/**
 * @file snippetService.ts
 * @description Service for preparing code snippets to be sent to the Chrome Extension.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Defines the structure for a code snippet payload, excluding `targetTabId` and `windowId`
 * which are added by the caller (e.g., `extension.ts`).
 */
export interface SnippetPayload {
    snippet: string;
    language: string;
    filePath: string; // Full path
    relativeFilePath: string; // Path relative to workspace folder
    startLine: number; // 1-indexed
    endLine: number; // 1-indexed
    metadata: {
        unique_block_id: string;
        content_source_id: string;
        type: 'CodeSnippet';
        label: string;
        workspaceFolderUri: string | null;
        workspaceFolderName: string | null;
        windowId?: string; // Optional, will be filled by the caller
    };
}

/**
 * Provides functionality to prepare code snippets from the active VS Code editor
 * for transmission to the Chrome Extension.
 */
export class SnippetService {
    private outputChannel: vscode.OutputChannel;

    /**
     * Creates an instance of SnippetService.
     * @param outputChannel The VS Code output channel for logging.
     */
    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.outputChannel.appendLine('[ContextWeaver SnippetService] Initialized.');
        console.log('[ContextWeaver SnippetService] Initialized.');
    }

    /**
     * @description Prepares the snippet data from the active editor's selection.
     * @returns {SnippetPayload | null} The prepared snippet payload, or null if no valid selection.
     */
    public prepareSnippetData(): SnippetPayload | null {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this.outputChannel.appendLine('[ContextWeaver SnippetService] No active text editor.');
            // vscode.window.showInformationMessage('ContextWeaver: No active text editor to get snippet from.');
            return null;
        }

        if (editor.document.isUntitled) {
            this.outputChannel.appendLine('[ContextWeaver SnippetService] Cannot get snippet from an untitled document.');
            vscode.window.showWarningMessage('ContextWeaver: Please save the file before sending a snippet.');
            return null;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            this.outputChannel.appendLine('[ContextWeaver SnippetService] No text selected.');
            // vscode.window.showInformationMessage('ContextWeaver: No text selected to send as snippet.');
            return null;
        }

        // For simplicity, we'll use the primary selection if there are multiple.
        // VS Code's default context menu behavior usually operates on the selection where the menu was invoked.
        const selectedText = editor.document.getText(selection);
        const document = editor.document;
        const filePath = document.uri.fsPath;
        const languageId = document.languageId;

        // Line numbers are 0-indexed in API, convert to 1-indexed for display and source_id consistency
        const startLine = selection.start.line + 1;
        const endLine = selection.end.line + 1;

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        const workspaceFolderUriString = workspaceFolder ? workspaceFolder.uri.toString() : null;
        const workspaceFolderName = workspaceFolder ? workspaceFolder.name : null;

        // Ensure relative path is calculated correctly, even if file is not in a workspace folder (though less common for snippets)
        const relativeFilePath = workspaceFolder ? vscode.workspace.asRelativePath(document.uri, false) : path.basename(filePath);

        const unique_block_id = uuidv4();
        // Use document.uri.toString() for a consistent URI format (e.g., file:///)
        const content_source_id = `${document.uri.toString()}::snippet::${startLine}-${endLine}`;
        const label = `${path.basename(filePath)} (lines ${startLine}-${endLine})`;

        const snippetPayload: SnippetPayload = {
            snippet: selectedText,
            language: languageId,
            filePath: filePath,
            relativeFilePath: relativeFilePath,
            startLine: startLine,
            endLine: endLine,
            metadata: {
                unique_block_id,
                content_source_id,
                type: 'CodeSnippet',
                label,
                workspaceFolderUri: workspaceFolderUriString,
                workspaceFolderName: workspaceFolderName,
            },
        };

        this.outputChannel.appendLine(`[ContextWeaver SnippetService] Prepared snippet from ${filePath} (lines ${startLine}-${endLine})`);
        return snippetPayload;
    }
}
