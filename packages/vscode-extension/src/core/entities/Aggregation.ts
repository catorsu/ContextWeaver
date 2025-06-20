/**
 * @file Aggregation.ts
 * @description Core data structures for response aggregation system.
 * @module ContextWeaver/VSCE
 */

/// <reference types="node" />

/**
 * Represents a response from a single window during aggregation.
 */
export interface AggregationResponse {
    /** Window ID that provided this response */
    windowId: string;
    /** The actual response payload */
    payload: unknown;
}

/**
 * Represents an active aggregation session.
 */
export interface AggregationSession {
    /** Unique identifier for the aggregation session */
    sessionId: string;
    /** Command being aggregated */
    command: string;
    /** Expected number of responses */
    expectedResponses: number;
    /** Responses received so far */
    responses: AggregationResponse[];
    /** Timeout handler for the session */
    timeoutHandle: NodeJS.Timeout;
    /** Whether the session has been completed */
    completed: boolean;
    /** Timestamp when the session started */
    startTime: Date;
}