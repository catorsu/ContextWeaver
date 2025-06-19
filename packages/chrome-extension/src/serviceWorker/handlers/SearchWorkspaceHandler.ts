/**
 * @file SearchWorkspaceHandler.ts
 * @description Handler for SEARCH_WORKSPACE messages.
 * @module ContextWeaver/CE
 */

import { SearchWorkspaceRequestPayload, SearchWorkspaceResponsePayload } from '@contextweaver/shared';
import { Logger } from '@contextweaver/shared';
import { IMessageHandler } from './IMessageHandler';
import { IPCClient } from '../ipcClient';

/**
 * Handles SEARCH_WORKSPACE messages by performing workspace search via VSCE.
 */
export class SearchWorkspaceHandler implements IMessageHandler {
    private readonly logger = new Logger('SearchWorkspaceHandler');

    /**
     * Handles the request for workspace search.
     * @param payload The search workspace request payload containing query and workspaceFolderUri.
     * @param ipcClient The IPC client for communicating with VSCE.
     * @returns Promise resolving to the search results response.
     */
    async handle(payload: SearchWorkspaceRequestPayload, ipcClient: IPCClient): Promise<any> {
        this.logger.debug(`Handling SEARCH_WORKSPACE for query (length: ${payload.query.length}), folder: ${payload.workspaceFolderUri}`);
        
        try {
            const responsePayload: SearchWorkspaceResponsePayload = await ipcClient.searchWorkspace(payload.query, payload.workspaceFolderUri);
            
            this.logger.trace(`Response for search_workspace: ${responsePayload.data?.results?.length || 0} results`);
            
            if (responsePayload.success === false) {
                return { success: false, error: responsePayload.error || 'Failed to get search results from VSCE.' };
            } else {
                return { success: true, data: responsePayload.data };
            }
        } catch (error) {
            this.logger.error('Error in search_workspace IPC call:', error);
            return { success: false, error: (error as Error).message || 'IPC call failed for search_workspace.' };
        }
    }
}