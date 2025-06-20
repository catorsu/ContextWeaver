/**
 * @file GetOpenFilesAggregationStrategy.ts
 * @description Aggregation strategy for get_open_files command responses.
 * @module ContextWeaver/VSCE
 */

import { Logger } from '@contextweaver/shared';
import { IAggregationStrategy } from '../../../../core/ports/IAggregationStrategy';
import { AggregationResponse } from '../../../../core/entities/Aggregation';

/**
 * Strategy for aggregating open files from multiple VS Code windows.
 * Combines all open files from different windows into a single response.
 */
export class GetOpenFilesAggregationStrategy implements IAggregationStrategy {
    private readonly logger = new Logger('GetOpenFilesAggregationStrategy');

    /**
     * Aggregates open files from multiple windows.
     * Combines all open files arrays from individual windows.
     * @param responses - Array of responses from different VS Code windows
     * @returns Combined open files response with all files
     */
    aggregate(responses: AggregationResponse[]): unknown {
        this.logger.debug(`Aggregating open files from ${responses.length} windows`);

        const allOpenFiles: Array<{
            path: string;
            name: string;
            workspaceFolderUri: string | null;
            workspaceFolderName: string | null;
            windowId: string;
        }> = [];

        for (const response of responses) {
            const payload = response.payload as { 
                data?: { 
                    openFiles?: Array<{
                        path: string;
                        name: string;
                        workspaceFolderUri: string | null;
                        workspaceFolderName: string | null;
                        windowId: string;
                    }>
                } 
            };

            if (payload?.data?.openFiles) {
                allOpenFiles.push(...payload.data.openFiles);
                this.logger.debug(`Added ${payload.data.openFiles.length} open files from window ${response.windowId}`);
            }
        }

        const aggregatedPayload = {
            success: true,
            data: { openFiles: allOpenFiles },
            error: null
        };

        this.logger.debug(`Aggregated open files complete: ${allOpenFiles.length} total open files`);
        return aggregatedPayload;
    }
}