/**
 * @file GetFolderContentHandler.ts
 * @description Handler for GET_FOLDER_CONTENT messages.
 * @module ContextWeaver/CE
 */

import { GetFolderContentRequestPayload, FolderContentResponsePayload, extractErrorInfo } from '@contextweaver/shared';
import { Logger } from '@contextweaver/shared';
import { IMessageHandler, HandlerResponse } from './IMessageHandler';
import { IPCClient } from '../ipcClient';

/**
 * Handles GET_FOLDER_CONTENT messages by requesting folder content from VSCE.
 */
export class GetFolderContentHandler implements IMessageHandler<GetFolderContentRequestPayload, HandlerResponse<FolderContentResponsePayload['data']>> {
    private readonly logger = new Logger('GetFolderContentHandler');

    /**
     * Handles the request for folder content.
     * @param payload The folder content request payload containing folderPath and workspaceFolderUri.
     * @param ipcClient The IPC client for communicating with VSCE.
     * @returns Promise resolving to the folder content response.
     */
    async handle(payload: GetFolderContentRequestPayload, ipcClient: IPCClient): Promise<HandlerResponse<FolderContentResponsePayload['data']>> {
        this.logger.debug(`Handling GET_FOLDER_CONTENT for path: ${payload.folderPath}`);
        
        try {
            const responsePayload: FolderContentResponsePayload = await ipcClient.getFolderContent(payload.folderPath, payload.workspaceFolderUri);
            
            this.logger.trace(`Response for get_folder_content: ${responsePayload.data?.filesData?.length || 0} files`);
            
            if (responsePayload.success === false) {
                return { success: false, error: responsePayload.error || 'Failed to get folder content from VSCE.' };
            } else {
                return { success: true, data: responsePayload.data };
            }
        } catch (error) {
            this.logger.error('Error in get_folder_content IPC call:', error);
            const errorInfo = extractErrorInfo(error);
            return { success: false, error: errorInfo.message || 'IPC call failed for get_folder_content.' };
        }
    }
}