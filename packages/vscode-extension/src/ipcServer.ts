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
    getFileContentWithLanguageId, // Use this for single file content
    getFolderContentsForIPC,      // Use this for folder content
    getWorkspaceDataForIPC,       // Use this for entire codebase
    getDirectoryListing
} from './fileSystemService'; // Ensure correct functions are imported
import { SearchService } from './searchService'; // Removed local SearchResult import
import { WorkspaceService, WorkspaceServiceError } from './workspaceService';
import { DiagnosticsService } from './diagnosticsService';
import { v4 as uuidv4 } from 'uuid';

// Import shared types
import {
    // Request Payloads
    GetFileTreeRequestPayload, GetFileContentRequestPayload, GetFolderContentRequestPayload,
    GetEntireCodebaseRequestPayload, SearchWorkspaceRequestPayload, GetFilterInfoRequestPayload,
    ListFolderContentsRequestPayload, RegisterActiveTargetRequestPayload, GetWorkspaceProblemsRequestPayload,
    // Response Payloads
    FileTreeResponsePayload, FileContentResponsePayload, FolderContentResponsePayload,
    EntireCodebaseResponsePayload, SearchWorkspaceResponsePayload as CWSearchWorkspaceResponsePayload, // Alias to avoid conflict if SearchResult differs
    ActiveFileInfoResponsePayload, OpenFilesResponsePayload, WorkspaceDetailsResponsePayload,
    FilterInfoResponsePayload, ListFolderContentsResponsePayload, WorkspaceProblemsResponsePayload, GenericAckResponsePayload, ErrorResponsePayload,
    // IPC Message Structure Types
    IPCMessageRequest, IPCMessageResponse, IPCMessageErrorResponse, IPCBaseMessage, IPCMessagePush, // We primarily deal with requests and send responses
    // Data Models (if directly used)
    ContextBlockMetadata, FileData as CWFileData, SearchResult as CWSearchResult, PushSnippetPayload // Alias FileData and SearchResult
} from '@contextweaver/shared';


const LOG_PREFIX_SERVER = '[ContextWeaver IPCServer] ';
// Rationale: Define a port range for the server to try, making it resilient to port conflicts.
const PORT_RANGE_START = 30001;
const PORT_RANGE_END = 30005;

/**
 * Represents a connected client (Chrome Extension instance or Secondary VSCE) to the IPC server.
 */
interface Client {
    ws: WebSocket;
    isAuthenticated: boolean;
    ip: string;
    activeLLMTabId?: number;
    activeLLMHost?: string;
    windowId?: string; // For secondary VSCE clients
}

// FileData interface from original file is now CWFileData from shared

/**
 * Manages the WebSocket server for Inter-Process Communication (IPC) between the VS Code Extension (VSCE)
 * and the Chrome Extension (CE). It handles client connections, message routing, and authentication.
 * Also manages Primary/Secondary VSCE architecture for multi-window support.
 */
export class IPCServer {
    private wss: WebSocketServer | null = null;
    private clients: Map<WebSocket, Client> = new Map();
    private searchService: SearchService;
    private workspaceService: WorkspaceService;
    private diagnosticsService: DiagnosticsService;
    private readonly port: number;
    private readonly windowId: string;
    private readonly extensionContext: vscode.ExtensionContext;
    private activePort: number | null = null; // Rationale: Store the port the server successfully binds to.
    private outputChannel: vscode.OutputChannel;

    // Primary/Secondary architecture properties
    private isPrimary: boolean = false;
    private primaryWebSocket: WebSocket | null = null;
    private secondaryClients: Map<string, WebSocket> = new Map();
    private pendingAggregatedResponses: Map<string, {
        originalRequester: WebSocket,
        // TODO: Replace 'any' with a discriminated union of response payloads for type safety.
        responses: any[],
        expectedResponses: number,
        timeout: NodeJS.Timeout,
        originalMessageId: string,
        originalCommand: string
    }> = new Map();

    /**
     * Creates an instance of IPCServer.
     * @param port The port number on which the WebSocket server will listen.
     * @param windowId The unique identifier for this VS Code window instance.
     * @param context The VS Code extension context.
     * @param outputChannelInstance The VS Code output channel for logging.
     * @param searchServiceInstance The SearchService instance for handling search requests.
     * @param workspaceServiceInstance The WorkspaceService instance for handling workspace-related requests.
     * @param diagnosticsServiceInstance The DiagnosticsService instance for handling diagnostics requests.
     */
    constructor(
        _port: number, // Rationale: Port is no longer needed here as it's determined dynamically. Underscore indicates it's unused.
        windowId: string,
        context: vscode.ExtensionContext,
        outputChannelInstance: vscode.OutputChannel,
        searchServiceInstance: SearchService,
        workspaceServiceInstance: WorkspaceService,
        diagnosticsServiceInstance: DiagnosticsService
    ) {
        console.log(LOG_PREFIX_SERVER + 'Constructor called.');
        outputChannelInstance.appendLine(LOG_PREFIX_SERVER + 'Constructor called.');

        this.port = PORT_RANGE_START; // Set a default/initial port, but it will be updated.
        this.windowId = windowId;
        this.extensionContext = context;
        this.outputChannel = outputChannelInstance;
        this.searchService = searchServiceInstance;
        this.workspaceService = workspaceServiceInstance;
        this.diagnosticsService = diagnosticsServiceInstance;
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Initialized with port ${this.port}, windowId ${this.windowId}.`);
    }

    /**
     * Starts the IPC server with leader election for Primary/Secondary architecture.
     * Attempts to connect to a primary server across a range of ports. If connection fails, becomes primary.
     * If connection succeeds, becomes secondary and registers with the primary.
     */
    /**
     * Starts the IPC server. It performs leader election to determine if this instance
     * should become a Primary (listening for connections) or a Secondary (connecting to a Primary).
     */
    public start(): void {
        console.log(LOG_PREFIX_SERVER + 'start() method called.');
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + 'start() method called.');

        // Try to connect to primary first (leader election)
        this.findPrimaryAndInitialize();
    }

    /**
     * Scans a predefined port range to find an existing primary server. If found, this instance
     * becomes a secondary. If not found, this instance becomes the primary. This method
     * orchestrates the leader election process.
     */
    private async findPrimaryAndInitialize(): Promise<void> {
        for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
            try {
                const ws = new WebSocket(`ws://127.0.0.1:${port}`);
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Connection timed out')), 200); // Quick timeout
                    ws.on('open', () => {
                        clearTimeout(timeout);
                        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Found existing primary server on port ${port}. Becoming secondary.`);
                        ws.close();
                        this.becomeSecondary(port); // Connect to the found port
                        resolve();
                    });
                    ws.on('error', (err) => {
                        clearTimeout(timeout);
                        // ECONNREFUSED is expected, other errors might be noteworthy
                        if ((err as any).code !== 'ECONNREFUSED') {
                            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Non-refused error on port ${port}: ${err.message}`);
                        }
                        reject(err);
                    });
                });
                // If promise resolved, we found a primary and became secondary, so we can stop scanning.
                return;
            } catch (error) {
                // This is the expected path when a port is not open. Continue to next port.
            }
        }

        // If loop completes, no primary was found. Become primary.
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + 'No primary server found in range. Becoming primary.');
        this.becomePrimary();
    }

    /**
     * Attempts to start the WebSocket server on a specific port.
     * @param port The port number to attempt to bind to.
     * @returns A promise that resolves if the server starts successfully, or rejects if the port is in use or another error occurs.
     */
    private tryStartServerOnPort(port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const wss = new WebSocketServer({ port, host: '127.0.0.1' });

            const onError = (error: Error & { code?: string }) => {
                wss.removeAllListeners();
                wss.close();
                reject(error);
            };

            const onListening = () => {
                wss.removeListener('error', onError); // Don't reject on subsequent errors
                this.wss = wss;
                this.activePort = port;
                resolve();
            };

            wss.once('error', onError);
            wss.once('listening', onListening);
        });
    }

    /**
     * Becomes the primary VSCE server. Finds an open port and starts listening.
     * and handles connections from both Chrome Extension and secondary VSCEs.
     */
    private async becomePrimary(): Promise<void> {
        this.isPrimary = true;
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + 'Setting up as PRIMARY server.');

        for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
            try {
                await this.tryStartServerOnPort(port);
                break; // Exit loop on success
            } catch (error: any) {
                if (error.code === 'EADDRINUSE') {
                    this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Port ${port} is in use, trying next...`);
                    continue;
                }
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Failed to start PRIMARY server with unexpected error: ${error.message}`);
                vscode.window.showErrorMessage(`ContextWeaver: A critical error occurred while starting the server: ${error.message}`);
                return; // Stop trying if it's not a port conflict
            }
        }

        if (this.wss && this.activePort) {
            const msg = `PRIMARY WebSocket server listening on 127.0.0.1:${this.activePort}`;
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + msg);
            vscode.window.showInformationMessage(`ContextWeaver: Primary IPC Server started on port ${this.activePort}.`);

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
                    // If this was a secondary VSCE, remove from secondaryClients
                    if (client.windowId) {
                        this.secondaryClients.delete(client.windowId);
                        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Removed secondary VSCE with windowId ${client.windowId}`);
                    }
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

        } else {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `CRITICAL: All ports in range ${PORT_RANGE_START}-${PORT_RANGE_END} are in use.`);
            vscode.window.showErrorMessage(
                `ContextWeaver: Server failed to start. All ports from ${PORT_RANGE_START}-${PORT_RANGE_END} are busy. Please free up a port and restart VS Code.`
            );
        }
    }

    /**
     * Becomes a secondary VSCE server. Connects to the primary server
     * and forwards requests/responses between primary and local resources.
     */
    private becomeSecondary(primaryPort: number): void {
        this.isPrimary = false;
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + 'Setting up as SECONDARY server.');

        // Connect to primary
        this.primaryWebSocket = new WebSocket(`ws://127.0.0.1:${primaryPort}`);

        this.primaryWebSocket.on('open', () => {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + 'Connected to primary server.');

            // Register ourselves as a secondary
            const registerMessage: IPCMessageRequest = {
                protocol_version: '1.0',
                message_id: uuidv4(),
                type: 'request',
                command: 'register_secondary',
                payload: { windowId: this.windowId, port: 0 } // Port 0 since we're using the same connection
            };

            this.primaryWebSocket!.send(JSON.stringify(registerMessage));
            vscode.window.showInformationMessage('ContextWeaver: Connected as secondary to primary server.');
        });

        this.primaryWebSocket.on('message', (data) => {
            this.handleSecondaryMessage(data);
        });

        this.primaryWebSocket.on('close', () => {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + 'Connection to primary server closed. Attempting to become primary...');
            this.primaryWebSocket = null;
            // Primary died, try to become primary
            setTimeout(() => this.start(), 1000); // Retry after 1 second
        });

        this.primaryWebSocket.on('error', (error) => {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error connecting to primary: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + 'Error connecting to primary:', error);
        });
    }

    /**
     * Handles messages when running as secondary VSCE.
     */
    private async handleSecondaryMessage(data: WebSocket.RawData): Promise<void> {
        // TODO: Replace 'any' with a discriminated union of possible forwarded messages.
        let parsedMessage: any;
        try {
            parsedMessage = JSON.parse(data.toString());
        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Failed to parse message from primary: ${error.message}`);
            return;
        }

        // Handle forwarded requests from primary
        if (parsedMessage.command === 'forward_request_to_secondaries') {
            const originalRequest = parsedMessage.payload.originalRequest as IPCMessageRequest;
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Received forwarded request: ${originalRequest.command}`);

            // Process the request locally
            const dummyClient: Client = {
                ws: null as any, // We'll handle sending response differently
                isAuthenticated: true,
                ip: 'primary-forward',
                windowId: this.windowId
            };

            // Store the original handler responses in a buffer
            const responseBuffer: any[] = [];
            const originalSendMessage = this.sendMessage.bind(this);
            this.sendMessage = (ws: any, type: any, command: any, payload: any, message_id?: string) => {
                responseBuffer.push({ type, command, payload, message_id });
            };

            // Process the request
            await this.handleMessage(dummyClient, Buffer.from(JSON.stringify(originalRequest)));

            // Restore original sendMessage
            this.sendMessage = originalSendMessage;

            // Send response back to primary
            if (responseBuffer.length > 0) {
                const response = responseBuffer[0]; // Should only be one response
                const forwardResponse: IPCMessagePush = {
                    protocol_version: '1.0',
                    message_id: uuidv4(),
                    type: 'push',
                    command: 'forward_response_to_primary',
                    payload: {
                        originalMessageId: originalRequest.message_id,
                        responsePayload: response.payload
                    }
                };
                this.primaryWebSocket!.send(JSON.stringify(forwardResponse));
            }
        }
    }

    /**
     * The central message handler for all incoming requests from connected clients.
     * It parses, validates, and routes messages to the appropriate command handler.
     * @param client The client that sent the message.
     * @param message The raw message data from the WebSocket.
     */
    private async handleMessage(client: Client, message: WebSocket.RawData): Promise<void> {
        let parsedMessage: IPCMessageRequest | IPCMessagePush;
        try {
            const rawParsed = JSON.parse(message.toString());
            if (typeof rawParsed !== 'object' || rawParsed === null || !rawParsed.protocol_version || !rawParsed.message_id || !rawParsed.type || !rawParsed.command) {
                throw new Error('Message does not conform to IPC message structure.');
            }
            parsedMessage = rawParsed as IPCMessageRequest | IPCMessagePush;
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

        // Handle push messages first - they don't follow the request/response pattern
        if (type === 'push') {
            // Handle special push commands for Primary/Secondary architecture
            if (this.isPrimary) {
                const pushCommand = command as string;
                switch (pushCommand) {
                    case 'forward_response_to_primary':
                        /**
                         * Handles a response forwarded from a secondary instance, adding it to the pending aggregation.
                         * @param payload - The forwarded response payload.
                         * // TODO: Replace 'any' with a discriminated union of response payloads for type safety.
                         */
                        this.handleForwardedResponse(payload as any);
                        return;
                    case 'forward_push_to_primary':
                        /**
                         * Handles a push message (like a snippet) forwarded from a secondary instance, broadcasting it to all connected CEs.
                         * @param payload - The forwarded push payload.
                         * // TODO: Review if originalPushPayload needs a more specific type than PushSnippetPayload if other pushes are added.
                         */
                        this.handleForwardedPush(payload as any);
                        return;
                }
            }
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Received push command '${command}' from ${client.ip}, but no handler defined.`);
            return;
        }

        if (type !== 'request') {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Unexpected message type '${type}' from ${client.ip}. Expected 'request' or 'push'.`);
            this.sendError(client.ws, message_id, 'INVALID_MESSAGE_TYPE', `Unexpected message type: ${type}`);
            return;
        }

        // At this point, type is guaranteed to be 'request'
        // Handle special request commands for Primary/Secondary architecture
        if (this.isPrimary) {
            switch (command) {
                case 'register_secondary':
                    this.handleRegisterSecondary(client, payload as any, message_id);
                    return;
                case 'unregister_secondary':
                    this.handleUnregisterSecondary(client, payload as any, message_id);
                    return;
            }
        }

        const commandsRequiringWorkspace = [
            'get_FileTree', 'get_file_content', 'get_folder_content',
            'get_entire_codebase', 'search_workspace', 'get_active_file_info',
            'get_open_files', 'get_filter_info', 'list_folder_contents', 'get_workspace_problems'
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

        // If primary and this is a request from CE that requires aggregation
        if (this.isPrimary && commandsRequiringWorkspace.includes(command) && !client.windowId) {
            // This is from CE, need to broadcast to secondaries
            this.broadcastToSecondaries(parsedMessage, client);
            // Also process locally
        }

        switch (command) {
            case 'register_active_target':
                this.handleRegisterActiveTarget(client, payload as RegisterActiveTargetRequestPayload, message_id);
                break;
            case 'get_workspace_details':
                this.handleGetWorkspaceDetails(client, message_id);
                break;
            case 'get_FileTree':
                this.handleGetFileTree(client, payload as GetFileTreeRequestPayload, message_id);
                break;
            case 'get_file_content':
                this.handleGetFileContent(client, payload as GetFileContentRequestPayload, message_id);
                break;
            case 'get_folder_content':
                this.handleGetFolderContent(client, payload as GetFolderContentRequestPayload, message_id);
                break;
            case 'get_entire_codebase':
                this.handleGetEntireCodebase(client, payload as GetEntireCodebaseRequestPayload, message_id);
                break;
            case 'search_workspace':
                this.handleSearchWorkspace(client, payload as SearchWorkspaceRequestPayload, message_id);
                break;
            case 'get_active_file_info':
                this.handleGetActiveFileInfo(client, message_id);
                break;
            case 'get_open_files':
                this.handleGetOpenFiles(client, message_id);
                break;
            case 'get_filter_info':
                this.handleGetFilterInfo(client, payload as GetFilterInfoRequestPayload, message_id);
                break;
            case 'list_folder_contents':
                this.handleListFolderContents(client, payload as ListFolderContentsRequestPayload, message_id);
                break;
            case 'get_workspace_problems':
                this.handleGetWorkspaceProblems(client, payload as GetWorkspaceProblemsRequestPayload, message_id);
                break;
            // Note: 'check_workspace_trust' was deprecated and removed from IPCRequest union type
            default: {
                const unknownCommand = command as string;
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Unknown command '${unknownCommand}' from ${client.ip}.`);
                console.warn(LOG_PREFIX_SERVER + `Unknown command '${unknownCommand}' from ${client.ip}.`);
                this.sendError(client.ws, message_id, 'UNKNOWN_COMMAND', `Unknown command: ${unknownCommand}`);
            }
        }
    }

    /**
     * Handles registration of a secondary VSCE instance.
     */
    private handleRegisterSecondary(client: Client, payload: { windowId: string; port: number }, message_id: string): void {
        client.windowId = payload.windowId;
        this.secondaryClients.set(payload.windowId, client.ws);
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Registered secondary VSCE with windowId: ${payload.windowId}`);
        this.sendGenericAck(client, message_id, true, 'Secondary registered successfully.');
    }

    /**
     * Handles unregistration of a secondary VSCE instance.
     */
    private handleUnregisterSecondary(client: Client, payload: { windowId: string }, message_id: string): void {
        this.secondaryClients.delete(payload.windowId);
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Unregistered secondary VSCE with windowId: ${payload.windowId}`);
        const ackPayload: GenericAckResponsePayload = { success: true, message: 'Secondary unregistered successfully.' };
        this.sendMessage<GenericAckResponsePayload>(client.ws, 'response', 'response_unregister_secondary_ack', ackPayload, message_id);
    }

    /**
     * Broadcasts a request to all secondary VSCE instances and sets up aggregation.
     */
    private broadcastToSecondaries(originalRequest: IPCMessageRequest, originalRequester: Client): void {
        const secondaryCount = this.secondaryClients.size;
        if (secondaryCount === 0) {
            // No secondaries, just process locally
            return;
        }

        // Set up aggregation tracking
        const aggregationId = uuidv4();
        const timeout = setTimeout(() => {
            // Timeout - send what we have
            this.completeAggregation(aggregationId);
        }, 5000); // 5 second timeout

        this.pendingAggregatedResponses.set(aggregationId, {
            originalRequester: originalRequester.ws,
            responses: [],
            expectedResponses: secondaryCount + 1, // secondaries + primary
            timeout,
            originalMessageId: originalRequest.message_id,
            originalCommand: originalRequest.command
        });

        // Broadcast to secondaries
        const forwardMessage: IPCMessageRequest = {
            protocol_version: '1.0',
            message_id: aggregationId,
            type: 'request',
            command: 'forward_request_to_secondaries',
            payload: { originalRequest }
        };

        for (const [windowId, ws] of this.secondaryClients) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(forwardMessage));
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Forwarded request to secondary ${windowId}`);
            }
        }

        // Store primary's response when it's ready
        const originalSendMessage = this.sendMessage.bind(this);
        this.sendMessage = (ws: any, type: any, command: any, payload: any, message_id?: string) => {
            if (message_id === originalRequest.message_id && ws === originalRequester.ws) {
                // This is the primary's response
                const aggregation = this.pendingAggregatedResponses.get(aggregationId);
                if (aggregation) {
                    aggregation.responses.push({ windowId: this.windowId, payload });
                    if (aggregation.responses.length === aggregation.expectedResponses) {
                        this.completeAggregation(aggregationId);
                    }
                }
                // Don't send yet, wait for aggregation
            } else {
                // Other message, send normally
                originalSendMessage(ws, type, command, payload, message_id);
            }
        };
    }

    /**
     * Handles forwarded responses from secondary VSCE instances.
     */
    private handleForwardedResponse(payload: { originalMessageId: string; responsePayload: any }): void {
        // Find the pending aggregation
        for (const [aggregationId, aggregation] of this.pendingAggregatedResponses) {
            if (aggregation.originalMessageId === payload.originalMessageId) {
                aggregation.responses.push(payload.responsePayload);
                if (aggregation.responses.length === aggregation.expectedResponses) {
                    this.completeAggregation(aggregationId);
                }
                break;
            }
        }
    }

    /**
     * Completes response aggregation and sends the combined response to the CE.
     */
    private completeAggregation(aggregationId: string): void {
        const aggregation = this.pendingAggregatedResponses.get(aggregationId);
        if (!aggregation) return;

        clearTimeout(aggregation.timeout);
        this.pendingAggregatedResponses.delete(aggregationId);

        // Aggregate responses based on command type
        // TODO: Replace 'any' with a specific aggregated payload type based on the command.
        let aggregatedPayload: any;
        const command = aggregation.originalCommand;

        switch (command) {
            case 'search_workspace': {
                // Combine search results
                const allResults: CWSearchResult[] = [];
                for (const response of aggregation.responses) {
                    if (response.payload?.data?.results) {
                        allResults.push(...response.payload.data.results);
                    }
                }
                aggregatedPayload = {
                    success: true,
                    data: { results: allResults },
                    error: null
                };
                break;
            }

            case 'get_open_files': {
                // Combine open files
                const allOpenFiles: any[] = [];
                for (const response of aggregation.responses) {
                    if (response.payload?.data?.openFiles) {
                        allOpenFiles.push(...response.payload.data.openFiles);
                    }
                }
                aggregatedPayload = {
                    success: true,
                    data: { openFiles: allOpenFiles },
                    error: null
                };
                break;
            }

            // Add more aggregation logic for other commands as needed
            default:
                // For commands that don't need special aggregation, just use primary's response
                aggregatedPayload = aggregation.responses[0]?.payload || { success: false, error: 'No responses received' };
        }

        // Send aggregated response
        this.sendMessage(aggregation.originalRequester, 'response' as any, `response_${command}` as any, aggregatedPayload, aggregation.originalMessageId);
    }

    /**
     * Handles forwarded push messages from secondary VSCE instances.
     */
    private handleForwardedPush(payload: { originalPushPayload: PushSnippetPayload }): void {
        // Forward the push to all CE clients
        const pushPayload = payload.originalPushPayload;

        // Remove targetTabId restriction and send to all CE clients
        for (const client of this.clients.values()) {
            if (client.isAuthenticated && !client.windowId) { // Not a secondary VSCE
                const pushMessage: IPCMessagePush = {
                    protocol_version: '1.0',
                    message_id: uuidv4(),
                    type: 'push',
                    command: 'push_snippet',
                    payload: pushPayload
                };

                if (client.ws.readyState === WebSocket.OPEN) {
                    client.ws.send(JSON.stringify(pushMessage));
                    this.outputChannel.appendLine(LOG_PREFIX_SERVER + 'Forwarded push to CE client');
                }
            }
        }
    }

    /**
     * Handles snippet send requests. If primary, pushes to CE.
     * If secondary, forwards to primary for distribution.
     */
    public handleSnippetSendRequest(snippetData: Omit<PushSnippetPayload, 'targetTabId' | 'windowId'>): void {
        // Add windowId to the snippet data
        const fullSnippetData: PushSnippetPayload = {
            ...snippetData,
            targetTabId: 0, // Will be ignored by the new logic
            windowId: this.windowId,
            metadata: {
                ...snippetData.metadata,
                windowId: this.windowId
            } as ContextBlockMetadata
        };

        if (this.isPrimary) {
            // Send to all CE clients
            for (const client of this.clients.values()) {
                if (client.isAuthenticated && !client.windowId) { // Not a secondary VSCE
                    const pushMessage: IPCMessagePush = {
                        protocol_version: '1.0',
                        message_id: uuidv4(),
                        type: 'push',
                        command: 'push_snippet',
                        payload: fullSnippetData
                    };

                    if (client.ws.readyState === WebSocket.OPEN) {
                        client.ws.send(JSON.stringify(pushMessage));
                        this.outputChannel.appendLine(LOG_PREFIX_SERVER + 'Pushed snippet to CE client');
                    }
                }
            }
        } else {
            // We're secondary, forward to primary
            if (this.primaryWebSocket && this.primaryWebSocket.readyState === WebSocket.OPEN) {
                const forwardPush: IPCMessagePush = {
                    protocol_version: '1.0',
                    message_id: uuidv4(),
                    type: 'push',
                    command: 'forward_push_to_primary',
                    payload: { originalPushPayload: fullSnippetData }
                };

                this.primaryWebSocket.send(JSON.stringify(forwardPush));
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + 'Forwarded snippet push to primary');
            } else {
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + 'Cannot forward snippet - no connection to primary');
                vscode.window.showWarningMessage('ContextWeaver: Cannot send snippet - no connection to primary server.');
            }
        }
    }

    /**
     * Sends a response message to a connected WebSocket client.
     * @param ws The WebSocket instance of the client.
     * @param type The type of the IPC message (e.g., 'response').
     * @param command The specific command associated with the response.
     * @param payload The payload data of the response.
     * @param message_id Optional. The ID of the original request message, if applicable.
     */
    private sendMessage<TResponsePayload>(
        ws: WebSocket,
        type: IPCMessageResponse['type'], // Should always be 'response' for this method
        command: IPCMessageResponse['command'], // Specific response command
        payload: TResponsePayload, // Typed payload
        message_id?: string
    ): void {
        const message: IPCBaseMessage & { type: typeof type, command: typeof command, payload: TResponsePayload } = {
            protocol_version: '1.0',
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

    /**
     * Sends an error response message to a connected WebSocket client.
     * @param ws The WebSocket instance of the client.
     * @param original_message_id The ID of the original request message that caused the error, or null if not applicable.
     * @param errorCode A specific error code identifying the type of error.
     * @param errorMessage A human-readable error message.
     */
    private sendError(ws: WebSocket, original_message_id: string | null, errorCode: string, errorMessage: string): void {
        if (!ws) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Attempted to send error but WebSocket was null. Error: ${errorCode} - ${errorMessage}`);
            return;
        }
        const errorPayload: ErrorResponsePayload = {
            success: false,
            error: errorMessage,
            errorCode: errorCode,
            // originalCommand: null // Could be populated if we parse command before erroring
        };
        // Send error response directly as a response type message
        const errorResponseMessage: IPCMessageErrorResponse = {
            protocol_version: '1.0',
            message_id: original_message_id || uuidv4(),
            type: 'error_response',
            command: 'error_response',
            payload: errorPayload
        };
        ws.send(JSON.stringify(errorResponseMessage));
    }

    /**
     * Sends a generic acknowledgment response to a client.
     * @param client - The client to send the acknowledgment to.
     * @param message_id - The ID of the request being acknowledged.
     * @param success - Whether the operation was successful.
     * @param message - An optional descriptive message.
     */
    private sendGenericAck(client: Client, message_id: string, success: boolean, message: string | null = null) {
        const payload: GenericAckResponsePayload = { success, message };
        this.sendMessage<GenericAckResponsePayload>(client.ws, 'response', 'response_generic_ack', payload, message_id);
    }

    /**
     * Handles a request to register an active target (LLM tab) for a client.
     * @param client - The client that sent the request.
     * @param payload - The request payload containing the tab ID and LLM host.
     * @param message_id - The message ID for the response.
     */
    private handleRegisterActiveTarget(client: Client, payload: RegisterActiveTargetRequestPayload, message_id: string): void {
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `handleRegisterActiveTarget called: TabID ${payload.tabId}, Host ${payload.llmHost} for client ${client.ip}`);
        client.activeLLMTabId = payload.tabId;
        client.activeLLMHost = payload.llmHost;
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Registered active target for client ${client.ip}: TabID ${payload.tabId}, Host ${payload.llmHost}`);
        this.sendGenericAck(client, message_id, true, 'Target registered successfully.');
    }

    /**
     * Handles a request to get details about the current workspace.
     * @param client - The client that sent the request.
     * @param message_id - The message ID for the response.
     */
    private handleGetWorkspaceDetails(client: Client, message_id: string): void {
        try {
            const details = this.workspaceService.getWorkspaceDetailsForIPC();
            const responsePayload: WorkspaceDetailsResponsePayload = {
                success: true,
                data: {
                    workspaceFolders: details || [], // Ensure it's an array even if null
                    isTrusted: this.workspaceService.isWorkspaceTrusted(),
                    workspaceName: vscode.workspace.name // Add the workspace name
                },
                error: null,
                errorCode: undefined
            };
            this.sendMessage<WorkspaceDetailsResponsePayload>(client.ws, 'response', 'response_workspace_details', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent workspace details to ${client.ip}`);
        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error getting workspace details: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + 'Error getting workspace details:', error);
            const errorCode = error instanceof WorkspaceServiceError ? error.code : 'INTERNAL_SERVER_ERROR';
            this.sendError(client.ws, message_id, errorCode, `Error getting workspace details: ${error.message}`);
        }
    }

    /**
     * Determines the target workspace folder based on a requested URI string or the current workspace context.
     * Sends an error response to the client if the workspace is ambiguous, not found, or not open.
     * @param client The connected client.
     * @param requestedUriString The URI string of the requested workspace folder, or undefined/null to infer from context.
     * @param commandName The name of the command for which the workspace folder is being determined (for error messages).
     * @param message_id The ID of the original message for sending error responses.
     * @returns A Promise that resolves to the `vscode.WorkspaceFolder` if successfully determined, otherwise `null`.
     */
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
            const allFolders = this.workspaceService.getWorkspaceFolders();
            if (allFolders && allFolders.length > 1) {
                this.sendError(client.ws, message_id, 'AMBIGUOUS_WORKSPACE', `Multiple workspace folders open. Please specify 'workspaceFolderUri' for ${commandName}.`);
                return null;
            } else if (allFolders && allFolders.length === 1) {
                targetWorkspaceFolder = allFolders[0];
            } else {
                this.sendError(client.ws, message_id, 'NO_WORKSPACE_OPEN', `No workspace folder open or specified for ${commandName}.`);
                return null;
            }
        }
        return targetWorkspaceFolder;
    }

    /**
     * Handles a request to get the file tree for a specific workspace folder.
     * @param client - The client that sent the request.
     * @param payload - The request payload containing the workspace folder URI.
     * @param message_id - The message ID for the response.
     */
    private async handleGetFileTree(
        client: Client,
        payload: GetFileTreeRequestPayload,
        message_id: string
    ): Promise<void> {
        const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(client, payload.workspaceFolderUri, 'get_FileTree', message_id);
        if (!targetWorkspaceFolder) return;

        try {
            const result = await getFileTree(targetWorkspaceFolder);

            if (typeof result === 'string' && result.startsWith('Error:')) {
                this.sendError(client.ws, message_id, 'FileTree_GENERATION_FAILED', result);
                return;
            }

            const { tree: fileTreeString, filterTypeApplied } = result as { tree: string; filterTypeApplied: 'gitignore' | 'default' };

            const metadata: ContextBlockMetadata = {
                unique_block_id: uuidv4(),
                content_source_id: `${targetWorkspaceFolder.uri.toString()}::FileTree`,
                type: 'FileTree',
                label: targetWorkspaceFolder.name,
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                workspaceFolderName: targetWorkspaceFolder.name,
                windowId: this.windowId
            };

            const responsePayload: FileTreeResponsePayload = {
                success: true,
                data: {
                    fileTreeString: fileTreeString,
                    metadata: metadata,
                    windowId: this.windowId
                },
                error: null,
                errorCode: undefined,
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                filterType: filterTypeApplied
            };
            this.sendMessage<FileTreeResponsePayload>(client.ws, 'response', 'response_FileTree', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent file tree for ${targetWorkspaceFolder.uri.toString()} (Filter: ${filterTypeApplied}) to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error generating file tree for ${targetWorkspaceFolder.uri.toString()}: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + 'Error generating file tree:', error);
            const errorCode = error instanceof WorkspaceServiceError ? error.code : 'FileTree_ERROR';
            this.sendError(client.ws, message_id, errorCode, `Error generating file tree: ${error.message}`);
        }
    }

    /**
     * Handles a request to get the content of a single file.
     * @param client - The client that sent the request.
     * @param payload - The request payload containing the file path.
     * @param message_id - The message ID for the response.
     */
    private async handleGetFileContent(
        client: Client,
        payload: GetFileContentRequestPayload,
        message_id: string
    ): Promise<void> {
        const { filePath } = payload;
        if (!filePath || typeof filePath !== 'string') {
            this.sendError(client.ws, message_id, 'INVALID_PAYLOAD', 'Missing or invalid filePath in payload.');
            return;
        }
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing get_file_content for: ${filePath}`);

        try {
            const fileUri = vscode.Uri.parse(filePath, true);

            let associatedWorkspaceFolder = this.workspaceService.getWorkspaceFolder(fileUri);
            if (!associatedWorkspaceFolder) {
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

            const result = await getFileContentWithLanguageId(fileUri);

            if (!result) {
                this.sendError(client.ws, message_id, 'FILE_READ_ERROR', 'Failed to read file content.');
                return;
            }

            const fileData: CWFileData = {
                fullPath: fileUri.fsPath,
                content: result.content,
                languageId: result.languageId
            };

            const metadata: ContextBlockMetadata = {
                unique_block_id: uuidv4(),
                content_source_id: fileUri.toString(),
                type: 'file_content',
                label: path.basename(fileUri.fsPath),
                workspaceFolderUri: associatedWorkspaceFolder?.uri.toString() || null,
                workspaceFolderName: associatedWorkspaceFolder?.name || null,
                windowId: this.windowId
            };

            const responsePayload: FileContentResponsePayload = {
                success: true,
                data: {
                    fileData: fileData,
                    metadata: metadata,
                    windowId: this.windowId
                },
                error: null,
                errorCode: undefined,
                filePath: filePath,
                filterType: 'not_applicable'
            };

            this.sendMessage<FileContentResponsePayload>(client.ws, 'response', 'response_file_content', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent file content for ${filePath} to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error reading file ${filePath}: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + 'Error reading file:', error);
            const errorCode = error.code === 'FileNotFound' ? 'FILE_NOT_FOUND' : 'FILE_READ_ERROR';
            this.sendError(client.ws, message_id, errorCode, `Error reading file: ${error.message}`);
        }
    }

    /**
     * Handles a request to get the content of a folder.
     * @param client - The client that sent the request.
     * @param payload - The request payload containing the folder path and workspace folder URI.
     * @param message_id - The message ID for the response.
     */
    private async handleGetFolderContent(
        client: Client,
        payload: GetFolderContentRequestPayload,
        message_id: string
    ): Promise<void> {
        const { folderPath, workspaceFolderUri } = payload;
        if (!folderPath || typeof folderPath !== 'string' || !workspaceFolderUri || typeof workspaceFolderUri !== 'string') {
            this.sendError(client.ws, message_id, 'INVALID_PAYLOAD', 'Missing or invalid folderPath or workspaceFolderUri in payload.');
            return;
        }

        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing get_folder_content for: ${folderPath} in workspace ${workspaceFolderUri}`);

        try {
            const folderUri = vscode.Uri.parse(folderPath, true); // strict parsing
            const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(client, workspaceFolderUri, 'get_folder_content', message_id);
            if (!targetWorkspaceFolder) return;

            const result = await getFolderContentsForIPC(folderUri, targetWorkspaceFolder);

            if (!result || typeof result === 'string') {
                this.sendError(client.ws, message_id, 'FOLDER_READ_ERROR', typeof result === 'string' ? result : 'Failed to read folder contents.');
                return;
            }

            const { filesData, filterTypeApplied } = result;
            const actualFolderUri = folderUri; // Use the requested folder URI

            const metadata: ContextBlockMetadata = {
                unique_block_id: uuidv4(),
                content_source_id: actualFolderUri.toString(), // Use the canonical URI
                type: 'folder_content',
                label: path.basename(actualFolderUri.fsPath), // Use the canonical path
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                workspaceFolderName: targetWorkspaceFolder.name,
                windowId: this.windowId
            };

            const responsePayload: FolderContentResponsePayload = {
                success: true,
                data: {
                    filesData: filesData,
                    metadata: metadata,
                    windowId: this.windowId
                },
                error: null,
                errorCode: undefined,
                folderPath: actualFolderUri.toString(), // Return the canonical URI
                filterType: filterTypeApplied,
                workspaceFolderUri: targetWorkspaceFolder.uri.toString()
            };

            this.sendMessage<FolderContentResponsePayload>(client.ws, 'response', 'response_folder_content', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent folder content for ${actualFolderUri.toString()} (${filesData.length} files, Filter: ${filterTypeApplied}) to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error reading folder ${folderPath}: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + 'Error reading folder:', error);
            const errorCode = error.code === 'DirectoryNotFound' ? 'DIRECTORY_NOT_FOUND' : 'FOLDER_READ_ERROR';
            this.sendError(client.ws, message_id, errorCode, `Error reading folder: ${error.message}`);
        }
    }

    /**
     * Handles a request to get the entire codebase for a specific workspace folder.
     * @param client - The client that sent the request.
     * @param payload - The request payload containing the workspace folder URI.
     * @param message_id - The message ID for the response.
     */
    private async handleGetEntireCodebase(
        client: Client,
        payload: GetEntireCodebaseRequestPayload,
        message_id: string
    ): Promise<void> {
        const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(client, payload.workspaceFolderUri, 'get_entire_codebase', message_id);
        if (!targetWorkspaceFolder) return;

        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing get_entire_codebase for workspace ${targetWorkspaceFolder.uri.toString()}`);

        try {
            const result = await getWorkspaceDataForIPC(targetWorkspaceFolder);

            if (!result || typeof result === 'string') {
                this.sendError(client.ws, message_id, 'CODEBASE_READ_ERROR', typeof result === 'string' ? result : 'Failed to read codebase.');
                return;
            }

            const { filesData, filterTypeApplied } = result;

            const metadata: ContextBlockMetadata = {
                unique_block_id: uuidv4(),
                content_source_id: `${targetWorkspaceFolder.uri.toString()}::entire_codebase`,
                type: 'codebase_content',
                label: `${targetWorkspaceFolder.name} Codebase`,
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                workspaceFolderName: targetWorkspaceFolder.name,
                windowId: this.windowId
            };

            const responsePayload: EntireCodebaseResponsePayload = {
                success: true,
                data: {
                    filesData: filesData,
                    metadata: metadata,
                    windowId: this.windowId
                },
                error: null,
                errorCode: undefined,
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                filterType: filterTypeApplied,
                workspaceFolderName: targetWorkspaceFolder.name,
                projectPath: targetWorkspaceFolder.uri.fsPath
            };

            this.sendMessage<EntireCodebaseResponsePayload>(client.ws, 'response', 'response_entire_codebase', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent entire codebase for ${targetWorkspaceFolder.uri.toString()} (${filesData.length} files, Filter: ${filterTypeApplied}) to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error reading entire codebase: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + 'Error reading entire codebase:', error);
            const errorCode = error instanceof WorkspaceServiceError ? error.code : 'CODEBASE_READ_ERROR';
            this.sendError(client.ws, message_id, errorCode, `Error reading entire codebase: ${error.message}`);
        }
    }

    /**
     * Handles a request to search the workspace.
     * @param client - The client that sent the request.
     * @param payload - The request payload containing the search query and optional workspace folder URI.
     * @param message_id - The message ID for the response.
     */
    private async handleSearchWorkspace(
        client: Client,
        payload: SearchWorkspaceRequestPayload,
        message_id: string
    ): Promise<void> {
        const { query, workspaceFolderUri } = payload;
        if (!query || typeof query !== 'string') {
            this.sendError(client.ws, message_id, 'INVALID_PAYLOAD', 'Missing or invalid query in payload.');
            return;
        }

        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing search_workspace for query: "${query}" in workspace: ${workspaceFolderUri || 'all'}`);

        try {
            const results = await this.searchService.search(query, workspaceFolderUri ? vscode.Uri.parse(workspaceFolderUri) : undefined);

            // Add windowId to each result
            const resultsWithWindowId = results.map((result) => ({
                ...result,
                windowId: this.windowId
            }));

            const responsePayload: CWSearchWorkspaceResponsePayload = {
                success: true,
                data: {
                    results: resultsWithWindowId,
                    windowId: this.windowId
                },
                error: null,
                errorCode: undefined,
                query: query
            };

            this.sendMessage<CWSearchWorkspaceResponsePayload>(client.ws, 'response', 'response_search_workspace', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent search results (${results.length} items) to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error searching workspace: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + 'Error searching workspace:', error);
            const errorCode = error instanceof WorkspaceServiceError ? error.code : 'SEARCH_ERROR';
            this.sendError(client.ws, message_id, errorCode, `Error searching workspace: ${error.message}`);
        }
    }

    /**
     * Handles a request to get information about the currently active file.
     * @param client - The client that sent the request.
     * @param message_id - The message ID for the response.
     */
    private handleGetActiveFileInfo(client: Client, message_id: string): void {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                const responsePayload: ActiveFileInfoResponsePayload = {
                    success: false,
                    data: null,
                    error: 'No active file',
                    errorCode: 'NO_ACTIVE_FILE'
                };
                this.sendMessage<ActiveFileInfoResponsePayload>(client.ws, 'response', 'response_active_file_info', responsePayload, message_id);
                return;
            }

            const fileUri = activeEditor.document.uri;
            const workspaceFolder = this.workspaceService.getWorkspaceFolder(fileUri);

            const responsePayload: ActiveFileInfoResponsePayload = {
                success: true,
                data: {
                    activeFilePath: fileUri.toString(),
                    activeFileLabel: path.basename(fileUri.fsPath),
                    workspaceFolderUri: workspaceFolder?.uri.toString() || null,
                    workspaceFolderName: workspaceFolder?.name || null,
                    windowId: this.windowId
                },
                error: null,
                errorCode: undefined
            };

            this.sendMessage<ActiveFileInfoResponsePayload>(client.ws, 'response', 'response_active_file_info', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent active file info to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error getting active file info: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + 'Error getting active file info:', error);
            this.sendError(client.ws, message_id, 'INTERNAL_SERVER_ERROR', `Error getting active file info: ${error.message}`);
        }
    }

    /**
     * Handles a request to get a list of all currently open files.
     * @param client - The client that sent the request.
     * @param message_id - The message ID for the response.
     */
    private handleGetOpenFiles(client: Client, message_id: string): void {
        try {
            const openFiles = vscode.window.tabGroups.all
                .flatMap(group => group.tabs)
                .filter(tab => tab.input instanceof vscode.TabInputText)
                .map(tab => {
                    const input = tab.input as vscode.TabInputText;
                    const workspaceFolder = this.workspaceService.getWorkspaceFolder(input.uri);
                    return {
                        path: input.uri.toString(),
                        name: path.basename(input.uri.fsPath),
                        workspaceFolderUri: workspaceFolder?.uri.toString() || null,
                        workspaceFolderName: workspaceFolder?.name || null,
                        windowId: this.windowId
                    };
                });

            const responsePayload: OpenFilesResponsePayload = {
                success: true,
                data: {
                    openFiles: openFiles
                },
                error: null,
                errorCode: undefined
            };

            this.sendMessage<OpenFilesResponsePayload>(client.ws, 'response', 'response_open_files', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent open files list (${openFiles.length} files) to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error getting open files: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + 'Error getting open files:', error);
            this.sendError(client.ws, message_id, 'INTERNAL_SERVER_ERROR', `Error getting open files: ${error.message}`);
        }
    }

    /**
     * Handles a request to get filter information for a workspace folder.
     * @param client - The client that sent the request.
     * @param payload - The request payload containing the workspace folder URI.
     * @param message_id - The message ID for the response.
     */
    private async handleGetFilterInfo(
        client: Client,
        payload: GetFilterInfoRequestPayload,
        message_id: string
    ): Promise<void> {
        const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(client, payload.workspaceFolderUri, 'get_filter_info', message_id);
        if (!targetWorkspaceFolder) return;

        try {
            const gitignorePath = vscode.Uri.joinPath(targetWorkspaceFolder.uri, '.gitignore');
            let filterType: 'gitignore' | 'default' | 'none' = 'none';

            try {
                await vscode.workspace.fs.stat(gitignorePath);
                filterType = 'gitignore';
            } catch {
                filterType = 'default';
            }

            const responsePayload: FilterInfoResponsePayload = {
                success: true,
                data: {
                    filterType: filterType,
                    workspaceFolderUri: targetWorkspaceFolder.uri.toString()
                },
                error: null,
                errorCode: undefined
            };

            this.sendMessage<FilterInfoResponsePayload>(client.ws, 'response', 'response_filter_info', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent filter info (${filterType}) for ${targetWorkspaceFolder.uri.toString()} to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error getting filter info: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + 'Error getting filter info:', error);
            this.sendError(client.ws, message_id, 'INTERNAL_SERVER_ERROR', `Error getting filter info: ${error.message}`);
        }
    }

    /**
     * Handles a request to list the contents of a folder.
     * @param client - The client that sent the request.
     * @param payload - The request payload containing the folder URI and workspace folder URI.
     * @param message_id - The message ID for the response.
     */
    private async handleListFolderContents(
        client: Client,
        payload: ListFolderContentsRequestPayload,
        message_id: string
    ): Promise<void> {
        const { folderUri: folderUriString, workspaceFolderUri } = payload;
        if (!folderUriString || typeof folderUriString !== 'string') {
            this.sendError(client.ws, message_id, 'INVALID_PAYLOAD', 'Missing or invalid folderUri in payload.');
            return;
        }

        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Processing list_folder_contents for: ${folderUriString}`);

        try {
            const folderUri = vscode.Uri.parse(folderUriString, true);
            const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(client, workspaceFolderUri, 'list_folder_contents', message_id);
            if (!targetWorkspaceFolder) return;

            const result = await getDirectoryListing(
                folderUri,
                targetWorkspaceFolder
            );

            if (!result) {
                this.sendError(client.ws, message_id, 'DIRECTORY_READ_ERROR', 'Failed to read directory contents.');
                return;
            }

            const { entries, filterTypeApplied } = result;

            // Add windowId to each entry
            const entriesWithWindowId = entries.map(entry => ({
                ...entry,
                windowId: this.windowId
            }));

            const responsePayload: ListFolderContentsResponsePayload = {
                success: true,
                data: {
                    entries: entriesWithWindowId,
                    parentFolderUri: folderUriString,
                    filterTypeApplied: filterTypeApplied,
                    windowId: this.windowId
                },
                error: null,
                errorCode: undefined
            };

            this.sendMessage<ListFolderContentsResponsePayload>(client.ws, 'response', 'response_list_folder_contents', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent folder listing (${entries.length} entries) for ${folderUriString} to ${client.ip}`);

        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error listing folder contents: ${error.message}`);
            console.error(LOG_PREFIX_SERVER + 'Error listing folder contents:', error);
            const errorCode = error.code === 'DirectoryNotFound' ? 'DIRECTORY_NOT_FOUND' : 'DIRECTORY_READ_ERROR';
            this.sendError(client.ws, message_id, errorCode, `Error listing folder contents: ${error.message}`);
        }
    }

    /**
     * Handles a request to get workspace problems (diagnostics).
     * @param client The client that sent the request.
     * @param payload The request payload containing the workspace folder URI.
     * @param message_id The message ID for the response.
     */
    private async handleGetWorkspaceProblems(
        client: Client,
        payload: GetWorkspaceProblemsRequestPayload,
        message_id: string
    ): Promise<void> {
        const targetWorkspaceFolder = await this.getTargetWorkspaceFolder(client, payload.workspaceFolderUri, 'get_workspace_problems', message_id);
        if (!targetWorkspaceFolder) return;

        try {
            const { problemsString, problemCount } = this.diagnosticsService.getProblemsForWorkspace(targetWorkspaceFolder);

            const metadata: ContextBlockMetadata = {
                unique_block_id: uuidv4(),
                content_source_id: `${targetWorkspaceFolder.uri.toString()}::Problems`,
                type: 'WorkspaceProblems',
                label: targetWorkspaceFolder.name,
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
                workspaceFolderName: targetWorkspaceFolder.name,
                windowId: this.windowId
            };

            const responsePayload: WorkspaceProblemsResponsePayload = {
                success: true,
                data: {
                    problemsString: problemsString,
                    problemCount: problemCount,
                    metadata: metadata,
                    windowId: this.windowId,
                },
                error: null,
                workspaceFolderUri: targetWorkspaceFolder.uri.toString(),
            };
            this.sendMessage<WorkspaceProblemsResponsePayload>(client.ws, 'response', 'response_workspace_problems', responsePayload, message_id);
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Sent workspace problems for ${targetWorkspaceFolder.name} to ${client.ip}`);
        } catch (error: any) {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error getting workspace problems for ${targetWorkspaceFolder.uri.toString()}: ${error.message}`);
            this.sendError(client.ws, message_id, 'PROBLEMS_ERROR', `Error getting workspace problems: ${error.message}`);
        }
    }

    /**
     * Gets the primary target tab ID from connected Chrome Extension clients.
     * Returns the first found active tab ID, or undefined if none are found.
     * @returns The primary target tab ID, or undefined if not found.
     */
    public getPrimaryTargetTabId(): number | undefined {
        for (const client of this.clients.values()) {
            if (client.isAuthenticated && client.activeLLMTabId !== undefined) {
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Primary target tab ID found: ${client.activeLLMTabId}`);
                return client.activeLLMTabId;
            }
        }
        this.outputChannel.appendLine(LOG_PREFIX_SERVER + 'No primary target tab ID found among connected clients.');
        return undefined;
    }

    /**
     * Pushes a code snippet to a specific target tab identified by its tab ID.
     * @deprecated This method uses an older, targeted push mechanism. Use {@link handleSnippetSendRequest} instead, which supports the primary/secondary architecture.
     * @param targetTabId The ID of the browser tab to push the snippet to.
     * @param snippetData The snippet data to be pushed, including content and metadata.
     */
    public pushSnippetToTarget(targetTabId: number, snippetData: PushSnippetPayload): void {
        let targetClient: Client | null = null;
        for (const client of this.clients.values()) {
            if (client.isAuthenticated && client.activeLLMTabId === targetTabId) {
                targetClient = client;
                break;
            }
        }

        if (targetClient) {
            if (targetClient.ws) {
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `pushSnippetToTarget: targetClient.ws.readyState: ${targetClient.ws.readyState}`);
                console.log(LOG_PREFIX_SERVER + `pushSnippetToTarget: targetClient.ws.readyState: ${targetClient.ws.readyState}`);
                // The sendMessage method expects a response command, but this is a push.
                // For pushes, we construct the message directly or have a separate sendPushMessage utility.
                // For now, adapting the existing sendMessage structure slightly for a push.
                // A more robust solution would be a dedicated sendPushMessage.
                const pushMessage = {
                    protocol_version: '1.0',
                    message_id: uuidv4(), // Pushes can have IDs for logging/tracing
                    type: 'push',
                    command: 'push_snippet',
                    payload: snippetData
                };
                try {
                    if (targetClient.ws.readyState === WebSocket.OPEN) {
                        targetClient.ws.send(JSON.stringify(pushMessage));
                        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Pushed snippet to tabId ${targetTabId}`);
                        console.log(LOG_PREFIX_SERVER + `Pushed snippet to tabId ${targetTabId}`);
                    } else {
                        this.outputChannel.appendLine(LOG_PREFIX_SERVER + `WARN: WebSocket not OPEN for tabId ${targetTabId}. Snippet not sent.`);
                        console.warn(LOG_PREFIX_SERVER + `WARN: WebSocket not OPEN for tabId ${targetTabId}. Snippet not sent.`);
                    }
                } catch (error: any) {
                    this.outputChannel.appendLine(LOG_PREFIX_SERVER + `Error sending push_snippet: ${error.message}`);
                    console.error(LOG_PREFIX_SERVER + 'Error sending push_snippet:', error);
                }
            } else {
                this.outputChannel.appendLine(LOG_PREFIX_SERVER + `WARN: targetClient found for tabId ${targetTabId} but its WebSocket is missing.`);
                console.warn(LOG_PREFIX_SERVER + `WARN: targetClient found for tabId ${targetTabId} but its WebSocket is missing.`);
                vscode.window.showWarningMessage('ContextWeaver: Could not send snippet. Target client found, but WebSocket is missing.');
            }
        } else {
            this.outputChannel.appendLine(LOG_PREFIX_SERVER + `WARN: No authenticated client found for targetTabId ${targetTabId} to push snippet.`);
            console.warn(LOG_PREFIX_SERVER + `No authenticated client found for targetTabId ${targetTabId} to push snippet.`);
            vscode.window.showWarningMessage('ContextWeaver: Could not send snippet. No active, authenticated Chrome tab found.');
        }
    }


    /**
     * Stops the WebSocket server, closes all client connections, and cleans up resources.
     * If the instance is a secondary, it closes its connection to the primary.
     */
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

        // If secondary, close connection to primary
        if (this.primaryWebSocket) {
            this.primaryWebSocket.close();
            this.primaryWebSocket = null;
        }
    }
}