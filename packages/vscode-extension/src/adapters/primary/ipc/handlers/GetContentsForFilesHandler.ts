/**
 * @file GetContentsForFilesHandler.ts
 * @description Handler for get_contents_for_files IPC command requests.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@contextweaver/shared';

import { ICommandHandler } from '../ICommandHandler';
import { ClientContext } from '../types';
import { WorkspaceService } from '../../../../workspaceService';
import { getFileContentWithLanguageId } from '../../../../fileSystemService';
import {
    GetContentsForFilesRequestPayload,
    ContentsForFilesResponsePayload,
    ContextBlockMetadata,
    FileContentResponseData
} from '@contextweaver/shared';

/**
 * Handler for processing get_contents_for_files command requests.
 * Retrieves and returns the content of multiple specified files.
 */
export class GetContentsForFilesHandler implements ICommandHandler<GetContentsForFilesRequestPayload, ContentsForFilesResponsePayload> {
    private readonly logger = new Logger('GetContentsForFilesHandler');

    constructor(
        private readonly workspaceService: WorkspaceService,
        private readonly windowId: string
    ) {}

    /**
     * Handles a get_contents_for_files request by reading multiple files' content.
     */
    async handle(request: { payload: GetContentsForFilesRequestPayload; client: ClientContext }): Promise<ContentsForFilesResponsePayload> {
        const { payload, client } = request;
        const { fileUris } = payload;

        if (!Array.isArray(fileUris) || fileUris.length === 0) {
            throw new Error('Missing or invalid fileUris array in payload.');
        }

        this.logger.debug(`Processing get_contents_for_files for ${fileUris.length} files.`);

        const results: FileContentResponseData[] = [];
        const errors: { uri: string; error: string; errorCode?: string }[] = [];

        for (const uriString of fileUris) {
            try {
                const fileUri = vscode.Uri.parse(uriString, true);
                const result = await getFileContentWithLanguageId(fileUri);

                if (result) {
                    const associatedWorkspaceFolder = this.workspaceService.getWorkspaceFolder(fileUri);
                    const metadata: ContextBlockMetadata = {
                        unique_block_id: uuidv4(),
                        content_source_id: fileUri.toString(),
                        type: 'file_content',
                        label: path.basename(fileUri.fsPath),
                        workspaceFolderUri: associatedWorkspaceFolder?.uri.toString() || null,
                        workspaceFolderName: associatedWorkspaceFolder?.name || null,
                        windowId: this.windowId
                    };
                    results.push({
                        fileData: result,
                        metadata: metadata,
                        windowId: this.windowId
                    });
                } else {
                    errors.push({ uri: uriString, error: 'File is binary, empty, or could not be read.', errorCode: 'FILE_READ_ERROR' });
                }
            } catch (error) {
                const errorWithCode = error as Error & { code?: string };
                const errorCode = errorWithCode.code === 'FileNotFound' ? 'FILE_NOT_FOUND' : 'FILE_READ_ERROR';
                const errorMessage = error instanceof Error ? error.message : String(error);
                errors.push({ uri: uriString, error: errorMessage, errorCode });
            }
        }

        const responsePayload: ContentsForFilesResponsePayload = {
            success: true,
            data: results,
            errors: errors,
            error: null
        };

        this.logger.debug(`Sent contents for ${results.length} files (and ${errors.length} errors) to ${client.ip}`);
        return responsePayload;
    }
}