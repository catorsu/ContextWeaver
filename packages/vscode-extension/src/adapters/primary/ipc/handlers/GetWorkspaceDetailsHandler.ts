/**
 * @file GetWorkspaceDetailsHandler.ts
 * @description Handler for get_workspace_details IPC command requests.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import { Logger } from '@contextweaver/shared';

import { ICommandHandler } from '../ICommandHandler';
import { ClientContext } from '../types';
import { WorkspaceService, WorkspaceServiceError } from '../../../../core/services/WorkspaceService';
import {
    WorkspaceDetailsResponsePayload
} from '@contextweaver/shared';

/**
 * Handler for processing get_workspace_details command requests.
 * Retrieves and returns details about the current workspace.
 */
export class GetWorkspaceDetailsHandler implements ICommandHandler<void, WorkspaceDetailsResponsePayload> {
    private readonly logger = new Logger('GetWorkspaceDetailsHandler');

    constructor(
        private readonly workspaceService: WorkspaceService
    ) {}

    /**
     * Handles a get_workspace_details request by gathering workspace information.
     */
    async handle(request: { payload: void; client: ClientContext }): Promise<WorkspaceDetailsResponsePayload> {
        const { client } = request;

        try {
            const details = this.workspaceService.getWorkspaceDetailsForIPC();
            const responsePayload: WorkspaceDetailsResponsePayload = {
                success: true,
                data: {
                    workspaceFolders: details || [], // Ensure it's an array even if null
                    isTrusted: this.workspaceService.isWorkspaceTrusted(),
                    workspaceName: vscode.workspace.name // Add the workspace name
                },
                error: null,
                errorCode: undefined
            };

            this.logger.debug(`Sent workspace details to ${client.ip}`);
            return responsePayload;

        } catch (error) {
            this.logger.error(`Error getting workspace details: ${error instanceof Error ? error.message : String(error)}`);
            const _errorCode = error instanceof WorkspaceServiceError ? error.code : 'INTERNAL_SERVER_ERROR';
            throw new Error(`Error getting workspace details: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}