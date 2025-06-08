/**
 * @file extension.ts
 * @description Main entry point for the ContextWeaver VS Code Extension.
 * Handles activation, deactivation, and initializes the IPC server.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import { IPCServer } from './ipcServer';
import { SearchService } from './searchService';
import { SnippetService, SnippetPayload } from './snippetService';
import { WorkspaceService } from './workspaceService'; // Added import

const EXTENSION_ID = 'contextweaver'; // For settings and prefixing
const LOG_PREFIX = '[ContextWeaver] ';
let outputChannel: vscode.OutputChannel;
let ipcServer: IPCServer | null = null;
let snippetService: SnippetService;
let workspaceService: WorkspaceService; // Added declaration

// Interface for the subset of vscode.window methods needed by command handlers
/**
 * Defines a subset of the `vscode.window` API for testing purposes,
 * allowing command logic to be tested without a full VS Code environment.
 */
interface VSCodeWindowSubset {
    showErrorMessage: (message: string, ...items: any[]) => Thenable<string | undefined>;
    showWarningMessage: (message: string, ...items: any[]) => Thenable<string | undefined>;
    showInformationMessage: (message: string, ...items: any[]) => Thenable<string | undefined>;
}

/**
 * Handles the logic for the 'sendSnippet' command.
 * This function is exported for testing purposes.
 * @param services An object containing the IPC server and snippet service instances.
 * @param vsCodeWindow A subset of the vscode.window API for showing messages.
 * @param outputChannelRef The VS Code output channel for logging.
 */
export async function _handleSendSnippetCommandLogic(
    services: { ipcServer: IPCServer | null; snippetService: SnippetService | null },
    vsCodeWindow: VSCodeWindowSubset,
    outputChannelRef: vscode.OutputChannel
) {
    if (!services.ipcServer || !services.snippetService) {
        vsCodeWindow.showErrorMessage('ContextWeaver: Services not initialized.');
        outputChannelRef.appendLine(LOG_PREFIX + 'Error: sendSnippet called but services not initialized.');
        return;
    }

    const preparedSnippetData = services.snippetService.prepareSnippetData();
    if (preparedSnippetData) {
        const targetTabId = services.ipcServer.getPrimaryTargetTabId();
        if (targetTabId !== undefined) {
            const fullPayload = {
                ...preparedSnippetData,
                targetTabId: targetTabId
            };
            services.ipcServer.pushSnippetToTarget(targetTabId, fullPayload);
            vsCodeWindow.showInformationMessage('ContextWeaver: Snippet sent.');
            outputChannelRef.appendLine(LOG_PREFIX + 'Snippet sent to tab ID: ' + targetTabId);
        } else {
            vsCodeWindow.showWarningMessage('ContextWeaver: No active Chrome tab registered to send snippet to. Please ensure an LLM chat page is active in Chrome and ContextWeaver CE is connected.');
            outputChannelRef.appendLine(LOG_PREFIX + 'No active target tab ID found for snippet.');
        }
    } else {
        outputChannelRef.appendLine(LOG_PREFIX + 'Snippet preparation failed or not applicable (e.g., no selection).');
    }
}

/**
 * @description This method is called when your extension is activated.
 * Your extension is activated the very first time the command is executed
 * or when the `onStartupFinished` activation event occurs.
 * @param {vscode.ExtensionContext} context - The context for the extension.
 */
export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel("ContextWeaver VSCE");
    outputChannel.appendLine(LOG_PREFIX + 'Activating extension...');
    console.log(LOG_PREFIX + 'VSCE is now active.'); // Keep console log for debug console visibility too

    // Initialize services
    workspaceService = new WorkspaceService(outputChannel); // Instantiate WorkspaceService
    const searchService = new SearchService(outputChannel, workspaceService); // Pass outputChannel and workspaceService to SearchService

    // Retrieve configuration for IPC
    const configuration = vscode.workspace.getConfiguration(EXTENSION_ID);
    const port = configuration.get('ipc.port', 30001);

    ipcServer = new IPCServer(port, context, outputChannel, searchService, workspaceService); // Pass workspaceService

    // --- ADDED LOGGING ---
    console.log(LOG_PREFIX + 'IPCServer instance created. Attempting to start...');
    outputChannel.appendLine(LOG_PREFIX + 'IPCServer instance created. Attempting to start...');
    // --- END ADDED LOGGING ---

    ipcServer.start();

    // --- ADDED LOGGING ---
    console.log(LOG_PREFIX + 'ipcServer.start() called.');
    outputChannel.appendLine(LOG_PREFIX + 'ipcServer.start() called.');
    // --- END ADDED LOGGING ---

    snippetService = new SnippetService(outputChannel);

    context.subscriptions.push(
        new vscode.Disposable(() => {
            if (ipcServer) {
                ipcServer.stop();
            }
            outputChannel.dispose();
        })
    );

    // Example: Register a command (useful for testing later)
    let disposable = vscode.commands.registerCommand('contextweaver.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from ContextWeaver VSCE!');
        outputChannel.appendLine(LOG_PREFIX + "Command 'contextweaver.helloWorld' executed.");
    });
    context.subscriptions.push(disposable);

    // Register sendSnippet command
    const sendSnippetCommand = vscode.commands.registerCommand('contextweaver.sendSnippet',
        () => _handleSendSnippetCommandLogic({ ipcServer, snippetService }, vscode.window, outputChannel)
    );
    context.subscriptions.push(sendSnippetCommand);

    outputChannel.appendLine(LOG_PREFIX + 'Extension activated successfully.');
}

/**
 * @description This method is called when your extension is deactivated.
 */
export function deactivate() {
    if (ipcServer) {
        ipcServer.stop();
        ipcServer = null;
    }
    outputChannel.appendLine(LOG_PREFIX + 'Extension deactivated.');
    console.log(LOG_PREFIX + 'VSCE has been deactivated.');
}
