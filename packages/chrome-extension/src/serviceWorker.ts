/**
 * @file serviceWorker.ts
 * @description Service worker for the ContextWeaver Chrome Extension.
 * Manages IPC client connection to VSCE, handles messages, and background tasks.
 * @module ContextWeaver/CE
 */

import {
    // Request Payloads (for methods sending requests)
    RegisterActiveTargetRequestPayload, GetFileTreeRequestPayload, GetFileContentRequestPayload,
    GetFolderContentRequestPayload, GetEntireCodebaseRequestPayload, SearchWorkspaceRequestPayload,
    GetFilterInfoRequestPayload, ListFolderContentsRequestPayload, GetWorkspaceProblemsRequestPayload, GetContentsForFilesRequestPayload,
    // Response Payloads (for resolving promises)
    GenericAckResponsePayload, FileTreeResponsePayload, FileContentResponsePayload,
    FolderContentResponsePayload, EntireCodebaseResponsePayload, ActiveFileInfoResponsePayload,
    OpenFilesResponsePayload, SearchWorkspaceResponsePayload, WorkspaceDetailsResponsePayload,
    FilterInfoResponsePayload, ListFolderContentsResponsePayload, WorkspaceProblemsResponsePayload, ErrorResponsePayload, ContentsForFilesResponsePayload,
    // Push Payloads
    // IPC Message Structure Types
    IPCMessageRequest, IPCMessagePush, AnyIPCMessage, IPCBaseMessage
} from '@contextweaver/shared';
import { Logger, LogLevel } from '@contextweaver/shared';
import { BrowserConsoleLogger } from './ceLogger';

// Configure the logger for the service worker environment
Logger.setOutput(new BrowserConsoleLogger());
Logger.setLevel(LogLevel.INFO); // Default to INFO, can be changed for debugging
const logger = new Logger('ServiceWorker');

// Rationale: Define a port range for the client to scan, matching the server's range.
const PORT_RANGE_START = 30001;
const PORT_RANGE_END = 30005;

/**
 * Manages the WebSocket client connection to the VS Code Extension (VSCE) IPC server.
 * Handles connection retries, message serialization, request/response tracking, and connection state.
 */
class IPCClient {
    private ws: WebSocket | null = null;
    public port: number = PORT_RANGE_START; // Current port being used
    private readonly logger = new Logger('IPCClient');
    private connectionPromise: Promise<void> | null = null;
    private resolveConnectionPromise: (() => void) | null = null;
    private rejectConnectionPromise: ((reason?: any) => void) | null = null;
    public isIntentionalDisconnect: boolean = false;
    // Correctly type the pendingRequests map
    // TODO: Replace 'any' with generic types in the sendRequest method to ensure type-safe resolution.
    // This will allow the Promise returned by sendRequest to be strongly typed.
    private pendingRequests: Map<string, { resolve: (value: any) => void, reject: (reason?: any) => void }> = new Map();


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
                        const rejectFn = this.rejectConnectionPromise as ((reason?: any) => void) | null;
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

        private handleServerMessage(messageData: any): void {
        this.logger.trace('Raw data received from server.');

        try {
            const message = JSON.parse(messageData as string) as AnyIPCMessage; // Use shared umbrella type
            this.logger.trace(`Parsed message from server. Type: ${message.type}, Command: ${(message as any).command}, ID: ${message.message_id}`);

            if (message.type === 'response' || message.type === 'error_response') {
                const requestState = this.pendingRequests.get(message.message_id);
                if (requestState) {
                    if (message.type === 'error_response' || (message.payload as any)?.success === false) {
                        // Ensure payload is treated as ErrorResponsePayload or a success:false response
                        const errorPayload = message.payload as ErrorResponsePayload | { success: false, error: string, errorCode: string };
                        this.logger.warn(`Error response for message_id ${message.message_id}:`, errorPayload);
                        const error = new Error(errorPayload.error);
                        (error as any).errorCode = errorPayload.errorCode;
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

                if (pushMessage.command === 'push_snippet') {
                    this.logger.debug('Broadcasting \'push_snippet\' to all LLM tabs.');

                    // Query for all tabs matching supported LLM host permissions
                    const urlsToQuery = SUPPORTED_LLM_HOST_SUFFIXES.map(suffix => `*://${suffix}/*`);
                    chrome.tabs.query({ url: urlsToQuery }).then(tabs => {
                        this.logger.debug(`Found ${tabs.length} LLM tabs to send snippet to`);

                        // Send the snippet message to each tab
                        tabs.forEach(tab => {
                            if (tab.id) {
                                chrome.tabs.sendMessage(tab.id, pushMessage)
                                    .then(() => {
                                        if (chrome.runtime.lastError) {
                                            this.logger.warn(`Error sending push_snippet to tab ${tab.id}: ${chrome.runtime.lastError.message}`);
                                        } else {
                                            this.logger.debug(`Successfully sent push_snippet to tab ${tab.id}`);
                                        }
                                    })
                                    .catch(e => {
                                        this.logger.warn(`Error sending push_snippet message to tab ${tab.id}:`, e);
                                    });
                            }
                        });
                    }).catch(e => {
                        this.logger.error('Error querying tabs for push_snippet broadcast:', e);
                    });
                } else {
                    // For other potential push messages
                    this.logger.debug(`Broadcasting generic push message. Command: ${pushMessage.command}`);
                    chrome.runtime.sendMessage(pushMessage).catch(e => this.logger.warn('Error broadcasting generic push message:', e));
                }
            } else {
                this.logger.warn('handleServerMessage: Received unknown message type from server:', (message as any).type);
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
            // Correctly store the resolve and reject functions from the Promise constructor
            this.pendingRequests.set(message_id, {
                resolve: resolve,
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

const ipcClient = new IPCClient();

// Define types for messages contentScript sends to serviceWorker
// These are not IPC messages themselves, but describe the action for the service worker
/**
 * Represents a message sent from the content script to the service worker,
 * typically requesting an API call to the VSCE.
 */
interface SWApiRequestMessage {
    type: string; // e.g., 'SEARCH_WORKSPACE', 'GET_FILE_CONTENT'
    payload?: any; // Payload type will be refined in each handler
}

/**
 * Represents a message sent from the options or popup page to the service worker,
 * typically for configuration updates or connection status requests.
 */
interface OptionsPageMessage {
    action: 'settingsUpdated' | 'reconnectIPC' | 'getIPCConnectionStatus';
    payload?: any; // Specific payload for each action
    status?: string; // For getIPCConnectionStatus response
    port?: number; // For getIPCConnectionStatus response
    message?: string; // For getIPCConnectionStatus response
}

type IncomingRuntimeMessage = SWApiRequestMessage | OptionsPageMessage | IPCMessagePush; // Added IPCMessagePush for direct pushes from VSCE

chrome.runtime.onMessage.addListener((message: IncomingRuntimeMessage, sender, sendResponse) => {
    logger.debug(`Message received in service worker. Type: ${(message as any).type || (message as any).action}, FromTab: ${sender?.tab?.id}`);

    if ('type' in message) { // Handle messages from contentScript (via serviceWorkerClient) or direct IPC pushes
        const typedMessage = message as SWApiRequestMessage | IPCMessagePush; // Type assertion for this block

        if (typedMessage.type === 'GET_WORKSPACE_DETAILS_FOR_UI') {
            logger.debug('Handling GET_WORKSPACE_DETAILS_FOR_UI');
            ipcClient.getWorkspaceDetails()
                .then((responsePayload: WorkspaceDetailsResponsePayload) => { // Explicitly type here for clarity
                    logger.trace(`Response for get_workspace_details: ${responsePayload.data?.workspaceFolders?.length || 0} folders`);
                    // The responsePayload is already correctly typed due to IPCClient method's return type
                    sendResponse(responsePayload); // Send the whole typed payload back
                })
                .catch(error => {
                    logger.error('Error in get_workspace_details IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for get_workspace_details.' });
                });
            return true; // Indicates async response
        } else if (typedMessage.type === 'GET_FileTree') {
            const payload = typedMessage.payload as GetFileTreeRequestPayload;
            logger.debug(`Handling GET_FileTree for URI: ${payload.workspaceFolderUri}`);
            ipcClient.getFileTree(payload.workspaceFolderUri)
                .then((responsePayload: FileTreeResponsePayload) => { // responsePayload is the entire payload from VSCE
                    logger.trace(`Response for get_FileTree. Tree size: ${responsePayload.data?.fileTreeString?.length || 0}`);

                    if (responsePayload.success === false) {
                        sendResponse({ success: false, error: responsePayload.error || 'Failed to get file tree from VSCE.' });
                    } else if (responsePayload.data && responsePayload.data.fileTreeString !== undefined) {
                        // Construct the response for contentScript as expected
                        sendResponse({
                            success: true,
                            data: { // Nest fileTreeString and metadata under data
                                fileTreeString: responsePayload.data.fileTreeString,
                                metadata: responsePayload.data.metadata
                            },
                            // Corrected: workspaceFolderName is only in metadata, not top-level
                            workspaceFolderName: responsePayload.data.metadata?.workspaceFolderName,
                            filterType: responsePayload.filterType,
                            workspaceFolderUri: responsePayload.workspaceFolderUri
                        });
                    } else {
                        sendResponse({ success: false, error: 'Invalid file tree data from VSCE (missing data object or fileTreeString).' });
                    }
                })
                .catch(error => {
                    logger.error('Error in get_FileTree IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for get_FileTree.' });
                });
            return true; // Indicates async response
        } else if (typedMessage.type === 'GET_ACTIVE_FILE_INFO') {
            logger.debug('Handling GET_ACTIVE_FILE_INFO');
            ipcClient.getActiveFileInfo()
                .then((responsePayload: ActiveFileInfoResponsePayload) => {
                    logger.trace('Response for get_active_file_info:', responsePayload.data?.activeFileLabel);
                    if (responsePayload.success === false) {
                        sendResponse({ success: false, error: responsePayload.error || 'Failed to get active file info from VSCE.' });
                    } else {
                        sendResponse({ success: true, data: responsePayload.data });
                    }
                })
                .catch(error => {
                    logger.error('Error in get_active_file_info IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for get_active_file_info.' });
                });
            return true;
        } else if (typedMessage.type === 'GET_FILE_CONTENT') {
            const payload = typedMessage.payload as GetFileContentRequestPayload;
            logger.debug(`Handling GET_FILE_CONTENT for path: ${payload.filePath}`);
            ipcClient.getFileContent(payload.filePath)
                .then((responsePayload: FileContentResponsePayload) => {
                    logger.trace(`Response for get_file_content for path: ${payload.filePath}`);
                    if (responsePayload.success === false) {
                        sendResponse({ success: false, error: responsePayload.error || 'Failed to get file content from VSCE.' });
                    } else {
                        sendResponse({ success: true, data: responsePayload.data });
                    }
                })
                .catch(error => {
                    logger.error('Error in get_file_content IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for get_file_content.' });
                });
            return true;
        } else if (typedMessage.type === 'GET_ENTIRE_CODEBASE') {
            const payload = typedMessage.payload as GetEntireCodebaseRequestPayload;
            logger.debug(`Handling GET_ENTIRE_CODEBASE for URI: ${payload.workspaceFolderUri}`);
            ipcClient.getEntireCodebase(payload.workspaceFolderUri)
                .then((responsePayload: EntireCodebaseResponsePayload) => { // responsePayload is the entire payload from VSCE
                    logger.trace(`Response for get_entire_codebase. Files: ${responsePayload.data?.filesData?.length || 0}`);
                    if (responsePayload.success === false) {
                        sendResponse({ success: false, error: responsePayload.error || 'Failed to get entire codebase from VSCE.' });
                    } else if (responsePayload.data && Array.isArray(responsePayload.data.filesData)) { // Check for filesData
                        sendResponse({
                            success: true,
                            data: { // Pass filesData and metadata
                                filesData: responsePayload.data.filesData,
                                metadata: responsePayload.data.metadata
                            },
                            workspaceFolderName: responsePayload.data.metadata?.workspaceFolderName,
                            filterType: responsePayload.filterType,
                            projectPath: responsePayload.projectPath,
                            workspaceFolderUri: responsePayload.workspaceFolderUri
                        });
                    } else {
                        sendResponse({ success: false, error: 'Invalid codebase data from VSCE (missing data.filesData array).' });
                    }
                })
                .catch(error => {
                    logger.error('Error in get_entire_codebase IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for get_entire_codebase.' });
                });
            return true; // Indicates async response
        } else if (typedMessage.type === 'GET_OPEN_FILES_FOR_UI') {
            logger.debug('Handling GET_OPEN_FILES_FOR_UI');
            ipcClient.getOpenFiles()
                .then((responsePayload: OpenFilesResponsePayload) => {
                    logger.trace(`Response for get_open_files: ${responsePayload.data?.openFiles?.length || 0} files`);
                    if (responsePayload.success === false) {
                        sendResponse({ success: false, error: responsePayload.error || 'Failed to get open files list from VSCE.' });
                    } else {
                        sendResponse({ success: true, data: responsePayload.data });
                    }
                })
                .catch(error => {
                    logger.error('Error in get_open_files IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for get_open_files.' });
                });
            return true;
        } else if (typedMessage.type === 'GET_CONTENTS_FOR_SELECTED_OPEN_FILES') {
            // This message type is internal to CE, not a direct IPC command.
            // Its payload is an array of file URIs.
            const fileUris = typedMessage.payload.fileUris as string[]; // Corrected: fileUris
            logger.debug(`Handling GET_CONTENTS_FOR_SELECTED_OPEN_FILES for ${fileUris.length} URIs`);

            if (!Array.isArray(fileUris) || fileUris.length === 0) {
                sendResponse({ success: false, error: 'No file URIs provided.' });
                return false;
            }

            ipcClient.getContentsForFiles(fileUris)
                .then((response: ContentsForFilesResponsePayload) => {
                    if (!response || response.success === false) {
                        sendResponse({ success: false, error: response?.error || 'Failed to get contents for files.' });
                        return;
                    }

                    const successfulFilesData = response.data?.map((item: any) => ({
                        fileData: item.fileData,
                        metadata: item.metadata
                    })) || [];

                    const erroredFiles = response.errors || [];

                    sendResponse({
                        success: true,
                        data: successfulFilesData,
                        errors: erroredFiles
                    });
                })
                .catch((error: any) => {
                    logger.error('Error in getContentsForFiles IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'Failed to process multiple file content requests.' });
                });
            return true;
        } else if (typedMessage.type === 'GET_FOLDER_CONTENT') {
            const payload = typedMessage.payload as GetFolderContentRequestPayload;
            logger.debug(`Handling GET_FOLDER_CONTENT for path: ${payload.folderPath}`);
            ipcClient.getFolderContent(payload.folderPath, payload.workspaceFolderUri)
                .then((responsePayload: FolderContentResponsePayload) => {
                    logger.trace(`Response for get_folder_content: ${responsePayload.data?.filesData?.length || 0} files`);
                    if (responsePayload.success === false) {
                        sendResponse({ success: false, error: responsePayload.error || 'Failed to get folder content from VSCE.' });
                    } else {
                        sendResponse({ success: true, data: responsePayload.data });
                    }
                })
                .catch(error => {
                    logger.error('Error in get_folder_content IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for get_folder_content.' });
                });
            return true;
        } else if (typedMessage.type === 'LIST_FOLDER_CONTENTS') {
            const payload = typedMessage.payload as ListFolderContentsRequestPayload;
            logger.debug(`Handling LIST_FOLDER_CONTENTS for URI: ${payload.folderUri}, Workspace: ${payload.workspaceFolderUri}`);
            ipcClient.listFolderContents(payload.folderUri, payload.workspaceFolderUri)
                .then((responsePayload: ListFolderContentsResponsePayload) => {
                    logger.trace(`Response for list_folder_contents: ${responsePayload.data?.entries?.length || 0} entries`);
                    if (responsePayload.success === false) {
                        sendResponse({ success: false, error: responsePayload.error || 'Failed to get folder contents from VSCE.' });
                    } else {
                        sendResponse({ success: true, data: responsePayload.data });
                    }
                })
                .catch(error => {
                    logger.error('Error in list_folder_contents IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for list_folder_contents.' });
                });
            return true;
        } else if (typedMessage.type === 'SEARCH_WORKSPACE') {
            const payload = typedMessage.payload as SearchWorkspaceRequestPayload;
            logger.debug(`Handling SEARCH_WORKSPACE for query (length: ${payload.query.length}), folder: ${payload.workspaceFolderUri}`);
            ipcClient.searchWorkspace(payload.query, payload.workspaceFolderUri)
                .then((responsePayload: SearchWorkspaceResponsePayload) => {
                    logger.trace(`Response for search_workspace: ${responsePayload.data?.results?.length || 0} results`);
                    if (responsePayload.success === false) {
                        sendResponse({ success: false, error: responsePayload.error || 'Failed to get search results from VSCE.' });
                    } else {
                        sendResponse({ success: true, data: responsePayload.data });
                    }
                })
                .catch(error => {
                    logger.error('Error in search_workspace IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for search_workspace.' });
                });
            return true;
        } else if (typedMessage.type === 'GET_WORKSPACE_PROBLEMS') {
            const payload = typedMessage.payload as GetWorkspaceProblemsRequestPayload;
            logger.debug(`Handling GET_WORKSPACE_PROBLEMS for URI: ${payload.workspaceFolderUri}`);
            ipcClient.getWorkspaceProblems(payload.workspaceFolderUri)
                .then((responsePayload: WorkspaceProblemsResponsePayload) => {
                    logger.trace(`Response for get_workspace_problems: ${responsePayload.data?.problemCount || 0} problems`);
                    sendResponse(responsePayload); // Forward the full payload
                })
                .catch(error => {
                    logger.error('Error in get_workspace_problems IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for get_workspace_problems.' });
                });
            return true;
        } else {
            logger.warn(`Received unhandled message type: ${typedMessage.type}`);
            return false;
        }
    } else if ('action' in message) { // Handle messages from options/popup pages
        const optionsMessage = message as OptionsPageMessage;
        if (optionsMessage.action === 'settingsUpdated') {
            // Rationale: This action is now obsolete as there are no settings to save.
            logger.debug('Received obsolete settingsUpdated message. Ignoring.');
            return false;
        } else if (optionsMessage.action === 'reconnectIPC') {
            logger.info('Received reconnectIPC message. Forcing reconnection.');
            // This message is from options.ts, which also handles its own status updates.
            // No need to send IPC_CONNECTION_STATUS from here immediately, as options.ts expects it from the SW's
            // onclose/onerror/onopen handlers.
            ipcClient.disconnect();
            ipcClient.connectWithRetry();
            return false;
        } else if (optionsMessage.action === 'getIPCConnectionStatus') {
            logger.debug('Received request for current IPC status');
            if (ipcClient.isConnected()) {
                sendResponse({
                    action: 'ipcConnectionStatus',
                    status: 'connected',
                    payload: { port: ipcClient.port, message: `Currently connected to VS Code on port ${ipcClient.port}.` }
                });
            } else {
                sendResponse({
                    action: 'ipcConnectionStatus',
                    status: 'disconnected_unexpectedly',
                    payload: { message: 'Currently not connected to VS Code.' }
                });
            }
            return false;
        } else if (optionsMessage.action === 'updateBadge') {
            logger.debug('Received request to update badge.');
            // Update badge based on current connection status
            if (ipcClient.isConnected()) {
                ipcClient.updateBadge('connected');
            } else {
                ipcClient.updateBadge('failed');
            }
            return false;
        }
    }

    logger.warn('Received unhandled message:', message);
    return false;
});


let keepAliveIntervalId: number | undefined;

// Service workers become idle after 30 seconds of inactivity. This interval
// calls a trivial, non-impacting Chrome API every 20 seconds to reset the
// idle timer and keep the service worker alive to maintain the WebSocket connection.
function startKeepAlive() {
    if (keepAliveIntervalId !== undefined) return;
    keepAliveIntervalId = setInterval(() => {
        if (chrome.runtime && chrome.runtime.getPlatformInfo) {
            chrome.runtime.getPlatformInfo().then(() => {
                logger.trace('Keep-alive ping.');
            }).catch((e) => {
                logger.warn('Keep-alive: runtime not available, stopping.', e);
            });
        } else {
            logger.warn('Keep-alive: chrome.runtime or getPlatformInfo not available, stopping.');
        }
    }, 20 * 1000);
    logger.info('Keep-alive interval started.');
}

// function stopKeepAlive() {  // Currently unused, kept for future use
//     if (keepAliveIntervalId !== undefined) {
//         clearInterval(keepAliveIntervalId);
//         keepAliveIntervalId = undefined;
//         logger.info('Keep-alive interval stopped.');
//     }
// }

// --- Lifecycle Event Listeners ---
chrome.runtime.onStartup.addListener(async () => {
    logger.info('Extension started up via onStartup.');
    ipcClient.updateBadge('connecting'); // Set initial badge state
    ipcClient.connectWithRetry();
    startKeepAlive();
});

chrome.runtime.onInstalled.addListener(async (details) => {
    logger.info(`Extension installed/updated: ${details.reason}`);
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        chrome.runtime.openOptionsPage();
    }
    ipcClient.updateBadge('connecting'); // Set initial badge state
    ipcClient.connectWithRetry();
    startKeepAlive();
});

// Initial load actions
if (typeof keepAliveIntervalId === 'undefined') {
    logger.info('Service worker script loaded, starting keep-alive.');
    startKeepAlive();
}

if (!ipcClient.isConnected()) {
    logger.info('Service worker script loaded, attempting initial connection (if not already handled by startup/install).');
    ipcClient.updateBadge('connecting'); // Set initial badge state
    ipcClient.connectWithRetry();
}

const SUPPORTED_LLM_HOST_SUFFIXES = [
    'chat.deepseek.com',
    'aistudio.google.com'
];

/**
 * Checks if a given tab is a supported LLM host and registers it with the VSCE IPC server
 * as an active target if it is.
 * @param tabId The ID of the tab to check and register.
 * @param tabUrl Optional. The URL of the tab. If not provided, it will be fetched.
 * @returns A Promise that resolves when the check and registration process is complete.
 */
async function checkAndRegisterTab(tabId: number, tabUrl?: string): Promise<void> {
    if (!tabId) return;

    let currentTabUrl = tabUrl;
    if (!currentTabUrl) {
        try {
            const tab = await chrome.tabs.get(tabId);
            if (!tab.url) return; // Tab might not have a URL (e.g., internal pages)
            currentTabUrl = tab.url;
        } catch (error) {
            logger.warn(`Error getting tab info for tabId ${tabId}:`, error);
            return; // Cannot get tab info
        }
    }

    try {
        const url = new URL(currentTabUrl);
        const host = url.hostname;

        const isSupportedLLM = SUPPORTED_LLM_HOST_SUFFIXES.some(suffix => host.endsWith(suffix));

        if (isSupportedLLM) {
            logger.debug(`Supported LLM tab identified: ID ${tabId}, Host ${host}. Registering with VSCE.`);
            await ipcClient.sendRequest<RegisterActiveTargetRequestPayload, GenericAckResponsePayload>(
                'register_active_target',
                { tabId: tabId, llmHost: host }
            );
            logger.trace(`Registration request sent for tabId ${tabId}, host ${host}.`);
        } else {
            logger.trace(`Tab ${tabId} (${host}) is not a supported LLM host.`);
        }
    } catch (error) {
        logger.warn(`Error processing tab URL '${currentTabUrl}' for registration:`, error);
    }
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    logger.debug(`Tab activated: tabId ${activeInfo.tabId}`);
    await checkAndRegisterTab(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        logger.debug(`Tab updated and complete: tabId ${tabId}, url ${tab.url}`);
        await checkAndRegisterTab(tabId, tab.url);
    } else if (changeInfo.url) {
        logger.debug(`Tab URL changed: tabId ${tabId}, new url ${changeInfo.url}`);
        await checkAndRegisterTab(tabId, changeInfo.url);
    }
});

/**
 * Registers the initially active tab with the VSCE IPC server if it's a supported LLM host.
 * This function is called on service worker startup to ensure the correct tab is registered.
 */
async function registerInitialActiveTab() {
    try {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tabs.length > 0 && tabs[0].id !== undefined) {
            logger.debug(`Initial check: Active tab is ${tabs[0].id}, url ${tabs[0].url}`);
            await checkAndRegisterTab(tabs[0].id, tabs[0].url);
        } else {
            logger.debug('Initial check: No active tab found in last focused window.');
        }
    } catch (error) {
        logger.error('Error during initial active tab registration:', error);
    }
}

// Call this function when the service worker script is loaded, after ipcClient is initialized.
// This ensures that even if the extension is reloaded or browser starts with an LLM tab open,
// it gets registered.
// Rationale: Connection is already attempted in the constructor. This ensures the active tab is registered
// once the connection is established.
ipcClient.ensureConnected().then(() => registerInitialActiveTab());

logger.info('Service worker script fully loaded and IPCClient instantiated.');
