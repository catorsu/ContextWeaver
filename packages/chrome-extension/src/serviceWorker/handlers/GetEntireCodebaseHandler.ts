/**
 * @file GetEntireCodebaseHandler.ts
 * @description Handler for GET_ENTIRE_CODEBASE messages.
 * @module ContextWeaver/CE
 */

import { GetEntireCodebaseRequestPayload, EntireCodebaseResponsePayload, EntireCodebaseResponseData, extractErrorInfo } from '@contextweaver/shared';
import { Logger } from '@contextweaver/shared';
import { IMessageHandler, HandlerResponse } from './IMessageHandler';
import { IPCClient } from '../ipcClient';

/**
 * Handles GET_ENTIRE_CODEBASE messages by requesting entire codebase data from VSCE.
 */
interface EntireCodebaseHandlerResponse extends HandlerResponse<EntireCodebaseResponseData | null> {
    workspaceFolderName?: string;
    filterType?: string;
    projectPath?: string;
    workspaceFolderUri?: string | null | undefined;
}

export class GetEntireCodebaseHandler implements IMessageHandler<GetEntireCodebaseRequestPayload, EntireCodebaseHandlerResponse> {
    private readonly logger = new Logger('GetEntireCodebaseHandler');

    /**
     * Handles the request for entire codebase data.
     * @param payload The entire codebase request payload containing workspaceFolderUri.
     * @param ipcClient The IPC client for communicating with VSCE.
     * @returns Promise resolving to the entire codebase response.
     */
    async handle(payload: GetEntireCodebaseRequestPayload, ipcClient: IPCClient): Promise<EntireCodebaseHandlerResponse> {
        this.logger.debug(`Handling GET_ENTIRE_CODEBASE for URI: ${payload.workspaceFolderUri}`);
        
        try {
            const responsePayload: EntireCodebaseResponsePayload = await ipcClient.getEntireCodebase(payload.workspaceFolderUri);
            
            this.logger.trace(`Response for get_entire_codebase. Files: ${responsePayload.data?.filesData?.length || 0}`);
            
            if (responsePayload.success === false) {
                return { success: false, error: responsePayload.error || 'Failed to get entire codebase from VSCE.' };
            } else if (responsePayload.data && Array.isArray(responsePayload.data.filesData)) {
                return {
                    success: true,
                    data: {
                        filesData: responsePayload.data.filesData,
                        metadata: responsePayload.data.metadata,
                        windowId: responsePayload.data.windowId
                    },
                    workspaceFolderName: responsePayload.data.metadata?.workspaceFolderName ?? undefined,
                    filterType: responsePayload.filterType,
                    projectPath: responsePayload.projectPath,
                    workspaceFolderUri: responsePayload.workspaceFolderUri ?? undefined
                };
            } else {
                return { success: false, error: 'Invalid codebase data from VSCE (missing data.filesData array).' };
            }
        } catch (error) {
            this.logger.error('Error in get_entire_codebase IPC call:', error);
            const errorInfo = extractErrorInfo(error);
            return { success: false, error: errorInfo.message || 'IPC call failed for get_entire_codebase.' };
        }
    }
}