/**
 * @file SearchAggregationStrategy.ts
 * @description Aggregation strategy for search_workspace command responses.
 * @module ContextWeaver/VSCE
 */

import { Logger } from '@contextweaver/shared';
import { IAggregationStrategy } from '../../../../core/ports/IAggregationStrategy';
import { AggregationResponse } from '../../../../core/entities/Aggregation';

// Import types from shared module
import {
    SearchWorkspaceResponsePayload as CWSearchWorkspaceResponsePayload,
    ErrorResponsePayload,
    SearchResult as CWSearchResult
} from '@contextweaver/shared';

/**
 * Strategy for aggregating search results from multiple VS Code windows.
 * Combines all search results and errors from different windows into a single response.
 */
export class SearchAggregationStrategy implements IAggregationStrategy {
    private readonly logger = new Logger('SearchAggregationStrategy');
    private readonly windowId: string;

    constructor(windowId: string) {
        this.windowId = windowId;
    }

    /**
     * Aggregates search results from multiple windows.
     * Combines all results and tracks errors from individual windows.
     * @param responses - Array of responses from different VS Code windows
     * @returns Combined search response with all results and errors
     */
    aggregate(responses: AggregationResponse[]): unknown {
        this.logger.debug(`Aggregating search results from ${responses.length} windows`);

        const allResults: CWSearchResult[] = [];
        const allErrors: { windowId: string, error: string, errorCode?: string }[] = [];

        for (const response of responses) {
            // response.payload is a SearchWorkspaceResponsePayload or ErrorResponsePayload
            const payload = response.payload as CWSearchWorkspaceResponsePayload | ErrorResponsePayload;
            
            if (payload.success && 'data' in payload && payload.data?.results) {
                allResults.push(...payload.data.results);
                this.logger.debug(`Added ${payload.data.results.length} results from window ${response.windowId}`);
            } else if (!payload.success) {
                allErrors.push({
                    windowId: response.windowId,
                    error: payload.error || 'Unknown error from secondary',
                    errorCode: payload.errorCode
                });
                this.logger.warn(`Error from window ${response.windowId}: ${payload.error}`);
            }
        }

        const aggregatedPayload = {
            success: allErrors.length === 0,
            data: { 
                results: allResults, 
                windowId: this.windowId, 
                errors: allErrors.length > 0 ? allErrors : undefined 
            },
            error: null
        };

        this.logger.debug(`Aggregated search complete: ${allResults.length} total results, ${allErrors.length} errors`);
        return aggregatedPayload;
    }
}