/**
 * @file GetWorkspaceDetailsHandler.ts
 * @description Handler for GET_WORKSPACE_DETAILS_FOR_UI messages.
 * @module ContextWeaver/CE
 */

import { WorkspaceDetailsResponsePayload, extractErrorInfo } from '@contextweaver/shared';
import { Logger } from '@contextweaver/shared';
import { IMessageHandler } from './IMessageHandler';
import { IPCClient } from '../ipcClient';

/**
 * Handles GET_WORKSPACE_DETAILS_FOR_UI messages by requesting workspace details from VSCE.
 */
export class GetWorkspaceDetailsHandler implements IMessageHandler<unknown, WorkspaceDetailsResponsePayload> {
    private readonly logger = new Logger('GetWorkspaceDetailsHandler');

    /**
     * Handles the request for workspace details.
     * @param payload Empty payload - no parameters needed.
     * @param ipcClient The IPC client for communicating with VSCE.
     * @returns Promise resolving to the workspace details response.
     */
    async handle(payload: unknown, ipcClient: IPCClient): Promise<WorkspaceDetailsResponsePayload> {
        this.logger.debug('Handling GET_WORKSPACE_DETAILS_FOR_UI');
        
        try {
            const responsePayload: WorkspaceDetailsResponsePayload = await ipcClient.getWorkspaceDetails();
            
            this.logger.trace(`Response for get_workspace_details: ${responsePayload.data?.workspaceFolders?.length || 0} folders`);
            return responsePayload;
        } catch (error) {
            this.logger.error('Error in get_workspace_details IPC call:', error);
            const errorInfo = extractErrorInfo(error);
            return { success: false, error: errorInfo.message || 'IPC call failed for get_workspace_details.', data: null };
        }
    }
}