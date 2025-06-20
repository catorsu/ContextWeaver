/**
 * @file GetWorkspaceDetailsAggregationStrategy.ts
 * @description Aggregation strategy for get_workspace_details command responses.
 * @module ContextWeaver/VSCE
 */

import { Logger } from '@contextweaver/shared';
import { IAggregationStrategy } from '../../../../core/ports/IAggregationStrategy';
import { AggregationResponse } from '../../../../core/entities/Aggregation';

/**
 * Strategy for aggregating workspace details from multiple VS Code windows.
 * Combines workspace folders and determines overall trust status.
 */
export class GetWorkspaceDetailsAggregationStrategy implements IAggregationStrategy {
    private readonly logger = new Logger('GetWorkspaceDetailsAggregationStrategy');
    private readonly windowId: string;

    constructor(windowId: string) {
        this.windowId = windowId;
    }

    /**
     * Aggregates workspace details from multiple windows.
     * Combines all workspace folders and calculates overall trust status.
     * @param responses - Array of responses from different VS Code windows
     * @returns Combined workspace details with all folders and trust status
     */
    aggregate(responses: AggregationResponse[]): unknown {
        this.logger.debug(`Aggregating workspace details from ${responses.length} windows`);

        const allFolders: Array<{ uri: string; name: string; isTrusted: boolean }> = [];
        const seenUris = new Set<string>();
        let isTrusted = true;
        let primaryWorkspaceName: string | undefined;

        for (const response of responses) {
            const payload = response.payload as { 
                data?: { 
                    workspaceFolders?: Array<{ uri: string; name: string; isTrusted: boolean }>; 
                    isTrusted?: boolean; 
                    workspaceName?: string 
                } 
            };

            if (payload?.data?.workspaceFolders) {
                for (const folder of payload.data.workspaceFolders) {
                    if (!seenUris.has(folder.uri)) {
                        allFolders.push(folder);
                        seenUris.add(folder.uri);
                    }
                }
                this.logger.debug(`Added ${payload.data.workspaceFolders.length} workspace folders from window ${response.windowId}`);
            }

            // If any workspace is not trusted, the overall workspace is not trusted
            if (payload?.data?.isTrusted === false) {
                isTrusted = false;
                this.logger.debug(`Window ${response.windowId} is not trusted, marking overall workspace as untrusted`);
            }

            // Use the primary window's workspace name
            if (response.windowId === this.windowId) {
                primaryWorkspaceName = payload?.data?.workspaceName;
                this.logger.debug(`Using workspace name from primary window: ${primaryWorkspaceName}`);
            }
        }

        const aggregatedPayload = {
            success: true,
            data: { 
                isTrusted, 
                workspaceFolders: allFolders, 
                workspaceName: primaryWorkspaceName 
            },
            error: null
        };

        this.logger.debug(`Aggregated workspace details: ${allFolders.length} folders, trusted: ${isTrusted}`);
        return aggregatedPayload;
    }
}