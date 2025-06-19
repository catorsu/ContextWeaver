/**
 * @file GetFileTreeHandler.ts
 * @description Handler for get_FileTree IPC command requests.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@contextweaver/shared';

import { ICommandHandler } from '../ICommandHandler';
import { ClientContext } from '../types';
import { IFilterService } from '../../../../core/ports/IFilterService';
import { WorkspaceService } from '../../../../workspaceService';
import { getFileTree } from '../../../../fileSystemService';
import {
    GetFileTreeRequestPayload,
    FileTreeResponsePayload,
    ContextBlockMetadata
} from '@contextweaver/shared';

/**
 * Handler for processing get_FileTree command requests.
 * Generates and returns the file tree for a specified workspace folder.
 */
export class GetFileTreeHandler implements ICommandHandler<GetFileTreeRequestPayload, FileTreeResponsePayload> {
    private readonly logger = new Logger('GetFileTreeHandler');

    constructor(
        private readonly filterService: IFilterService,
        private readonly workspaceService: WorkspaceService,
        private readonly windowId: string
    ) {}

    /**
     * Handles a get_FileTree request by generating the file tree for the specified workspace.
     */
    async handle(request: { payload: GetFileTreeRequestPayload; client: ClientContext }): Promise<FileTreeResponsePayload> {
        const { payload, client } = request;
        
        const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(
            payload.workspaceFolderUri,
            'get_FileTree'
        );

        const filter = await this.filterService.createFilterForWorkspace(targetWorkspaceFolder);
        const result = await getFileTree(targetWorkspaceFolder, filter);

        if (typeof result === 'string' && result.startsWith('Error:')) {
            throw new Error(result);
        }

        const { tree: fileTreeString, filterTypeApplied } = result as { tree: string; filterTypeApplied: 'gitignore' | 'default' };

        const metadata: ContextBlockMetadata = {
            unique_block_id: uuidv4(),
            content_source_id: `${targetWorkspaceFolder.uri.toString()}::FileTree`,
            type: 'FileTree',
            label: targetWorkspaceFolder.name,
            workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
            workspaceFolderName: targetWorkspaceFolder.name,
            windowId: this.windowId
        };

        const responsePayload: FileTreeResponsePayload = {
            success: true,
            data: {
                fileTreeString: fileTreeString,
                metadata: metadata,
                windowId: this.windowId
            },
            error: null,
            errorCode: undefined,
            workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
            filterType: filterTypeApplied
        };

        this.logger.debug(`Generated file tree for ${targetWorkspaceFolder.uri.toString()} (Filter: ${filterTypeApplied}) for ${client.ip}`);
        return responsePayload;
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