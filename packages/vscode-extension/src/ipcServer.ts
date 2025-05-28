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
    // parseGitignore // Not directly needed by ipcServer, but its effect is reflected in filterType
} from './fileSystemService';
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
    private readonly port: number;
    private readonly extensionContext: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;

    constructor(port: number, context: vscode.ExtensionContext, outputChannelInstance: vscode.OutputChannel) {
        this.port = port;
        this.extensionContext = context;
        this.outputChannel = outputChannelInstance;
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Initialized with port ${port}.`);
    }

    public start(): void {
        const MAX_PORT_RETRIES = 3; // Try original port + 3 alternatives
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
                    const client: Client = { ws, isAuthenticated: true, ip: clientIp }; // Token auth removed, client is authenticated on connect
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
                        if (this.wss) { // Clean up the failed server instance
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

            } catch (error: any) { // Catch synchronous errors from new WebSocketServer, though 'error' event is more common
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Failed to create WebSocket server on port ${portToTry}: ${error.message}`);
                console.error(LOG_PREFIX_SERVER + `Failed to create WebSocket server on port ${portToTry}:`, error);
                vscode.window.showErrorMessage(`ContextWeaver: Exception while starting IPC Server on port ${portToTry}. Error: ${error.message}`);
            }
        };
        tryStartServer(currentPort);
    }

    private handleMessage(client: Client, message: WebSocket.RawData): void {
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

        if (!client.isAuthenticated) { 
            const msg = `Request type '${type}' command '${command}' from ${client.ip} blocked as client is not marked authenticated. This should not happen.`;
            this.outputChannel.appendLine('ERROR: ' + LOG_PREFIX_SERVER + msg);
            console.error(LOG_PREFIX_SERVER + msg);
            this.sendError(client.ws, message_id, 'INTERNAL_SERVER_ERROR', 'Client not marked authenticated despite token removal.');
            return;
        }

        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Received command '${command}' of type '${type}' from ${client.ip}. Payload: ${JSON.stringify(payload)}`);
        console.log(LOG_PREFIX_SERVER + `Received command '${command}' of type '${type}' from ${client.ip}. Payload:`, payload);

        switch (command) {
            case 'register_active_target':
                this.handleRegisterActiveTarget(client, payload, message_id);
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
            case 'get_active_file_info':
            case 'get_open_files':
            case 'search_workspace':
            case 'check_workspace_trust':
            case 'get_filter_info':
                this.sendPlaceholderResponse(client, command, payload, message_id);
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

    private async handleGetFileTree(client: Client, payload: any, message_id: string): Promise<void> {
        const requestedWorkspaceFolderUriString = payload.workspaceFolderUri;
        let requestedWorkspaceFolderUri: vscode.Uri | null = null;
        if (requestedWorkspaceFolderUriString) {
            try {
                requestedWorkspaceFolderUri = vscode.Uri.parse(requestedWorkspaceFolderUriString, true);
            } catch (e: any) {
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Invalid workspaceFolderUri for get_file_tree: ${requestedWorkspaceFolderUriString}. Error: ${e.message}`);
                this.sendError(client.ws, message_id, 'INVALID_PAYLOAD', `Invalid workspaceFolderUri: ${e.message}`);
                return;
            }
        }

        let targetWorkspaceFolder: vscode.WorkspaceFolder | undefined;
        if (requestedWorkspaceFolderUri) {
            targetWorkspaceFolder = vscode.workspace.getWorkspaceFolder(requestedWorkspaceFolderUri);
            if (!targetWorkspaceFolder) {
                 this.sendError(client.ws, message_id, 'WORKSPACE_FOLDER_NOT_FOUND', `Workspace folder for URI ${requestedWorkspaceFolderUriString} not found.`);
                 return;
            }
        } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            targetWorkspaceFolder = vscode.workspace.workspaceFolders[0]; 
        }

        if (!targetWorkspaceFolder) {
            this.sendError(client.ws, message_id, 'NO_WORKSPACE_OPEN', 'No workspace folder open or specified for get_file_tree.');
            return;
        }
        
        try {
            const result = await getFileTree(targetWorkspaceFolder); 

            if (typeof result === 'string' && result.startsWith('Error:')) { // Error string from getFileTree
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
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                filterType: filterTypeApplied 
            };
            this.sendMessage(client.ws, 'response', 'response_file_tree', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent file tree for ${targetWorkspaceFolder.uri.toString()} (Filter: ${filterTypeApplied}) to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error generating file tree for ${targetWorkspaceFolder.uri.toString()}: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + `Error generating file tree:`, error);
            this.sendError(client.ws, message_id, 'FILE_TREE_ERROR', `Internal server error while generating file tree: ${error.message}`);
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
            const fileUri = vscode.Uri.file(filePath);
            const content = await getFileContent(fileUri); 

            let workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
            let workspaceFolderName = workspaceFolder ? workspaceFolder.name : 'Unknown Workspace';
            let workspaceFolderUriString = workspaceFolder ? workspaceFolder.uri.toString() : null;

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
            this.sendError(client.ws, message_id, 'FILE_CONTENT_ERROR', `Internal server error while getting file content: ${error.message}`);
        }
    }

    private async handleGetFolderContent(client: Client, payload: any, message_id: string): Promise<void> {
        const { folderPath, workspaceFolderUri: workspaceFolderUriString } = payload;

        if (!folderPath || typeof folderPath !== 'string') {
            this.sendError(client.ws, message_id, 'INVALID_PAYLOAD', 'Missing or invalid folderPath in payload.');
            return;
        }
        if (!workspaceFolderUriString || typeof workspaceFolderUriString !== 'string') {
            this.sendError(client.ws, message_id, 'INVALID_PAYLOAD', 'Missing or invalid workspaceFolderUri in payload.');
            return;
        }
        
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing get_folder_content for: ${folderPath} in workspace ${workspaceFolderUriString}`);

        try {
            const targetFolderUri = vscode.Uri.file(folderPath);
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(workspaceFolderUriString, true));

            if (!workspaceFolder) {
                this.sendError(client.ws, message_id, 'WORKSPACE_FOLDER_NOT_FOUND', `Workspace folder for URI ${workspaceFolderUriString} not found.`);
                return;
            }

            const result = await getFolderContents(targetFolderUri, workspaceFolder);

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
                workspaceFolderUri: workspaceFolder.uri.toString(),
                workspaceFolderName: workspaceFolder.name
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
                filterType: filterTypeApplied
            };
            this.sendMessage(client.ws, 'response', 'response_folder_content', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent folder content for ${folderPath} (Filter: ${filterTypeApplied}) to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Unexpected error in handleGetFolderContent for ${folderPath}: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + `Unexpected error in handleGetFolderContent for ${folderPath}:`, error);
            this.sendError(client.ws, message_id, 'FOLDER_CONTENT_UNEXPECTED_ERROR', `Internal server error while getting folder content: ${error.message}`);
        }
    }

    private async handleGetEntireCodebase(client: Client, payload: any, message_id: string): Promise<void> {
        const { workspaceFolderUri: workspaceFolderUriString } = payload;

        if (!workspaceFolderUriString || typeof workspaceFolderUriString !== 'string') {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Invalid or missing workspaceFolderUri for get_entire_codebase from ${client.ip}.`);
            this.sendError(client.ws, message_id, 'INVALID_PAYLOAD', 'Missing or invalid workspaceFolderUri in payload.');
            return;
        }

        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing get_entire_codebase for workspace: ${workspaceFolderUriString}`);

        try {
            const workspaceUri = vscode.Uri.parse(workspaceFolderUriString, true);
            const result = await getWorkspaceCodebaseContents(workspaceUri);

            if (typeof result === 'string') { 
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error getting entire codebase for ${workspaceFolderUriString}: ${result}`);
                this.sendError(client.ws, message_id, 'CODEBASE_CONTENT_ERROR', result);
                return;
            }
            
            const { fileTree, concatenatedContent, workspaceName, filterTypeApplied } = result;

            const metadata = {
                unique_block_id: uuidv4(),
                content_source_id: `${workspaceUri.toString()}::codebase`,
                type: "codebase_content",
                label: `Entire Codebase - ${workspaceName}`,
                workspaceFolderUri: workspaceUri.toString(),
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
                workspaceFolderUri: workspaceUri.toString(),
                filterType: filterTypeApplied
            };
            this.sendMessage(client.ws, 'response', 'response_entire_codebase', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent entire codebase content for ${workspaceName} (Filter: ${filterTypeApplied}) to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Unexpected error in handleGetEntireCodebase for ${workspaceFolderUriString}: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + `Unexpected error in handleGetEntireCodebase for ${workspaceFolderUriString}:`, error);
            this.sendError(client.ws, message_id, 'CODEBASE_CONTENT_UNEXPECTED_ERROR', `Internal server error while getting entire codebase content: ${error.message}`);
        }
    }

    private sendPlaceholderResponse(client: Client, originalCommand: string, requestPayload: any, message_id: string): void {
        const commandMap: { [key: string]: string } = {
            'get_active_file_info': 'response_active_file_info',
            'get_open_files': 'response_open_files',
            'search_workspace': 'response_search_workspace',
            'check_workspace_trust': 'response_workspace_trust',
            'get_filter_info': 'response_filter_info',
        };
        const responseCommand = commandMap[originalCommand] || `response_${originalCommand}`;
        let responseData: any = { message: `Placeholder data for ${originalCommand}` };
        
        if (originalCommand === 'get_active_file_info') {
            responseData = { activeFilePath: "placeholder/active/file.ts", activeFileLabel: "file.ts", workspaceFolderUri: null, workspaceFolderName: null };
        } else if (originalCommand === 'get_open_files') {
            responseData = { openFiles: [{ path: "placeholder/open/file1.ts", name: "file1.ts", workspaceFolderUri: null, workspaceFolderName: null }] };
        } else if (originalCommand === 'search_workspace') {
            responseData = { results: [{ path: "placeholder/search/result.ts", name: "result.ts", type: "file", content_source_id: "placeholder/search/result.ts", workspaceFolderUri: null, workspaceFolderName: null }] };
        } else if (originalCommand === 'check_workspace_trust') {
            responseData = { isTrusted: true, workspaceFolders: [{ uri: "placeholder/ws", name: "PlaceholderWS", isTrusted: true }] };
        } else if (originalCommand === 'get_filter_info') {
            responseData = { filterType: 'default', workspaceFolderUri: null };
        }

        let fullResponsePayload: any = {
            success: true,
            data: responseData,
            error: null
        };
         if (requestPayload.workspaceFolderUri) {
            fullResponsePayload.workspaceFolderUri = requestPayload.workspaceFolderUri;
        }

        this.sendMessage(client.ws, 'response', responseCommand, fullResponsePayload, message_id);
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent placeholder response for ${originalCommand} to ${client.ip}`);
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