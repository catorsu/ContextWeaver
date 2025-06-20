/**
 * @file GetFilterInfoHandler.ts
 * @description Handler for get_filter_info IPC command requests.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import { Logger } from '@contextweaver/shared';

import { ICommandHandler } from '../ICommandHandler';
import { ClientContext } from '../types';
import { WorkspaceService } from '../../../../core/services/WorkspaceService';
import {
    GetFilterInfoRequestPayload,
    FilterInfoResponsePayload
} from '@contextweaver/shared';

/**
 * Handler for processing get_filter_info command requests.
 * Retrieves information about the filtering rules applied to a workspace folder.
 */
export class GetFilterInfoHandler implements ICommandHandler<GetFilterInfoRequestPayload, FilterInfoResponsePayload> {
    private readonly logger = new Logger('GetFilterInfoHandler');

    constructor(
        private readonly workspaceService: WorkspaceService
    ) {}

    /**
     * Handles a get_filter_info request by determining the filter type for the workspace.
     */
    async handle(request: { payload: GetFilterInfoRequestPayload; client: ClientContext }): Promise<FilterInfoResponsePayload> {
        const { payload, client } = request;
        
        const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(
            payload.workspaceFolderUri,
            'get_filter_info'
        );

        try {
            const gitignorePath = vscode.Uri.joinPath(targetWorkspaceFolder.uri, '.gitignore');
            let filterType: 'gitignore' | 'default' | 'none' = 'none';

            try {
                await vscode.workspace.fs.stat(gitignorePath);
                filterType = 'gitignore';
            } catch {
                filterType = 'default';
            }

            const responsePayload: FilterInfoResponsePayload = {
                success: true,
                data: {
                    filterType: filterType,
                    workspaceFolderUri: targetWorkspaceFolder.uri.toString()
                },
                error: null,
                errorCode: undefined
            };

            this.logger.debug(`Sent filter info (${filterType}) for ${targetWorkspaceFolder.uri.toString()} to ${client.ip}`);
            return responsePayload;

        } catch (error) {
            this.logger.error(`Error getting filter info: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error(`Error getting filter info: ${error instanceof Error ? error.message : String(error)}`);
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