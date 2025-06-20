/**
 * @file GetOpenFilesHandler.ts
 * @description Handler for get_open_files IPC command requests.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '@contextweaver/shared';

import { ICommandHandler } from '../ICommandHandler';
import { ClientContext } from '../types';
import { WorkspaceService } from '../../../../core/services/WorkspaceService';
import {
    OpenFilesResponsePayload
} from '@contextweaver/shared';

/**
 * Handler for processing get_open_files command requests.
 * Retrieves a list of all currently open files in the editor.
 */
export class GetOpenFilesHandler implements ICommandHandler<void, OpenFilesResponsePayload> {
    private readonly logger = new Logger('GetOpenFilesHandler');

    constructor(
        private readonly workspaceService: WorkspaceService,
        private readonly windowId: string
    ) {}

    /**
     * Handles a get_open_files request by gathering information about all open files.
     */
    async handle(request: { payload: void; client: ClientContext }): Promise<OpenFilesResponsePayload> {
        const { client } = request;

        try {
            const openFiles = vscode.window.tabGroups.all
                .flatMap((group) => group.tabs)
                .filter((tab) => tab.input instanceof vscode.TabInputText)
                .map((tab) => {
                    const input = tab.input as vscode.TabInputText;
                    const workspaceFolder = this.workspaceService.getWorkspaceFolder(input.uri);
                    return {
                        path: input.uri.toString(),
                        name: path.basename(input.uri.fsPath),
                        workspaceFolderUri: workspaceFolder?.uri.toString() || null,
                        workspaceFolderName: workspaceFolder?.name || null,
                        windowId: this.windowId
                    };
                });

            const responsePayload: OpenFilesResponsePayload = {
                success: true,
                data: {
                    openFiles: openFiles
                },
                error: null,
                errorCode: undefined
            };

            this.logger.debug(`Sent open files list (${openFiles.length} files) to ${client.ip}`);
            return responsePayload;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error getting open files: ${errorMessage}`);
            throw new Error(`Error getting open files: ${errorMessage}`);
        }
    }
}