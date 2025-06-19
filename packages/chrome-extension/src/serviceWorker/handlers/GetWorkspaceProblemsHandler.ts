/**
 * @file GetWorkspaceProblemsHandler.ts
 * @description Handler for GET_WORKSPACE_PROBLEMS messages.
 * @module ContextWeaver/CE
 */

import { GetWorkspaceProblemsRequestPayload, WorkspaceProblemsResponsePayload, extractErrorInfo } from '@contextweaver/shared';
import { Logger } from '@contextweaver/shared';
import { IMessageHandler } from './IMessageHandler';
import { IPCClient } from '../ipcClient';

/**
 * Handles GET_WORKSPACE_PROBLEMS messages by requesting workspace problems from VSCE.
 */
export class GetWorkspaceProblemsHandler implements IMessageHandler<GetWorkspaceProblemsRequestPayload, WorkspaceProblemsResponsePayload> {
    private readonly logger = new Logger('GetWorkspaceProblemsHandler');

    /**
     * Handles the request for workspace problems.
     * @param payload The workspace problems request payload containing workspaceFolderUri.
     * @param ipcClient The IPC client for communicating with VSCE.
     * @returns Promise resolving to the workspace problems response.
     */
    async handle(payload: GetWorkspaceProblemsRequestPayload, ipcClient: IPCClient): Promise<WorkspaceProblemsResponsePayload> {
        this.logger.debug(`Handling GET_WORKSPACE_PROBLEMS for URI: ${payload.workspaceFolderUri}`);
        
        try {
            const responsePayload: WorkspaceProblemsResponsePayload = await ipcClient.getWorkspaceProblems(payload.workspaceFolderUri);
            
            this.logger.trace(`Response for get_workspace_problems: ${responsePayload.data?.problemCount || 0} problems`);
            return responsePayload;
        } catch (error) {
            this.logger.error('Error in get_workspace_problems IPC call:', error);
            const errorInfo = extractErrorInfo(error);
            return { success: false, error: errorInfo.message || 'IPC call failed for get_workspace_problems.', data: null, workspaceFolderUri: payload.workspaceFolderUri };
        }
    }
}