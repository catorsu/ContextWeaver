/**
 * @file GetFileContentHandler.ts
 * @description Handler for GET_FILE_CONTENT messages.
 * @module ContextWeaver/CE
 */

import { GetFileContentRequestPayload, FileContentResponsePayload, extractErrorInfo } from '@contextweaver/shared';
import { Logger } from '@contextweaver/shared';
import { IMessageHandler, HandlerResponse } from './IMessageHandler';
import { IPCClient } from '../ipcClient';

/**
 * Handles GET_FILE_CONTENT messages by requesting file content from VSCE.
 */
export class GetFileContentHandler implements IMessageHandler<GetFileContentRequestPayload, HandlerResponse<FileContentResponsePayload['data']>> {
    private readonly logger = new Logger('GetFileContentHandler');

    /**
     * Handles the request for file content.
     * @param payload The file content request payload containing filePath.
     * @param ipcClient The IPC client for communicating with VSCE.
     * @returns Promise resolving to the file content response.
     */
    async handle(payload: GetFileContentRequestPayload, ipcClient: IPCClient): Promise<HandlerResponse<FileContentResponsePayload['data']>> {
        this.logger.debug(`Handling GET_FILE_CONTENT for path: ${payload.filePath}`);
        
        try {
            const responsePayload: FileContentResponsePayload = await ipcClient.getFileContent(payload.filePath);
            
            this.logger.trace(`Response for get_file_content for path: ${payload.filePath}`);
            
            if (responsePayload.success === false) {
                return { success: false, error: responsePayload.error || 'Failed to get file content from VSCE.' };
            } else {
                return { success: true, data: responsePayload.data };
            }
        } catch (error) {
            this.logger.error('Error in get_file_content IPC call:', error);
            const errorInfo = extractErrorInfo(error);
            return { success: false, error: errorInfo.message || 'IPC call failed for get_file_content.' };
        }
    }
}