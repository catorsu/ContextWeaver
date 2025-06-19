/**
 * @file GetOpenFilesHandler.ts
 * @description Handler for GET_OPEN_FILES_FOR_UI messages.
 * @module ContextWeaver/CE
 */

import { OpenFilesResponsePayload, extractErrorInfo } from '@contextweaver/shared';
import { Logger } from '@contextweaver/shared';
import { IMessageHandler, HandlerResponse } from './IMessageHandler';
import { IPCClient } from '../ipcClient';

/**
 * Handles GET_OPEN_FILES_FOR_UI messages by requesting open files list from VSCE.
 */
export class GetOpenFilesHandler implements IMessageHandler<unknown, HandlerResponse<OpenFilesResponsePayload['data']>> {
    private readonly logger = new Logger('GetOpenFilesHandler');

    /**
     * Handles the request for open files list.
     * @param payload Empty payload - no parameters needed.
     * @param ipcClient The IPC client for communicating with VSCE.
     * @returns Promise resolving to the open files response.
     */
    async handle(payload: unknown, ipcClient: IPCClient): Promise<HandlerResponse<OpenFilesResponsePayload['data']>> {
        this.logger.debug('Handling GET_OPEN_FILES_FOR_UI');
        
        try {
            const responsePayload: OpenFilesResponsePayload = await ipcClient.getOpenFiles();
            
            this.logger.trace(`Response for get_open_files: ${responsePayload.data?.openFiles?.length || 0} files`);
            
            if (responsePayload.success === false) {
                return { success: false, error: responsePayload.error || 'Failed to get open files list from VSCE.' };
            } else {
                return { success: true, data: responsePayload.data };
            }
        } catch (error) {
            this.logger.error('Error in get_open_files IPC call:', error);
            const errorInfo = extractErrorInfo(error);
            return { success: false, error: errorInfo.message || 'IPC call failed for get_open_files.' };
        }
    }
}