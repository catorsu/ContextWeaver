/**
 * @file GetActiveFileInfoHandler.ts
 * @description Handler for GET_ACTIVE_FILE_INFO messages.
 * @module ContextWeaver/CE
 */

import { ActiveFileInfoResponsePayload, extractErrorInfo } from '@contextweaver/shared';
import { Logger } from '@contextweaver/shared';
import { IMessageHandler, HandlerResponse } from './IMessageHandler';
import { IPCClient } from '../ipcClient';

/**
 * Handles GET_ACTIVE_FILE_INFO messages by requesting active file information from VSCE.
 */
export class GetActiveFileInfoHandler implements IMessageHandler<unknown, HandlerResponse<ActiveFileInfoResponsePayload['data']>> {
    private readonly logger = new Logger('GetActiveFileInfoHandler');

    /**
     * Handles the request for active file information.
     * @param payload Empty payload - no parameters needed.
     * @param ipcClient The IPC client for communicating with VSCE.
     * @returns Promise resolving to the active file info response.
     */
    async handle(payload: unknown, ipcClient: IPCClient): Promise<HandlerResponse<ActiveFileInfoResponsePayload['data']>> {
        this.logger.debug('Handling GET_ACTIVE_FILE_INFO');
        
        try {
            const responsePayload: ActiveFileInfoResponsePayload = await ipcClient.getActiveFileInfo();
            
            this.logger.trace('Response for get_active_file_info:', responsePayload.data?.activeFileLabel);
            
            if (responsePayload.success === false) {
                return { success: false, error: responsePayload.error || 'Failed to get active file info from VSCE.' };
            } else {
                return { success: true, data: responsePayload.data };
            }
        } catch (error) {
            this.logger.error('Error in get_active_file_info IPC call:', error);
            const errorInfo = extractErrorInfo(error);
            return { success: false, error: errorInfo.message || 'IPC call failed for get_active_file_info.' };
        }
    }
}