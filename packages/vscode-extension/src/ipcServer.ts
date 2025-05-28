/**
 * @file ipcServer.ts
 * @description Hosts the WebSocket server for IPC between the VSCE and CE.
 * Handles incoming requests, authentication, and routes to appropriate service modules.
 * @module ContextWeaver/VSCE
 */

import WebSocket, { WebSocketServer } from 'ws';
import * as vscode from 'vscode';
import * as path from 'path';
import {
    getFileTree,
    getFileContent,
    getFolderContents,
    getWorkspaceCodebaseContents,
} from './fileSystemService';
import { SearchService, SearchResult } from './searchService';
import { WorkspaceService, WorkspaceServiceError } from './workspaceService'; // Added import
import { v4 as uuidv4 } from 'uuid';

const LOG_PREFIX_SERVER = '[ContextWeaver IPCServer] ';

interface Client {
    ws: WebSocket;
    isAuthenticated: boolean;
    ip: string;
    activeLLMTabId?: number;
    activeLLMHost?: string;
}

export class IPCServer {
    private wss: WebSocketServer | null = null;
    private clients: Map<WebSocket, Client> = new Map();
    private searchService: SearchService;
    private workspaceService: WorkspaceService; // Added
    private readonly port: number;
    private readonly extensionContext: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;

    constructor(
        port: number,
        context: vscode.ExtensionContext,
        outputChannelInstance: vscode.OutputChannel,
        searchServiceInstance: SearchService,
        workspaceServiceInstance: WorkspaceService // Added
    ) {
        this.port = port;
        this.extensionContext = context;
        this.outputChannel = outputChannelInstance;
        this.searchService = searchServiceInstance;
        this.workspaceService = workspaceServiceInstance; // Added
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Initialized with port ${port}.`);
    }

    public start(): void {
        const MAX_PORT_RETRIES = 3;
        let currentPort = this.port;
        let attempts = 0;

        const tryStartServer = (portToTry: number) => {
            try {
                this.wss = new WebSocketServer({ port: portToTry });

                this.wss.on('listening', () => {
                    const msg = `WebSocket server listening on localhost:${portToTry}`;
                    this.outputChannel.appendLine(LOG_PREFIX_SERVER + msg);
                    console.log(LOG_PREFIX_SERVER + msg);
                    if (portToTry !== this.port) {
                        vscode.window.showInformationMessage(`ContextWeaver: IPC Server started on port ${portToTry} (configured port ${this.port} was busy).`);
                    } else {
                        vscode.window.showInformationMessage(`ContextWeaver: IPC Server started on port ${portToTry}.`);
                    }
                });

                this.wss.on('connection', (ws: WebSocket, req) => {
                    const clientIp = req.socket.remoteAddress || 'unknown';
                    this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Client connected from ${clientIp}`);
                    const client: Client = { ws, isAuthenticated: true, ip: clientIp };
                    this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Client from ${client.ip} authenticated (token auth removed).`);
                    this.clients.set(ws, client);

                    ws.on('message', (message) => {
                        this.handleMessage(client, message);
                    });

                    ws.on('close', () => {
                        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Client from ${client.ip} disconnected.`);
                        this.clients.delete(ws);
                    });

                    ws.on('error', (error) => {
                        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error on WebSocket connection from ${client.ip}: ${error.message}`);
                        console.error(LOG_PREFIX_SERVER + `Error on WebSocket connection from ${client.ip}:`, error);
                        if (this.clients.has(ws)) {
                            this.clients.delete(ws);
                        }
                    });
                });

                this.wss.on('error', (error: Error & { code?: string }) => {
                    this.outputChannel.appendLine(LOG_PREFIX_SERVER + `WebSocket server error on port ${portToTry}: ${error.message}`);
                    console.error(LOG_PREFIX_SERVER + `WebSocket server error on port ${portToTry}:`, error);
                    if (error.code === 'EADDRINUSE' && attempts < MAX_PORT_RETRIES) {
                        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Port ${portToTry} is in use. Attempting next port.`);
                        console.warn(LOG_PREFIX_SERVER + `Port ${portToTry} is in use. Attempting next port.`);
                        if (this.wss) {
                            this.wss.removeAllListeners();
                            this.wss.close();
                            this.wss = null;
                        }
                        attempts++;
                        currentPort++;
                        tryStartServer(currentPort);
                    } else if (error.code === 'EADDRINUSE') {
                        const failMsg = `ContextWeaver: IPC Server failed to start. Port ${this.port} and ${MAX_PORT_RETRIES} alternatives are in use.`;
                        this.outputChannel.appendLine(LOG_PREFIX_SERVER + failMsg);
                        console.error(LOG_PREFIX_SERVER + failMsg);
                        vscode.window.showErrorMessage(failMsg);
                    } else {
                        const failMsg = `ContextWeaver: IPC Server failed to start on port ${portToTry}. Error: ${error.message}`;
                        this.outputChannel.appendLine(LOG_PREFIX_SERVER + failMsg);
                        console.error(LOG_PREFIX_SERVER + failMsg);
                        vscode.window.showErrorMessage(failMsg);
                    }
                });

            } catch (error: any) {
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Failed to create WebSocket server on port ${portToTry}: ${error.message}`);
                console.error(LOG_PREFIX_SERVER + `Failed to create WebSocket server on port ${portToTry}:`, error);
                vscode.window.showErrorMessage(`ContextWeaver: Exception while starting IPC Server on port ${portToTry}. Error: ${error.message}`);
            }
        };
        tryStartServer(currentPort);
    }

    private async handleMessage(client: Client, message: WebSocket.RawData): Promise<void> { // Added async
        let parsedMessage: any;
        try {
            parsedMessage = JSON.parse(message.toString());
            if (typeof parsedMessage !== 'object' || parsedMessage === null) {
                throw new Error("Message is not a valid JSON object.");
            }
        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Failed to parse message or invalid message format from ${client.ip}: ${message.toString()}. Error: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + 'Failed to parse message or invalid message format:', message.toString(), error);
            this.sendError(client.ws, null, 'INVALID_MESSAGE_FORMAT', `Error parsing message: ${error.message}`);
            return;
        }

        const { protocol_version, message_id, type, command, payload } = parsedMessage;

        if (protocol_version !== '1.0') {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Protocol version mismatch from ${client.ip}. Expected 1.0, got ${protocol_version}.`);
            this.sendError(client.ws, message_id, 'UNSUPPORTED_PROTOCOL_VERSION', 'Protocol version mismatch.');
            return;
        }

        // Authentication check is effectively always true now
        // if (!client.isAuthenticated) { ... } 

        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Received command '${command}' of type '${type}' from ${client.ip}. Payload: ${JSON.stringify(payload)}`);
        console.log(LOG_PREFIX_SERVER + `Received command '${command}' of type '${type}' from ${client.ip}. Payload:`, payload);

        // Centralized pre-check for workspace trust and open folders for relevant commands
        const commandsRequiringWorkspace = [
            'get_file_tree', 'get_file_content', 'get_folder_content',
            'get_entire_codebase', 'search_workspace', 'get_active_file_info',
            'get_open_files', 'get_filter_info' // 'check_workspace_trust' is handled by get_workspace_details
        ];

        if (commandsRequiringWorkspace.includes(command)) {
            try {
                await this.workspaceService.ensureWorkspaceTrustedAndOpen();
            } catch (error: any) {
                if (error instanceof WorkspaceServiceError) {
                    this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Workspace check failed for command '${command}': ${error.message}`);
                    this.sendError(client.ws, message_id, error.code, error.message);
                } else {
                    this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Unexpected error during workspace check for command '${command}': ${error.message}`);
                    this.sendError(client.ws, message_id, 'INTERNAL_SERVER_ERROR', `Unexpected error during workspace check: ${error.message}`);
                }
                return;
            }
        }


        switch (command) {
            case 'register_active_target':
                this.handleRegisterActiveTarget(client, payload, message_id);
                break;
            case 'get_workspace_details': // New handler
                this.handleGetWorkspaceDetails(client, message_id);
                break;
            case 'get_file_tree':
                this.handleGetFileTree(client, payload, message_id);
                break;
            case 'get_file_content':
                this.handleGetFileContent(client, payload, message_id);
                break;
            case 'get_folder_content':
                this.handleGetFolderContent(client, payload, message_id);
                break;
            case 'get_entire_codebase':
                this.handleGetEntireCodebase(client, payload, message_id);
                break;
            case 'search_workspace':
                this.handleSearchWorkspace(client, payload, message_id);
                break;
            // Placeholder commands that might need more specific handling or WorkspaceService integration
            case 'get_active_file_info':
            case 'get_open_files':
            case 'get_filter_info':
                // For these, ensureWorkspaceTrustedAndOpen has run.
                // They might need specific workspace folder context if not about "all" open files/active file.
                // For now, keeping placeholder, but they are candidates for WorkspaceService integration.
                this.sendPlaceholderResponse(client, command, payload, message_id);
                break;
            case 'check_workspace_trust': // This command is now effectively handled by get_workspace_details
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Command 'check_workspace_trust' is deprecated. Use 'get_workspace_details'.`);
                this.handleGetWorkspaceDetails(client, message_id); // Redirect to new handler
                break;
            default:
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Unknown command '${command}' from ${client.ip}.`);
                console.warn(LOG_PREFIX_SERVER + `Unknown command '${command}' from ${client.ip}.`);
                this.sendError(client.ws, message_id, 'UNKNOWN_COMMAND', `Unknown command: ${command}`);
        }
    }

    private sendMessage(ws: WebSocket, type: string, command: string, payload: any, message_id?: string): void {
        const message = {
            protocol_version: "1.0",
            message_id: message_id || uuidv4(),
            type,
            command,
            payload
        };
        try {
            ws.send(JSON.stringify(message));
        } catch (error) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error sending message: ${error}. Message: ${JSON.stringify(message)}`);
            console.error(LOG_PREFIX_SERVER + "Error sending message: ", error, message);
        }
    }

    private sendError(ws: WebSocket, original_message_id: string | null, errorCode: string, errorMessage: string): void {
        const errorPayload = {
            success: false,
            error: errorMessage,
            errorCode: errorCode,
            originalCommand: null
        };
        this.sendMessage(ws, 'error_response', 'error_response', errorPayload, original_message_id || uuidv4());
    }

    private sendGenericAck(client: Client, message_id: string, success: boolean, message: string | null = null) {
        this.sendMessage(client.ws, 'response', 'response_generic_ack', { success, message }, message_id);
    }

    private handleRegisterActiveTarget(client: Client, payload: any, message_id: string): void {
        client.activeLLMTabId = payload.tabId;
        client.activeLLMHost = payload.llmHost;
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Registered active target for client ${client.ip}: TabID ${payload.tabId}, Host ${payload.llmHost}`);
        this.sendGenericAck(client, message_id, true, "Target registered successfully.");
    }

    private handleGetWorkspaceDetails(client: Client, message_id: string): void {
        try {
            // ensureWorkspaceTrustedAndOpen has already run if this point is reached for this command type.
            const details = this.workspaceService.getWorkspaceDetailsForIPC();
            const responsePayload = {
                success: true,
                data: {
                    workspaceFolders: details || [], // Send empty array if null (no workspace open)
                    isTrusted: this.workspaceService.isWorkspaceTrusted(), // Overall trust status
                },
                error: null,
            };
            this.sendMessage(client.ws, 'response', 'response_workspace_details', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent workspace details to ${client.ip}`);
        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error getting workspace details: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + `Error getting workspace details:`, error);
            const errorCode = error instanceof WorkspaceServiceError ? error.code : 'INTERNAL_SERVER_ERROR';
            this.sendError(client.ws, message_id, errorCode, `Error getting workspace details: ${error.message}`);
        }
    }

    private async getTargetWorkspaceFolder(
        client: Client,
        requestedUriString: string | undefined,
        commandName: string,
        message_id: string
    ): Promise<vscode.WorkspaceFolder | null> {
        let targetWorkspaceFolder: vscode.WorkspaceFolder | undefined;

        if (requestedUriString) {
            try {
                const requestedUri = vscode.Uri.parse(requestedUriString, true);
                targetWorkspaceFolder = this.workspaceService.getWorkspaceFolder(requestedUri);
                if (!targetWorkspaceFolder) {
                    this.sendError(client.ws, message_id, 'WORKSPACE_FOLDER_NOT_FOUND', `Specified workspace folder URI '${requestedUriString}' not found for ${commandName}.`);
                    return null;
                }
            } catch (e: any) {
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Invalid workspaceFolderUri for ${commandName}: ${requestedUriString}. Error: ${e.message}`);
                this.sendError(client.ws, message_id, 'INVALID_PAYLOAD', `Invalid workspaceFolderUri: ${e.message}`);
                return null;
            }
        } else {
            const allFolders = this.workspaceService.getWorkspaceFolders();
            if (allFolders && allFolders.length > 1) {
                this.sendError(client.ws, message_id, 'AMBIGUOUS_WORKSPACE', `Multiple workspace folders open. Please specify 'workspaceFolderUri' for ${commandName}.`);
                return null;
            } else if (allFolders && allFolders.length === 1) {
                targetWorkspaceFolder = allFolders[0];
            } else {
                // This case should be caught by ensureWorkspaceTrustedAndOpen, but as a safeguard:
                this.sendError(client.ws, message_id, 'NO_WORKSPACE_OPEN', `No workspace folder open or specified for ${commandName}.`);
                return null;
            }
        }
        return targetWorkspaceFolder;
    }


    private async handleGetFileTree(client: Client, payload: any, message_id: string): Promise<void> {
        const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(client, payload.workspaceFolderUri, 'get_file_tree', message_id);
        if (!targetWorkspaceFolder) return; // Error already sent by getTargetWorkspaceFolder

        try {
            const result = await getFileTree(targetWorkspaceFolder);

            if (typeof result === 'string' && result.startsWith('Error:')) {
                this.sendError(client.ws, message_id, 'FILE_TREE_GENERATION_FAILED', result);
                return;
            }

            const { tree: fileTreeString, filterTypeApplied } = result as { tree: string; filterTypeApplied: 'gitignore' | 'default' };

            const metadata = {
                unique_block_id: uuidv4(),
                content_source_id: `${targetWorkspaceFolder.uri.toString()}::file_tree`,
                type: "file_tree",
                label: "File Tree",
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                workspaceFolderName: targetWorkspaceFolder.name
            };

            const responsePayload = {
                success: true,
                data: {
                    fileTree: fileTreeString,
                    metadata: metadata
                },
                error: null,
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(), // Include for CE context
                filterType: filterTypeApplied
            };
            this.sendMessage(client.ws, 'response', 'response_file_tree', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent file tree for ${targetWorkspaceFolder.uri.toString()} (Filter: ${filterTypeApplied}) to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error generating file tree for ${targetWorkspaceFolder.uri.toString()}: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + `Error generating file tree:`, error);
            const errorCode = error instanceof WorkspaceServiceError ? error.code : 'FILE_TREE_ERROR';
            this.sendError(client.ws, message_id, errorCode, `Error generating file tree: ${error.message}`);
        }
    }

    private async handleGetFileContent(client: Client, payload: any, message_id: string): Promise<void> {
        const { filePath } = payload;
        if (!filePath || typeof filePath !== 'string') {
            this.sendError(client.ws, message_id, 'INVALID_PAYLOAD', 'Missing or invalid filePath in payload.');
            return;
        }

        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing get_file_content for: ${filePath}`);

        try {
            // ensureWorkspaceTrustedAndOpen has already run.
            const fileUri = vscode.Uri.file(filePath); // Assuming filePath is absolute
            const content = await getFileContent(fileUri);

            let associatedWorkspaceFolder = this.workspaceService.getWorkspaceFolder(fileUri);
            // If file is not part of any workspace folder, but workspace is trusted (e.g. loose file open in trusted empty workspace)
            // we might still allow it. For now, let's assume it must be part of a folder.
            // This check might need refinement based on how VS Code handles trust for loose files.
            if (!associatedWorkspaceFolder) {
                // Try to find if it's within ANY of the open workspace folders
                const allFolders = this.workspaceService.getWorkspaceFolders();
                if (allFolders) {
                    for (const folder of allFolders) {
                        if (fileUri.fsPath.startsWith(folder.uri.fsPath)) {
                            associatedWorkspaceFolder = folder;
                            break;
                        }
                    }
                }
                if (!associatedWorkspaceFolder) {
                    this.outputChannel.appendLine(LOG_PREFIX_SERVER + `File ${filePath} is not part of any open workspace folder.`);
                    // Not sending an error here, as getFileContent itself might return an error if access is denied by VS Code.
                    // Or, we could send a specific error if strict containment is required.
                }
            }

            let workspaceFolderName = associatedWorkspaceFolder ? associatedWorkspaceFolder.name : 'Unknown Workspace';
            let workspaceFolderUriString = associatedWorkspaceFolder ? associatedWorkspaceFolder.uri.toString() : null;


            if (typeof content === 'string' && content.startsWith('Error:')) {
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error reading file content for ${filePath}: ${content}`);
                const responsePayload = {
                    success: false, data: null, error: content, filePath, filterType: 'not_applicable'
                };
                this.sendMessage(client.ws, 'response', 'response_file_content', responsePayload, message_id);
                return;
            }

            const isBinary = content === null;
            const metadata = {
                unique_block_id: uuidv4(),
                content_source_id: fileUri.toString(),
                type: "file_content",
                label: path.basename(filePath),
                workspaceFolderUri: workspaceFolderUriString,
                workspaceFolderName: workspaceFolderName
            };

            const responsePayload = {
                success: true,
                data: {
                    content: isBinary ? null : content,
                    isBinary: isBinary,
                    metadata: metadata
                },
                error: null,
                filePath: filePath,
                filterType: 'not_applicable'
            };
            this.sendMessage(client.ws, 'response', 'response_file_content', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent file content for ${filePath} (Binary: ${isBinary}) to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Unexpected error in handleGetFileContent for ${filePath}: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + `Unexpected error in handleGetFileContent for ${filePath}:`, error);
            const errorCode = error instanceof WorkspaceServiceError ? error.code : 'FILE_CONTENT_ERROR';
            this.sendError(client.ws, message_id, errorCode, `Error getting file content: ${error.message}`);
        }
    }

    private async handleGetFolderContent(client: Client, payload: any, message_id: string): Promise<void> {
        const { folderPath, workspaceFolderUri } = payload;

        if (!folderPath || typeof folderPath !== 'string') {
            this.sendError(client.ws, message_id, 'INVALID_PAYLOAD', 'Missing or invalid folderPath in payload.');
            return;
        }

        const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(client, workspaceFolderUri, 'get_folder_content', message_id);
        if (!targetWorkspaceFolder) return;

        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing get_folder_content for: ${folderPath} in workspace ${targetWorkspaceFolder.name}`);

        try {
            const targetFolderUri = vscode.Uri.file(folderPath); // Assuming folderPath is absolute

            // Ensure targetFolderUri is within the targetWorkspaceFolder
            if (!targetFolderUri.fsPath.startsWith(targetWorkspaceFolder.uri.fsPath)) {
                this.sendError(client.ws, message_id, 'INVALID_PATH', `Folder path '${folderPath}' is not within the specified workspace folder '${targetWorkspaceFolder.name}'.`);
                return;
            }

            const result = await getFolderContents(targetFolderUri, targetWorkspaceFolder);

            if (typeof result === 'string') {
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error getting folder content for ${folderPath}: ${result}`);
                this.sendError(client.ws, message_id, 'FOLDER_CONTENT_ERROR', result);
                return;
            }

            const { fileTree, concatenatedContent, filterTypeApplied } = result;

            const metadata = {
                unique_block_id: uuidv4(),
                content_source_id: targetFolderUri.toString(),
                type: "folder_content",
                label: path.basename(folderPath),
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                workspaceFolderName: targetWorkspaceFolder.name
            };

            const responsePayload = {
                success: true,
                data: {
                    fileTree: fileTree,
                    concatenatedContent: concatenatedContent,
                    metadata: metadata
                },
                error: null,
                folderPath: folderPath,
                filterType: filterTypeApplied,
                workspaceFolderUri: targetWorkspaceFolder.uri.toString() // Include for CE context
            };
            this.sendMessage(client.ws, 'response', 'response_folder_content', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent folder content for ${folderPath} (Filter: ${filterTypeApplied}) to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Unexpected error in handleGetFolderContent for ${folderPath}: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + `Unexpected error in handleGetFolderContent for ${folderPath}:`, error);
            const errorCode = error instanceof WorkspaceServiceError ? error.code : 'FOLDER_CONTENT_UNEXPECTED_ERROR';
            this.sendError(client.ws, message_id, errorCode, `Error getting folder content: ${error.message}`);
        }
    }

    private async handleGetEntireCodebase(client: Client, payload: any, message_id: string): Promise<void> {
        const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(client, payload.workspaceFolderUri, 'get_entire_codebase', message_id);
        if (!targetWorkspaceFolder) return;

        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing get_entire_codebase for workspace: ${targetWorkspaceFolder.name}`);

        try {
            const result = await getWorkspaceCodebaseContents(targetWorkspaceFolder);

            if (typeof result === 'string') {
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error getting entire codebase for ${targetWorkspaceFolder.name}: ${result}`);
                this.sendError(client.ws, message_id, 'CODEBASE_CONTENT_ERROR', result);
                return;
            }

            const { fileTree, concatenatedContent, workspaceName, filterTypeApplied } = result;

            const metadata = {
                unique_block_id: uuidv4(),
                content_source_id: `${targetWorkspaceFolder.uri.toString()}::codebase`,
                type: "codebase_content",
                label: `Entire Codebase - ${workspaceName}`,
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                workspaceFolderName: workspaceName
            };

            const responsePayload = {
                success: true,
                data: {
                    fileTree: fileTree,
                    concatenatedContent: concatenatedContent,
                    metadata: metadata
                },
                error: null,
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(), // Include for CE context
                filterType: filterTypeApplied
            };
            this.sendMessage(client.ws, 'response', 'response_entire_codebase', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent entire codebase content for ${workspaceName} (Filter: ${filterTypeApplied}) to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Unexpected error in handleGetEntireCodebase for ${targetWorkspaceFolder.name}: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + `Unexpected error in handleGetEntireCodebase for ${targetWorkspaceFolder.name}:`, error);
            const errorCode = error instanceof WorkspaceServiceError ? error.code : 'CODEBASE_CONTENT_UNEXPECTED_ERROR';
            this.sendError(client.ws, message_id, errorCode, `Error getting entire codebase content: ${error.message}`);
        }
    }

    private async handleSearchWorkspace(client: Client, payload: any, message_id: string): Promise<void> {
        // ensureWorkspaceTrustedAndOpen has already run.
        const { query, workspaceFolderUri: workspaceFolderUriString } = payload;

        if (typeof query !== 'string') {
            this.sendError(client.ws, message_id, 'INVALID_PAYLOAD', 'Missing or invalid query in payload.');
            return;
        }

        let workspaceFolderToSearchIn: vscode.WorkspaceFolder | undefined | null = null; // null means search all, undefined means error
        if (workspaceFolderUriString && typeof workspaceFolderUriString === 'string') {
            try {
                const parsedUri = vscode.Uri.parse(workspaceFolderUriString, true);
                workspaceFolderToSearchIn = this.workspaceService.getWorkspaceFolder(parsedUri);
                if (!workspaceFolderToSearchIn) {
                    this.sendError(client.ws, message_id, 'WORKSPACE_FOLDER_NOT_FOUND', `Specified workspace folder URI '${workspaceFolderUriString}' not found for search_workspace.`);
                    return;
                }
            } catch (e: any) {
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Invalid workspaceFolderUri for search_workspace: ${workspaceFolderUriString}. Error: ${e.message}`);
                this.sendError(client.ws, message_id, 'INVALID_PAYLOAD', `Invalid workspaceFolderUri: ${e.message}`);
                return;
            }
        } else {
            // If no specific workspaceFolderUri is provided, searchService will search all open (and trusted) workspace folders.
            workspaceFolderToSearchIn = null; // Signal to searchService to search all
        }

        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing search_workspace for query: \"${query}\" in workspace ${workspaceFolderToSearchIn ? workspaceFolderToSearchIn.name : 'all'}`);

        try {
            // Pass either a specific folder URI or undefined to searchService.search
            const searchScopeUri = workspaceFolderToSearchIn ? workspaceFolderToSearchIn.uri : undefined;
            const results: SearchResult[] = await this.searchService.search(query, searchScopeUri);

            const responsePayload = {
                success: true,
                data: {
                    results: results
                },
                error: null,
                query: query
            };
            this.sendMessage(client.ws, 'response', 'response_search_workspace', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent ${results.length} search results for query \"${query}\" to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error performing search for query \"${query}\": ${error.message}`);
            console.error(LOG_PREFIX_SERVER + `Error performing search:`, error);
            const errorCode = error instanceof WorkspaceServiceError ? error.code : 'SEARCH_ERROR';
            this.sendError(client.ws, message_id, errorCode, `Error performing search: ${error.message}`);
        }
    }

    private sendPlaceholderResponse(client: Client, originalCommand: string, requestPayload: any, message_id: string): void {
        const commandMap: { [key: string]: string } = {
            'get_active_file_info': 'response_active_file_info',
            'get_open_files': 'response_open_files',
            // 'search_workspace': 'response_search_workspace', // Handled by actual implementation
            // 'check_workspace_trust': 'response_workspace_trust', // Handled by get_workspace_details
            'get_filter_info': 'response_filter_info',
        };
        const responseCommand = commandMap[originalCommand] || `response_${originalCommand}`;
        let responseData: any = { message: `Placeholder data for ${originalCommand}` };

        // Simplified placeholder data, actual implementation would use WorkspaceService
        if (originalCommand === 'get_active_file_info') {
            responseData = { activeFilePath: "placeholder/active/file.ts", activeFileLabel: "file.ts", workspaceFolderUri: null, workspaceFolderName: null };
        } else if (originalCommand === 'get_open_files') {
            responseData = { openFiles: [{ path: "placeholder/open/file1.ts", name: "file1.ts", workspaceFolderUri: null, workspaceFolderName: null }] };
        } else if (originalCommand === 'get_filter_info') {
            responseData = { filterType: 'default', workspaceFolderUri: null };
        }

        let fullResponsePayload: any = {
            success: true,
            data: responseData,
            error: null
        };
        if (requestPayload && requestPayload.workspaceFolderUri) { // Check if requestPayload exists
            fullResponsePayload.workspaceFolderUri = requestPayload.workspaceFolderUri;
        }

        this.sendMessage(client.ws, 'response', responseCommand, fullResponsePayload, message_id);
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent placeholder response for ${originalCommand} to ${client.ip}`);
    }

    public getPrimaryTargetTabId(): number | undefined {
        for (const client of this.clients.values()) {
            if (client.isAuthenticated && client.activeLLMTabId !== undefined) {
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Found primary target tab ID: ${client.activeLLMTabId}`);
                return client.activeLLMTabId;
            }
        }
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + 'No primary target tab ID found among connected clients.');
        return undefined;
    }

    public pushSnippetToTarget(targetTabId: number, snippetData: any): void {
        let targetClient: Client | null = null;
        for (const client of this.clients.values()) {
            if (client.isAuthenticated && client.activeLLMTabId === targetTabId) {
                targetClient = client;
                break;
            }
        }

        if (targetClient) {
            this.sendMessage(targetClient.ws, 'push', 'push_snippet', snippetData);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Pushed snippet to tabId ${targetTabId}`);
            console.log(LOG_PREFIX_SERVER + `Pushed snippet to tabId ${targetTabId}`);
        } else {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `WARN: No authenticated client found for targetTabId ${targetTabId} to push snippet.`);
            console.warn(LOG_PREFIX_SERVER + `No authenticated client found for targetTabId ${targetTabId} to push snippet.`);
            vscode.window.showWarningMessage("ContextWeaver: Could not send snippet. No active, authenticated Chrome tab found.");
        }
    }

    public stop(): void {
        if (this.wss) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + 'Stopping WebSocket server...');
            console.log(LOG_PREFIX_SERVER + 'Stopping WebSocket server...');
            this.clients.forEach(client => {
                client.ws.close();
            });
            this.clients.clear();
            this.wss.close((err) => {
                if (err) {
                    this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error closing WebSocket server: ${err.message}`);
                    console.error(LOG_PREFIX_SERVER + 'Error closing WebSocket server:', err);
                } else {
                    this.outputChannel.appendLine(LOG_PREFIX_SERVER + 'WebSocket server stopped.');
                    console.log(LOG_PREFIX_SERVER + 'WebSocket server stopped.');
                }
                this.wss = null;
            });
        }
    }
}