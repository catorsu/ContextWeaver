/**
 * @file ListFolderContentsHandler.ts
 * @description Handler for LIST_FOLDER_CONTENTS messages.
 * @module ContextWeaver/CE
 */

import { ListFolderContentsRequestPayload, ListFolderContentsResponsePayload, extractErrorInfo } from '@contextweaver/shared';
import { Logger } from '@contextweaver/shared';
import { IMessageHandler, HandlerResponse } from './IMessageHandler';
import { IPCClient } from '../ipcClient';

/**
 * Handles LIST_FOLDER_CONTENTS messages by requesting folder contents listing from VSCE.
 */
export class ListFolderContentsHandler implements IMessageHandler<ListFolderContentsRequestPayload, HandlerResponse<ListFolderContentsResponsePayload['data']>> {
    private readonly logger = new Logger('ListFolderContentsHandler');

    /**
     * Handles the request for folder contents listing.
     * @param payload The list folder contents request payload containing folderUri and workspaceFolderUri.
     * @param ipcClient The IPC client for communicating with VSCE.
     * @returns Promise resolving to the folder contents response.
     */
    async handle(payload: ListFolderContentsRequestPayload, ipcClient: IPCClient): Promise<HandlerResponse<ListFolderContentsResponsePayload['data']>> {
        this.logger.debug(`Handling LIST_FOLDER_CONTENTS for URI: ${payload.folderUri}, Workspace: ${payload.workspaceFolderUri}`);
        
        try {
            const responsePayload: ListFolderContentsResponsePayload = await ipcClient.listFolderContents(payload.folderUri, payload.workspaceFolderUri);
            
            this.logger.trace(`Response for list_folder_contents: ${responsePayload.data?.entries?.length || 0} entries`);
            
            if (responsePayload.success === false) {
                return { success: false, error: responsePayload.error || 'Failed to get folder contents from VSCE.' };
            } else {
                return { success: true, data: responsePayload.data };
            }
        } catch (error) {
            this.logger.error('Error in list_folder_contents IPC call:', error);
            const errorInfo = extractErrorInfo(error);
            return { success: false, error: errorInfo.message || 'IPC call failed for list_folder_contents.' };
        }
    }
}