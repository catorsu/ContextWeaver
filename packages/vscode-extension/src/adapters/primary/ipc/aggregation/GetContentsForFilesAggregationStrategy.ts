/**
 * @file GetContentsForFilesAggregationStrategy.ts
 * @description Aggregation strategy for get_contents_for_files command responses.
 * @module ContextWeaver/VSCE
 */

import { Logger } from '@contextweaver/shared';
import { IAggregationStrategy } from '../../../../core/ports/IAggregationStrategy';
import { AggregationResponse } from '../../../../core/entities/Aggregation';

// Import types from shared module
import { FileContentResponseData } from '@contextweaver/shared';

/**
 * Strategy for aggregating file content responses from multiple VS Code windows.
 * Combines all file data and errors from different windows into a single response.
 */
export class GetContentsForFilesAggregationStrategy implements IAggregationStrategy {
    private readonly logger = new Logger('GetContentsForFilesAggregationStrategy');

    /**
     * Aggregates file content responses from multiple windows.
     * Combines all data and error arrays from individual windows.
     * @param responses - Array of responses from different VS Code windows
     * @returns Combined file content response with all data and errors
     */
    aggregate(responses: AggregationResponse[]): unknown {
        this.logger.debug(`Aggregating file contents from ${responses.length} windows`);

        const allData: FileContentResponseData[] = [];
        const allErrors: { uri: string; error: string; errorCode?: string }[] = [];

        for (const response of responses) {
            // The payload of each response is a ContentsForFilesResponsePayload
            const payload = response.payload as { 
                data?: FileContentResponseData[]; 
                errors?: { uri: string; error: string; errorCode?: string }[] 
            };

            if (payload?.data) {
                allData.push(...payload.data);
                this.logger.debug(`Added ${payload.data.length} file contents from window ${response.windowId}`);
            }

            if (payload?.errors) {
                allErrors.push(...payload.errors);
                this.logger.debug(`Added ${payload.errors.length} errors from window ${response.windowId}`);
            }
        }

        const aggregatedPayload = {
            success: true,
            data: allData,
            errors: allErrors,
            error: null
        };

        this.logger.debug(`Aggregated file contents complete: ${allData.length} files, ${allErrors.length} errors`);
        return aggregatedPayload;
    }
}