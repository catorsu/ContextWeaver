/**
 * @file MultiWindowService.ts
 * @description Manages Primary/Secondary leader election and message forwarding for multi-window support.
 * @module ContextWeaver/VSCE
 */

import WebSocket from 'ws';
import * as vscode from 'vscode';
import { Logger } from '@contextweaver/shared';
import { v4 as uuidv4 } from 'uuid';
import { AggregationService } from './AggregationService';

// Import shared types
import {
    IPCMessageRequest, IPCMessagePush, PushSnippetPayload, ContextBlockMetadata
} from '@contextweaver/shared';

// Import the actual ConnectionService interface
import type { ConnectionService } from '../../adapters/primary/ipc/ConnectionService';

const PORT_RANGE_START = 30001;
const PORT_RANGE_END = 30005;

/**
 * Manages the Primary/Secondary architecture for multi-window VS Code support.
 * Handles leader election, secondary registration, and message forwarding between instances.
 */
export class MultiWindowService {
    private isPrimary: boolean = false;
    private primaryWebSocket: WebSocket | null = null;
    private secondaryClients: Map<string, WebSocket> = new Map();
    private readonly logger = new Logger('MultiWindowService');
    private readonly windowId: string;
    
    constructor(
        private readonly aggregationService: AggregationService,
        windowId: string
    ) {
        this.windowId = windowId;
    }

    /**
     * Starts the multi-window service by performing leader election.
     * Determines if this instance should be primary or secondary.
     */
    public async start(): Promise<void> {
        this.logger.info('Starting multi-window service with leader election.');
        await this.findPrimaryAndInitialize();
    }

    /**
     * Returns whether this instance is the primary server.
     */
    public getIsPrimary(): boolean {
        return this.isPrimary;
    }

    /**
     * Returns the map of secondary clients (windowId -> WebSocket).
     */
    public getSecondaryClients(): Map<string, WebSocket> {
        return this.secondaryClients;
    }

    /**
     * Scans a predefined port range to find an existing primary server. If found, this instance
     * becomes a secondary. If not found, this instance becomes the primary.
     */
    private async findPrimaryAndInitialize(): Promise<void> {
        for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
            try {
                const ws = new WebSocket(`ws://127.0.0.1:${port}`);
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Connection timed out')), 500);
                    ws.on('open', () => {
                        clearTimeout(timeout);
                        this.logger.info(`Found existing primary server on port ${port}. Becoming secondary.`);
                        ws.close();
                        this.becomeSecondary(port);
                        resolve();
                    });
                    ws.on('error', (err: Error) => {
                        clearTimeout(timeout);
                        const errorWithCode = err as Error & { code?: string };
                        if (errorWithCode.code !== 'ECONNREFUSED') {
                            this.logger.warn(`Non-refused error on port ${port}: ${err.message}`);
                        }
                        reject(err);
                    });
                });
                // If promise resolved, we found a primary and became secondary
                return;
            } catch (error) {
                const errorWithCode = error as Error & { code?: string };
                if (errorWithCode.code === 'ECONNREFUSED') {
                    this.logger.trace(`Port scan: Port ${port} is not open (ECONNREFUSED).`);
                }
                this.logger.trace(`Port scan on ${port} failed (as expected for unoccupied port):`, errorWithCode.code);
            }
        }

        // If loop completes, no primary was found. Become primary.
        this.logger.info('No primary server found in range. Becoming primary.');
        this.becomePrimary();
    }

    /**
     * Becomes the primary multi-window server.
     */
    private becomePrimary(): void {
        this.isPrimary = true;
        this.logger.info('Setting up as PRIMARY multi-window server.');
    }

    /**
     * Becomes a secondary multi-window server by connecting to the primary.
     */
    private becomeSecondary(primaryPort: number): void {
        this.isPrimary = false;
        this.logger.info('Setting up as SECONDARY multi-window server.');

        // Connect to primary
        this.primaryWebSocket = new WebSocket(`ws://127.0.0.1:${primaryPort}`);

        this.primaryWebSocket!.on('open', () => {
            this.logger.info('Connected to primary server.');

            // Register ourselves as a secondary
            const registerMessage: IPCMessageRequest = {
                protocol_version: '1.0',
                message_id: uuidv4(),
                type: 'request',
                command: 'register_secondary',
                payload: { windowId: this.windowId, port: 0 }
            };

            this.primaryWebSocket!.send(JSON.stringify(registerMessage));
            vscode.window.showInformationMessage('ContextWeaver: Connected as secondary to primary server.');
        });

        this.primaryWebSocket!.on('message', (data) => {
            this.handleSecondaryMessage(data);
        });

        this.primaryWebSocket!.on('close', () => {
            this.logger.warn('Connection to primary server closed. Will attempt to become primary on next start...');
            this.primaryWebSocket = null;
        });

        this.primaryWebSocket!.on('error', (error) => {
            this.logger.error(`Error connecting to primary: ${error.message}`);
        });
    }

    /**
     * Handles messages when running as secondary VSCE.
     */
    private async handleSecondaryMessage(data: WebSocket.RawData): Promise<void> {
        let parsedMessage: IPCMessageRequest;
        try {
            parsedMessage = JSON.parse(data.toString()) as IPCMessageRequest;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to parse message from primary: ${errorMessage}`);
            return;
        }

        // Handle forwarded requests from primary
        if (parsedMessage.type === 'request' && parsedMessage.command === 'forward_request_to_secondaries') {
            const originalRequest = parsedMessage.payload.originalRequest as IPCMessageRequest;
            this.logger.debug(`Received forwarded request: ${originalRequest.command}`);

            // This would need to be handled by the main message handler
            // For now, we'll emit an event or use a callback mechanism
            // The actual handling will be done by the IPCServer's handleMessage method
            this.onForwardRequestReceived?.(originalRequest, parsedMessage.message_id);
        }
    }

    /**
     * Callback for when a forwarded request is received (to be set by IPCServer).
     */
    public onForwardRequestReceived?: (originalRequest: IPCMessageRequest, aggregationId: string) => Promise<void>;

    /**
     * Handles registration of a secondary VSCE instance.
     */
    public handleRegisterSecondary(client: { windowId?: string; ws: WebSocket }, payload: { windowId: string; port: number }): void {
        client.windowId = payload.windowId;
        this.secondaryClients.set(payload.windowId, client.ws);
        this.logger.info(`Registered secondary VSCE with windowId: ${payload.windowId}`);
    }

    /**
     * Handles unregistration of a secondary VSCE instance.
     */
    public handleUnregisterSecondary(payload: { windowId: string }): void {
        this.secondaryClients.delete(payload.windowId);
        this.logger.info(`Unregistered secondary VSCE with windowId: ${payload.windowId}`);
    }

    /**
     * Removes a secondary client when its connection closes.
     */
    public removeSecondaryClient(windowId: string): void {
        if (this.secondaryClients.has(windowId)) {
            this.secondaryClients.delete(windowId);
            this.logger.info(`Removed secondary VSCE with windowId ${windowId}`);
        }
    }

    /**
     * Broadcasts a request to all secondary VSCE instances and sets up aggregation.
     */
    public broadcastToSecondaries(originalRequest: IPCMessageRequest, originalRequesterWs: WebSocket): void {
        const secondaryCount = this.secondaryClients.size;
        if (secondaryCount === 0) {
            return;
        }

        // Set up aggregation tracking
        const aggregationId = uuidv4();
        this.aggregationService.startAggregation(
            aggregationId,
            originalRequesterWs,
            secondaryCount + 1, // +1 for the primary's own response
            originalRequest.message_id,
            originalRequest.command
        );

        // Broadcast to secondaries
        const forwardMessage: IPCMessageRequest = {
            protocol_version: '1.0',
            message_id: aggregationId,
            type: 'request',
            command: 'forward_request_to_secondaries',
            payload: { originalRequest }
        };

        for (const [windowId, ws] of Array.from(this.secondaryClients)) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(forwardMessage));
                this.logger.debug(`Forwarded request to secondary ${windowId}`);
            }
        }
    }

    /**
     * Handles forwarded responses from secondary VSCE instances.
     */
    public handleForwardedResponse(payload: { originalMessageId: string; responsePayload: unknown; secondaryWindowId: string }): void {
        const aggregationId = payload.originalMessageId;
        this.aggregationService.addResponse(aggregationId, payload.secondaryWindowId, payload.responsePayload);
    }

    /**
     * Handles forwarded push messages from secondary VSCE instances.
     */
    public handleForwardedPush(payload: { originalPushPayload: PushSnippetPayload }, connectionService: ConnectionService): void {
        const pushPayload = payload.originalPushPayload;
        const clients = connectionService.getClients();

        // Forward the push to all CE clients
        for (const [ws, client] of Array.from(clients)) {
            if (client.isAuthenticated && !client.windowId) { // Not a secondary VSCE
                const pushMessage: IPCMessagePush = {
                    protocol_version: '1.0',
                    message_id: uuidv4(),
                    type: 'push',
                    command: 'push_snippet',
                    payload: pushPayload
                };

                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(pushMessage));
                    this.logger.debug('Forwarded push to CE client');
                }
            }
        }
    }

    /**
     * Handles snippet send requests. If primary, pushes to CE via connection service.
     * If secondary, forwards to primary for distribution.
     */
    public handleSnippetSendRequest(snippetData: Omit<PushSnippetPayload, 'targetTabId' | 'windowId'>, connectionService: ConnectionService): void {
        const fullSnippetData: PushSnippetPayload = {
            ...snippetData,
            targetTabId: 0, // Will be ignored by the new logic
            windowId: this.windowId,
            metadata: {
                ...snippetData.metadata,
                windowId: this.windowId
            } as ContextBlockMetadata
        };

        if (this.isPrimary) {
            // Send to all CE clients via connection service
            const clients = connectionService.getClients();
            for (const [ws, client] of Array.from(clients)) {
                if (client.isAuthenticated && !client.windowId) { // Not a secondary VSCE
                    const pushMessage: IPCMessagePush = {
                        protocol_version: '1.0',
                        message_id: uuidv4(),
                        type: 'push',
                        command: 'push_snippet',
                        payload: fullSnippetData
                    };

                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify(pushMessage));
                        this.logger.info('Pushed snippet to CE client');
                    }
                }
            }
        } else {
            // We're secondary, forward to primary
            if (this.primaryWebSocket && this.primaryWebSocket.readyState === WebSocket.OPEN) {
                const forwardPush: IPCMessagePush = {
                    protocol_version: '1.0',
                    message_id: uuidv4(),
                    type: 'push',
                    command: 'forward_push_to_primary',
                    payload: { originalPushPayload: fullSnippetData }
                };

                this.primaryWebSocket.send(JSON.stringify(forwardPush));
                this.logger.info('Forwarded snippet push to primary');
            } else {
                this.logger.warn('Cannot forward snippet - no connection to primary');
                vscode.window.showWarningMessage('ContextWeaver: Cannot send snippet - no connection to primary server.');
            }
        }
    }

    /**
     * Sends a response from secondary back to primary.
     */
    public sendResponseToPrimary(aggregationId: string, responsePayload: unknown): void {
        if (!this.primaryWebSocket || this.primaryWebSocket.readyState !== WebSocket.OPEN) {
            this.logger.warn('Cannot send response to primary - no connection');
            return;
        }

        const forwardResponse: IPCMessagePush = {
            protocol_version: '1.0',
            message_id: aggregationId,
            type: 'push',
            command: 'forward_response_to_primary',
            payload: {
                originalMessageId: aggregationId,
                responsePayload: responsePayload,
                secondaryWindowId: this.windowId
            }
        };

        this.primaryWebSocket.send(JSON.stringify(forwardResponse));
    }

    /**
     * Stops the multi-window service and closes connections.
     */
    public stop(): void {
        // Clear secondary clients
        this.secondaryClients.clear();

        // If secondary, close connection to primary
        if (this.primaryWebSocket) {
            this.primaryWebSocket.close();
            this.primaryWebSocket = null;
        }

        this.logger.info('Multi-window service stopped.');
    }
}