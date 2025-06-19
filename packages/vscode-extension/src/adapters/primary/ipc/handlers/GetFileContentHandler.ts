/**
 * @file GetFileContentHandler.ts
 * @description Handler for get_file_content IPC command requests.
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
    GetFileContentRequestPayload,
    FileContentResponsePayload,
    ContextBlockMetadata,
    FileData as CWFileData
} from '@contextweaver/shared';

/**
 * Handler for processing get_file_content command requests.
 * Retrieves and returns the content of a specified file.
 */
export class GetFileContentHandler implements ICommandHandler<GetFileContentRequestPayload, FileContentResponsePayload> {
    private readonly logger = new Logger('GetFileContentHandler');

    constructor(
        private readonly workspaceService: WorkspaceService,
        private readonly windowId: string
    ) {}

    /**
     * Handles a get_file_content request by reading the specified file's content.
     */
    async handle(request: { payload: GetFileContentRequestPayload; client: ClientContext }): Promise<FileContentResponsePayload> {
        const { payload, client } = request;
        const { filePath } = payload;

        if (!filePath || typeof filePath !== 'string') {
            throw new Error('Missing or invalid filePath in payload.');
        }

        this.logger.debug(`Processing get_file_content for: ${filePath}`);

        try {
            const fileUri = vscode.Uri.parse(filePath, true);

            let associatedWorkspaceFolder = this.workspaceService.getWorkspaceFolder(fileUri);
            if (!associatedWorkspaceFolder) {
                const allFolders = this.workspaceService.getWorkspaceFolders();
                if (allFolders) {
                    for (const folder of allFolders) {
                        if (fileUri.fsPath.startsWith(folder.uri.fsPath)) {
                            associatedWorkspaceFolder = folder;
                            break;
                        }
                    }
                }
            }

            const result = await getFileContentWithLanguageId(fileUri);

            if (!result) {
                throw new Error('Failed to read file content.');
            }

            const fileData: CWFileData = {
                fullPath: fileUri.fsPath,
                content: result.content,
                languageId: result.languageId
            };

            const metadata: ContextBlockMetadata = {
                unique_block_id: uuidv4(),
                content_source_id: fileUri.toString(),
                type: 'file_content',
                label: path.basename(fileUri.fsPath),
                workspaceFolderUri: associatedWorkspaceFolder?.uri.toString() || null,
                workspaceFolderName: associatedWorkspaceFolder?.name || null,
                windowId: this.windowId
            };

            const responsePayload: FileContentResponsePayload = {
                success: true,
                data: {
                    fileData: fileData,
                    metadata: metadata,
                    windowId: this.windowId
                },
                error: null,
                errorCode: undefined,
                filePath: filePath,
                filterType: 'not_applicable'
            };

            this.logger.debug(`Read file content for ${filePath} for ${client.ip}`);
            return responsePayload;

        } catch (error) {
            this.logger.error(`Error reading file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
            const _errorCode = (error as Error & { code?: string }).code === 'FileNotFound' ? 'FILE_NOT_FOUND' : 'FILE_READ_ERROR';
            throw new Error(`Error reading file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}