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
    GetFilterInfoRequestPayload, ListFolderContentsRequestPayload, GetWorkspaceProblemsRequestPayload,
    // Response Payloads (for resolving promises)
    GenericAckResponsePayload, FileTreeResponsePayload, FileContentResponsePayload,
    FolderContentResponsePayload, EntireCodebaseResponsePayload, ActiveFileInfoResponsePayload,
    OpenFilesResponsePayload, SearchWorkspaceResponsePayload, WorkspaceDetailsResponsePayload,
    FilterInfoResponsePayload, ListFolderContentsResponsePayload, WorkspaceProblemsResponsePayload, ErrorResponsePayload,
    // Push Payloads
    PushSnippetPayload,
    // IPC Message Structure Types
    IPCMessageRequest, IPCMessagePush, AnyIPCMessage, IPCBaseMessage
} from '@contextweaver/shared';

const LOG_PREFIX_SW = '[ContextWeaver CE-SW]';

/**
 * Manages the WebSocket client connection to the VS Code Extension (VSCE) IPC server.
 * Handles sending requests, receiving responses, and managing connection state.
 */
class IPCClient {
    private ws: WebSocket | null = null;
    private readonly primaryPort: number = 30001; // Fixed primary port
    public port: number = 30001; // Current port being used
    private connectionPromise: Promise<void> | null = null;
    private resolveConnectionPromise: (() => void) | null = null;
    private rejectConnectionPromise: ((reason?: any) => void) | null = null;
    public isIntentionalDisconnect: boolean = false;
    // Correctly type the pendingRequests map
    private pendingRequests: Map<string, { resolve: (value: any) => void, reject: (reason?: any) => void }> = new Map();


    /**
     * Creates an instance of IPCClient.
     * Loads configuration and attempts to connect to the VSCE IPC server.
     */
    constructor() {
        console.log(LOG_PREFIX_SW, 'IPCClient constructor called.');
        this.loadConfiguration();
        this.connectWithRetry();
    }

    /**
     * Loads the IPC port configuration from Chrome storage.
     */
    public async loadConfiguration(): Promise<void> {
        try {
            const result = await chrome.storage.sync.get(['ipcPort', 'ipcToken']);
            this.port = result.ipcPort || 30001;
            console.log(LOG_PREFIX_SW, `Configuration loaded: Port=${this.port}`);
        } catch (error) {
            console.error(LOG_PREFIX_SW, 'Error loading configuration:', error);
            this.port = 30001;
        }
    }

    private initializeConnectionPromise() {
        // Only create a new promise if one isn't already pending resolution/rejection
        if (!this.connectionPromise || (this.resolveConnectionPromise === null && this.rejectConnectionPromise === null)) {
            console.log(LOG_PREFIX_SW, 'Initializing new connectionPromise.');
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
        console.log(LOG_PREFIX_SW, 'ensureConnected called.');
        console.log(LOG_PREFIX_SW, `  Current ws state: ${this.ws ? this.ws.readyState : 'null'}`);
        console.log(LOG_PREFIX_SW, `  connectionPromise exists: ${!!this.connectionPromise}, resolve: ${!!this.resolveConnectionPromise}, reject: ${!!this.rejectConnectionPromise}`);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log(LOG_PREFIX_SW, 'ensureConnected: Already connected.');
            return Promise.resolve();
        }

        // If there's no active WebSocket, or it's closing/closed,
        // or if there's no pending connection promise, initiate connection.
        if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING || !this.connectionPromise) {
            console.log(LOG_PREFIX_SW, 'ensureConnected: Connection not ready or promise stale. Re-initiating connectWithRetry.');
            this.connectWithRetry(); // This will call initializeConnectionPromise if needed
        } else {
            console.log(LOG_PREFIX_SW, 'ensureConnected: Waiting on existing connectionPromise.');
        }

        return this.connectionPromise!; // Return the current or newly created promise
    }


    private connect(): void { // This method attempts a single connection
        console.log(LOG_PREFIX_SW, 'connect() called.');
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            console.log(LOG_PREFIX_SW, 'connect: WebSocket connection already open or connecting.');
            if (this.ws.readyState === WebSocket.OPEN && this.resolveConnectionPromise) {
                this.resolveConnectionPromise(); // Resolve if already open and promise was pending
                this.resolveConnectionPromise = null;
                this.rejectConnectionPromise = null;
            }
            return;
        }

        // Ensure a promise exists for this attempt
        this.initializeConnectionPromise();

        const serverUrl = `ws://127.0.0.1:${this.port}`;
        console.log(LOG_PREFIX_SW, `Attempting to connect to VSCE IPC Server at ${serverUrl}`);

        try {
            this.ws = new WebSocket(serverUrl);

            this.ws.onopen = () => {
                console.log(LOG_PREFIX_SW, `Successfully connected to ${serverUrl}`);
                if (this.resolveConnectionPromise) {
                    this.resolveConnectionPromise();
                }
                // Nullify promise handlers after resolution/rejection
                this.resolveConnectionPromise = null;
                this.rejectConnectionPromise = null;
            };

            this.ws.onmessage = (event) => {
                this.handleServerMessage(event.data);
            };

            this.ws.onclose = (event) => {
                const wasIntentional = this.isIntentionalDisconnect;
                this.isIntentionalDisconnect = false; // Reset flag

                const reason = `Disconnected from ${serverUrl}. Code: ${event.code}, Reason: ${event.reason}. Clean: ${event.wasClean}`;
                if (wasIntentional) {
                    console.log(LOG_PREFIX_SW, `Intentionally ${reason}`);
                } else {
                    console.warn(LOG_PREFIX_SW, `Unintentionally ${reason}`);
                    // Notify UI about unexpected disconnect
                    chrome.runtime.sendMessage({
                        type: 'IPC_CONNECTION_STATUS',
                        payload: { status: 'disconnected_unexpectedly', message: `Unexpectedly disconnected from VS Code. Code: ${event.code}, Reason: ${event.reason}. Will attempt to reconnect.` }
                    }).catch(err => console.warn(LOG_PREFIX_SW, 'Error sending IPC_CONNECTION_STATUS (disconnected_unexpectedly) message:', err));
                }

                const currentReject = this.rejectConnectionPromise;
                this.ws = null; // Clear WebSocket instance

                if (currentReject && !wasIntentional) {
                    currentReject(new Error(`Connection closed unexpectedly. ${reason}`));
                }
                // Nullify promise handlers after resolution/rejection
                this.resolveConnectionPromise = null;
                this.rejectConnectionPromise = null;
                // Do NOT re-initialize connectionPromise here, connectWithRetry will handle it.
            };

            this.ws.onerror = (errorEvent) => {
                const errorMsg = `WebSocket error with ${serverUrl}: ${errorEvent.type}`;
                console.error(LOG_PREFIX_SW, errorMsg, errorEvent);

                const currentWs = this.ws; // Capture current ws before nulling
                this.ws = null; // Clear WebSocket instance

                const currentReject = this.rejectConnectionPromise;
                if (currentReject) {
                    currentReject(new Error(`WebSocket error. ${errorMsg}`));
                }
                // Nullify promise handlers
                this.resolveConnectionPromise = null;
                this.rejectConnectionPromise = null;

                if (currentWs && (currentWs.readyState === WebSocket.OPEN || currentWs.readyState === WebSocket.CONNECTING)) {
                    currentWs.close(); // Attempt to clean up the problematic socket
                }
                chrome.runtime.sendMessage({
                    type: 'IPC_CONNECTION_STATUS',
                    payload: { status: 'connection_error', message: 'WebSocket error connecting to VS Code. Retrying...' }
                }).catch(err => console.warn(LOG_PREFIX_SW, 'Error sending IPC_CONNECTION_STATUS (connection_error) message:', err));
                // Do NOT re-initialize connectionPromise here, connectWithRetry will handle it.
            };
        } catch (error) {
            const errorMsg = `Error initializing WebSocket connection to ${serverUrl}: ${error}`;
            console.error(LOG_PREFIX_SW, errorMsg);
            const currentReject = this.rejectConnectionPromise;
            if (currentReject) {
                currentReject(new Error(errorMsg));
            }
            this.resolveConnectionPromise = null;
            this.rejectConnectionPromise = null;
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
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // If already connected (e.g., by a concurrent call or previous success), resolve.
                if (this.resolveConnectionPromise) {
                    this.resolveConnectionPromise();
                    this.resolveConnectionPromise = null;
                    this.rejectConnectionPromise = null;
                }
                return;
            }
            attempt++;
            console.log(LOG_PREFIX_SW, `Connection attempt ${attempt}`);

            this.connect(); // This attempts one connection and uses/resolves/rejects this.connectionPromise

            this.connectionPromise!
                .then(() => {
                    console.log(LOG_PREFIX_SW, 'Connection successful after retry.');
                    // Promise already resolved by connect()'s onopen
                })
                .catch((error) => { // This catch is for the current attempt's promise
                    console.error(LOG_PREFIX_SW, `Connection attempt ${attempt} failed:`, error.message);

                    // Prepare for the next attempt by ensuring a new promise can be created
                    this.resolveConnectionPromise = null;
                    this.rejectConnectionPromise = null;
                    this.connectionPromise = null; // Allow initializeConnectionPromise to create a new one

                    if (attempt < maxRetries) {
                        setTimeout(tryConnect, delay);
                    } else {
                        // Initialize new promise for final rejection
                        this.initializeConnectionPromise();
                        const maxRetriesError = new Error('Max connection retries reached.');
                        console.error(LOG_PREFIX_SW, maxRetriesError.message);
                        // Type assertion to help TypeScript understand the property is not null after initializeConnectionPromise
                        const rejectFn = this.rejectConnectionPromise as ((reason?: any) => void) | null;
                        if (rejectFn) { // Use the newly initialized promise's reject
                            rejectFn(maxRetriesError);
                        }
                        this.resolveConnectionPromise = null;
                        this.rejectConnectionPromise = null;
                        chrome.runtime.sendMessage({
                            type: 'IPC_CONNECTION_STATUS',
                            payload: { status: 'failed_max_retries', message: `Could not connect to VS Code primary server after ${maxRetries} attempts. Please ensure VS Code is running with ContextWeaver extension.` }
                        }).catch(err => console.warn(LOG_PREFIX_SW, 'Error sending IPC_CONNECTION_STATUS (failed_max_retries) message:', err));
                    }
                });
        };
        tryConnect();
    }

    private handleServerMessage(messageData: any): void {
        console.log(LOG_PREFIX_SW, 'handleServerMessage: Raw data received from server:', messageData);

        try {
            const message = JSON.parse(messageData as string) as AnyIPCMessage; // Use shared umbrella type
            console.log(LOG_PREFIX_SW, 'handleServerMessage: Parsed message from server:', message);

            if (message.type === 'response' || message.type === 'error_response') {
                const requestState = this.pendingRequests.get(message.message_id);
                if (requestState) {
                    if (message.type === 'error_response' || (message.payload as any)?.success === false) {
                        // Ensure payload is treated as ErrorResponsePayload or a success:false response
                        const errorPayload = message.payload as ErrorResponsePayload | { success: false, error: string, errorCode: string };
                        console.warn(LOG_PREFIX_SW, `Error response for message_id ${message.message_id}:`, errorPayload);
                        requestState.reject(errorPayload); // Reject with the full error payload
                    } else {
                        // The resolve function in pendingRequests now expects the specific TResPayload type
                        requestState.resolve(message.payload); // message.payload is already the correct TResPayload
                    }
                    this.pendingRequests.delete(message.message_id);
                } else {
                    console.warn(LOG_PREFIX_SW, 'handleServerMessage: Received response for unknown message_id:', message.message_id);
                }
            } else if (message.type === 'push') {
                const pushMessage = message as IPCMessagePush; // Narrow down to IPCPush
                console.log(LOG_PREFIX_SW, `handleServerMessage: Detected 'push' message type. Command: ${pushMessage.command}`);

                if (pushMessage.command === 'push_snippet') {
                    const snippetPayload = pushMessage.payload as PushSnippetPayload; // Typed payload
                    console.log(LOG_PREFIX_SW, `handleServerMessage: Broadcasting 'push_snippet' to all LLM tabs.`);

                    // Query for all tabs matching supported LLM host permissions
                    chrome.tabs.query({
                        url: [
                            "*://gemini.google.com/*",
                            "*://chatgpt.com/*",
                            "*://claude.ai/*",
                            "*://aistudio.google.com/*",
                            "*://chat.deepseek.com/*"
                        ]
                    }).then(tabs => {
                        console.log(LOG_PREFIX_SW, `Found ${tabs.length} LLM tabs to send snippet to`);

                        // Send the snippet message to each tab
                        tabs.forEach(tab => {
                            if (tab.id) {
                                chrome.tabs.sendMessage(tab.id, pushMessage)
                                    .then(() => {
                                        if (chrome.runtime.lastError) {
                                            console.warn(LOG_PREFIX_SW, `Error sending push_snippet to tab ${tab.id}: ${chrome.runtime.lastError.message}`);
                                        } else {
                                            console.log(LOG_PREFIX_SW, `Successfully sent push_snippet to tab ${tab.id}`);
                                        }
                                    })
                                    .catch(e => {
                                        console.warn(LOG_PREFIX_SW, `Error sending push_snippet message to tab ${tab.id}:`, e);
                                    });
                            }
                        });
                    }).catch(e => {
                        console.error(LOG_PREFIX_SW, 'Error querying tabs for push_snippet broadcast:', e);
                    });
                } else {
                    // For other potential push messages
                    console.log(LOG_PREFIX_SW, `handleServerMessage: Forwarding generic push message to all listeners. Command: ${pushMessage.command}`);
                    chrome.runtime.sendMessage(pushMessage).catch(e => console.warn(LOG_PREFIX_SW, 'Error broadcasting generic push message:', e));
                }
            } else {
                console.warn(LOG_PREFIX_SW, 'handleServerMessage: Received unknown message type from server:', (message as any).type);
            }
        } catch (error) {
            console.error(LOG_PREFIX_SW, 'handleServerMessage: Error processing server message:', error, 'Raw data:', messageData);
        }
    }

    /**
     * Sends a request to the VSCE IPC server and waits for a response.
     * Ensures connection before sending the request.
     * @param command The command to send to the VSCE.
     * @param payload The payload for the command.
     * @returns A Promise that resolves with the response payload from the VSCE.
     * @template TReqPayload The type of the request payload.
     * @template TResPayload The type of the expected response payload.
     */
    public async sendRequest<TReqPayload, TResPayload>(
        command: IPCMessageRequest['command'], // Use the command union type
        payload: TReqPayload
    ): Promise<TResPayload> { // Return the specific expected response payload
        console.log(LOG_PREFIX_SW, `sendRequest: Attempting to send '${command}'. Ensuring connection first.`);
        await this.ensureConnected();

        console.log(LOG_PREFIX_SW, `sendRequest: Post ensureConnected. Current ws state: ${this.ws ? this.ws.readyState : 'null'}`);

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error(LOG_PREFIX_SW, `sendRequest: WebSocket not connected or not open (State: ${this.ws ? this.ws.readyState : 'null'}). Cannot send request '${command}'.`);
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
                console.log(LOG_PREFIX_SW, `Sent request: ${command}`, message);
            } catch (error) {
                console.error(LOG_PREFIX_SW, `Error sending request ${command}:`, error);
                this.pendingRequests.delete(message_id);
                reject(error);
            }
            // Timeout logic remains the same
            setTimeout(() => {
                if (this.pendingRequests.has(message_id)) {
                    const pendingRequest = this.pendingRequests.get(message_id);
                    const timeoutError = new Error(`IPC_REQUEST_TIMEOUT: Request ${command} (ID: ${message_id}) timed out`);
                    console.warn(LOG_PREFIX_SW, timeoutError.message);
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
            console.log(LOG_PREFIX_SW, 'disconnect() called, closing WebSocket.');
            this.ws.close();
        } else {
            console.log(LOG_PREFIX_SW, 'disconnect() called, but no active WebSocket.');
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

// --- Message Handling from Content Scripts / UI ---
chrome.runtime.onMessage.addListener((message: IncomingRuntimeMessage, sender, sendResponse) => {
    console.log(LOG_PREFIX_SW, 'Message received in service worker:', message, 'from sender:', sender?.tab?.id, sender?.url);

    if ('type' in message) { // Handle messages from contentScript (via serviceWorkerClient) or direct IPC pushes
        const typedMessage = message as SWApiRequestMessage | IPCMessagePush; // Type assertion for this block

        if (typedMessage.type === 'push') { // Handle direct IPC pushes (e.g., snippets)
            const pushMessage = typedMessage as IPCMessagePush;
            if (pushMessage.command === 'push_snippet') {
                const snippetPayload = pushMessage.payload as PushSnippetPayload;
                if (snippetPayload && snippetPayload.targetTabId) {
                    const targetTabId = snippetPayload.targetTabId;
                    console.log(LOG_PREFIX_SW, `handleServerMessage: Forwarding 'push_snippet' to specific tabId: ${targetTabId}.`);
                    chrome.tabs.sendMessage(targetTabId, pushMessage)
                        .then(() => {
                            if (chrome.runtime.lastError) {
                                console.warn(LOG_PREFIX_SW, `Error sending push_snippet to tab ${targetTabId}: ${chrome.runtime.lastError.message}`);
                            } else {
                                // console.log(LOG_PREFIX_SW, `Push_snippet message sent to tab ${targetTabId}, response from content script (if any):`, response);
                            }
                        })
                        .catch(e => {
                            console.warn(LOG_PREFIX_SW, `Error explicitly sending push_snippet message to tab ${targetTabId}:`, e);
                        });
                    console.log(LOG_PREFIX_SW, 'handleServerMessage: Specifically received and processed push_snippet, attempted to send to tab:', snippetPayload);
                } else {
                    console.warn(LOG_PREFIX_SW, 'handleServerMessage: \'push_snippet\' received without targetTabId. Payload:', snippetPayload);
                    chrome.runtime.sendMessage(pushMessage).catch(e => console.warn(LOG_PREFIX_SW, 'Error broadcasting push_snippet (fallback):', e));
                }
            } else {
                console.log(LOG_PREFIX_SW, `handleServerMessage: Forwarding generic push message to all listeners. Command: ${pushMessage.command}`);
                chrome.runtime.sendMessage(pushMessage).catch(e => console.warn(LOG_PREFIX_SW, 'Error broadcasting generic push message:', e));
            }
        } else if (typedMessage.type === 'GET_WORKSPACE_DETAILS_FOR_UI') {
            console.log(LOG_PREFIX_SW, 'Handling GET_WORKSPACE_DETAILS_FOR_UI');
            ipcClient.getWorkspaceDetails()
                .then((responsePayload: WorkspaceDetailsResponsePayload) => { // Explicitly type here for clarity
                    console.log(LOG_PREFIX_SW, 'Response for get_workspace_details:', responsePayload);
                    // The responsePayload is already correctly typed due to IPCClient method's return type
                    sendResponse(responsePayload); // Send the whole typed payload back
                })
                .catch(error => {
                    console.error(LOG_PREFIX_SW, 'Error in get_workspace_details IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for get_workspace_details.' });
                });
            return true; // Indicates async response
        } else if (typedMessage.type === 'GET_FileTree') {
            const payload = typedMessage.payload as GetFileTreeRequestPayload;
            console.log(LOG_PREFIX_SW, `Handling GET_FileTree for URI: ${payload.workspaceFolderUri}`);
            ipcClient.getFileTree(payload.workspaceFolderUri)
                .then((responsePayload: FileTreeResponsePayload) => { // responsePayload is the entire payload from VSCE
                    console.log(LOG_PREFIX_SW, 'Response for get_FileTree (raw payload from VSCE):', responsePayload);

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
                    console.error(LOG_PREFIX_SW, 'Error in get_FileTree IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for get_FileTree.' });
                });
            return true; // Indicates async response
        } else if (typedMessage.type === 'GET_ACTIVE_FILE_INFO') {
            console.log(LOG_PREFIX_SW, 'Handling GET_ACTIVE_FILE_INFO');
            ipcClient.getActiveFileInfo()
                .then((responsePayload: ActiveFileInfoResponsePayload) => {
                    console.log(LOG_PREFIX_SW, 'Response for get_active_file_info:', responsePayload);
                    if (responsePayload.success === false) {
                        sendResponse({ success: false, error: responsePayload.error || 'Failed to get active file info from VSCE.' });
                    } else {
                        sendResponse({ success: true, data: responsePayload.data });
                    }
                })
                .catch(error => {
                    console.error(LOG_PREFIX_SW, 'Error in get_active_file_info IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for get_active_file_info.' });
                });
            return true;
        } else if (typedMessage.type === 'GET_FILE_CONTENT') {
            const payload = typedMessage.payload as GetFileContentRequestPayload;
            console.log(LOG_PREFIX_SW, `Handling GET_FILE_CONTENT for path: ${payload.filePath}`);
            ipcClient.getFileContent(payload.filePath)
                .then((responsePayload: FileContentResponsePayload) => {
                    console.log(LOG_PREFIX_SW, 'Response for get_file_content:', responsePayload);
                    if (responsePayload.success === false) {
                        sendResponse({ success: false, error: responsePayload.error || 'Failed to get file content from VSCE.' });
                    } else {
                        sendResponse({ success: true, data: responsePayload.data });
                    }
                })
                .catch(error => {
                    console.error(LOG_PREFIX_SW, 'Error in get_file_content IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for get_file_content.' });
                });
            return true;
        } else if (typedMessage.type === 'GET_ENTIRE_CODEBASE') {
            const payload = typedMessage.payload as GetEntireCodebaseRequestPayload;
            console.log(LOG_PREFIX_SW, `Handling GET_ENTIRE_CODEBASE for URI: ${payload.workspaceFolderUri}`);
            ipcClient.getEntireCodebase(payload.workspaceFolderUri)
                .then((responsePayload: EntireCodebaseResponsePayload) => { // responsePayload is the entire payload from VSCE
                    console.log(LOG_PREFIX_SW, 'Response for get_entire_codebase (raw payload from VSCE):', responsePayload);
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
                    console.error(LOG_PREFIX_SW, 'Error in get_entire_codebase IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for get_entire_codebase.' });
                });
            return true; // Indicates async response
        } else if (typedMessage.type === 'GET_OPEN_FILES_FOR_UI') {
            console.log(LOG_PREFIX_SW, 'Handling GET_OPEN_FILES_FOR_UI');
            ipcClient.getOpenFiles()
                .then((responsePayload: OpenFilesResponsePayload) => {
                    console.log(LOG_PREFIX_SW, 'Response for get_open_files:', responsePayload);
                    if (responsePayload.success === false) {
                        sendResponse({ success: false, error: responsePayload.error || 'Failed to get open files list from VSCE.' });
                    } else {
                        sendResponse({ success: true, data: responsePayload.data });
                    }
                })
                .catch(error => {
                    console.error(LOG_PREFIX_SW, 'Error in get_open_files IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for get_open_files.' });
                });
            return true;
        } else if (typedMessage.type === 'GET_CONTENTS_FOR_SELECTED_OPEN_FILES') {
            // This message type is internal to CE, not a direct IPC command.
            // Its payload is an array of file URIs.
            const fileUris = typedMessage.payload.fileUris as string[]; // Corrected: fileUris
            console.log(LOG_PREFIX_SW, 'Handling GET_CONTENTS_FOR_SELECTED_OPEN_FILES for URIs:', fileUris);

            if (!Array.isArray(fileUris) || fileUris.length === 0) {
                sendResponse({ success: false, error: 'No file URIs provided.' });
                return false;
            }

            const fetchPromises = fileUris.map(uri =>
                ipcClient.getFileContent(uri) // This call is now typed
                    .then(responsePayload => {
                        if (responsePayload.success === false || !responsePayload.data || !responsePayload.data.fileData) {
                            console.warn(LOG_PREFIX_SW, `Failed to get content for ${uri}: ${responsePayload.error || 'No fileData'}`);
                            return { uri, success: false, error: responsePayload.error || 'Failed to retrieve content.', fileData: null, metadata: null };
                        }
                        return {
                            uri,
                            success: true,
                            fileData: responsePayload.data.fileData,
                            metadata: responsePayload.data.metadata || null
                        };
                    })
                    .catch(error => {
                        console.error(LOG_PREFIX_SW, `Error fetching content for ${uri}:`, error);
                        return { uri, success: false, error: error.message || 'IPC call failed.', fileData: null, metadata: null };
                    })
            );

            Promise.all(fetchPromises)
                .then(results => {
                    const successfulFilesData = results.filter(r => r.success).map(r => ({ fileData: r.fileData, metadata: r.metadata }));
                    const erroredFiles = results.filter(r => !r.success).map(r => ({ uri: r.uri, error: r.error }));

                    console.log(LOG_PREFIX_SW, `Processed selected files. Success: ${successfulFilesData.length}, Errors: ${erroredFiles.length}`);
                    sendResponse({
                        success: true,
                        data: successfulFilesData,
                        errors: erroredFiles
                    });
                })
                .catch(error => {
                    console.error(LOG_PREFIX_SW, 'Unexpected error in Promise.all for GET_CONTENTS_FOR_SELECTED_OPEN_FILES:', error);
                    sendResponse({ success: false, error: error.message || 'Failed to process multiple file content requests.' });
                });
            return true;
        } else if (typedMessage.type === 'GET_FOLDER_CONTENT') {
            const payload = typedMessage.payload as GetFolderContentRequestPayload;
            console.log(LOG_PREFIX_SW, `Handling GET_FOLDER_CONTENT for path: ${payload.folderPath}`);
            ipcClient.getFolderContent(payload.folderPath, payload.workspaceFolderUri)
                .then((responsePayload: FolderContentResponsePayload) => {
                    console.log(LOG_PREFIX_SW, 'Response for get_folder_content:', responsePayload);
                    if (responsePayload.success === false) {
                        sendResponse({ success: false, error: responsePayload.error || 'Failed to get folder content from VSCE.' });
                    } else {
                        sendResponse({ success: true, data: responsePayload.data });
                    }
                })
                .catch(error => {
                    console.error(LOG_PREFIX_SW, 'Error in get_folder_content IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for get_folder_content.' });
                });
            return true;
        } else if (typedMessage.type === 'LIST_FOLDER_CONTENTS') {
            const payload = typedMessage.payload as ListFolderContentsRequestPayload;
            console.log(LOG_PREFIX_SW, `Handling LIST_FOLDER_CONTENTS for URI: ${payload.folderUri}, Workspace: ${payload.workspaceFolderUri}`);
            ipcClient.listFolderContents(payload.folderUri, payload.workspaceFolderUri)
                .then((responsePayload: ListFolderContentsResponsePayload) => {
                    console.log(LOG_PREFIX_SW, 'Response for list_folder_contents:', responsePayload);
                    if (responsePayload.success === false) {
                        sendResponse({ success: false, error: responsePayload.error || 'Failed to get folder contents from VSCE.' });
                    } else {
                        sendResponse({ success: true, data: responsePayload.data });
                    }
                })
                .catch(error => {
                    console.error(LOG_PREFIX_SW, 'Error in list_folder_contents IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for list_folder_contents.' });
                });
            return true;
        } else if (typedMessage.type === 'SEARCH_WORKSPACE') {
            const payload = typedMessage.payload as SearchWorkspaceRequestPayload;
            console.log(LOG_PREFIX_SW, `Handling SEARCH_WORKSPACE for query: "${payload.query}", folder: ${payload.workspaceFolderUri}`);
            ipcClient.searchWorkspace(payload.query, payload.workspaceFolderUri)
                .then((responsePayload: SearchWorkspaceResponsePayload) => {
                    console.log(LOG_PREFIX_SW, 'Response for search_workspace:', responsePayload);
                    if (responsePayload.success === false) {
                        sendResponse({ success: false, error: responsePayload.error || 'Failed to get search results from VSCE.' });
                    } else {
                        sendResponse({ success: true, data: responsePayload.data });
                    }
                })
                .catch(error => {
                    console.error(LOG_PREFIX_SW, 'Error in search_workspace IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for search_workspace.' });
                });
            return true;
        } else if (typedMessage.type === 'GET_WORKSPACE_PROBLEMS') {
            const payload = typedMessage.payload as GetWorkspaceProblemsRequestPayload;
            console.log(LOG_PREFIX_SW, `Handling GET_WORKSPACE_PROBLEMS for URI: ${payload.workspaceFolderUri}`);
            ipcClient.getWorkspaceProblems(payload.workspaceFolderUri)
                .then((responsePayload: WorkspaceProblemsResponsePayload) => {
                    console.log(LOG_PREFIX_SW, 'Response for get_workspace_problems:', responsePayload);
                    sendResponse(responsePayload); // Forward the full payload
                })
                .catch(error => {
                    console.error(LOG_PREFIX_SW, 'Error in get_workspace_problems IPC call:', error);
                    sendResponse({ success: false, error: error.message || 'IPC call failed for get_workspace_problems.' });
                });
            return true;
        } else {
            console.warn(LOG_PREFIX_SW, `Received unhandled message type: ${typedMessage.type}`);
            return false;
        }
    } else if ('action' in message) { // Handle messages from options/popup pages
        const optionsMessage = message as OptionsPageMessage;
        if (optionsMessage.action === 'settingsUpdated') {
            console.log(LOG_PREFIX_SW, 'Settings updated message received. Reloading configuration and reconnecting.');
            ipcClient.loadConfiguration().then(() => {
                ipcClient.disconnect();
                ipcClient.connectWithRetry();
            });
            return false;
        } else if (optionsMessage.action === 'reconnectIPC') {
            console.log(LOG_PREFIX_SW, 'Received reconnectIPC message. Forcing reconnection.');
            // This message is from options.ts, which also handles its own status updates.
            // No need to send IPC_CONNECTION_STATUS from here immediately, as options.ts expects it from the SW's
            // onclose/onerror/onopen handlers.
            ipcClient.disconnect();
            ipcClient.connectWithRetry();
            return false;
        } else if (optionsMessage.action === 'getIPCConnectionStatus') {
            console.log(LOG_PREFIX_SW, 'Received request for current IPC status.');
            if (ipcClient.isConnected()) {
                sendResponse({
                    action: 'ipcConnectionStatus', // Echo action for options.ts listener
                    status: 'connected',
                    port: ipcClient.port,
                    message: `Currently connected to VS Code on port ${ipcClient.port}.`
                });
            } else {
                sendResponse({
                    action: 'ipcConnectionStatus', // Echo action for options.ts listener
                    status: 'disconnected_unexpectedly',
                    message: 'Currently not connected to VS Code.'
                });
            }
            return false;
        }
    }

    console.warn(LOG_PREFIX_SW, 'Received unhandled message:', message);
    return false;
});


// --- Keep Alive for Service Worker ---
let keepAliveIntervalId: number | undefined;

function startKeepAlive() {
    if (keepAliveIntervalId !== undefined) return;
    keepAliveIntervalId = setInterval(() => {
        if (chrome.runtime && chrome.runtime.getPlatformInfo) {
            chrome.runtime.getPlatformInfo().then(() => {
                // console.log(LOG_PREFIX_SW, 'Keep-alive ping, platform:', info.os);
            }).catch(() => {
                // console.warn(LOG_PREFIX_SW, "Keep-alive: runtime not available, stopping.", e);
            });
        } else {
            // console.warn(LOG_PREFIX_SW, "Keep-alive: chrome.runtime or getPlatformInfo not available, stopping.");
        }
    }, 20 * 1000);
    console.log(LOG_PREFIX_SW, 'Keep-alive interval started.');
}

// function stopKeepAlive() {  // Currently unused, kept for future use
//     if (keepAliveIntervalId !== undefined) {
//         clearInterval(keepAliveIntervalId);
//         keepAliveIntervalId = undefined;
//         console.log(LOG_PREFIX_SW, 'Keep-alive interval stopped.');
//     }
// }

// --- Lifecycle Event Listeners ---
chrome.runtime.onStartup.addListener(async () => {
    console.log(LOG_PREFIX_SW, 'Extension started up via onStartup.');
    await ipcClient.loadConfiguration();
    ipcClient.connectWithRetry();
    startKeepAlive();
});

chrome.runtime.onInstalled.addListener(async (details) => {
    console.log(LOG_PREFIX_SW, `Extension installed/updated: ${details.reason}`);
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        chrome.runtime.openOptionsPage();
    }
    await ipcClient.loadConfiguration();
    ipcClient.connectWithRetry();
    startKeepAlive();
});

// Initial load actions
if (typeof keepAliveIntervalId === 'undefined') {
    console.log(LOG_PREFIX_SW, 'Service worker script loaded, starting keep-alive.');
    startKeepAlive();
}

if (!ipcClient.isConnected()) {
    console.log(LOG_PREFIX_SW, 'Service worker script loaded, attempting initial connection (if not already handled by startup/install).');
    ipcClient.loadConfiguration().then(() => {
        ipcClient.connectWithRetry();
    });
}

const SUPPORTED_LLM_HOST_SUFFIXES = [
    'gemini.google.com',
    'chatgpt.com',
    'claude.ai',
    'chat.deepseek.com'
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
            console.warn(LOG_PREFIX_SW, `Error getting tab info for tabId ${tabId}:`, error);
            return; // Cannot get tab info
        }
    }

    try {
        const url = new URL(currentTabUrl);
        const host = url.hostname;

        const isSupportedLLM = SUPPORTED_LLM_HOST_SUFFIXES.some(suffix => host.endsWith(suffix));

        if (isSupportedLLM) {
            console.log(LOG_PREFIX_SW, `Supported LLM tab identified: ID ${tabId}, Host ${host}. Registering with VSCE.`);
            await ipcClient.sendRequest<RegisterActiveTargetRequestPayload, GenericAckResponsePayload>(
                'register_active_target',
                { tabId: tabId, llmHost: host }
            );
            console.log(LOG_PREFIX_SW, `Registration request sent for tabId ${tabId}, host ${host}.`);
        } else {
            // console.log(LOG_PREFIX_SW, `Tab ${tabId} (${host}) is not a supported LLM host.`);
        }
    } catch (error) {
        console.warn(LOG_PREFIX_SW, `Error processing tab URL '${currentTabUrl}' for registration:`, error);
    }
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log(LOG_PREFIX_SW, `Tab activated: tabId ${activeInfo.tabId}`);
    await checkAndRegisterTab(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        console.log(LOG_PREFIX_SW, `Tab updated and complete: tabId ${tabId}, url ${tab.url}`);
        await checkAndRegisterTab(tabId, tab.url);
    } else if (changeInfo.url) {
        console.log(LOG_PREFIX_SW, `Tab URL changed: tabId ${tabId}, new url ${changeInfo.url}`);
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
            console.log(LOG_PREFIX_SW, `Initial check: Active tab is ${tabs[0].id}, url ${tabs[0].url}`);
            await checkAndRegisterTab(tabs[0].id, tabs[0].url);
        } else {
            console.log(LOG_PREFIX_SW, 'Initial check: No active tab found in last focused window.');
        }
    } catch (error) {
        console.error(LOG_PREFIX_SW, 'Error during initial active tab registration:', error);
    }
}

// Call this function when the service worker script is loaded, after ipcClient is initialized.
// This ensures that even if the extension is reloaded or browser starts with an LLM tab open,
// it gets registered.
ipcClient.loadConfiguration().then(() => {
    ipcClient.connectWithRetry();
    registerInitialActiveTab(); // Call after ipcClient is ready and attempting connection
});

console.log(LOG_PREFIX_SW, 'Service worker script fully loaded and IPCClient instantiated.');
