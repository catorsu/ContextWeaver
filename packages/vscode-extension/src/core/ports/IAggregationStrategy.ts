/**
 * @file IAggregationStrategy.ts
 * @description Interface for aggregation strategies.
 * @module ContextWeaver/VSCE
 */

import { AggregationResponse } from '../entities/Aggregation';

/**
 * Strategy interface for aggregating responses from multiple windows.
 */
export interface IAggregationStrategy {
    /**
     * Aggregates responses from multiple windows into a single result.
     * @param responses - Array of responses from different windows
     * @returns The aggregated result
     */
    aggregate(responses: AggregationResponse[]): unknown;
}