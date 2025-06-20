/**
 * @file GetEntireCodebaseHandler.ts
 * @description Handler for get_entire_codebase IPC command requests.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@contextweaver/shared';

import { ICommandHandler } from '../ICommandHandler';
import { ClientContext } from '../types';
import { IFilterService } from '../../../../core/ports/IFilterService';
import { WorkspaceService, WorkspaceServiceError } from '../../../../core/services/WorkspaceService';
import { FileSystemService } from '../../../../core/services/FileSystemService';
import {
    GetEntireCodebaseRequestPayload,
    EntireCodebaseResponsePayload,
    ContextBlockMetadata
} from '@contextweaver/shared';

/**
 * Handler for processing get_entire_codebase command requests.
 * Retrieves and returns the content of all files within the entire workspace/codebase.
 */
export class GetEntireCodebaseHandler implements ICommandHandler<GetEntireCodebaseRequestPayload, EntireCodebaseResponsePayload> {
    private readonly logger = new Logger('GetEntireCodebaseHandler');

    constructor(
        private readonly filterService: IFilterService,
        private readonly workspaceService: WorkspaceService,
        private readonly fileSystemService: FileSystemService,
        private readonly windowId: string
    ) { }

    /**
     * Handles a get_entire_codebase request by reading all files in the workspace.
     */
    async handle(request: { payload: GetEntireCodebaseRequestPayload; client: ClientContext }): Promise<EntireCodebaseResponsePayload> {
        const { payload, client } = request;

        const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(
            payload.workspaceFolderUri,
            'get_entire_codebase'
        );

        this.logger.debug(`Processing get_entire_codebase for workspace ${targetWorkspaceFolder.uri.toString()}`);

        try {
            const filter = await this.filterService.createFilterForWorkspace(targetWorkspaceFolder);
            const result = await this.fileSystemService.getWorkspaceDataForIPC(targetWorkspaceFolder, filter);

            if (!result || typeof result === 'string') {
                throw new Error(typeof result === 'string' ? result : 'Failed to read codebase.');
            }

            const { filesData, filterTypeApplied } = result;

            const metadata: ContextBlockMetadata = {
                unique_block_id: uuidv4(),
                content_source_id: `${targetWorkspaceFolder.uri.toString()}::entire_codebase`,
                type: 'codebase_content',
                label: targetWorkspaceFolder.name,
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                workspaceFolderName: targetWorkspaceFolder.name,
                windowId: this.windowId
            };

            const responsePayload: EntireCodebaseResponsePayload = {
                success: true,
                data: {
                    filesData: filesData,
                    metadata: metadata,
                    windowId: this.windowId
                },
                error: null,
                errorCode: undefined,
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                filterType: filterTypeApplied,
                workspaceFolderName: targetWorkspaceFolder.name,
                projectPath: targetWorkspaceFolder.uri.fsPath
            };

            this.logger.debug(`Sent entire codebase for ${targetWorkspaceFolder.uri.toString()} (${filesData.length} files, Filter: ${filterTypeApplied}) to ${client.ip}`);
            return responsePayload;

        } catch (error) {
            this.logger.error(`Error reading entire codebase: ${error instanceof Error ? error.message : String(error)}`);
            const _errorCode = error instanceof WorkspaceServiceError ? error.code : 'CODEBASE_READ_ERROR';
            throw new Error(`Error reading entire codebase: ${error instanceof Error ? error.message : String(error)}`);
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