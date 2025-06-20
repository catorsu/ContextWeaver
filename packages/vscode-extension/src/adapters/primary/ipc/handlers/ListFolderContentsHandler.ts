/**
 * @file ListFolderContentsHandler.ts
 * @description Handler for list_folder_contents IPC command requests.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import { Logger } from '@contextweaver/shared';

import { ICommandHandler } from '../ICommandHandler';
import { ClientContext } from '../types';
import { IFilterService } from '../../../../core/ports/IFilterService';
import { WorkspaceService } from '../../../../core/services/WorkspaceService';
import { FileSystemService } from '../../../../core/services/FileSystemService';
import {
    ListFolderContentsRequestPayload,
    ListFolderContentsResponsePayload
} from '@contextweaver/shared';

/**
 * Handler for processing list_folder_contents command requests.
 * Lists the contents (files and directories) of a specified folder.
 */
export class ListFolderContentsHandler implements ICommandHandler<ListFolderContentsRequestPayload, ListFolderContentsResponsePayload> {
    private readonly logger = new Logger('ListFolderContentsHandler');

    constructor(
        private readonly filterService: IFilterService,
        private readonly workspaceService: WorkspaceService,
        private readonly fileSystemService: FileSystemService,
        private readonly windowId: string
    ) {}

    /**
     * Handles a list_folder_contents request by listing directory entries.
     */
    async handle(request: { payload: ListFolderContentsRequestPayload; client: ClientContext }): Promise<ListFolderContentsResponsePayload> {
        const { payload, client } = request;
        const { folderUri: folderUriString, workspaceFolderUri } = payload;

        if (!folderUriString || typeof folderUriString !== 'string') {
            throw new Error('Missing or invalid folderUri in payload.');
        }

        this.logger.debug(`Processing list_folder_contents for: ${folderUriString}`);

        try {
            const folderUri = vscode.Uri.parse(folderUriString, true);
            const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(workspaceFolderUri, 'list_folder_contents');

            const filter = await this.filterService.createFilterForWorkspace(targetWorkspaceFolder);
            const result = await this.fileSystemService.getDirectoryListing(
                folderUri,
                targetWorkspaceFolder,
                filter
            );

            if (!result) {
                throw new Error('Failed to read directory contents.');
            }

            const { entries, filterTypeApplied } = result;

            // Add windowId to each entry
            const entriesWithWindowId = entries.map(entry => ({
                ...entry,
                windowId: this.windowId
            }));

            const responsePayload: ListFolderContentsResponsePayload = {
                success: true,
                data: {
                    entries: entriesWithWindowId,
                    parentFolderUri: folderUriString,
                    filterTypeApplied: filterTypeApplied,
                    windowId: this.windowId
                },
                error: null,
                errorCode: undefined
            };

            this.logger.debug(`Sent folder listing (${entries.length} entries) for ${folderUriString} to ${client.ip}`);
            return responsePayload;

        } catch (error) {
            this.logger.error(`Error listing folder contents for ${folderUriString}: ${error instanceof Error ? error.message : String(error)}`);
            const _errorCode = (error as Error & { code?: string }).code === 'DirectoryNotFound' ? 'DIRECTORY_NOT_FOUND' : 'DIRECTORY_READ_ERROR';
            throw new Error(`Error listing folder contents: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Determines the target workspace folder based on a requested URI string or the current workspace context.
     */
    private async getTargetWorkspaceFolder(
        requestedUriString: string | undefined | null,
        commandName: string
    ): Promise<vscode.WorkspaceFolder> {
        let targetWorkspaceFolder: vscode.WorkspaceFolder | undefined;

        if (requestedUriString) {
            try {
                const requestedUri = vscode.Uri.parse(requestedUriString, true);
                targetWorkspaceFolder = this.workspaceService.getWorkspaceFolder(requestedUri);
                if (!targetWorkspaceFolder) {
                    throw new Error(`Specified workspace folder URI '${requestedUriString}' not found for ${commandName}.`);
                }
            } catch (e) {
                this.logger.warn(`Invalid workspaceFolderUri for ${commandName}: ${requestedUriString}. Error: ${e instanceof Error ? e.message : String(e)}`);
                throw new Error(`Invalid workspaceFolderUri: ${e instanceof Error ? e.message : String(e)}`);
            }
        } else {
            const allFolders = this.workspaceService.getWorkspaceFolders();
            if (allFolders && allFolders.length > 1) {
                throw new Error(`Multiple workspace folders open. Please specify 'workspaceFolderUri' for ${commandName}.`);
            } else if (allFolders && allFolders.length === 1) {
                targetWorkspaceFolder = allFolders[0];
            } else {
                throw new Error(`No workspace folder open or specified for ${commandName}.`);
            }
        }
        return targetWorkspaceFolder;
    }
}