/**
 * @file ipcClient.ts
 * @description IPC client implementation for communication with VS Code Extension (VSCE).
 * Manages WebSocket connections, request/response handling, and connection retries.
 * @module ContextWeaver/CE
 */

import {
    // Request Payloads (for methods sending requests)
    GetFileTreeRequestPayload, GetFileContentRequestPayload,
    GetFolderContentRequestPayload, GetEntireCodebaseRequestPayload, SearchWorkspaceRequestPayload,
    GetFilterInfoRequestPayload, ListFolderContentsRequestPayload, GetWorkspaceProblemsRequestPayload, GetContentsForFilesRequestPayload,
    // Response Payloads (for resolving promises)
    FileTreeResponsePayload, FileContentResponsePayload,
    FolderContentResponsePayload, EntireCodebaseResponsePayload, ActiveFileInfoResponsePayload,
    OpenFilesResponsePayload, SearchWorkspaceResponsePayload, WorkspaceDetailsResponsePayload,
    FilterInfoResponsePayload, ListFolderContentsResponsePayload, WorkspaceProblemsResponsePayload, ErrorResponsePayload, ContentsForFilesResponsePayload,
    // Push Payloads
    // IPC Message Structure Types
    IPCMessageRequest, IPCMessagePush, AnyIPCMessage, IPCBaseMessage,
    ContextWeaverError
} from '@contextweaver/shared';
import { Logger } from '@contextweaver/shared';
import { IpcClient } from './ports/IpcClient';

// Rationale: Define a port range for the client to scan, matching the server's range.
const PORT_RANGE_START = 30001;
const PORT_RANGE_END = 30005;

/**
 * Manages the WebSocket client connection to the VS Code Extension (VSCE) IPC server.
 * Handles connection retries, message serialization, request/response tracking, and connection state.
 */
export class IPCClient implements IpcClient {
    private ws: WebSocket | null = null;
    public port: number = PORT_RANGE_START; // Current port being used
    private readonly logger = new Logger('IPCClient');
    private connectionPromise: Promise<void> | null = null;
    private resolveConnectionPromise: (() => void) | null = null;
    private rejectConnectionPromise: ((reason?: unknown) => void) | null = null;
    public isIntentionalDisconnect: boolean = false;
    // Map to store pending requests with their resolve/reject functions
    private pendingRequests: Map<string, { resolve: (value: unknown) => void, reject: (reason?: unknown) => void }> = new Map();


    /**
     * Creates an instance of IPCClient.
     * Loads configuration and attempts to connect to the VSCE IPC server.
     */
    constructor() {
        this.logger.info('IPCClient constructor called.');
        // Rationale: No longer loading config. Immediately try to connect.
        this.connectWithRetry();
    }

    private initializeConnectionPromise() {
        // Only create a new promise if one isn't already pending resolution/rejection
        if (!this.connectionPromise || (this.resolveConnectionPromise === null && this.rejectConnectionPromise === null)) {
            this.logger.debug('Initializing new connectionPromise.');
            this.connectionPromise = new Promise((resolve, reject) => {
                this.resolveConnectionPromise = resolve;
                this.rejectConnectionPromise = reject;
            });
        }
    }

    /**
     * Ensures that the WebSocket client is connected to the VSCE IPC server.
     * If not connected, it initiates a connection attempt.
     * @returns A Promise that resolves when the connection is established.
     */
    public async ensureConnected(): Promise<void> {
        this.logger.debug('ensureConnected called.');
        this.logger.trace(`Current ws state: ${this.ws ? this.ws.readyState : 'null'}`);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.logger.trace('ensureConnected: Already connected.');
            return Promise.resolve();
        }

        // If there's no active WebSocket, or it's closing/closed,
        // or if there's no pending connection promise, initiate connection.
        if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING || !this.connectionPromise) {
            this.logger.debug('ensureConnected: Connection not ready or promise stale. Re-initiating connectWithRetry.');
            this.connectWithRetry(); // This will call initializeConnectionPromise if needed
        } else {
            this.logger.debug('ensureConnected: Waiting on existing connectionPromise.');
        }

        return this.connectionPromise!; // Return the current or newly created promise
    }


    private async scanForServer(): Promise<void> {
        const createConnectionAttempt = (port: number): Promise<{ ws: WebSocket, port: number }> => {
            return new Promise((resolve, reject) => {
                const serverUrl = `ws://127.0.0.1:${port}`;
                const ws = new WebSocket(serverUrl);
                ws.onopen = () => resolve({ ws, port });
                ws.onerror = () => {
                    ws.close();
                    reject(new Error(`Connection failed on port ${port}`));
                };
            });
        };

        const connectionPromises = [];
        for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
            connectionPromises.push(createConnectionAttempt(port));
        }

        try {
            const { ws, port } = await Promise.any(connectionPromises);

            // We have a winner. Configure it.
            this.ws = ws;
            this.port = port;
            this.logger.info(`Successfully connected to ws://127.0.0.1:${port}`);

            // Set up handlers
            this.ws!.onmessage = (event) => this.handleServerMessage(event.data);
            this.ws!.onclose = (event) => {
                const wasIntentional = this.isIntentionalDisconnect;
                this.isIntentionalDisconnect = false; // Reset flag

                const reason = `Disconnected from ws://127.0.0.1:${this.port}. Code: ${event.code}, Reason: ${event.reason}. Clean: ${event.wasClean}`;
                if (wasIntentional) {
                    this.logger.info(`Intentionally ${reason}`);
                } else {
                    this.logger.warn(`Unintentionally ${reason}`);
                    chrome.runtime.sendMessage({
                        action: 'ipcConnectionStatus',
                        status: 'disconnected_unexpectedly',
                        payload: { message: `Unexpectedly disconnected from VS Code. Code: ${event.code}, Reason: ${event.reason}. Will attempt to reconnect.` }
                    }).catch(err => this.logger.warn('Error sending IPC_CONNECTION_STATUS (disconnected_unexpectedly) message:', err));
                    this.updateBadge('failed');
                    this.connectWithRetry();
                }
                this.ws = null;
            };
            this.ws!.onerror = (errorEvent) => {
                this.logger.error(`WebSocket error post-connection: ${errorEvent.type}`);
                this.ws?.close(); // Trigger onclose logic
            };

            // Close all other connections that might eventually succeed.
            connectionPromises.forEach(async (p) => {
                try {
                    const { ws: otherWs } = await p;
                    if (otherWs !== this.ws) {
                        otherWs.close();
                    }
                } catch (e) {
                    // Expected for failed promises.
                }
            });

            // Resolve the main connection promise
            if (this.resolveConnectionPromise) {
                this.resolveConnectionPromise();
            }
            this.resolveConnectionPromise = null;
            this.rejectConnectionPromise = null;

            // Notify UI and update badge
            this.updateBadge('connected');
            chrome.runtime.sendMessage({
                action: 'ipcConnectionStatus',
                status: 'connected',
                payload: { message: `Connected to VS Code on port ${this.port}.`, port: this.port }
            }).catch(err => this.logger.warn('Error sending IPC_CONNECTION_STATUS (connected) message:', err));

        } catch (error) {
            // This block is reached if all promises in Promise.any reject.
            throw new Error(`Could not find a ContextWeaver server in the port range ${PORT_RANGE_START}-${PORT_RANGE_END}.`);
        }
    }

    /**
     * Updates the browser action badge based on connection status.
     * @param status The connection status to display.
     */
    public updateBadge(status: 'connected' | 'connecting' | 'failed'): void {
        switch (status) {
            case 'connected':
                chrome.action.setBadgeText({ text: 'ON' });
                chrome.action.setBadgeBackgroundColor({ color: '#34a853' }); // Green
                break;
            case 'connecting':
                chrome.action.setBadgeText({ text: '...' });
                chrome.action.setBadgeBackgroundColor({ color: '#4285f4' }); // Blue
                break;
            case 'failed':
                chrome.action.setBadgeText({ text: 'OFF' });
                chrome.action.setBadgeBackgroundColor({ color: '#ea4335' }); // Red
                break;
        }
    }

    /**
     * Attempts to establish a WebSocket connection to the VSCE IPC server with retries.
     * @param maxRetries The maximum number of connection attempts.
     * @param delay The delay in milliseconds between retry attempts.
     */
    public connectWithRetry(maxRetries = 5, delay = 3000): void {
        let attempt = 0;

        // Always ensure a fresh promise for a new retry sequence
        this.initializeConnectionPromise();

        const tryConnect = () => {
            // Rationale: Call the new port scanning logic instead of a single connect.
            attempt++;
            this.logger.info(`Connection attempt ${attempt}`);

            // Update badge to show connecting status
            this.updateBadge('connecting');

            // Send connecting status to popup
            chrome.runtime.sendMessage({
                action: 'ipcConnectionStatus',
                status: 'connecting',
                payload: { message: `Attempting connection (attempt ${attempt}/${maxRetries})...` }
            }).catch(err => this.logger.warn('Error sending connecting status:', err));

            this.scanForServer() // Scan all ports instead of connecting to one
                .then(() => {
                    this.logger.debug('Connection successful after retry.');
                    // Promise already resolved by connect()'s onopen
                })
                .catch(() => { // This catch is for the current attempt's promise

                    if (attempt < maxRetries) {
                        setTimeout(tryConnect, delay);
                    } else {
                        // Initialize new promise for final rejection
                        this.initializeConnectionPromise();
                        const maxRetriesError = new Error('Max connection retries reached.');
                        this.logger.error(maxRetriesError.message);
                        // Type assertion to help TypeScript understand the property is not null after initializeConnectionPromise
                        const rejectFn = this.rejectConnectionPromise;
                        if (rejectFn) { // Use the newly initialized promise's reject
                            rejectFn(maxRetriesError);
                        }
                        this.resolveConnectionPromise = null;
                        this.rejectConnectionPromise = null;
                        chrome.runtime.sendMessage({
                            action: 'ipcConnectionStatus',
                            status: 'failed_max_retries',
                            payload: { message: `Could not connect to VS Code primary server after ${maxRetries} attempts. Please ensure VS Code is running with ContextWeaver extension.` }
                        }).catch(err => this.logger.warn('Error sending IPC_CONNECTION_STATUS (failed_max_retries) message:', err));
                    }
                });
        };
        tryConnect();
    }

        private handleServerMessage(messageData: unknown): void {
        this.logger.trace('Raw data received from server.');

        try {
            const message = JSON.parse(messageData as string) as AnyIPCMessage; // Use shared umbrella type
            this.logger.trace(`Parsed message from server. Type: ${message.type}, Command: ${'command' in message ? message.command : 'N/A'}, ID: ${message.message_id}`);

            if (message.type === 'response' || message.type === 'error_response') {
                const requestState = this.pendingRequests.get(message.message_id);
                if (requestState) {
                    if (message.type === 'error_response' || (message.payload && typeof message.payload === 'object' && 'success' in message.payload && message.payload.success === false)) {
                        // Ensure payload is treated as ErrorResponsePayload or a success:false response
                        const errorPayload = message.payload as ErrorResponsePayload | { success: false, error: string, errorCode: string };
                        this.logger.warn(`Error response for message_id ${message.message_id}:`, errorPayload);
                        const error = new ContextWeaverError(errorPayload.error, errorPayload.errorCode);
                        requestState.reject(error);
                    } else {
                        // The resolve function in pendingRequests now expects the specific TResPayload type
                        requestState.resolve(message.payload); // message.payload is already the correct TResPayload
                    }
                    this.pendingRequests.delete(message.message_id);
                } else {
                    this.logger.warn('Received response for unknown message_id:', message.message_id);
                }
            } else if (message.type === 'push') {
                const pushMessage = message as IPCMessagePush; // Narrow down to IPCPush
                this.logger.debug(`Detected 'push' message type. Command: ${pushMessage.command}`);

                // Forward push messages to the service worker for handling
                chrome.runtime.sendMessage(pushMessage).catch(e => this.logger.warn('Error forwarding push message:', e));
            } else {
                this.logger.warn('handleServerMessage: Received unknown message type from server:', (message as AnyIPCMessage).type);
            }
        } catch (error) {
            this.logger.error('handleServerMessage: Error processing server message:', error);
        }
    }

    /**
     * Sends a request to the VSCE IPC server and returns a promise that resolves with the response.
     * Ensures connection before sending and manages request timeouts.
     * @template TReqPayload The type of the request payload.
     * @template TResPayload The type of the expected response payload.
     * @param command The IPC command to send.
     * @param payload The data payload for the command.
     * @returns A Promise that resolves with the typed response payload from the server.
     * @throws An error if the connection fails or the request times out.
     */
    public async sendRequest<TReqPayload, TResPayload>(
        command: IPCMessageRequest['command'], // Use the command union type
        payload: TReqPayload
    ): Promise<TResPayload> { // Return the specific expected response payload
        this.logger.debug(`Attempting to send '${command}'. Ensuring connection first.`);
        await this.ensureConnected();

        this.logger.debug(`Post ensureConnected. Current ws state: ${this.ws ? this.ws.readyState : 'null'}`);

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.logger.error(`WebSocket not connected or not open (State: ${this.ws ? this.ws.readyState : 'null'}). Cannot send request '${command}'.`);
            // Propagate a more specific error that can be caught by the caller
            throw new Error(`IPC_CLIENT_NOT_CONNECTED: WebSocket not connected for command '${command}'.`);
        }

        const message_id = crypto.randomUUID();
        // Construct the message using the shared IPCMessageRequest structure
        const message: IPCBaseMessage & { type: 'request', command: typeof command, payload: TReqPayload } = {
            protocol_version: '1.0',
            message_id,
            type: 'request',
            command,
            payload
        };

        return new Promise<TResPayload>((resolve, reject) => {
            // Store the resolve and reject functions from the Promise constructor
            this.pendingRequests.set(message_id, {
                resolve: (value: unknown) => resolve(value as TResPayload),
                reject: reject
            });
            try {
                this.ws!.send(JSON.stringify(message));
                this.logger.debug(`Sent request: ${command}`, { message_id });
            } catch (error) {
                this.logger.error(`Error sending request ${command}:`, error);
                this.pendingRequests.delete(message_id);
                reject(error);
            }
            // Timeout logic remains the same
            setTimeout(() => {
                if (this.pendingRequests.has(message_id)) {
                    const pendingRequest = this.pendingRequests.get(message_id);
                    const timeoutError = new Error(`IPC_REQUEST_TIMEOUT: Request ${command} (ID: ${message_id}) timed out`);
                    this.logger.warn(timeoutError.message);
                    pendingRequest?.reject(timeoutError);
                    this.pendingRequests.delete(message_id);
                }
            }, 30000);
        });
    }

    /**
     * Requests workspace details from the VSCE.
     * @returns A Promise that resolves with the WorkspaceDetailsResponsePayload.
     */
    async getWorkspaceDetails(): Promise<WorkspaceDetailsResponsePayload> {
        return this.sendRequest<Record<string, never>, WorkspaceDetailsResponsePayload>('get_workspace_details', {});
    }
    /**
     * Requests the file tree for a specified workspace folder from the VSCE.
     * @param workspaceFolderUri The URI of the workspace folder.
     * @returns A Promise that resolves with the FileTreeResponsePayload.
     */
    async getFileTree(workspaceFolderUri: string | null): Promise<FileTreeResponsePayload> {
        return this.sendRequest<GetFileTreeRequestPayload, FileTreeResponsePayload>(
            'get_FileTree', { workspaceFolderUri }
        );
    }
    /**
     * Requests the content of a specific file from the VSCE.
     * @param filePath The URI of the file.
     * @returns A Promise that resolves with the FileContentResponsePayload.
     */
    async getFileContent(filePath: string): Promise<FileContentResponsePayload> {
        return this.sendRequest<GetFileContentRequestPayload, FileContentResponsePayload>(
            'get_file_content', { filePath }
        );
    }
    /**
     * Requests the content of all files within a specified folder from the VSCE.
     * @param folderPath The URI of the folder.
     * @param workspaceFolderUri The URI of the workspace folder the folder belongs to.
     * @returns A Promise that resolves with the FolderContentResponsePayload.
     */
    async getFolderContent(folderPath: string, workspaceFolderUri: string): Promise<FolderContentResponsePayload> {
        return this.sendRequest<GetFolderContentRequestPayload, FolderContentResponsePayload>(
            'get_folder_content', { folderPath, workspaceFolderUri }
        );
    }
    /**
     * Requests the content of the entire codebase for a specified workspace folder from the VSCE.
     * @param workspaceFolderUri The URI of the workspace folder.
     * @returns A Promise that resolves with the EntireCodebaseResponsePayload.
     */
    async getEntireCodebase(workspaceFolderUri: string | null): Promise<EntireCodebaseResponsePayload> {
        return this.sendRequest<GetEntireCodebaseRequestPayload, EntireCodebaseResponsePayload>(
            'get_entire_codebase', { workspaceFolderUri }
        );
    }
    /**
     * Requests information about the currently active file in VS Code.
     * @returns A Promise that resolves with the ActiveFileInfoResponsePayload.
     */
    async getActiveFileInfo(): Promise<ActiveFileInfoResponsePayload> {
        return this.sendRequest<Record<string, never>, ActiveFileInfoResponsePayload>('get_active_file_info', {});
    }
    /**
     * Requests a list of currently open files in VS Code.
     * @returns A Promise that resolves with the OpenFilesResponsePayload.
     */
    async getOpenFiles(): Promise<OpenFilesResponsePayload> {
        return this.sendRequest<Record<string, never>, OpenFilesResponsePayload>('get_open_files', {});
    }
    /**
     * Requests the content for a list of selected open files via the service worker.
     * @param fileUris An array of file URIs for which to retrieve content.
     * @returns A Promise that resolves with a payload containing file data and any errors.
     */
    async getContentsForFiles(fileUris: string[]): Promise<ContentsForFilesResponsePayload> {
        return this.sendRequest<GetContentsForFilesRequestPayload, ContentsForFilesResponsePayload>(
            'get_contents_for_files',
            { fileUris }
        );
    }
    /**
     * Performs a workspace search in VS Code.
     * @param query The search query.
     * @param workspaceFolderUri The URI of the workspace folder to search within (optional).
     * @returns A Promise that resolves with the SearchWorkspaceResponsePayload.
     */
    async searchWorkspace(query: string, workspaceFolderUri: string | null): Promise<SearchWorkspaceResponsePayload> {
        return this.sendRequest<SearchWorkspaceRequestPayload, SearchWorkspaceResponsePayload>(
            'search_workspace', { query, workspaceFolderUri }
        );
    }
    /**
     * Requests filter information (e.g., .gitignore rules) for a workspace folder from the VSCE.
     * @param workspaceFolderUri The URI of the workspace folder.
     * @returns A Promise that resolves with the FilterInfoResponsePayload.
     */
    async getFilterInfo(workspaceFolderUri: string | null): Promise<FilterInfoResponsePayload> {
        return this.sendRequest<GetFilterInfoRequestPayload, FilterInfoResponsePayload>(
            'get_filter_info', { workspaceFolderUri }
        );
    }
    /**
     * Requests a listing of contents (files and subfolders) for a specified folder from the VSCE.
     * @param folderUri The URI of the folder to list.
     * @param workspaceFolderUri The URI of the workspace folder the folder belongs to.
     * @returns A Promise that resolves with the ListFolderContentsResponsePayload.
     */
    async listFolderContents(folderUri: string, workspaceFolderUri: string | null): Promise<ListFolderContentsResponsePayload> {
        return this.sendRequest<ListFolderContentsRequestPayload, ListFolderContentsResponsePayload>(
            'list_folder_contents', { folderUri, workspaceFolderUri }
        );
    }

    /**
     * Requests workspace problems for a specified workspace folder from the VSCE.
     * @param workspaceFolderUri The URI of the workspace folder.
     * @returns A Promise that resolves with the WorkspaceProblemsResponsePayload.
     */
    async getWorkspaceProblems(workspaceFolderUri: string): Promise<WorkspaceProblemsResponsePayload> {
        return this.sendRequest<GetWorkspaceProblemsRequestPayload, WorkspaceProblemsResponsePayload>(
            'get_workspace_problems', { workspaceFolderUri }
        );
    }


    /**
     * Checks if the IPC client is currently connected to the VSCE IPC server.
     * @returns True if connected, false otherwise.
     */
    public isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Disconnects the WebSocket client from the VSCE IPC server.
     * Sets a flag to indicate that the disconnect is intentional.
     */
    public disconnect(): void {
        this.isIntentionalDisconnect = true;
        if (this.ws) {
            this.logger.info('disconnect() called, closing WebSocket.');
            this.ws.close();
        } else {
            this.logger.info('disconnect() called, but no active WebSocket.');
        }
    }
}

