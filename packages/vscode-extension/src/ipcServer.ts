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
    parseGitignore,
    getFileTree,
    getFileContentWithLanguageId, // Use this for single file content
    getFolderContentsForIPC,      // Use this for folder content
    getWorkspaceDataForIPC,       // Use this for entire codebase
    getDirectoryListing
} from './fileSystemService'; // Ensure correct functions are imported
import { SearchService, SearchResult } from './searchService';
import { WorkspaceService, WorkspaceServiceError } from './workspaceService';
import { v4 as uuidv4 } from 'uuid';

const LOG_PREFIX_SERVER = '[ContextWeaver IPCServer] ';

interface Client {
    ws: WebSocket;
    isAuthenticated: boolean;
    ip: string;
    activeLLMTabId?: number;
    activeLLMHost?: string;
}

// Define FileData interface here or import from a shared types location
interface FileData {
    fullPath: string;
    content: string;
    languageId: string;
}


export class IPCServer {
    private wss: WebSocketServer | null = null;
    private clients: Map<WebSocket, Client> = new Map();
    private searchService: SearchService;
    private workspaceService: WorkspaceService;
    private readonly port: number;
    private readonly extensionContext: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;

    constructor(
        port: number,
        context: vscode.ExtensionContext,
        outputChannelInstance: vscode.OutputChannel,
        searchServiceInstance: SearchService,
        workspaceServiceInstance: WorkspaceService
    ) {
        console.log(LOG_PREFIX_SERVER + 'Constructor called.');
        outputChannelInstance.appendLine(LOG_PREFIX_SERVER + 'Constructor called.');

        this.port = port;
        this.extensionContext = context;
        this.outputChannel = outputChannelInstance;
        this.searchService = searchServiceInstance;
        this.workspaceService = workspaceServiceInstance;
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Initialized with port ${port}.`);
    }

    public start(): void {
        console.log(LOG_PREFIX_SERVER + 'start() method called.');
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + 'start() method called.');

        const MAX_PORT_RETRIES = 3;
        let currentPort = this.port;
        let attempts = 0;

        const tryStartServer = (portToTry: number) => {
            try {
                this.wss = new WebSocketServer({ port: portToTry, host: '127.0.0.1' });

                this.wss.on('listening', () => {
                    const msg = `WebSocket server listening on 127.0.0.1:${portToTry}`;
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
                    const client: Client = { ws, isAuthenticated: true, ip: clientIp }; // Token auth removed
                    this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Client from ${client.ip} authenticated (token auth removed).`);
                    this.clients.set(ws, client);

                    ws.on('message', (message) => {
                        this.handleMessage(client, message);
                    });

                    ws.on('close', () => {
                        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Client from ${client.ip} disconnected.`);
                        ws.removeAllListeners();
                        this.clients.delete(ws);
                    });

                    ws.on('error', (error) => {
                        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error on WebSocket connection from ${client.ip}: ${error.message}`);
                        console.error(LOG_PREFIX_SERVER + `Error on WebSocket connection from ${client.ip}:`, error);
                        if (this.clients.has(ws)) {
                            ws.removeAllListeners();
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

    private async handleMessage(client: Client, message: WebSocket.RawData): Promise<void> {
        let parsedMessage: any;
        try {
            parsedMessage = JSON.parse(message.toString());
            if (typeof parsedMessage !== 'object' || parsedMessage === null || Array.isArray(parsedMessage)) {
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

        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Received command '${command}' of type '${type}' from ${client.ip}. Payload: ${JSON.stringify(payload)}`);
        console.log(LOG_PREFIX_SERVER + `Received command '${command}' of type '${type}' from ${client.ip}. Payload:`, payload);

        const commandsRequiringWorkspace = [
            'get_file_tree', 'get_file_content', 'get_folder_content',
            'get_entire_codebase', 'search_workspace', 'get_active_file_info',
            'get_open_files', 'get_filter_info', 'list_folder_contents'
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
            case 'get_workspace_details':
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
            case 'get_active_file_info':
                this.handleGetActiveFileInfo(client, message_id);
                break;
            case 'get_open_files':
                this.handleGetOpenFiles(client, message_id);
                break;
            case 'get_filter_info':
                this.handleGetFilterInfo(client, payload, message_id);
                break;
            case 'list_folder_contents':
                this.handleListFolderContents(client, payload, message_id);
                break;
            case 'check_workspace_trust': // Deprecated, but handle for now
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Command 'check_workspace_trust' is deprecated. Use 'get_workspace_details'.`);
                this.handleGetWorkspaceDetails(client, message_id); // Forward to new handler
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
            const messageString = JSON.stringify(message); // Stringify once
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `sendMessage: Attempting to send to client. ReadyState: ${ws.readyState}. Message: ${messageString}`);
            console.log(LOG_PREFIX_SERVER + `sendMessage: Attempting to send to client. ReadyState: ${ws.readyState}. Message:`, message); // Log full object for console

            if (ws.readyState === WebSocket.OPEN) { // Check if OPEN before sending
                ws.send(messageString);
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `sendMessage: Message sent successfully for command: ${command}`);
                console.log(LOG_PREFIX_SERVER + `sendMessage: Message sent successfully for command: ${command}`);
            } else {
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `sendMessage: WebSocket not OPEN (state: ${ws.readyState}). Message for command '${command}' NOT sent.`);
                console.warn(LOG_PREFIX_SERVER + `sendMessage: WebSocket not OPEN (state: ${ws.readyState}). Message for command '${command}' NOT sent.`);
            }
        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `sendMessage: Error during ws.send() for command '${command}': ${error.message}. Message: ${JSON.stringify(message)}`);
            console.error(LOG_PREFIX_SERVER + `sendMessage: Error during ws.send() for command '${command}': `, error, message);
        }
    }

    private sendError(ws: WebSocket, original_message_id: string | null, errorCode: string, errorMessage: string): void {
        const errorPayload = {
            success: false,
            error: errorMessage,
            errorCode: errorCode,
            originalCommand: null // Could be populated if we parse command before erroring
        };
        this.sendMessage(ws, 'error_response', 'error_response', errorPayload, original_message_id || uuidv4());
    }

    private sendGenericAck(client: Client, message_id: string, success: boolean, message: string | null = null) {
        this.sendMessage(client.ws, 'response', 'response_generic_ack', { success, message }, message_id);
    }


    private handleRegisterActiveTarget(client: Client, payload: any, message_id: string): void {
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `handleRegisterActiveTarget called: TabID ${payload.tabId}, Host ${payload.llmHost} for client ${client.ip}`);
        client.activeLLMTabId = payload.tabId;
        client.activeLLMHost = payload.llmHost;
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Registered active target for client ${client.ip}: TabID ${payload.tabId}, Host ${payload.llmHost}`);
        this.sendGenericAck(client, message_id, true, "Target registered successfully.");
    }

    private handleGetWorkspaceDetails(client: Client, message_id: string): void {
        try {
            const details = this.workspaceService.getWorkspaceDetailsForIPC();
            const responsePayload = {
                success: true,
                data: {
                    workspaceFolders: details || [], // Ensure it's an array even if null
                    isTrusted: this.workspaceService.isWorkspaceTrusted(),
                    // vsCodeInstanceName: vscode.env.appName // Could be useful
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
        requestedUriString: string | undefined | null,
        commandName: string,
        message_id: string
    ): Promise<vscode.WorkspaceFolder | null> {
        let targetWorkspaceFolder: vscode.WorkspaceFolder | undefined;

        if (requestedUriString) {
            try {
                const requestedUri = vscode.Uri.parse(requestedUriString, true); // strict parsing
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
            // If no URI is specified, behavior depends on the number of open workspace folders
            const allFolders = this.workspaceService.getWorkspaceFolders();
            if (allFolders && allFolders.length > 1) {
                this.sendError(client.ws, message_id, 'AMBIGUOUS_WORKSPACE', `Multiple workspace folders open. Please specify 'workspaceFolderUri' for ${commandName}.`);
                return null;
            } else if (allFolders && allFolders.length === 1) {
                targetWorkspaceFolder = allFolders[0];
            } else {
                // This case should ideally be caught by ensureWorkspaceTrustedAndOpen, but as a fallback:
                this.sendError(client.ws, message_id, 'NO_WORKSPACE_OPEN', `No workspace folder open or specified for ${commandName}.`);
                return null;
            }
        }
        return targetWorkspaceFolder;
    }


    private async handleGetFileTree(client: Client, payload: any, message_id: string): Promise<void> {
        const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(client, payload.workspaceFolderUri, 'get_file_tree', message_id);
        if (!targetWorkspaceFolder) return;

        try {
            const result = await getFileTree(targetWorkspaceFolder);

            if (typeof result === 'string' && result.startsWith('Error:')) { // Error string from getFileTree
                this.sendError(client.ws, message_id, 'FILE_TREE_GENERATION_FAILED', result);
                return;
            }

            // Assuming result is { tree: string; filterTypeApplied: 'gitignore' | 'default' }
            const { tree: fileTreeString, filterTypeApplied } = result as { tree: string; filterTypeApplied: 'gitignore' | 'default' };

            const metadata = { // As per FR-IPC-005
                unique_block_id: uuidv4(),
                content_source_id: `${targetWorkspaceFolder.uri.toString()}::file_tree`, // Canonical ID for the tree
                type: "file_tree",
                label: `File Tree - ${targetWorkspaceFolder.name}`, // Label for CE indicator
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                workspaceFolderName: targetWorkspaceFolder.name
            };

            const responsePayload = {
                success: true,
                data: { // Nest the actual data under a 'data' property
                    fileTreeString: fileTreeString, // The formatted tree
                    metadata: metadata
                },
                error: null,
                // Top-level context for CE if needed, though metadata is preferred
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
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
            const fileUri = vscode.Uri.parse(filePath, true); // Strict parsing

            // Determine owning workspace folder for context
            let associatedWorkspaceFolder = this.workspaceService.getWorkspaceFolder(fileUri);
            if (!associatedWorkspaceFolder) { // Check if it's a sub-file of any open folder
                const allFolders = this.workspaceService.getWorkspaceFolders();
                if (allFolders) {
                    for (const folder of allFolders) {
                        if (fileUri.fsPath.startsWith(folder.uri.fsPath)) {
                            associatedWorkspaceFolder = folder;
                            break;
                        }
                    }
                }
            }
            // If still no associated folder, it might be a loose file not in any workspace folder,
            // or workspace is not trusted/open (which should be caught earlier).
            // For simplicity, we'll allow it if it's a file URI, but workspace context might be null.

            const fileData = await getFileContentWithLanguageId(fileUri);

            if (!fileData) { // Handles binary files or read errors
                const errorMsg = `File is binary or could not be read: ${filePath}`;
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + errorMsg);
                this.sendError(client.ws, message_id, 'FILE_BINARY_OR_READ_ERROR', errorMsg);
                return;
            }

            const metadata = { // As per FR-IPC-005
                unique_block_id: uuidv4(),
                content_source_id: fileUri.toString(), // CRITICAL: Use URI string as content_source_id for consistent format
                type: "file_content",
                label: path.basename(fileUri.fsPath), // Label for CE indicator
                languageId: fileData.languageId, // Include languageId
                workspaceFolderUri: associatedWorkspaceFolder ? associatedWorkspaceFolder.uri.toString() : null,
                workspaceFolderName: associatedWorkspaceFolder ? associatedWorkspaceFolder.name : null
            };

            const responsePayload = {
                success: true,
                data: { // Nest actual data under 'data'
                    fileData: fileData, // Send the whole FileData object
                    metadata: metadata
                },
                error: null,
                filePath: fileData.fullPath, // Echo back the processed path
                filterType: 'not_applicable' // Filter type not relevant for single file
            };
            this.sendMessage(client.ws, 'response', 'response_file_content', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent file content for ${fileData.fullPath} to ${client.ip}`);
        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Unexpected error in handleGetFileContent for ${filePath}: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + `Unexpected error in handleGetFileContent for ${filePath}:`, error);
            let errorCode = 'FILE_CONTENT_ERROR';
            if (error instanceof WorkspaceServiceError) {
                errorCode = error.code;
            } else if (error.message.includes('URI')) { // Catch URI parsing errors
                errorCode = 'INVALID_URI';
            }
            this.sendError(client.ws, message_id, errorCode, `Error getting file content for '${filePath}': ${error.message}`);
        }
    }

    private async handleGetFolderContent(client: Client, payload: any, message_id: string): Promise<void> {
        const { folderPath, workspaceFolderUri } = payload; // folderPath is expected to be a URI string
        if (!folderPath || typeof folderPath !== 'string') {
            this.sendError(client.ws, message_id, 'INVALID_PAYLOAD', 'Missing or invalid folderPath in payload.');
            return;
        }

        const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(client, workspaceFolderUri, 'get_folder_content', message_id);
        if (!targetWorkspaceFolder) return;

        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing get_folder_content for: ${folderPath} in workspace ${targetWorkspaceFolder.name}`);

        try {
            const targetFolderUri = vscode.Uri.parse(folderPath, true);
            if (!targetFolderUri.fsPath.startsWith(targetWorkspaceFolder.uri.fsPath)) {
                this.sendError(client.ws, message_id, 'INVALID_PATH', `Folder path '${folderPath}' is not within the specified workspace folder '${targetWorkspaceFolder.name}'.`);
                return;
            }

            const result = await getFolderContentsForIPC(targetFolderUri, targetWorkspaceFolder);

            if (typeof result === 'string') { // Error occurred
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error getting folder content for ${folderPath}: ${result}`);
                this.sendError(client.ws, message_id, 'FOLDER_CONTENT_ERROR', result);
                return;
            }

            const { filesData, filterTypeApplied } = result;

            const metadata = { // As per FR-IPC-005
                unique_block_id: uuidv4(),
                content_source_id: targetFolderUri.toString(), // Use the folder's URI as source_id
                type: "folder_content",
                label: path.basename(targetFolderUri.path) || targetFolderUri.path, // Label for CE indicator
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                workspaceFolderName: targetWorkspaceFolder.name
            };

            const responsePayload = {
                success: true,
                data: { // Nest actual data under 'data'
                    filesData: filesData, // Send the array of FileData objects
                    metadata: metadata
                },
                error: null,
                folderPath: targetFolderUri.toString(), // Echo back the processed path
                filterType: filterTypeApplied,
                workspaceFolderUri: targetWorkspaceFolder.uri.toString()
            };
            this.sendMessage(client.ws, 'response', 'response_folder_content', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent folder content for ${targetFolderUri.toString()} (Filter: ${filterTypeApplied}, ${filesData.length} files) to ${client.ip}`);
        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Unexpected error in handleGetFolderContent for ${folderPath}: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + `Unexpected error in handleGetFolderContent for ${folderPath}:`, error);
            let errorCode = 'FOLDER_CONTENT_UNEXPECTED_ERROR';
            if (error instanceof WorkspaceServiceError) {
                errorCode = error.code;
            } else if (error.message.includes('URI')) {
                errorCode = 'INVALID_URI';
            }
            this.sendError(client.ws, message_id, errorCode, `Error getting folder content for '${folderPath}': ${error.message}`);
        }
    }

    private async handleGetEntireCodebase(client: Client, payload: any, message_id: string): Promise<void> {
        const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(client, payload.workspaceFolderUri, 'get_entire_codebase', message_id);
        if (!targetWorkspaceFolder) return;

        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing get_entire_codebase for workspace: ${targetWorkspaceFolder.name}`);
        try {
            const result = await getWorkspaceDataForIPC(targetWorkspaceFolder);

            if (typeof result === 'string') { // Error occurred
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error getting entire codebase for ${targetWorkspaceFolder.name}: ${result}`);
                this.sendError(client.ws, message_id, 'CODEBASE_CONTENT_ERROR', result);
                return;
            }

            const { filesData, fileTreeString, workspaceName, filterTypeApplied, projectPath } = result;

            const metadata = { // As per FR-IPC-005
                unique_block_id: uuidv4(),
                // Use projectPath (normalized workspaceFolder.uri.fsPath) for content_source_id
                content_source_id: `${targetWorkspaceFolder.uri.toString()}::codebase`,
                type: "codebase_content", // This indicates it's the full codebase
                label: `Entire Codebase - ${workspaceName}`, // Simplified label
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                workspaceFolderName: workspaceName
            };

            const responsePayload = {
                success: true,
                data: { // Nest actual data under 'data'
                    filesData: filesData, // Send the array of FileData objects
                    // fileTreeString: fileTreeString, // File tree is requested separately if needed
                    metadata: metadata
                },
                error: null,
                // Top-level context for CE if needed
                filterType: filterTypeApplied,
                workspaceFolderName: workspaceName,
                projectPath: projectPath, // Full path to the workspace folder
                workspaceFolderUri: targetWorkspaceFolder.uri.toString()
            };
            this.sendMessage(client.ws, 'response', 'response_entire_codebase', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent entire codebase content for ${workspaceName} (Filter: ${filterTypeApplied}, ${filesData.length} files) to ${client.ip}`);
        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Unexpected error in handleGetEntireCodebase for ${targetWorkspaceFolder.name}: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + `Unexpected error in handleGetEntireCodebase for ${targetWorkspaceFolder.name}:`, error);
            const errorCode = error instanceof WorkspaceServiceError ? error.code : 'CODEBASE_CONTENT_UNEXPECTED_ERROR';
            this.sendError(client.ws, message_id, errorCode, `Error getting entire codebase content: ${error.message}`);
        }
    }

    private async handleSearchWorkspace(client: Client, payload: any, message_id: string): Promise<void> {
        const { query, workspaceFolderUri: workspaceFolderUriString } = payload;
        if (typeof query !== 'string') {
            this.sendError(client.ws, message_id, 'INVALID_PAYLOAD', 'Missing or invalid query in payload.');
            return;
        }

        let workspaceFolderToSearchIn: vscode.WorkspaceFolder | undefined | null = null;
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
            // If no specific workspaceFolderUri is provided, searchService will handle searching across all trusted folders.
            workspaceFolderToSearchIn = null;
        }

        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing search_workspace for query: \\"${query}\\" in workspace ${workspaceFolderToSearchIn ? workspaceFolderToSearchIn.name : 'all trusted'}`);
        try {
            const searchScopeUri = workspaceFolderToSearchIn ? workspaceFolderToSearchIn.uri : undefined;
            const results: SearchResult[] = await this.searchService.search(query, searchScopeUri);
            const responsePayload = {
                success: true,
                data: { results: results },
                error: null,
                query: query
            };
            this.sendMessage(client.ws, 'response', 'response_search_workspace', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent ${results.length} search results for query \\"${query}\\" to ${client.ip}`);
        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error performing search for query \\"${query}\\": ${error.message}`);
            console.error(LOG_PREFIX_SERVER + `Error performing search:`, error);
            const errorCode = error instanceof WorkspaceServiceError ? error.code : 'SEARCH_ERROR';
            this.sendError(client.ws, message_id, errorCode, `Error performing search: ${error.message}`);
        }
    }

    private async handleGetActiveFileInfo(client: Client, message_id: string): Promise<void> {
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing get_active_file_info for ${client.ip}`);
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                this.sendError(client.ws, message_id, 'NO_ACTIVE_EDITOR', 'No active text editor found.');
                return;
            }
            const document = editor.document;
            const owningFolder = this.workspaceService.getWorkspaceFolder(document.uri);

            // FR-VSCE-009: Only operate on trusted workspaces.
            // This check is now primarily done before command dispatch, but good to be mindful.
            if (document.uri.scheme === 'file' && !owningFolder && !this.workspaceService.isWorkspaceTrusted()) {
                this.sendError(client.ws, message_id, 'WORKSPACE_NOT_TRUSTED', 'Cannot access active file as workspace is not trusted.');
                return;
            }
            if (owningFolder && !this.workspaceService.isWorkspaceTrusted()) {
                this.sendError(client.ws, message_id, 'WORKSPACE_NOT_TRUSTED', `Workspace folder '${owningFolder.name}' is not trusted.`);
                return;
            }


            const filePath = document.uri.toString(); // Send URI string
            const fileName = path.basename(document.uri.path);
            const workspaceFolder = this.workspaceService.getWorkspaceFolder(document.uri);

            const responsePayload = {
                success: true,
                data: {
                    activeFilePath: filePath,
                    activeFileLabel: fileName, // For display in CE UI options
                    workspaceFolderUri: workspaceFolder ? workspaceFolder.uri.toString() : null,
                    workspaceFolderName: workspaceFolder ? workspaceFolder.name : null,
                },
                error: null,
            };
            this.sendMessage(client.ws, 'response', 'response_active_file_info', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent active file info for ${filePath} to ${client.ip}`);
        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error in handleGetActiveFileInfo: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + `Error in handleGetActiveFileInfo:`, error);
            this.sendError(client.ws, message_id, 'INTERNAL_SERVER_ERROR', `Error getting active file info: ${error.message}`);
        }
    }

    private async handleGetOpenFiles(client: Client, message_id: string): Promise<void> {
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing get_open_files for ${client.ip}`);
        try {
            const openFilesData: Array<{ path: string; name: string; workspaceFolderUri: string | null; workspaceFolderName: string | null }> = [];
            const openDocuments = vscode.workspace.textDocuments;
            const trustedWorkspaceFolders = this.workspaceService.getWorkspaceFolders(); // Already filtered for trust by WorkspaceService

            if (!this.workspaceService.isWorkspaceTrusted() || !trustedWorkspaceFolders || trustedWorkspaceFolders.length === 0) {
                const responsePayload = { success: true, data: { openFiles: [] }, error: null };
                this.sendMessage(client.ws, 'response', 'response_open_files', responsePayload, message_id);
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent empty open files list (no trusted workspace folders or workspace not trusted) to ${client.ip}`);
                return;
            }

            for (const doc of openDocuments) {
                if (!doc.isUntitled && doc.uri.scheme === 'file') { // Only include saved files on disk
                    const owningFolder = this.workspaceService.getWorkspaceFolder(doc.uri);
                    // Ensure the file belongs to one of the currently open and trusted workspace folders
                    if (owningFolder && trustedWorkspaceFolders.some(wf => wf.uri.toString() === owningFolder.uri.toString())) {
                        openFilesData.push({
                            path: doc.uri.toString(), // Send URI string
                            name: path.basename(doc.uri.path),
                            workspaceFolderUri: owningFolder.uri.toString(),
                            workspaceFolderName: owningFolder.name,
                        });
                    }
                }
            }
            const responsePayload = {
                success: true,
                data: { openFiles: openFilesData, },
                error: null,
            };
            this.sendMessage(client.ws, 'response', 'response_open_files', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent ${openFilesData.length} open files to ${client.ip}`);
        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error in handleGetOpenFiles: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + `Error in handleGetOpenFiles:`, error);
            this.sendError(client.ws, message_id, 'INTERNAL_SERVER_ERROR', `Error getting open files: ${error.message}`);
        }
    }

    private async handleListFolderContents(client: Client, payload: any, message_id: string): Promise<void> {
        const { folderUri, workspaceFolderUri } = payload;
        if (!folderUri || typeof folderUri !== 'string') {
            this.sendError(client.ws, message_id, 'INVALID_PAYLOAD', 'Missing or invalid folderUri in payload.');
            return;
        }

        const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(client, workspaceFolderUri, 'list_folder_contents', message_id);
        if (!targetWorkspaceFolder) return;

        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing list_folder_contents for: ${folderUri} in workspace ${targetWorkspaceFolder.name}`);

        try {
            const folderToScanUri = vscode.Uri.parse(folderUri, true);
            if (!folderToScanUri.fsPath.startsWith(targetWorkspaceFolder.uri.fsPath)) {
                this.sendError(client.ws, message_id, 'INVALID_PATH', `Folder to list ('${folderUri}') is not within the specified workspace folder ('${targetWorkspaceFolder.name}').`);
                return;
            }

            const result = await getDirectoryListing(folderToScanUri, targetWorkspaceFolder);

            const responsePayload = {
                success: true,
                data: {
                    entries: result.entries,
                    parentFolderUri: folderUri,
                    filterTypeApplied: result.filterTypeApplied
                },
                error: null
            };
            this.sendMessage(client.ws, 'response', 'response_list_folder_contents', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent folder listing for ${folderUri} (Filter: ${result.filterTypeApplied}, ${result.entries.length} entries) to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error listing contents for ${folderUri}: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + `Error listing contents:`, error);
            const errorCode = error instanceof WorkspaceServiceError ? error.code : 'FOLDER_LISTING_ERROR';
            this.sendError(client.ws, message_id, errorCode, `Error listing contents for folder ${folderUri}: ${error.message}`);
        }
    }

    private async handleGetFilterInfo(client: Client, payload: any, message_id: string): Promise<void> {
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing get_filter_info for ${client.ip}. Payload: ${JSON.stringify(payload)}`);
        try {
            const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(client, payload.workspaceFolderUri, 'get_filter_info', message_id);
            if (!targetWorkspaceFolder) { return; }

            // parseGitignore is already part of fileSystemService, no need to call it directly here
            // We need a way to get the filter type that *would be* applied for this folder.
            // This might mean parseGitignore needs to be callable without full tree/content generation.
            // For now, let's assume fileSystemService can provide this.
            // This logic is simplified; ideally, fileSystemService would have a dedicated method.
            const gitignoreInstance = await parseGitignore(targetWorkspaceFolder);
            const filterType = gitignoreInstance ? 'gitignore' : 'default';


            const responsePayload = {
                success: true,
                data: {
                    filterType: filterType,
                    workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                },
                error: null,
            };
            this.sendMessage(client.ws, 'response', 'response_filter_info', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent filter info (${filterType}) for ${targetWorkspaceFolder.name} to ${client.ip}`);
        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error in handleGetFilterInfo: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + `Error in handleGetFilterInfo:`, error);
            const errorCode = error instanceof WorkspaceServiceError ? error.code : 'INTERNAL_SERVER_ERROR';
            this.sendError(client.ws, message_id, errorCode, `Error getting filter info: ${error.message}`);
        }
    }


    public getPrimaryTargetTabId(): number | undefined {
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Searching for primary target tab ID. Clients: ${this.clients.size}`);
        for (const client of this.clients.values()) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `  Client IP: ${client.ip}, Authenticated: ${client.isAuthenticated}, TabID: ${client.activeLLMTabId}, Host: ${client.activeLLMHost}`);
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
            if (targetClient.ws) { // Ensure ws exists
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `pushSnippetToTarget: targetClient.ws.readyState: ${targetClient.ws.readyState}`);
                console.log(LOG_PREFIX_SERVER + `pushSnippetToTarget: targetClient.ws.readyState: ${targetClient.ws.readyState}`);
                this.sendMessage(targetClient.ws, 'push', 'push_snippet', snippetData);
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Pushed snippet to tabId ${targetTabId}`);
                console.log(LOG_PREFIX_SERVER + `Pushed snippet to tabId ${targetTabId}`);
            } else {
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `WARN: targetClient found for tabId ${targetTabId} but its WebSocket is missing.`);
                console.warn(LOG_PREFIX_SERVER + `WARN: targetClient found for tabId ${targetTabId} but its WebSocket is missing.`);
                vscode.window.showWarningMessage("ContextWeaver: Could not send snippet. Target client found, but WebSocket is missing.");
            }
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
                try {
                    client.ws.removeAllListeners();
                    client.ws.close();
                } catch (err) {
                    console.error(LOG_PREFIX_SERVER + 'Error cleaning up client:', err);
                }
            });
            this.clients.clear();
            this.wss.removeAllListeners();
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
