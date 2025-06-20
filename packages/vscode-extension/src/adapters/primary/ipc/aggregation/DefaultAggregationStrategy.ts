/**
 * @file DefaultAggregationStrategy.ts
 * @description Default aggregation strategy that prioritizes the primary window's response.
 * @module ContextWeaver/VSCE
 */

import { Logger } from '@contextweaver/shared';
import { IAggregationStrategy } from '../../../../core/ports/IAggregationStrategy';
import { AggregationResponse } from '../../../../core/entities/Aggregation';

/**
 * Default aggregation strategy that prioritizes the primary window's response.
 * Falls back to the first available response if primary is not found.
 * Used for commands that don't need special aggregation logic.
 */
export class DefaultAggregationStrategy implements IAggregationStrategy {
    private readonly logger = new Logger('DefaultAggregationStrategy');
    private readonly windowId: string;

    constructor(windowId: string) {
        this.windowId = windowId;
    }

    /**
     * Returns the primary window's response, or first available if primary not found.
     * This avoids non-deterministic behavior where a secondary's response might be used.
     * @param responses - Array of responses from different VS Code windows
     * @returns Primary window's payload or first available response
     */
    aggregate(responses: AggregationResponse[]): unknown {
        this.logger.debug(`Using default aggregation for ${responses.length} responses`);

        // Prioritize the primary's response
        const primaryResponse = responses.find(r => r.windowId === this.windowId);
        
        if (primaryResponse) {
            this.logger.debug(`Using primary window response from ${this.windowId}`);
            return primaryResponse.payload;
        }

        // Fallback to first available response
        const fallbackResponse = responses[0];
        if (fallbackResponse) {
            this.logger.debug(`Primary not found, using fallback response from ${fallbackResponse.windowId}`);
            return fallbackResponse.payload;
        }

        // No responses available
        this.logger.warn('No responses available for aggregation');
        return { 
            success: false, 
            error: 'No responses received',
            errorCode: 'NO_RESPONSES'
        };
    }
}