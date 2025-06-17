/**
 * @file extension.ts
 * @description Main entry point for the ContextWeaver VS Code Extension.
 * Handles activation, deactivation, and initializes the IPC server.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { Logger, LogLevel } from '@contextweaver/shared';
import { IPCServer } from './ipcServer';
import { SearchService } from './searchService';
import { SnippetService } from './snippetService';
import { WorkspaceService } from './workspaceService';
import { DiagnosticsService } from './diagnosticsService';
import { VSCodeOutputChannelLogger } from './vsceLogger';

let outputChannel: vscode.OutputChannel;
let ipcServer: IPCServer | null = null;
let snippetService: SnippetService;
let workspaceService: WorkspaceService; // Added declaration
let diagnosticsService: DiagnosticsService;

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
 * Handles the core logic for the 'sendSnippet' command. Exported for testing purposes.
 * @param services - An object containing the active service instances.
 * @param services.ipcServer - The active IPCServer instance.
 * @param services.snippetService - The active SnippetService instance.
 * @param vsCodeWindow - A subset of the `vscode.window` API for displaying messages.
 * @deprecated The outputChannelRef parameter is no longer used and will be removed.
 */
export async function _handleSendSnippetCommandLogic(
    services: { ipcServer: IPCServer | null; snippetService: SnippetService | null },
    vsCodeWindow: VSCodeWindowSubset
) {
    const logger = new Logger('Extension');
    if (!services.ipcServer || !services.snippetService) {
        vsCodeWindow.showErrorMessage('ContextWeaver: Services not initialized.');
        logger.error('sendSnippet called but services not initialized.');
        return;
    }

    const preparedSnippetData = services.snippetService.prepareSnippetData();
    if (preparedSnippetData) {
        // Ensure windowId is not optional by providing a default value
        const snippetDataForIPC = {
            ...preparedSnippetData,
            metadata: {
                ...preparedSnippetData.metadata,
                windowId: preparedSnippetData.metadata.windowId || '' // Will be filled by ipcServer
            }
        };
        // Instead of directly pushing, use the new method that handles primary/secondary logic
        services.ipcServer.handleSnippetSendRequest(snippetDataForIPC);
        vsCodeWindow.showInformationMessage('ContextWeaver: Snippet sent.');
        logger.info('Snippet send request handled.');
    } else {
        logger.warn('Snippet preparation failed or not applicable (e.g., no selection).');
    }
}

/**
 * @description This method is called when your extension is activated.
 * Your extension is activated the very first time the command is executed
 * or when the `onStartupFinished` activation event occurs.
 * @param {vscode.ExtensionContext} context - The context for the extension.
 */
export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('ContextWeaver VSCE');

    // 1. Configure the logger
    Logger.setOutput(new VSCodeOutputChannelLogger(outputChannel));
    Logger.setLevel(LogLevel.DEBUG); // Set to DEBUG for development, can be changed later

    const logger = new Logger('Extension');
    logger.info('Activating extension...');

    // Generate unique window ID
    const windowId = uuidv4();
    logger.info('Generated window ID:', windowId);

    // Initialize services
    workspaceService = new WorkspaceService();
    diagnosticsService = new DiagnosticsService();
    const searchService = new SearchService(workspaceService);

    // Rationale: Port is now determined automatically by the server. Pass a placeholder.
    ipcServer = new IPCServer(0, windowId, context, outputChannel, searchService, workspaceService, diagnosticsService);

    ipcServer.start();

    snippetService = new SnippetService();

    context.subscriptions.push(
        new vscode.Disposable(() => {
            if (ipcServer) {
                ipcServer.stop();
            }
            outputChannel.dispose();
        })
    );

    // Example: Register a command (useful for testing later)
    const disposable = vscode.commands.registerCommand('contextweaver.helloWorld', () => {
        vscode.window.showInformationMessage('ContextWeaver: Hello World!');
        logger.info('Command \'contextweaver.helloWorld\' executed.');
    });
    context.subscriptions.push(disposable);

    // Register sendSnippet command
    const sendSnippetCommand = vscode.commands.registerCommand('contextweaver.sendSnippet',
        () => _handleSendSnippetCommandLogic({ ipcServer, snippetService }, vscode.window)
    );
    context.subscriptions.push(sendSnippetCommand);

    logger.info('Extension activated successfully.');
}

/**
 * @description This method is called when your extension is deactivated.
 */
export function deactivate() {
    if (ipcServer) {
        ipcServer.stop();
        ipcServer = null;
    }
    const logger = new Logger('Extension');
    logger.info('Extension deactivated');
}
