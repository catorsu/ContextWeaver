/**
 * @file IAggregationService.ts
 * @description Interface for aggregating responses from multiple VSCE instances.
 * @module ContextWeaver/VSCE
 */

import WebSocket from 'ws';

/**
 * Service interface for managing response aggregation from primary and secondary VSCE instances.
 */
export interface IAggregationService {
    /**
     * Starts a new aggregation session for a request that will be broadcast to secondaries.
     * @param aggregationId - Unique identifier for this aggregation session.
     * @param originalRequester - WebSocket of the original requester (CE client).
     * @param expectedResponses - Number of responses expected (including primary).
     * @param originalMessageId - Message ID of the original request.
     * @param originalCommand - Command of the original request.
     */
    startAggregation(
        aggregationId: string,
        originalRequester: WebSocket,
        expectedResponses: number,
        originalMessageId: string,
        originalCommand: string
    ): void;

    /**
     * Adds a response from a secondary VSCE instance to the aggregation.
     * @param aggregationId - Unique identifier for the aggregation session.
     * @param windowId - Window ID of the secondary that sent the response.
     * @param responsePayload - The response payload from the secondary.
     */
    addResponse(aggregationId: string, windowId: string, responsePayload: unknown): void;

    /**
     * Adds the primary VSCE instance's own response to the aggregation.
     * @param messageId - Message ID of the original request.
     * @param primaryWindowId - Window ID of the primary instance.
     * @param responsePayload - The response payload from the primary.
     * @returns True if the message was handled by aggregation, false otherwise.
     */
    addPrimaryResponse(messageId: string, primaryWindowId: string, responsePayload: unknown): boolean;

    /**
     * Checks if a message ID is part of an ongoing aggregation.
     * @param messageId - Message ID to check.
     * @returns True if the message is part of an aggregation, false otherwise.
     */
    isMessagePartOfAggregation(messageId: string): boolean;
}