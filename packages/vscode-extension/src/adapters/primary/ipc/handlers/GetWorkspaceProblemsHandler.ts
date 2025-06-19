/**
 * @file GetWorkspaceProblemsHandler.ts
 * @description Handler for get_workspace_problems IPC command requests.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@contextweaver/shared';

import { ICommandHandler } from '../ICommandHandler';
import { ClientContext } from '../types';
import { WorkspaceService } from '../../../../workspaceService';
import { DiagnosticsService } from '../../../../diagnosticsService';
import {
    GetWorkspaceProblemsRequestPayload,
    WorkspaceProblemsResponsePayload,
    ContextBlockMetadata
} from '@contextweaver/shared';

/**
 * Handler for processing get_workspace_problems command requests.
 * Retrieves and returns diagnostic problems (errors, warnings) for a workspace folder.
 */
export class GetWorkspaceProblemsHandler implements ICommandHandler<GetWorkspaceProblemsRequestPayload, WorkspaceProblemsResponsePayload> {
    private readonly logger = new Logger('GetWorkspaceProblemsHandler');

    constructor(
        private readonly workspaceService: WorkspaceService,
        private readonly diagnosticsService: DiagnosticsService,
        private readonly windowId: string
    ) {}

    /**
     * Handles a get_workspace_problems request by gathering diagnostic information.
     */
    async handle(request: { payload: GetWorkspaceProblemsRequestPayload; client: ClientContext }): Promise<WorkspaceProblemsResponsePayload> {
        const { payload, client } = request;
        
        const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(
            payload.workspaceFolderUri,
            'get_workspace_problems'
        );

        try {
            const { problemsString, problemCount } = this.diagnosticsService.getProblemsForWorkspace(targetWorkspaceFolder);

            const metadata: ContextBlockMetadata = {
                unique_block_id: uuidv4(),
                content_source_id: `${targetWorkspaceFolder.uri.toString()}::Problems`,
                type: 'WorkspaceProblems',
                label: targetWorkspaceFolder.name,
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                workspaceFolderName: targetWorkspaceFolder.name,
                windowId: this.windowId
            };

            const responsePayload: WorkspaceProblemsResponsePayload = {
                success: true,
                data: {
                    problemsString: problemsString,
                    problemCount: problemCount,
                    metadata: metadata,
                    windowId: this.windowId,
                },
                error: null,
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
            };

            this.logger.debug(`Sent workspace problems for ${targetWorkspaceFolder.name} to ${client.ip}`);
            return responsePayload;

        } catch (error) {
            this.logger.error(`Error getting workspace problems for ${targetWorkspaceFolder.uri.toString()}: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error(`Error getting workspace problems: ${error instanceof Error ? error.message : String(error)}`);
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