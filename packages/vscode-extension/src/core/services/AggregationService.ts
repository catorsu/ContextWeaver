/**
 * @file AggregationService.ts
 * @description Service for aggregating responses from multiple VSCE instances in Primary/Secondary architecture.
 * @module ContextWeaver/VSCE
 */

import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { Logger, extractErrorInfo } from '@contextweaver/shared';
import { IAggregationService } from '../ports/IAggregationService';
import { AggregationStrategyFactory } from '../../adapters/primary/ipc/aggregation/AggregationStrategyFactory';
import { AggregationResponse } from '../entities/Aggregation';

// Import types from shared module
import {
    IPCBaseMessage,
    IPCMessageResponse
} from '@contextweaver/shared';

interface AggregationSession {
    originalRequester: WebSocket;
    responses: AggregationResponse[];
    expectedResponses: number;
    timeout: NodeJS.Timeout;
    originalMessageId: string;
    originalCommand: string;
    completed?: boolean;
}

/**
 * Service for managing response aggregation from primary and secondary VSCE instances.
 * Handles collecting responses from multiple sources and combining them appropriately.
 */
export class AggregationService implements IAggregationService {
    private pendingAggregatedResponses: Map<string, AggregationSession> = new Map();
    private messageIdToAggregationId: Map<string, string> = new Map();
    private readonly logger = new Logger('AggregationService');
    private readonly windowId: string;
    private readonly strategyFactory: AggregationStrategyFactory;

    constructor(windowId: string, strategyFactory: AggregationStrategyFactory) {
        this.windowId = windowId;
        this.strategyFactory = strategyFactory;
        this.logger.info(`AggregationService initialized for window ${windowId}`);
    }

    /**
     * Starts a new aggregation session for a request that will be broadcast to secondaries.
     */
    public startAggregation(
        aggregationId: string,
        originalRequester: WebSocket,
        expectedResponses: number,
        originalMessageId: string,
        originalCommand: string
    ): void {
        this.logger.debug(`Starting aggregation session ${aggregationId} for command ${originalCommand}`);

        const timeout = setTimeout(() => {
            this.completeAggregation(aggregationId);
        }, 5000); // 5 second timeout

        this.pendingAggregatedResponses.set(aggregationId, {
            originalRequester,
            responses: [],
            expectedResponses,
            timeout,
            originalMessageId,
            originalCommand
        });

        // Map the original message ID to the aggregation ID for primary response tracking
        this.messageIdToAggregationId.set(originalMessageId, aggregationId);
    }

    /**
     * Adds a response from a secondary VSCE instance to the aggregation.
     */
    public addResponse(aggregationId: string, windowId: string, responsePayload: unknown): void {
        const aggregation = this.pendingAggregatedResponses.get(aggregationId);
        if (!aggregation) {
            this.logger.warn(`No aggregation session found for ID ${aggregationId}`);
            return;
        }

        const wrappedResponse = {
            windowId,
            payload: responsePayload
        };

        aggregation.responses.push(wrappedResponse);
        this.logger.debug(`Added response from ${windowId} to aggregation ${aggregationId}. Total: ${aggregation.responses.length}/${aggregation.expectedResponses}`);

        if (aggregation.responses.length >= aggregation.expectedResponses) {
            this.completeAggregation(aggregationId);
        }
    }

    /**
     * Adds the primary VSCE instance's own response to the aggregation.
     */
    public addPrimaryResponse(messageId: string, primaryWindowId: string, responsePayload: unknown): boolean {
        const aggregationId = this.messageIdToAggregationId.get(messageId);
        if (!aggregationId) {
            // This message is not part of an aggregation
            return false;
        }

        const aggregation = this.pendingAggregatedResponses.get(aggregationId);
        if (!aggregation || aggregation.completed) {
            if (aggregation?.completed) {
                this.logger.warn(`Aggregation for ${aggregation.originalCommand} (ID: ${aggregationId}) already completed. Dropping late primary response.`);
            }
            return true; // Return true to indicate this was handled (even if dropped)
        }

        this.logger.debug(`Capturing primary's local response for aggregation ID ${aggregationId}.`);
        aggregation.responses.push({ windowId: primaryWindowId, payload: responsePayload });
        
        if (aggregation.responses.length >= aggregation.expectedResponses) {
            this.completeAggregation(aggregationId);
        }
        
        return true; // Return true to indicate this was handled by aggregation
    }

    /**
     * Checks if a message ID is part of an ongoing aggregation.
     */
    public isMessagePartOfAggregation(messageId: string): boolean {
        return this.messageIdToAggregationId.has(messageId);
    }

    /**
     * Completes response aggregation and sends the combined response to the CE.
     */
    private completeAggregation(aggregationId: string): void {
        const aggregation = this.pendingAggregatedResponses.get(aggregationId);
        if (!aggregation || aggregation.completed) return;

        this.logger.debug(`Completing aggregation ${aggregationId} for command ${aggregation.originalCommand}`);

        // Mark as completed to prevent race conditions where the timeout fires
        // before the primary's own response is processed.
        aggregation.completed = true;
        clearTimeout(aggregation.timeout);

        // Defer deletion to allow any late-arriving primary responses to be gracefully dropped.
        setTimeout(() => {
            this.pendingAggregatedResponses.delete(aggregationId);
            this.messageIdToAggregationId.delete(aggregation.originalMessageId);
        }, 2000);

        // Use strategy pattern to aggregate responses based on command type
        const command = aggregation.originalCommand;
        const strategy = this.strategyFactory.createStrategy(command);
        const aggregatedPayload = strategy.aggregate(aggregation.responses);

        this.logger.debug(`Aggregation completed using strategy for command: ${command}`);

        // Send aggregated response
        this.sendMessage(aggregation.originalRequester, 'response', `response_${command}` as IPCMessageResponse['command'], aggregatedPayload, aggregation.originalMessageId, true);
    }

    /**
     * Sends a response message to a connected WebSocket client.
     */
    private sendMessage<TResponsePayload>(
        ws: WebSocket,
        type: IPCMessageResponse['type'],
        command: IPCMessageResponse['command'],
        payload: TResponsePayload,
        message_id?: string,
        _bypassAggregation?: boolean
    ): void {
        const message: IPCBaseMessage & { type: typeof type, command: typeof command, payload: TResponsePayload } = {
            protocol_version: '1.0',
            message_id: message_id || uuidv4(),
            type,
            command,
            payload
        };
        
        try {
            const messageString = JSON.stringify(message);
            this.logger.trace(`Sending aggregated message for command '${command}'. ReadyState: ${ws.readyState}.`, { message_id: message.message_id, type: message.type, payloadKeys: message.payload ? Object.keys(message.payload) : [] });

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(messageString);
                this.logger.trace(`Aggregated message sent successfully for command: ${command}`);
            } else {
                this.logger.warn(`WebSocket not OPEN (state: ${ws.readyState}). Aggregated message for command '${command}' NOT sent.`);
            }
        } catch (error) {
            const errorInfo = extractErrorInfo(error);
            this.logger.error(`Error during ws.send() for aggregated command '${command}': ${errorInfo.message}`, { message_id: message.message_id, type: message.type });
        }
    }
}