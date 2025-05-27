/**
 * @file ipcServer.ts
 * @description Hosts the WebSocket server for IPC between the VSCE and CE.
 * Handles incoming requests, authentication, and routes to appropriate service modules.
 * @module ContextWeaver/VSCE
 */

import WebSocket, { WebSocketServer } from 'ws'; // Import WebSocketServer as WebSocket.Server
import * as vscode from 'vscode'; // Ensure vscode is imported if not already for OutputChannel type
import { v4 as uuidv4 } from 'uuid'; // For generating unique message IDs if needed by server

// Import types from the IPC_Protocol_Design.md (assuming they will be in a shared types file later)
// For now, we'll define simplified versions or use 'any'
// import { Message, ContextBlockMetadata, RequestPayload, ResponsePayload, PushPayload } from '../../shared/src/ipcTypes'; 
// TODO: Create shared types in packages/shared/src/ipcTypes.ts

const LOG_PREFIX_SERVER = '[ContextWeaver IPCServer] '; // Specific prefix for server logs

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
    private readonly expectedToken: string;
    private readonly extensionContext: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;

    constructor(port: number, token: string, context: vscode.ExtensionContext, outputChannelInstance: vscode.OutputChannel) {
        this.port = port;
        this.expectedToken = token;
        this.extensionContext = context;
        this.outputChannel = outputChannelInstance;
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Initialized with port ${port}. Token configured: ${!!token}`);
    }

    public start(): void {
        if (!this.expectedToken) {
            const msg = "IPC Server started without a token. Communication will not be secure.";
            vscode.window.showWarningMessage(LOG_PREFIX_SERVER + msg);
            this.outputChannel.appendLine('WARNING: ' + LOG_PREFIX_SERVER + msg);
        }
        try {
            this.wss = new WebSocketServer({ port: this.port }); // Removed host: 'localhost' to listen on all available IPv4 interfaces by default
            this.wss.on('listening', () => {
                const msg = `WebSocket server listening on localhost:${this.port}`;
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + msg);
                console.log(LOG_PREFIX_SERVER + msg); // Keep console log for immediate debug visibility
                vscode.window.showInformationMessage(`ContextWeaver: IPC Server started on port ${this.port}.`);
            });

            this.wss.on('connection', (ws: WebSocket, req) => { // Explicitly type ws as WebSocket
                const clientIp = req.socket.remoteAddress || 'unknown';
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Client connected from ${clientIp}`);
                const client: Client = { ws, isAuthenticated: false, ip: clientIp };
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
                    // Ensure client is removed on error as well
                    if (this.clients.has(ws)) {
                        this.clients.delete(ws);
                    }
                });
            });

            this.wss.on('error', (error: Error & { code?: string }) => { // Added type for error.code
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `WebSocket server error: ${error.message}`);
                console.error(LOG_PREFIX_SERVER + 'WebSocket server error:', error);
                vscode.window.showErrorMessage(`ContextWeaver: IPC Server failed to start on port ${this.port}. Error: ${error.message}`);
                // TODO: Implement port fallback mechanism if desired (FR-IPC-002)
            });
        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Failed to create WebSocket server: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + 'Failed to create WebSocket server:', error);
            vscode.window.showErrorMessage(`ContextWeaver: Exception while starting IPC Server on port ${this.port}. Error: ${error.message}`);
        }
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

        const { protocol_version, message_id, type, command, token, payload } = parsedMessage;

        if (protocol_version !== '1.0') {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Protocol version mismatch from ${client.ip}. Expected 1.0, got ${protocol_version}.`);
            this.sendError(client.ws, message_id, 'UNSUPPORTED_PROTOCOL_VERSION', 'Protocol version mismatch.');
            return;
        }

        // Authenticate if not already and if it's a request type
        if (type === 'request' && !client.isAuthenticated) {
            if (!this.expectedToken) { // Server started without a token
                const msg = `Allowing unauthenticated request from ${client.ip} because server token is not set.`;
                this.outputChannel.appendLine('WARNING: ' + LOG_PREFIX_SERVER + msg);
                console.warn(LOG_PREFIX_SERVER + msg);
                client.isAuthenticated = true;
            } else if (token && token === this.expectedToken) {
                client.isAuthenticated = true;
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Client from ${client.ip} authenticated successfully.`);
                console.log(LOG_PREFIX_SERVER + `Client from ${client.ip} authenticated successfully.`);
            } else {
                const msg = `Authentication failed for client from ${client.ip}. Token: ${token ? 'provided_invalid' : 'missing'}`;
                this.outputChannel.appendLine('WARNING: ' + LOG_PREFIX_SERVER + msg);
                console.warn(LOG_PREFIX_SERVER + msg);
                this.sendError(client.ws, message_id, 'AUTHENTICATION_FAILED', 'Invalid or missing token.');
                client.ws.close(); // Optionally close connection on auth failure
                return;
            }
        }

        // For push messages, we might not require prior authentication if they are simple status updates from a trusted source,
        // but snippets should only go to authenticated and registered targets.
        // For now, let's assume all requests need authentication. Pushes are VSCE -> CE.
        if (type === 'request' && !client.isAuthenticated) {
            const msg = `Unauthenticated request type '${type}' command '${command}' from ${client.ip} blocked.`;
            this.outputChannel.appendLine('WARNING: ' + LOG_PREFIX_SERVER + msg);
            console.warn(LOG_PREFIX_SERVER + msg);
            this.sendError(client.ws, message_id, 'NOT_AUTHENTICATED', 'Client not authenticated.');
            return;
        }


        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Received command '${command}' of type '${type}' from ${client.ip}. Payload: ${JSON.stringify(payload)}`);
        console.log(LOG_PREFIX_SERVER + `Received command '${command}' of type '${type}' from ${client.ip}. Payload:`, payload);

        // Route message to appropriate handler
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
            // Add stubs for other request handlers
            case 'get_folder_content':
            case 'get_entire_codebase':
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
            message_id: message_id || uuidv4(), // Generate new ID if not a response
            type,
            command,
            // No token in server -> client messages
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
            originalCommand: null // Could be populated if we parse it before erroring
        };
        this.sendMessage(ws, 'error_response', 'error_response', errorPayload, original_message_id || uuidv4());
    }

    private sendGenericAck(client: Client, message_id: string, success: boolean, message: string | null = null) {
        this.sendMessage(client.ws, 'response', 'response_generic_ack', { success, message }, message_id);
    }

    // --- Stub Handlers ---
    private handleRegisterActiveTarget(client: Client, payload: any, message_id: string): void {
        // FR-IPC-004: Registration of an "active LLM context target"
        client.activeLLMTabId = payload.tabId;
        client.activeLLMHost = payload.llmHost;
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Registered active target for client ${client.ip}: TabID ${payload.tabId}, Host ${payload.llmHost}`);
        this.sendGenericAck(client, message_id, true, "Target registered successfully.");
    }

    private handleGetFileTree(client: Client, payload: any, message_id: string): void {
        // FR-VSCE-001
        const workspaceFolderUri = payload.workspaceFolderUri || vscode.workspace.workspaceFolders?.[0]?.uri.toString();
        const metadata = {
            unique_block_id: uuidv4(),
            content_source_id: `${workspaceFolderUri || 'unknown_workspace'}::file_tree`,
            type: "file_tree",
            label: "File Tree",
            workspaceFolderUri: workspaceFolderUri,
            workspaceFolderName: workspaceFolderUri ? vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(workspaceFolderUri))?.name : null
        };
        const responsePayload = {
            success: true,
            data: {
                fileTree: "C:/project/ContextWeaver\n├── backend\n│   └── api\n└── README.md (Placeholder)",
                metadata: metadata
            },
            error: null,
            workspaceFolderUri: workspaceFolderUri,
            filterType: 'default' // Placeholder
        };
        this.sendMessage(client.ws, 'response', 'response_file_tree', responsePayload, message_id);
    }

    private handleGetFileContent(client: Client, payload: any, message_id: string): void {
        // FR-VSCE-002
        const filePath = payload.filePath;
        const metadata = {
            unique_block_id: uuidv4(),
            content_source_id: filePath, // Assuming filePath is already normalized URI
            type: "file_content",
            label: filePath.substring(filePath.lastIndexOf('/') + 1), // Basic filename extraction
            workspaceFolderUri: null, // TODO: Determine workspace folder from filePath in a more robust way
            workspaceFolderName: null
        };
        const responsePayload = {
            success: true,
            data: {
                content: `// Content of ${filePath} (Placeholder)\nconsole.log('Hello from ${filePath}');`,
                metadata: metadata
            },
            error: null,
            filePath: filePath,
            filterType: 'not_applicable'
        };
        this.sendMessage(client.ws, 'response', 'response_file_content', responsePayload, message_id);
    }

    private sendPlaceholderResponse(client: Client, originalCommand: string, requestPayload: any, message_id: string): void {
        // Generic placeholder for other commands
        const commandMap: { [key: string]: string } = {
            'get_folder_content': 'response_folder_content',
            'get_entire_codebase': 'response_entire_codebase',
            'get_active_file_info': 'response_active_file_info',
            'get_open_files': 'response_open_files',
            'search_workspace': 'response_search_workspace',
            'check_workspace_trust': 'response_workspace_trust',
            'get_filter_info': 'response_filter_info',
        };
        const responseCommand = commandMap[originalCommand] || `response_${originalCommand}`;

        let responseData: any = { message: `Placeholder data for ${originalCommand}` };

        const metadata = { // Generic metadata
            unique_block_id: uuidv4(),
            content_source_id: `${requestPayload?.workspaceFolderUri || requestPayload?.folderPath || requestPayload?.filePath || 'placeholder_source'}::${originalCommand}`,
            type: originalCommand.replace('get_', ''),
            label: `Placeholder for ${originalCommand}`,
            workspaceFolderUri: requestPayload?.workspaceFolderUri,
            workspaceFolderName: null // Simplified
        };

        // More detailed placeholder data based on actual response structures
        if (originalCommand === 'get_folder_content') {
            responseData = {
                content: `Placeholder content for folder ${requestPayload?.folderPath}`,
                metadata: metadata
            };
        } else if (originalCommand === 'get_entire_codebase') {
            responseData = {
                content: `Placeholder content for entire codebase (workspace: ${requestPayload?.workspaceFolderUri || 'active'})`,
                metadata: metadata
            };
        } else if (originalCommand === 'get_active_file_info') {
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

        // Construct the full response payload structure
        let fullResponsePayload: any;
        if (['get_folder_content', 'get_entire_codebase'].includes(originalCommand)) {
            fullResponsePayload = {
                success: true,
                data: responseData,
                error: null,
                filterType: 'default'
            };
            if (requestPayload.folderPath) fullResponsePayload.folderPath = requestPayload.folderPath;
            if (requestPayload.workspaceFolderUri) fullResponsePayload.workspaceFolderUri = requestPayload.workspaceFolderUri;
        } else {
            fullResponsePayload = {
                success: true,
                data: responseData,
                error: null
            };
        }

        this.sendMessage(client.ws, 'response', responseCommand, fullResponsePayload, message_id);
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent placeholder response for ${originalCommand} to ${client.ip}`);
    }

    // Method to push snippets (will be called by snippetService.ts later)
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
            // Optionally, inform the user via VS Code UI if the snippet couldn't be sent
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