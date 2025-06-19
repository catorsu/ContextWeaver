/**
 * @file GetContentsForSelectedOpenFilesHandler.ts
 * @description Handler for GET_CONTENTS_FOR_SELECTED_OPEN_FILES messages.
 * @module ContextWeaver/CE
 */

import { ContentsForFilesResponsePayload, FileContentResponseData, extractErrorInfo } from '@contextweaver/shared';
import { Logger } from '@contextweaver/shared';
import { IMessageHandler, HandlerResponse } from './IMessageHandler';
import { IPCClient } from '../ipcClient';

/**
 * Handles GET_CONTENTS_FOR_SELECTED_OPEN_FILES messages by requesting content for multiple files from VSCE.
 */
interface ContentsForFilesHandlerResponse extends HandlerResponse<FileContentResponseData[]> {
    errors?: Array<{ uri: string; error: string; errorCode?: string }>;
}

export class GetContentsForSelectedOpenFilesHandler implements IMessageHandler<{ fileUris: string[] }, ContentsForFilesHandlerResponse> {
    private readonly logger = new Logger('GetContentsForSelectedOpenFilesHandler');

    /**
     * Handles the request for content of selected open files.
     * @param payload The payload containing fileUris array.
     * @param ipcClient The IPC client for communicating with VSCE.
     * @returns Promise resolving to the contents response.
     */
    async handle(payload: { fileUris: string[] }, ipcClient: IPCClient): Promise<ContentsForFilesHandlerResponse> {
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

            const successfulFilesData = response.data?.map((item) => ({
                fileData: item.fileData,
                metadata: item.metadata,
                windowId: item.windowId
            })) || [];

            const erroredFiles = response.errors || [];

            return {
                success: true,
                data: successfulFilesData,
                errors: erroredFiles
            };
        } catch (error) {
            this.logger.error('Error in getContentsForFiles IPC call:', error);
            const errorInfo = extractErrorInfo(error);
            return { success: false, error: errorInfo.message || 'Failed to process multiple file content requests.' };
        }
    }
}