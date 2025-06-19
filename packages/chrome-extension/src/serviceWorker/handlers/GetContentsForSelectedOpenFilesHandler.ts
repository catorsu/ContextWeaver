/**
 * @file GetContentsForSelectedOpenFilesHandler.ts
 * @description Handler for GET_CONTENTS_FOR_SELECTED_OPEN_FILES messages.
 * @module ContextWeaver/CE
 */

import { ContentsForFilesResponsePayload } from '@contextweaver/shared';
import { Logger } from '@contextweaver/shared';
import { IMessageHandler } from './IMessageHandler';
import { IPCClient } from '../ipcClient';

/**
 * Handles GET_CONTENTS_FOR_SELECTED_OPEN_FILES messages by requesting content for multiple files from VSCE.
 */
export class GetContentsForSelectedOpenFilesHandler implements IMessageHandler {
    private readonly logger = new Logger('GetContentsForSelectedOpenFilesHandler');

    /**
     * Handles the request for content of selected open files.
     * @param payload The payload containing fileUris array.
     * @param ipcClient The IPC client for communicating with VSCE.
     * @returns Promise resolving to the contents response.
     */
    async handle(payload: { fileUris: string[] }, ipcClient: IPCClient): Promise<any> {
        const fileUris = payload.fileUris;
        this.logger.debug(`Handling GET_CONTENTS_FOR_SELECTED_OPEN_FILES for ${fileUris.length} URIs`);

        if (!Array.isArray(fileUris) || fileUris.length === 0) {
            return { success: false, error: 'No file URIs provided.' };
        }

        try {
            const response: ContentsForFilesResponsePayload = await ipcClient.getContentsForFiles(fileUris);

            if (!response || response.success === false) {
                return { success: false, error: response?.error || 'Failed to get contents for files.' };
            }

            const successfulFilesData = response.data?.map((item: any) => ({
                fileData: item.fileData,
                metadata: item.metadata
            })) || [];

            const erroredFiles = response.errors || [];

            return {
                success: true,
                data: successfulFilesData,
                errors: erroredFiles
            };
        } catch (error) {
            this.logger.error('Error in getContentsForFiles IPC call:', error);
            return { success: false, error: (error as Error).message || 'Failed to process multiple file content requests.' };
        }
    }
}