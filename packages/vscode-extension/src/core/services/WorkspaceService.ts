/**
 * @file WorkspaceService.ts
 * @description Provides services for interacting with the VS Code workspace,
 * including workspace trust, folder information, and state.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import { Logger } from '@contextweaver/shared';


/**
 * Custom error class for WorkspaceService operations.
 */
export class WorkspaceServiceError extends Error {
    constructor(public code: string, message: string) {
        super(message);
        this.name = 'WorkspaceServiceError';
    }
}

/**
 * Provides services for interacting with the VS Code workspace,
 * including checking workspace trust, retrieving folder information, and managing state.
 */
export class WorkspaceService {
    private readonly logger = new Logger('WorkspaceService');

    /**
     * Creates an instance of WorkspaceService.
     */
    constructor() {
        this.logger.info('Initialized.');
    }

    /**
     * Checks if the current workspace is trusted.
     * @returns True if the workspace is trusted, false otherwise.
     */
    public isWorkspaceTrusted(): boolean {
        const trusted = vscode.workspace.isTrusted;
        this.logger.debug(`Workspace trusted: ${trusted}`);
        return trusted;
    }

    /**
     * Gets all workspace folders.
     * @returns An array of workspace folders, or undefined if no workspace is open.
     */
    public getWorkspaceFolders(): readonly vscode.WorkspaceFolder[] | undefined {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            this.logger.debug(`Found ${folders.length} workspace folder(s).`);
        } else {
            this.logger.debug('No workspace folders found.');
        }
        return folders;
    }

    /**
     * Gets a specific workspace folder by its URI.
     * @param uri - The URI of the workspace folder.
     * @returns The workspace folder, or undefined if not found.
     */
    public getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (folder) {
            this.logger.trace(`Workspace folder found for URI ${uri.toString()}: ${folder.name}`);
        } else {
            this.logger.trace(`No workspace folder found for URI ${uri.toString()}`);
        }
        return folder;
    }

    /**
     * Gets an array of details for all open and trusted workspace folders.
     * @returns An array of workspace folder details, or null if no workspace is open or none are trusted.
     *          Each trusted folder will have isTrusted = true. If the overall workspace is not trusted,
     *          this function will still list folders but mark them based on individual trust (which is usually false if workspace isn't trusted).
     *          However, core operations should be blocked if `isWorkspaceTrusted()` is false.
     */
    public getWorkspaceDetailsForIPC(): { uri: string, name: string, isTrusted: boolean }[] | null {
        const folders = this.getWorkspaceFolders();
        if (!folders || folders.length === 0) {
            this.logger.info('No workspace open, returning null for IPC details.');
            return null;
        }

        const overallTrusted = this.isWorkspaceTrusted(); // Overall workspace trust

        return folders.map(folder => ({
            uri: folder.uri.toString(),
            name: folder.name,
            // For IPC, report overall trust status for simplicity, as operations are gated by it.
            // Individual folder trust isn't directly used by VS Code in the same way as overall workspace trust for API access.
            isTrusted: overallTrusted
        }));
    }


    /**
     * Ensures that the workspace is trusted and at least one folder is open.
     * Throws a WorkspaceServiceError if conditions are not met.
     * @throws {WorkspaceServiceError} If the workspace is not trusted or no folders are open.
     * @returns Resolves if checks pass.
     */
    public async ensureWorkspaceTrustedAndOpen(): Promise<void> {
        if (!this.isWorkspaceTrusted()) {
            this.logger.error('Workspace trust check failed.');
            throw new WorkspaceServiceError('WORKSPACE_NOT_TRUSTED', 'Workspace is not trusted. Please trust the workspace to use this feature.');
        }
        const folders = this.getWorkspaceFolders();
        if (!folders || folders.length === 0) {
            this.logger.error('No workspace folder is open check failed.');
            throw new WorkspaceServiceError('NO_WORKSPACE_OPEN', 'No workspace folder is open. Please open a folder or workspace.');
        }
        // If we reach here, workspace is trusted and at least one folder is open.
    }
}
