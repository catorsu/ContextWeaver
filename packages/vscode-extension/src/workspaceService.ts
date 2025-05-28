/**
 * @file workspaceService.ts
 * @description Provides services for interacting with the VS Code workspace,
 * including workspace trust, folder information, and state.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';

const LOG_PREFIX_WORKSPACE_SERVICE = '[ContextWeaver WorkspaceService] ';

export class WorkspaceServiceError extends Error {
    constructor(public code: string, message: string) {
        super(message);
        this.name = 'WorkspaceServiceError';
    }
}

export class WorkspaceService {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.outputChannel.appendLine(LOG_PREFIX_WORKSPACE_SERVICE + 'Initialized.');
    }

    /**
     * @description Checks if the current workspace is trusted.
     * @returns {boolean} True if the workspace is trusted, false otherwise.
     */
    public isWorkspaceTrusted(): boolean {
        const trusted = vscode.workspace.isTrusted;
        this.outputChannel.appendLine(LOG_PREFIX_WORKSPACE_SERVICE + `Workspace trusted: ${trusted}`);
        return trusted;
    }

    /**
     * @description Gets all workspace folders.
     * @returns {readonly vscode.WorkspaceFolder[] | undefined} An array of workspace folders, or undefined if no workspace is open.
     */
    public getWorkspaceFolders(): readonly vscode.WorkspaceFolder[] | undefined {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            this.outputChannel.appendLine(LOG_PREFIX_WORKSPACE_SERVICE + `Found ${folders.length} workspace folder(s).`);
        } else {
            this.outputChannel.appendLine(LOG_PREFIX_WORKSPACE_SERVICE + 'No workspace folders found.');
        }
        return folders;
    }

    /**
     * @description Gets a specific workspace folder by its URI.
     * @param {vscode.Uri} uri - The URI of the workspace folder.
     * @returns {vscode.WorkspaceFolder | undefined} The workspace folder, or undefined if not found.
     */
    public getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (folder) {
            this.outputChannel.appendLine(LOG_PREFIX_WORKSPACE_SERVICE + `Workspace folder found for URI ${uri.toString()}: ${folder.name}`);
        } else {
            this.outputChannel.appendLine(LOG_PREFIX_WORKSPACE_SERVICE + `No workspace folder found for URI ${uri.toString()}`);
        }
        return folder;
    }

    /**
     * @description Gets an array of details for all open and trusted workspace folders.
     * @returns {{ uri: string, name: string, isTrusted: boolean }[] | null} 
     *          An array of workspace folder details, or null if no workspace is open or none are trusted.
     *          Each trusted folder will have isTrusted = true. If the overall workspace is not trusted,
     *          this function will still list folders but mark them based on individual trust (which is usually false if workspace isn't trusted).
     *          However, core operations should be blocked if `isWorkspaceTrusted()` is false.
     */
    public getWorkspaceDetailsForIPC(): { uri: string, name: string, isTrusted: boolean }[] | null {
        const folders = this.getWorkspaceFolders();
        if (!folders || folders.length === 0) {
            this.outputChannel.appendLine(LOG_PREFIX_WORKSPACE_SERVICE + 'No workspace open, returning null for IPC details.');
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
     * @description Ensures that the workspace is trusted and at least one folder is open.
     * Throws a WorkspaceServiceError if conditions are not met.
     * @throws {WorkspaceServiceError} If the workspace is not trusted or no folders are open.
     * @returns {Promise<void>} Resolves if checks pass.
     */
    public async ensureWorkspaceTrustedAndOpen(): Promise<void> {
        if (!this.isWorkspaceTrusted()) {
            this.outputChannel.appendLine(LOG_PREFIX_WORKSPACE_SERVICE + 'Error: Workspace is not trusted.');
            throw new WorkspaceServiceError('WORKSPACE_NOT_TRUSTED', 'Workspace is not trusted. Please trust the workspace to use this feature.');
        }
        const folders = this.getWorkspaceFolders();
        if (!folders || folders.length === 0) {
            this.outputChannel.appendLine(LOG_PREFIX_WORKSPACE_SERVICE + 'Error: No workspace folder is open.');
            throw new WorkspaceServiceError('NO_WORKSPACE_OPEN', 'No workspace folder is open. Please open a folder or workspace.');
        }
        // If we reach here, workspace is trusted and at least one folder is open.
    }
}