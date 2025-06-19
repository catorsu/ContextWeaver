/**
 * @file ipcServer.ts
 * @description Hosts the WebSocket server for IPC between the VSCE and CE.
 * Handles incoming requests, authentication, and routes to appropriate service modules.
 * @module ContextWeaver/VSCE
 */

import WebSocket, { WebSocketServer } from 'ws';
import * as vscode from 'vscode';
import { SearchService } from './searchService'; // Removed local SearchResult import
import { WorkspaceService, WorkspaceServiceError } from './workspaceService';
import { DiagnosticsService } from './diagnosticsService';
import { FilterService } from './core/services/FilterService';
import { AggregationService } from './core/services/AggregationService';
import { CommandRegistry } from './adapters/primary/ipc/CommandRegistry';
import { ClientContext } from './adapters/primary/ipc/types';
import { Logger } from '@contextweaver/shared';
import { v4 as uuidv4 } from 'uuid';

// Import shared types
import {
    // IPC Message Structure Types
    IPCMessageRequest, IPCMessageResponse, IPCMessageErrorResponse, IPCBaseMessage, IPCMessagePush,
    // Response Payloads (used in the code)
    GenericAckResponsePayload, ErrorResponsePayload,
    // Data Models (used in the code)
    ContextBlockMetadata, PushSnippetPayload
} from '@contextweaver/shared';


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
    private readonly logger = new Logger('IPCServer');
    private outputChannel: vscode.OutputChannel;

    // Primary/Secondary architecture properties
    private isPrimary: boolean = false;
    private primaryWebSocket: WebSocket | null = null;
    private secondaryClients: Map<string, WebSocket> = new Map();
    private aggregationService: AggregationService;

    /**
     * Creates an instance of IPCServer.
     * @param port The port number on which the WebSocket server will listen.
     * @param windowId The unique identifier for this VS Code window instance.
     * @param context The VS Code extension context.
     * @param outputChannelInstance The VS Code output channel for logging.
     * @param searchServiceInstance The SearchService instance for handling search requests.
     * @param workspaceServiceInstance The WorkspaceService instance for handling workspace-related requests.
     * @param diagnosticsServiceInstance The DiagnosticsService instance for handling diagnostics requests.
     * @param filterService The FilterService instance for handling filter operations.
     * @param commandRegistry The CommandRegistry instance for handling IPC commands.
     * @param aggregationService The AggregationService instance for handling multi-window response aggregation.
     */
    constructor(
        _port: number, // Rationale: Port is no longer needed here as it's determined dynamically. Underscore indicates it's unused.
        windowId: string,
        context: vscode.ExtensionContext,
        outputChannelInstance: vscode.OutputChannel,
        searchServiceInstance: SearchService,
        workspaceServiceInstance: WorkspaceService,
        diagnosticsServiceInstance: DiagnosticsService,
        private filterService: FilterService,
        private commandRegistry: CommandRegistry,
        private aggregationServiceInstance: AggregationService
    ) {
        this.logger.info('Constructor called.');

        this.port = PORT_RANGE_START; // Set a default/initial port, but it will be updated.
        this.windowId = windowId;
        this.extensionContext = context;
        this.outputChannel = outputChannelInstance;
        this.searchService = searchServiceInstance;
        this.workspaceService = workspaceServiceInstance;
        this.diagnosticsService = diagnosticsServiceInstance;
        this.aggregationService = this.aggregationServiceInstance;
        this.logger.info(`Initialized with windowId ${this.windowId}.`);
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
        this.logger.info('start() method called.');

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
                await new Promise<void>((resolve, reject) => { // Increased timeout for reliability on slower systems
                    const timeout = setTimeout(() => reject(new Error('Connection timed out')), 500);
                    ws.on('open', () => {
                        clearTimeout(timeout);
                        this.logger.info(`Found existing primary server on port ${port}. Becoming secondary.`);
                        ws.close();
                        this.becomeSecondary(port); // Connect to the found port
                        resolve();
                    });
                    ws.on('error', (err) => {
                        clearTimeout(timeout);
                        // ECONNREFUSED is expected, other errors might be noteworthy
                        const errorWithCode = err as Error & { code?: string };
                        if (errorWithCode.code !== 'ECONNREFUSED') {
                            this.logger.warn(`Non-refused error on port ${port}: ${err.message}`);
                        }
                        reject(err);
                    });
                });
                // If promise resolved, we found a primary and became secondary, so we can stop scanning.
                return;
            } catch (error) {
                // This is the expected path when a port is not open.
                const errorWithCode = error as Error & { code?: string };
                if (errorWithCode.code === 'ECONNREFUSED') {
                    this.logger.trace(`Port scan: Port ${port} is not open (ECONNREFUSED).`);
                }
                this.logger.trace(`Port scan on ${port} failed (as expected for unoccupied port):`, errorWithCode.code);
            }
        }

        // If loop completes, no primary was found. Become primary.
        this.logger.info('No primary server found in range. Becoming primary.');
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
        this.logger.info('Setting up as PRIMARY server.');

        for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
            try {
                await this.tryStartServerOnPort(port);
                break; // Exit loop on success
            } catch (error) {
                const errorWithCode = error as Error & { code?: string };
                if (errorWithCode.code === 'EADDRINUSE') {
                    this.logger.info(`Port ${port} is in use, trying next...`);
                    continue;
                }
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.error(`Failed to start PRIMARY server with unexpected error: ${errorMessage}`);
                vscode.window.showErrorMessage(`ContextWeaver: A critical error occurred while starting the server: ${errorMessage}`);
                return; // Stop trying if it's not a port conflict
            }
        }

        if (this.wss && this.activePort) {
            this.logger.info(`PRIMARY WebSocket server listening on 127.0.0.1:${this.activePort}`);
            vscode.window.showInformationMessage(`ContextWeaver: Primary IPC Server started on port ${this.activePort}.`);

            this.wss.on('connection', (ws: WebSocket, req) => {
                const clientIp = req.socket.remoteAddress || 'unknown';
                this.logger.info(`Client connected from ${clientIp}`);
                const client: Client = { ws, isAuthenticated: true, ip: clientIp }; // Token auth removed
                this.logger.info(`Client from ${client.ip} authenticated (token auth removed).`);
                this.clients.set(ws, client);

                ws.on('message', (message) => {
                    this.handleMessage(client, message);
                });

                ws.on('close', () => {
                    this.logger.info(`Client from ${client.ip} disconnected.`);
                    // If this was a secondary VSCE, remove from secondaryClients
                    if (client.windowId) {
                        this.secondaryClients.delete(client.windowId);
                        this.logger.info(`Removed secondary VSCE with windowId ${client.windowId}`);
                    }
                    ws.removeAllListeners();
                    this.clients.delete(ws);
                });

                ws.on('error', (error) => {
                    this.logger.error(`Error on WebSocket connection from ${client.ip}: ${error.message}`);
                    if (this.clients.has(ws)) {
                        ws.removeAllListeners();
                        this.clients.delete(ws);
                    }
                });
            });

        } else {
            this.logger.error(`CRITICAL: All ports in range ${PORT_RANGE_START}-${PORT_RANGE_END} are in use.`);
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
        this.logger.info('Setting up as SECONDARY server.');

        // Connect to primary
        this.primaryWebSocket = new WebSocket(`ws://127.0.0.1:${primaryPort}`);

        this.primaryWebSocket.on('open', () => {
            this.logger.info('Connected to primary server.');

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
            this.logger.warn('Connection to primary server closed. Attempting to become primary...');
            this.primaryWebSocket = null;
            // Primary died, try to become primary
            setTimeout(() => this.start(), 1000); // Retry after 1 second
        });

        this.primaryWebSocket.on('error', (error) => {
            this.logger.error(`Error connecting to primary: ${error.message}`);
        });
    }

    /**
     * Handles messages when running as secondary VSCE.
     */
    private async handleSecondaryMessage(data: WebSocket.RawData): Promise<void> {
        let parsedMessage: IPCMessageRequest;
        try {
            parsedMessage = JSON.parse(data.toString()) as IPCMessageRequest;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to parse message from primary: ${errorMessage}`);
            return;
        }

        // Handle forwarded requests from primary
        if (parsedMessage.type === 'request' && parsedMessage.command === 'forward_request_to_secondaries') {
            const originalRequest = parsedMessage.payload.originalRequest as IPCMessageRequest;
            this.logger.debug(`Received forwarded request: ${originalRequest.command}`);

            // Store the original handler responses in a buffer. It can be a success or error response.
            const responseBuffer: (IPCMessageResponse | IPCMessageErrorResponse)[] = [];

            // Process the request locally
            const dummyClient: Client = {
                ws: { // Mock WebSocket to capture the response without monkey-patching this.sendMessage
                    send: (data: string) => {
                        // The handler calls sendMessage, which stringifies. We parse it back to store the object.
                        responseBuffer.push(JSON.parse(data));
                    },
                    readyState: WebSocket.OPEN
                } as unknown as WebSocket,
                isAuthenticated: true,
                ip: 'primary-forward',
                windowId: this.windowId
            };

            // Process the request using the dummy client
            await this.handleMessage(dummyClient, Buffer.from(JSON.stringify(originalRequest)));

            // Send response back to primary
            // Send response back to primary
            if (responseBuffer.length > 0) {
                const response = responseBuffer[0]; // The full response message object
                const forwardResponse: IPCMessagePush = {
                    protocol_version: '1.0',
                    message_id: parsedMessage.message_id, // Use the aggregationId as the message_id for the response
                    type: 'push',
                    command: 'forward_response_to_primary',
                    payload: {
                        originalMessageId: parsedMessage.message_id, // This is the aggregationId
                        responsePayload: response.payload, // Extract the payload from the captured message
                        secondaryWindowId: this.windowId
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
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to parse message or invalid message format from ${client.ip}. Error: ${errorMessage}`, { message: message.toString() });
            this.sendError(client.ws, null, 'INVALID_MESSAGE_FORMAT', `Error parsing message: ${errorMessage}`);
            return;
        }

        const { protocol_version, message_id, type, command, payload } = parsedMessage;

        if (protocol_version !== '1.0') {
            this.logger.warn(`Protocol version mismatch from ${client.ip}. Expected 1.0, got ${protocol_version}.`);
            this.sendError(client.ws, message_id, 'UNSUPPORTED_PROTOCOL_VERSION', 'Protocol version mismatch.');
            return;
        }

        this.logger.debug(`Received command '${command}' (ID: ${message_id}) of type '${type}' from ${client.ip}.`);

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
                        this.handleForwardedResponse(payload as {
                            originalMessageId: string;
                            responsePayload: unknown;
                            secondaryWindowId: string;
                        });
                        return;
                    case 'forward_push_to_primary':
                        /**
                         * Handles a push message (like a snippet) forwarded from a secondary instance, broadcasting it to all connected CEs.
                         * @param payload - The forwarded push payload.
                         * // TODO: Review if originalPushPayload needs a more specific type than PushSnippetPayload if other pushes are added.
                         */
                        this.handleForwardedPush(payload as {
                            originalPushPayload: PushSnippetPayload;
                        });
                        return;
                }
            }
            this.logger.warn(`Received push command '${command}' from ${client.ip}, but no handler defined.`);
            return;
        }

        if (type !== 'request') {
            this.logger.warn(`Unexpected message type '${type}' from ${client.ip}. Expected 'request' or 'push'.`);
            this.sendError(client.ws, message_id, 'INVALID_MESSAGE_TYPE', `Unexpected message type: ${type}`);
            return;
        }

        // At this point, type is guaranteed to be 'request'
        // Handle special request commands for Primary/Secondary architecture
        if (this.isPrimary) {
            switch (command) {
                case 'register_secondary':
                    this.handleRegisterSecondary(client, payload as { windowId: string; port: number }, message_id);
                    return;
                case 'unregister_secondary':
                    this.handleUnregisterSecondary(client, payload as { windowId: string }, message_id);
                    return;
            }
        }

        const commandsRequiringWorkspace = [
            'get_FileTree', 'get_file_content', 'get_folder_content',
            'get_entire_codebase', 'search_workspace', 'get_active_file_info', 'get_workspace_details',
            'get_open_files', 'get_filter_info', 'list_folder_contents', 'get_workspace_problems',
            'get_contents_for_files'
        ];

        if (commandsRequiringWorkspace.includes(command)) {
            try {
                await this.workspaceService.ensureWorkspaceTrustedAndOpen();
            } catch (error) {
                if (error instanceof WorkspaceServiceError) {
                    this.logger.warn(`Workspace check failed for command '${command}': ${error.message}`);
                    this.sendError(client.ws, message_id, error.code, error.message);
                } else {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this.logger.error(`Unexpected error during workspace check for command '${command}': ${errorMessage}`);
                    this.sendError(client.ws, message_id, 'INTERNAL_SERVER_ERROR', `Unexpected error during workspace check: ${errorMessage}`);
                }
                return;
            }
        }

        // If primary and this is a request from CE that requires aggregation
        if (this.isPrimary && commandsRequiringWorkspace.includes(command) && !client.windowId && this.secondaryClients.size > 0) {
            // This is from CE, need to broadcast to secondaries
            this.broadcastToSecondaries(parsedMessage as IPCMessageRequest, client);
            // Also process locally
        }

        // Use CommandRegistry to get and execute the appropriate handler
        const handler = this.commandRegistry.getHandler(command);
        if (!handler) {
            this.logger.warn(`Unknown command '${command}' from ${client.ip}.`);
            this.sendError(client.ws, message_id, 'UNKNOWN_COMMAND', `Unknown command: ${command}`);
            return;
        }

        try {
            // Create client context for the handler
            const clientContext: ClientContext = {
                ws: client.ws,
                isAuthenticated: client.isAuthenticated,
                ip: client.ip,
                activeLLMTabId: client.activeLLMTabId,
                activeLLMHost: client.activeLLMHost,
                windowId: client.windowId
            };

            // Execute the handler
            const responsePayload = await handler.handle({ payload, client: clientContext });
            
            // Send the response using the appropriate command name
            const responseCommand = this.getResponseCommandName(command);
            this.sendMessage(client.ws, 'response', responseCommand as IPCMessageResponse['command'], responsePayload, message_id);
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error handling command '${command}': ${errorMessage}`);
            this.sendError(client.ws, message_id, 'COMMAND_EXECUTION_ERROR', `Error executing command: ${errorMessage}`);
        }
    }

    /**
     * Maps command names to their corresponding response command names.
     */
    private getResponseCommandName(command: string): string {
        const commandToResponseMap: Record<string, string> = {
            'get_FileTree': 'response_FileTree',
            'search_workspace': 'response_search_workspace',
            'get_file_content': 'response_file_content',
            'get_workspace_details': 'response_workspace_details',
            'register_active_target': 'response_generic_ack',
            'get_active_file_info': 'response_active_file_info',
            'get_open_files': 'response_open_files',
            'get_contents_for_files': 'response_contents_for_files',
            'get_folder_content': 'response_folder_content',
            'get_entire_codebase': 'response_entire_codebase',
            'get_filter_info': 'response_filter_info',
            'list_folder_contents': 'response_list_folder_contents',
            'get_workspace_problems': 'response_workspace_problems'
        };
        
        return commandToResponseMap[command] || `response_${command}`;
    }

    /**
     * Handles registration of a secondary VSCE instance.
     */
    private handleRegisterSecondary(client: Client, payload: { windowId: string; port: number }, message_id: string): void {
        client.windowId = payload.windowId;
        this.secondaryClients.set(payload.windowId, client.ws);
        this.logger.info(`Registered secondary VSCE with windowId: ${payload.windowId}`);
        this.sendGenericAck(client, message_id, true, 'Secondary registered successfully.');
    }

    /**
     * Handles unregistration of a secondary VSCE instance.
     */
    private handleUnregisterSecondary(client: Client, payload: { windowId: string }, message_id: string): void {
        this.secondaryClients.delete(payload.windowId);
        this.logger.info(`Unregistered secondary VSCE with windowId: ${payload.windowId}`);
        const ackPayload: GenericAckResponsePayload = { success: true, message: 'Secondary unregistered successfully.' };
        this.sendMessage<GenericAckResponsePayload>(client.ws, 'response', 'response_unregister_secondary_ack', ackPayload, message_id);
    }

    /**
     * Broadcasts a request to all secondary VSCE instances and sets up aggregation.
     */
    private broadcastToSecondaries(originalRequest: IPCMessageRequest, originalRequester: Client): void {
        const secondaryCount = this.secondaryClients.size;
        if (secondaryCount === 0) {
            // No secondaries, so no broadcasting or aggregation needed.
            // The request will be processed locally by the normal flow in handleMessage.
            return;
        }

        // Set up aggregation tracking
        const aggregationId = uuidv4();
        this.aggregationService.startAggregation(
            aggregationId,
            originalRequester.ws,
            secondaryCount + 1, // +1 for the primary's own response
            originalRequest.message_id,
            originalRequest.command
        );

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
                this.logger.debug(`Forwarded request to secondary ${windowId}`);
            }
        }
    }

    /**
     * Handles forwarded responses from secondary VSCE instances.
     */
    private handleForwardedResponse(payload: { originalMessageId: string; responsePayload: unknown; secondaryWindowId: string }): void {
        // The originalMessageId from the payload is now the aggregationId, allowing for a direct lookup.
        const aggregationId = payload.originalMessageId;
        this.aggregationService.addResponse(aggregationId, payload.secondaryWindowId, payload.responsePayload);
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
                    this.logger.debug('Forwarded push to CE client');
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
                        this.logger.info('Pushed snippet to CE client');
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
                this.logger.info('Forwarded snippet push to primary');
            } else {
                this.logger.warn('Cannot forward snippet - no connection to primary');
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
        message_id?: string,
        bypassAggregation?: boolean
    ): void {
        // If this is the primary server, check if this message is its own response to an aggregated request.
        if (this.isPrimary && message_id && !bypassAggregation) {
            // Try to add this as a primary response to an ongoing aggregation
            const wasHandledByAggregation = this.aggregationService.addPrimaryResponse(message_id, this.windowId, payload);
            if (wasHandledByAggregation) {
                // This response was part of an aggregation and has been handled
                return;
            }
            // If not handled by aggregation, continue with normal flow
        }

        const message: IPCBaseMessage & { type: typeof type, command: typeof command, payload: TResponsePayload } = {
            protocol_version: '1.0',
            message_id: message_id || uuidv4(),
            type,
            command,
            payload
        };
        try {
            const messageString = JSON.stringify(message);
            this.logger.trace(`Sending message for command '${command}'. ReadyState: ${ws.readyState}.`, { message_id: message.message_id, type: message.type, payloadKeys: message.payload ? Object.keys(message.payload) : [] });

            if (ws.readyState === WebSocket.OPEN) { // Check if OPEN before sending
                ws.send(messageString);
                this.logger.trace(`Message sent successfully for command: ${command}`);
            } else {
                this.logger.warn(`WebSocket not OPEN (state: ${ws.readyState}). Message for command '${command}' NOT sent.`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error during ws.send() for command '${command}': ${errorMessage}`, { message_id: message.message_id, type: message.type });
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
            this.logger.error('Attempted to send error but WebSocket was null.', { errorCode, errorMessage });
            return;
        }
        // Add a central log point for all errors sent to clients.
        this.logger.warn(`Sending error to client: ${errorMessage}`, { errorCode, original_message_id });
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
     * Gets the primary target tab ID from connected Chrome Extension clients.
     * Returns the first found active tab ID, or undefined if none are found.
     * @returns The primary target tab ID, or undefined if not found.
     */
    public getPrimaryTargetTabId(): number | undefined {
        for (const client of this.clients.values()) {
            if (client.isAuthenticated && client.activeLLMTabId !== undefined) {
                this.logger.debug(`Primary target tab ID found: ${client.activeLLMTabId}`);
                return client.activeLLMTabId;
            }
        }
        this.logger.debug('No primary target tab ID found among connected clients.');
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
                this.logger.trace(`pushSnippetToTarget: targetClient.ws.readyState: ${targetClient.ws.readyState}`);
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
                        this.logger.info(`Pushed snippet to tabId ${targetTabId}`);
                    } else {
                        this.logger.warn(`WebSocket not OPEN for tabId ${targetTabId}. Snippet not sent.`);
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this.logger.error(`Error sending push_snippet: ${errorMessage}`);
                }
            } else {
                this.logger.warn(`targetClient found for tabId ${targetTabId} but its WebSocket is missing.`);
                vscode.window.showWarningMessage('ContextWeaver: Could not send snippet. Target client found, but WebSocket is missing.');
            }
        } else {
            this.logger.warn(`No authenticated client found for targetTabId ${targetTabId} to push snippet.`);
            vscode.window.showWarningMessage('ContextWeaver: Could not send snippet. No active, authenticated Chrome tab found.');
        }
    }


    /**
     * Stops the WebSocket server, closes all client connections, and cleans up resources.
     * If the instance is a secondary, it closes its connection to the primary.
     */
    public stop(): void {
        if (this.wss) {
            this.logger.info('Stopping WebSocket server...');
            this.clients.forEach(client => {
                try {
                    client.ws.removeAllListeners();
                    client.ws.close();
                } catch (err) {
                    this.logger.error('Error cleaning up client:', err);
                }
            });
            this.clients.clear();
            this.wss.removeAllListeners();
            this.wss.close((err) => {
                if (err) {
                    this.logger.error(`Error closing WebSocket server: ${err.message}`);
                } else {
                    this.logger.info('WebSocket server stopped.');
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
