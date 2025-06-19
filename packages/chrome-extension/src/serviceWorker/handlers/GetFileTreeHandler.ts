/**
 * @file GetFileTreeHandler.ts
 * @description Handler for GET_FileTree messages.
 * @module ContextWeaver/CE
 */

import { GetFileTreeRequestPayload, FileTreeResponsePayload } from '@contextweaver/shared';
import { Logger } from '@contextweaver/shared';
import { IMessageHandler } from './IMessageHandler';
import { IPCClient } from '../ipcClient';

/**
 * Handles GET_FileTree messages by requesting file tree data from VSCE.
 */
export class GetFileTreeHandler implements IMessageHandler {
    private readonly logger = new Logger('GetFileTreeHandler');

    /**
     * Handles the request for file tree data.
     * @param payload The file tree request payload containing workspaceFolderUri.
     * @param ipcClient The IPC client for communicating with VSCE.
     * @returns Promise resolving to the file tree response.
     */
    async handle(payload: GetFileTreeRequestPayload, ipcClient: IPCClient): Promise<any> {
        this.logger.debug(`Handling GET_FileTree for URI: ${payload.workspaceFolderUri}`);
        
        try {
            const responsePayload: FileTreeResponsePayload = await ipcClient.getFileTree(payload.workspaceFolderUri);
            
            this.logger.trace(`Response for get_FileTree. Tree size: ${responsePayload.data?.fileTreeString?.length || 0}`);

            if (responsePayload.success === false) {
                return { success: false, error: responsePayload.error || 'Failed to get file tree from VSCE.' };
            } else if (responsePayload.data && responsePayload.data.fileTreeString !== undefined) {
                return {
                    success: true,
                    data: {
                        fileTreeString: responsePayload.data.fileTreeString,
                        metadata: responsePayload.data.metadata
                    },
                    workspaceFolderName: responsePayload.data.metadata?.workspaceFolderName,
                    filterType: responsePayload.filterType,
                    workspaceFolderUri: responsePayload.workspaceFolderUri
                };
            } else {
                return { success: false, error: 'Invalid file tree data from VSCE (missing data object or fileTreeString).' };
            }
        } catch (error) {
            this.logger.error('Error in get_FileTree IPC call:', error);
            return { success: false, error: (error as Error).message || 'IPC call failed for get_FileTree.' };
        }
    }
}