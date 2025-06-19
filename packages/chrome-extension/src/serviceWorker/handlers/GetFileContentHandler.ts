/**
 * @file GetFileContentHandler.ts
 * @description Handler for GET_FILE_CONTENT messages.
 * @module ContextWeaver/CE
 */

import { GetFileContentRequestPayload, FileContentResponsePayload } from '@contextweaver/shared';
import { Logger } from '@contextweaver/shared';
import { IMessageHandler } from './IMessageHandler';
import { IPCClient } from '../ipcClient';

/**
 * Handles GET_FILE_CONTENT messages by requesting file content from VSCE.
 */
export class GetFileContentHandler implements IMessageHandler {
    private readonly logger = new Logger('GetFileContentHandler');

    /**
     * Handles the request for file content.
     * @param payload The file content request payload containing filePath.
     * @param ipcClient The IPC client for communicating with VSCE.
     * @returns Promise resolving to the file content response.
     */
    async handle(payload: GetFileContentRequestPayload, ipcClient: IPCClient): Promise<any> {
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
            return { success: false, error: (error as Error).message || 'IPC call failed for get_file_content.' };
        }
    }
}