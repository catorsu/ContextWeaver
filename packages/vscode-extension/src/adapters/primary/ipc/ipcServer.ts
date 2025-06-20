/**
 * @file ipcServer.ts
 * @description Thin coordinator for IPC between the VSCE and CE. Delegates to ConnectionService,
 * MultiWindowService, and CommandRegistry for actual functionality.
 * @module ContextWeaver/VSCE
 */

import WebSocket from 'ws';
import * as vscode from 'vscode';
import { WorkspaceService, WorkspaceServiceError } from '../../../core/services/WorkspaceService';
import { MultiWindowService } from '../../../core/services/MultiWindowService';
import { ConnectionService, Client } from './ConnectionService';
import { CommandRegistry } from './CommandRegistry';
import { ClientContext } from './types';
import { Logger } from '@contextweaver/shared';
import { v4 as uuidv4 } from 'uuid';

// Import shared types
import {
    // IPC Message Structure Types
    IPCMessageRequest, IPCMessageResponse, IPCMessageErrorResponse, IPCMessagePush,
    // Response Payloads (used in the code)
    GenericAckResponsePayload, PushSnippetPayload
} from '@contextweaver/shared';

/**
 * Thin coordinator for Inter-Process Communication (IPC) between the VS Code Extension (VSCE)
 * and the Chrome Extension (CE). Delegates to injected services for actual functionality.
 */
export class IPCServer {
    private readonly windowId: string;
    private readonly extensionContext: vscode.ExtensionContext;
    private readonly logger = new Logger('IPCServer');
    private outputChannel: vscode.OutputChannel;

    /**
     * Creates an instance of IPCServer.
     * @param windowId The unique identifier for this VS Code window instance.
     * @param context The VS Code extension context.
     * @param outputChannelInstance The VS Code output channel for logging.
     * @param workspaceServiceInstance The WorkspaceService instance for workspace trust checks.
     * @param connectionService The ConnectionService instance for WebSocket management.
     * @param multiWindowService The MultiWindowService instance for primary/secondary logic.
     * @param commandRegistry The CommandRegistry instance for handling IPC commands.
     */
    constructor(
        windowId: string,
        context: vscode.ExtensionContext,
        outputChannelInstance: vscode.OutputChannel,
        private workspaceService: WorkspaceService,
        private connectionService: ConnectionService,
        private multiWindowService: MultiWindowService,
        private commandRegistry: CommandRegistry
    ) {
        this.logger.info('Constructor called.');
        this.windowId = windowId;
        this.extensionContext = context;
        this.outputChannel = outputChannelInstance;
        this.logger.info(`Initialized with windowId ${this.windowId}.`);
    }

    /**
     * Starts the IPC server. Delegates to MultiWindowService for leader election
     * and ConnectionService for WebSocket management.
     */
    public async start(): Promise<void> {
        this.logger.info('start() method called.');

        // Set up the callback for secondary message handling
        this.multiWindowService.onForwardRequestReceived = this.handleForwardedRequest.bind(this);

        // Start multi-window service which handles leader election
        await this.multiWindowService.start();

        // If we became primary, set up connection handling
        if (this.multiWindowService.getIsPrimary()) {
            await this.setupPrimaryServer();
        }
    }

    /**
     * Sets up connection handling for primary server.
     */
    private async setupPrimaryServer(): Promise<void> {
        try {
            const port = await this.connectionService.startServer(this.handleNewConnection.bind(this));
            this.logger.info(`Primary IPC server established on port ${port}`);
            vscode.window.showInformationMessage(`ContextWeaver: Primary IPC Server started on port ${port}.`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to start primary server: ${errorMessage}`);
            vscode.window.showErrorMessage(`ContextWeaver: Failed to start server: ${errorMessage}`);
        }
    }

    /**
     * Handles new client connections by setting up message handlers.
     */
    private handleNewConnection(client: Client): void {
        this.logger.info(`New client connected from ${client.ip}`);
        
        // Set up client-specific cleanup for secondary clients
        client.ws.on('close', () => {
            if (client.windowId) {
                this.multiWindowService.removeSecondaryClient(client.windowId);
            }
        });

        // Set up message handler
        client.ws.on('message', (message) => {
            this.handleMessage(client, message);
        });
    }

    /**
     * Handles forwarded requests from MultiWindowService when running as secondary.
     */
    private async handleForwardedRequest(originalRequest: IPCMessageRequest, aggregationId: string): Promise<void> {
        this.logger.debug(`Processing forwarded request: ${originalRequest.command}`);
        
        // Create a mock client to capture the response
        const responseBuffer: (IPCMessageResponse | IPCMessageErrorResponse)[] = [];
        const mockClient: Client = {
            ws: {
                send: (data: string) => {
                    responseBuffer.push(JSON.parse(data));
                },
                readyState: WebSocket.OPEN
            } as unknown as WebSocket,
            isAuthenticated: true,
            ip: 'primary-forward',
            windowId: this.windowId
        };

        // Process the request
        await this.handleMessage(mockClient, Buffer.from(JSON.stringify(originalRequest)));

        // Send response back to primary via MultiWindowService
        if (responseBuffer.length > 0) {
            const response = responseBuffer[0];
            this.multiWindowService.sendResponseToPrimary(aggregationId, response.payload);
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
            this.connectionService.sendError(client.ws, null, 'INVALID_MESSAGE_FORMAT', `Error parsing message: ${errorMessage}`);
            return;
        }

        const { protocol_version, message_id, type, command, payload } = parsedMessage;

        if (protocol_version !== '1.0') {
            this.logger.warn(`Protocol version mismatch from ${client.ip}. Expected 1.0, got ${protocol_version}.`);
            this.connectionService.sendError(client.ws, message_id, 'UNSUPPORTED_PROTOCOL_VERSION', 'Protocol version mismatch.');
            return;
        }

        this.logger.debug(`Received command '${command}' (ID: ${message_id}) of type '${type}' from ${client.ip}.`);

        // Handle push messages first - they don't follow the request/response pattern
        if (type === 'push') {
            // Handle special push commands for Primary/Secondary architecture
            if (this.multiWindowService.getIsPrimary()) {
                const pushCommand = command as string;
                switch (pushCommand) {
                    case 'forward_response_to_primary':
                        this.multiWindowService.handleForwardedResponse(payload as {
                            originalMessageId: string;
                            responsePayload: unknown;
                            secondaryWindowId: string;
                        });
                        return;
                    case 'forward_push_to_primary':
                        this.multiWindowService.handleForwardedPush(payload as {
                            originalPushPayload: PushSnippetPayload;
                        }, this.connectionService);
                        return;
                }
            }
            this.logger.warn(`Received push command '${command}' from ${client.ip}, but no handler defined.`);
            return;
        }

        if (type !== 'request') {
            this.logger.warn(`Unexpected message type '${type}' from ${client.ip}. Expected 'request' or 'push'.`);
            this.connectionService.sendError(client.ws, message_id, 'INVALID_MESSAGE_TYPE', `Unexpected message type: ${type}`);
            return;
        }

        // At this point, type is guaranteed to be 'request'
        // Handle special request commands for Primary/Secondary architecture
        if (this.multiWindowService.getIsPrimary()) {
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
                    this.connectionService.sendError(client.ws, message_id, error.code, error.message);
                } else {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this.logger.error(`Unexpected error during workspace check for command '${command}': ${errorMessage}`);
                    this.connectionService.sendError(client.ws, message_id, 'INTERNAL_SERVER_ERROR', `Unexpected error during workspace check: ${errorMessage}`);
                }
                return;
            }
        }

        // If primary and this is a request from CE that requires aggregation
        const secondaryClients = this.multiWindowService.getSecondaryClients();
        if (this.multiWindowService.getIsPrimary() && commandsRequiringWorkspace.includes(command) && !client.windowId && secondaryClients.size > 0) {
            // This is from CE, need to broadcast to secondaries
            this.multiWindowService.broadcastToSecondaries(parsedMessage as IPCMessageRequest, client.ws);
            // Also process locally
        }

        // Use CommandRegistry to get and execute the appropriate handler
        const handler = this.commandRegistry.getHandler(command);
        if (!handler) {
            this.logger.warn(`Unknown command '${command}' from ${client.ip}.`);
            this.connectionService.sendError(client.ws, message_id, 'UNKNOWN_COMMAND', `Unknown command: ${command}`);
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
            this.connectionService.sendError(client.ws, message_id, 'COMMAND_EXECUTION_ERROR', `Error executing command: ${errorMessage}`);
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
        this.connectionService.updateClient(client.ws, { windowId: payload.windowId });
        this.multiWindowService.handleRegisterSecondary(client, payload);
        this.sendGenericAck(client, message_id, true, 'Secondary registered successfully.');
    }

    /**
     * Handles unregistration of a secondary VSCE instance.
     */
    private handleUnregisterSecondary(client: Client, payload: { windowId: string }, message_id: string): void {
        this.multiWindowService.handleUnregisterSecondary(payload);
        const ackPayload: GenericAckResponsePayload = { success: true, message: 'Secondary unregistered successfully.' };
        this.connectionService.sendMessage<GenericAckResponsePayload>(client.ws, 'response', 'response_unregister_secondary_ack', ackPayload, message_id);
    }

    /**
     * Sends a response message to a connected WebSocket client.
     * Delegates to ConnectionService for actual sending.
     */
    private sendMessage<TResponsePayload>(
        ws: WebSocket,
        type: IPCMessageResponse['type'],
        command: IPCMessageResponse['command'],
        payload: TResponsePayload,
        message_id?: string
    ): void {
        this.connectionService.sendMessage(ws, type, command, payload, message_id);
    }

    /**
     * Sends a generic acknowledgment response to a client.
     */
    private sendGenericAck(client: Client, message_id: string, success: boolean, message: string | null = null) {
        const payload: GenericAckResponsePayload = { success, message };
        this.connectionService.sendMessage<GenericAckResponsePayload>(client.ws, 'response', 'response_generic_ack', payload, message_id);
    }

    /**
     * Gets the primary target tab ID from connected Chrome Extension clients.
     */
    public getPrimaryTargetTabId(): number | undefined {
        const clients = this.connectionService.getClients();
        for (const client of clients.values()) {
            if (client.isAuthenticated && client.activeLLMTabId !== undefined) {
                this.logger.debug(`Primary target tab ID found: ${client.activeLLMTabId}`);
                return client.activeLLMTabId;
            }
        }
        this.logger.debug('No primary target tab ID found among connected clients.');
        return undefined;
    }

    /**
     * Handles snippet send requests. Delegates to MultiWindowService.
     */
    public handleSnippetSendRequest(snippetData: Omit<PushSnippetPayload, 'targetTabId' | 'windowId'>): void {
        this.multiWindowService.handleSnippetSendRequest(snippetData, this.connectionService);
    }

    /**
     * Pushes a code snippet to a specific target tab identified by its tab ID.
     * @deprecated This method uses an older, targeted push mechanism. Use {@link handleSnippetSendRequest} instead.
     */
    public pushSnippetToTarget(targetTabId: number, snippetData: PushSnippetPayload): void {
        const clients = this.connectionService.getClients();
        let targetClient: Client | null = null;
        for (const client of clients.values()) {
            if (client.isAuthenticated && client.activeLLMTabId === targetTabId) {
                targetClient = client;
                break;
            }
        }

        if (targetClient) {
            const pushMessage = {
                protocol_version: '1.0',
                message_id: uuidv4(),
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
            this.logger.warn(`No authenticated client found for targetTabId ${targetTabId} to push snippet.`);
            vscode.window.showWarningMessage('ContextWeaver: Could not send snippet. No active, authenticated Chrome tab found.');
        }
    }

    /**
     * Stops the IPC server and cleans up resources.
     */
    public stop(): void {
        this.logger.info('Stopping IPC server...');
        this.connectionService.stop();
        this.multiWindowService.stop();
        this.logger.info('IPC server stopped.');
    }
}