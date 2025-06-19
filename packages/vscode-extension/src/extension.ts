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
import { FilterService } from './core/services/FilterService';
import { AggregationService } from './core/services/AggregationService';
import { CommandRegistry } from './adapters/primary/ipc/CommandRegistry';

// Import all command handlers
import { GetFileTreeHandler } from './adapters/primary/ipc/handlers/GetFileTreeHandler';
import { SearchWorkspaceHandler } from './adapters/primary/ipc/handlers/SearchWorkspaceHandler';
import { GetFileContentHandler } from './adapters/primary/ipc/handlers/GetFileContentHandler';
import { GetWorkspaceDetailsHandler } from './adapters/primary/ipc/handlers/GetWorkspaceDetailsHandler';
import { RegisterActiveTargetHandler } from './adapters/primary/ipc/handlers/RegisterActiveTargetHandler';
import { GetActiveFileInfoHandler } from './adapters/primary/ipc/handlers/GetActiveFileInfoHandler';
import { GetOpenFilesHandler } from './adapters/primary/ipc/handlers/GetOpenFilesHandler';
import { GetContentsForFilesHandler } from './adapters/primary/ipc/handlers/GetContentsForFilesHandler';
import { GetFolderContentHandler } from './adapters/primary/ipc/handlers/GetFolderContentHandler';
import { GetEntireCodebaseHandler } from './adapters/primary/ipc/handlers/GetEntireCodebaseHandler';
import { GetFilterInfoHandler } from './adapters/primary/ipc/handlers/GetFilterInfoHandler';
import { ListFolderContentsHandler } from './adapters/primary/ipc/handlers/ListFolderContentsHandler';
import { GetWorkspaceProblemsHandler } from './adapters/primary/ipc/handlers/GetWorkspaceProblemsHandler';

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
    showErrorMessage: (message: string, ...items: string[]) => Thenable<string | undefined>;
    showWarningMessage: (message: string, ...items: string[]) => Thenable<string | undefined>;
    showInformationMessage: (message: string, ...items: string[]) => Thenable<string | undefined>;
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
    const filterService = new FilterService();
    const searchService = new SearchService(workspaceService, filterService);
    const aggregationService = new AggregationService(windowId);

    // Initialize command registry and handlers
    const commandRegistry = new CommandRegistry();

    // Create and register all command handlers
    const getFileTreeHandler = new GetFileTreeHandler(filterService, workspaceService, windowId);
    const searchWorkspaceHandler = new SearchWorkspaceHandler(searchService, windowId);
    const getFileContentHandler = new GetFileContentHandler(workspaceService, windowId);
    const getWorkspaceDetailsHandler = new GetWorkspaceDetailsHandler(workspaceService);
    const registerActiveTargetHandler = new RegisterActiveTargetHandler();
    const getActiveFileInfoHandler = new GetActiveFileInfoHandler(workspaceService, windowId);
    const getOpenFilesHandler = new GetOpenFilesHandler(workspaceService, windowId);
    const getContentsForFilesHandler = new GetContentsForFilesHandler(workspaceService, windowId);
    const getFolderContentHandler = new GetFolderContentHandler(filterService, workspaceService, windowId);
    const getEntireCodebaseHandler = new GetEntireCodebaseHandler(filterService, workspaceService, windowId);
    const getFilterInfoHandler = new GetFilterInfoHandler(workspaceService);
    const listFolderContentsHandler = new ListFolderContentsHandler(filterService, workspaceService, windowId);
    const getWorkspaceProblemsHandler = new GetWorkspaceProblemsHandler(workspaceService, diagnosticsService, windowId);

    // Register all handlers with the command registry
    commandRegistry.register('get_FileTree', getFileTreeHandler);
    commandRegistry.register('search_workspace', searchWorkspaceHandler);
    commandRegistry.register('get_file_content', getFileContentHandler);
    commandRegistry.register('get_workspace_details', getWorkspaceDetailsHandler);
    commandRegistry.register('register_active_target', registerActiveTargetHandler);
    commandRegistry.register('get_active_file_info', getActiveFileInfoHandler);
    commandRegistry.register('get_open_files', getOpenFilesHandler);
    commandRegistry.register('get_contents_for_files', getContentsForFilesHandler);
    commandRegistry.register('get_folder_content', getFolderContentHandler);
    commandRegistry.register('get_entire_codebase', getEntireCodebaseHandler);
    commandRegistry.register('get_filter_info', getFilterInfoHandler);
    commandRegistry.register('list_folder_contents', listFolderContentsHandler);
    commandRegistry.register('get_workspace_problems', getWorkspaceProblemsHandler);

    // Initialize IPC server with the new services
    // Rationale: Port is now determined automatically by the server. Pass a placeholder.
    ipcServer = new IPCServer(0, windowId, context, outputChannel, searchService, workspaceService, diagnosticsService, filterService, commandRegistry, aggregationService);

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
