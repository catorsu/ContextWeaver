/**
 * @file GetActiveFileInfoHandler.ts
 * @description Handler for get_active_file_info IPC command requests.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger, ActiveFileInfoResponsePayload } from '@contextweaver/shared';
import { ICommandHandler } from '../ICommandHandler';
import { ClientContext } from '../types';
import { WorkspaceService } from '../../../../workspaceService';

/**
 * Handler for processing get_active_file_info command requests.
 * Retrieves information about the currently active file in the editor.
 */
export class GetActiveFileInfoHandler implements ICommandHandler<void, ActiveFileInfoResponsePayload> {
    private readonly logger = new Logger('GetActiveFileInfoHandler');

    constructor(
        private readonly workspaceService: WorkspaceService,
        private readonly windowId: string
    ) {}

    /**
     * Handles a get_active_file_info request by gathering information about the active file.
     */
    async handle(request: { payload: void; client: ClientContext }): Promise<ActiveFileInfoResponsePayload> {
        const { client } = request;

        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                const responsePayload: ActiveFileInfoResponsePayload = {
                    success: false,
                    data: null,
                    error: 'No active file',
                    errorCode: 'NO_ACTIVE_FILE'
                };
                return responsePayload;
            }

            const fileUri = activeEditor.document.uri;
            const workspaceFolder = this.workspaceService.getWorkspaceFolder(fileUri);

            const responsePayload: ActiveFileInfoResponsePayload = {
                success: true,
                data: {
                    activeFilePath: fileUri.toString(),
                    activeFileLabel: path.basename(fileUri.fsPath),
                    workspaceFolderUri: workspaceFolder?.uri.toString() || null,
                    workspaceFolderName: workspaceFolder?.name || null,
                    windowId: this.windowId
                },
                error: null,
                errorCode: undefined
            };

            this.logger.debug(`Sent active file info to ${client.ip}`);
            return responsePayload;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error getting active file info: ${errorMessage}`);
            throw new Error(`Error getting active file info: ${errorMessage}`);
        }
    }
}