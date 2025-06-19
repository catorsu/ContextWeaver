/**
 * @file GetFolderContentHandler.ts
 * @description Handler for get_folder_content IPC command requests.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@contextweaver/shared';

import { ICommandHandler } from '../ICommandHandler';
import { ClientContext } from '../types';
import { IFilterService } from '../../../../core/ports/IFilterService';
import { WorkspaceService } from '../../../../workspaceService';
import { getFolderContentsForIPC } from '../../../../fileSystemService';
import {
    GetFolderContentRequestPayload,
    FolderContentResponsePayload,
    ContextBlockMetadata
} from '@contextweaver/shared';

/**
 * Handler for processing get_folder_content command requests.
 * Retrieves and returns the content of all files within a specified folder.
 */
export class GetFolderContentHandler implements ICommandHandler<GetFolderContentRequestPayload, FolderContentResponsePayload> {
    private readonly logger = new Logger('GetFolderContentHandler');

    constructor(
        private readonly filterService: IFilterService,
        private readonly workspaceService: WorkspaceService,
        private readonly windowId: string
    ) {}

    /**
     * Handles a get_folder_content request by reading all files in the specified folder.
     */
    async handle(request: { payload: GetFolderContentRequestPayload; client: ClientContext }): Promise<FolderContentResponsePayload> {
        const { payload, client } = request;
        const { folderPath, workspaceFolderUri } = payload;

        if (!folderPath || typeof folderPath !== 'string' || !workspaceFolderUri || typeof workspaceFolderUri !== 'string') {
            throw new Error('Missing or invalid folderPath or workspaceFolderUri in payload.');
        }

        this.logger.debug(`Processing get_folder_content for: ${folderPath} in workspace ${workspaceFolderUri}`);

        try {
            const folderUri = vscode.Uri.parse(folderPath, true);
            const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(workspaceFolderUri, 'get_folder_content');

            const filter = await this.filterService.createFilterForWorkspace(targetWorkspaceFolder);
            const result = await getFolderContentsForIPC(folderUri, targetWorkspaceFolder, filter);

            if (!result || typeof result === 'string') {
                throw new Error(typeof result === 'string' ? result : 'Failed to read folder contents.');
            }

            const { filesData, filterTypeApplied } = result;
            const actualFolderUri = folderUri;

            const metadata: ContextBlockMetadata = {
                unique_block_id: uuidv4(),
                content_source_id: actualFolderUri.toString(),
                type: 'folder_content',
                label: path.basename(actualFolderUri.fsPath),
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                workspaceFolderName: targetWorkspaceFolder.name,
                windowId: this.windowId
            };

            const responsePayload: FolderContentResponsePayload = {
                success: true,
                data: {
                    filesData: filesData,
                    metadata: metadata,
                    windowId: this.windowId
                },
                error: null,
                errorCode: undefined,
                folderPath: actualFolderUri.toString(),
                filterType: filterTypeApplied,
                workspaceFolderUri: targetWorkspaceFolder.uri.toString()
            };

            this.logger.debug(`Sent folder content for ${actualFolderUri.toString()} (${filesData.length} files, Filter: ${filterTypeApplied}) to ${client.ip}`);
            return responsePayload;

        } catch (error) {
            this.logger.error(`Error reading folder ${folderPath}: ${error instanceof Error ? error.message : String(error)}`);
            const _errorCode = (error as Error & { code?: string }).code === 'DirectoryNotFound' ? 'DIRECTORY_NOT_FOUND' : 'FOLDER_READ_ERROR';
            throw new Error(`Error reading folder: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Determines the target workspace folder based on a requested URI string.
     */
    private async getTargetWorkspaceFolder(
        requestedUriString: string,
        commandName: string
    ): Promise<vscode.WorkspaceFolder> {
        try {
            const requestedUri = vscode.Uri.parse(requestedUriString, true);
            const targetWorkspaceFolder = this.workspaceService.getWorkspaceFolder(requestedUri);
            if (!targetWorkspaceFolder) {
                throw new Error(`Specified workspace folder URI '${requestedUriString}' not found for ${commandName}.`);
            }
            return targetWorkspaceFolder;
        } catch (e) {
            this.logger.warn(`Invalid workspaceFolderUri for ${commandName}: ${requestedUriString}. Error: ${e instanceof Error ? e.message : String(e)}`);
            throw new Error(`Invalid workspaceFolderUri: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}