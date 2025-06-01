/**
 * @file serviceWorker.ts
 * @description Service worker for the ContextWeaver Chrome Extension.
 * Manages IPC client connection to VSCE, handles messages, and background tasks.
 * @module ContextWeaver/CE
 */

const LOG_PREFIX_SW = '[ContextWeaver CE-SW]';

class IPCClient {
    private ws: WebSocket | null = null;
    public port: number = 30001; // Default port
    private connectionPromise: Promise<void> | null = null;
    private resolveConnectionPromise: (() => void) | null = null;
    private rejectConnectionPromise: ((reason?: any) => void) | null = null;
    public isIntentionalDisconnect: boolean = false;
    private pendingRequests: Map<string, { resolve: (value: any) => void, reject: (reason?: any) => void }> = new Map();


    constructor() {
        console.log(LOG_PREFIX_SW, 'IPCClient constructor called.');
        this.loadConfiguration();
        this.connectWithRetry();
    }

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
        console.log(LOG_PREFIX_SW, 'Initializing new connectionPromise.');
        this.connectionPromise = new Promise((resolve, reject) => {
            this.resolveConnectionPromise = resolve;
            this.rejectConnectionPromise = reject;
        });
    }

    public async ensureConnected(): Promise<void> {
        console.log(LOG_PREFIX_SW, 'ensureConnected called.');
        console.log(LOG_PREFIX_SW, `  Current ws state: ${this.ws ? this.ws.readyState : 'null'}`);
        console.log(LOG_PREFIX_SW, `  connectionPromise exists: ${!!this.connectionPromise}`);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log(LOG_PREFIX_SW, 'ensureConnected: Already connected.');
            return Promise.resolve();
        }

        if (!this.connectionPromise ||
            (this.ws && (this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING)) ||
            (!this.resolveConnectionPromise && !this.rejectConnectionPromise)
        ) {
            console.log(LOG_PREFIX_SW, 'ensureConnected: Connection not ready, closed, or promise stale. Re-initiating connectWithRetry.');
            this.connectWithRetry(); // This will re-initialize connectionPromise if needed
        } else {
            console.log(LOG_PREFIX_SW, 'ensureConnected: Waiting on existing connectionPromise.');
        }
        return this.connectionPromise!;
    }


    private connect(): void {
        console.log(LOG_PREFIX_SW, 'connect() called.');
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            console.log(LOG_PREFIX_SW, 'connect: WebSocket connection already open or connecting.');
            if (this.ws.readyState === WebSocket.OPEN && this.resolveConnectionPromise) {
                this.resolveConnectionPromise();
            }
            return;
        }

        if (!this.connectionPromise || (!this.resolveConnectionPromise && !this.rejectConnectionPromise)) {
            this.initializeConnectionPromise();
        }

        const serverUrl = `ws://127.0.0.1:${this.port}`;
        console.log(LOG_PREFIX_SW, `Attempting to connect to VSCE IPC Server at ${serverUrl}`);

        try {
            this.ws = new WebSocket(serverUrl);

            this.ws.onopen = () => {
                console.log(LOG_PREFIX_SW, `Successfully connected to ${serverUrl}`);
                if (this.resolveConnectionPromise) {
                    this.resolveConnectionPromise();
                    this.resolveConnectionPromise = null;
                    this.rejectConnectionPromise = null;
                }
            };

            this.ws.onmessage = (event) => {
                this.handleServerMessage(event.data);
            };

            this.ws.onclose = (event) => {
                const wasIntentional = this.isIntentionalDisconnect;
                this.isIntentionalDisconnect = false;

                if (wasIntentional) {
                    console.log(LOG_PREFIX_SW, `Intentionally disconnected from ${serverUrl}. Code: ${event.code}, Reason: ${event.reason}.`);
                } else {
                    console.warn(LOG_PREFIX_SW, `Disconnected from ${serverUrl}. Code: ${event.code}, Reason: ${event.reason}. Clean: ${event.wasClean}`);
                    chrome.runtime.sendMessage({
                        type: "IPC_CONNECTION_STATUS",
                        payload: { status: "disconnected_unexpectedly", message: `Unexpectedly disconnected from VS Code. Code: ${event.code}, Reason: ${event.reason}. Will attempt to reconnect.` }
                    }).catch(err => console.warn(LOG_PREFIX_SW, "Error sending IPC_CONNECTION_STATUS (disconnected_unexpectedly) message:", err));
                }

                const currentReject = this.rejectConnectionPromise;
                this.ws = null;
                if (currentReject && !wasIntentional) {
                    currentReject(new Error('Connection closed unexpectedly.'));
                    this.resolveConnectionPromise = null;
                    this.rejectConnectionPromise = null;
                }
            };

            this.ws.onerror = (errorEvent) => {
                console.error(LOG_PREFIX_SW, `WebSocket error with ${serverUrl}:`, errorEvent);
                const currentWs = this.ws;
                this.ws = null;

                const currentReject = this.rejectConnectionPromise;
                if (currentReject) {
                    currentReject(new Error('WebSocket error.'));
                    this.resolveConnectionPromise = null;
                    this.rejectConnectionPromise = null;
                }

                if (currentWs && (currentWs.readyState === WebSocket.OPEN || currentWs.readyState === WebSocket.CONNECTING)) {
                    currentWs.close();
                }
                chrome.runtime.sendMessage({
                    type: "IPC_CONNECTION_STATUS",
                    payload: { status: "connection_error", message: `WebSocket error connecting to VS Code. Retrying...` }
                }).catch(err => console.warn(LOG_PREFIX_SW, "Error sending IPC_CONNECTION_STATUS (connection_error) message:", err));
            };
        } catch (error) {
            console.error(LOG_PREFIX_SW, `Error initializing WebSocket connection to ${serverUrl}:`, error);
            const currentReject = this.rejectConnectionPromise;
            if (currentReject) {
                currentReject(error);
                this.resolveConnectionPromise = null;
                this.rejectConnectionPromise = null;
            }
        }
    }

    public connectWithRetry(maxRetries = 5, delay = 3000): void {
        let attempt = 0;
        if (!this.connectionPromise || (!this.resolveConnectionPromise && !this.rejectConnectionPromise)) {
            this.initializeConnectionPromise();
        }

        const tryConnect = () => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                if (this.resolveConnectionPromise) {
                    this.resolveConnectionPromise();
                    this.resolveConnectionPromise = null;
                    this.rejectConnectionPromise = null;
                }
                return;
            }
            attempt++;
            console.log(LOG_PREFIX_SW, `Connection attempt ${attempt}`);
            this.connect();

            this.connectionPromise!
                .then(() => {
                    console.log(LOG_PREFIX_SW, "Connection successful after retry.");
                })
                .catch((error) => {
                    console.error(LOG_PREFIX_SW, `Connection attempt ${attempt} failed:`, error.message);
                    this.initializeConnectionPromise(); // Prepare for next attempt
                    if (attempt < maxRetries) {
                        setTimeout(tryConnect, delay);
                    } else {
                        console.error(LOG_PREFIX_SW, "Max connection retries reached.");
                        if (this.rejectConnectionPromise) {
                            this.rejectConnectionPromise(new Error('Max connection retries reached.'));
                            this.resolveConnectionPromise = null;
                            this.rejectConnectionPromise = null;
                        }
                        chrome.runtime.sendMessage({
                            type: "IPC_CONNECTION_STATUS",
                            payload: { status: "failed_max_retries", message: `Could not connect to VS Code after ${maxRetries} attempts. Please check settings.` }
                        }).catch(err => console.warn(LOG_PREFIX_SW, "Error sending IPC_CONNECTION_STATUS (failed_max_retries) message:", err));
                    }
                });
        };
        tryConnect();
    }

    private handleServerMessage(messageData: any): void {
        try {
            const message = JSON.parse(messageData as string);
            console.log(LOG_PREFIX_SW, 'Received message from server:', message);

            if (message.type === 'response' || message.type === 'error_response') {
                const requestState = this.pendingRequests.get(message.message_id);
                if (requestState) {
                    if (message.payload?.success === false || message.type === 'error_response') {
                        requestState.reject(message.payload || { error: 'Unknown error from server', errorCode: message.payload?.errorCode || 'UNKNOWN_SERVER_ERROR' });
                    } else {
                        requestState.resolve(message.payload); // Entire payload is passed
                    }
                    this.pendingRequests.delete(message.message_id);
                } else {
                    console.warn(LOG_PREFIX_SW, 'Received response for unknown message_id:', message.message_id);
                }
            } else if (message.type === 'push') {
                // Forward the entire message object for push, contentScript will destructure
                chrome.runtime.sendMessage(message).catch(e => console.warn(LOG_PREFIX_SW, "Error broadcasting push message", e));
                if (message.command === 'push_snippet') {
                    console.log(LOG_PREFIX_SW, 'Received snippet push:', message.payload);
                }
            } else {
                console.warn(LOG_PREFIX_SW, 'Received unknown message type from server:', message.type);
            }
        } catch (error) {
            console.error(LOG_PREFIX_SW, 'Error processing server message:', error, 'Raw data:', messageData);
        }
    }

    public async sendRequest(command: string, payload: any = {}): Promise<any> {
        console.log(LOG_PREFIX_SW, `sendRequest: Attempting to send '${command}'. Ensuring connection first.`);
        await this.ensureConnected();

        console.log(LOG_PREFIX_SW, `sendRequest: Post ensureConnected. Current ws state: ${this.ws ? this.ws.readyState : 'null'}`);

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error(LOG_PREFIX_SW, `sendRequest: WebSocket not connected or not open (State: ${this.ws ? this.ws.readyState : 'null'}). Cannot send request '${command}'.`);
            throw new Error('WebSocket not connected.');
        }

        const message_id = crypto.randomUUID();
        const message = {
            protocol_version: "1.0",
            message_id,
            type: "request",
            command,
            payload
        };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(message_id, { resolve, reject });
            try {
                this.ws!.send(JSON.stringify(message));
                console.log(LOG_PREFIX_SW, `Sent request: ${command}`, message);
            } catch (error) {
                console.error(LOG_PREFIX_SW, `Error sending request ${command}:`, error);
                this.pendingRequests.delete(message_id);
                reject(error);
            }
            setTimeout(() => {
                if (this.pendingRequests.has(message_id)) {
                    const pendingRequest = this.pendingRequests.get(message_id);
                    console.warn(LOG_PREFIX_SW, `Request timed out: ${command} (ID: ${message_id})`);
                    pendingRequest?.reject(new Error(`Request ${command} timed out`));
                    this.pendingRequests.delete(message_id);
                }
            }, 30000); // 30 second timeout
        });
    }

    async getWorkspaceDetails(): Promise<any> { return this.sendRequest('get_workspace_details', {}); }
    async getFileTree(workspaceFolderUri: string | null): Promise<any> {
        return this.sendRequest('get_file_tree', { workspaceFolderUri });
    }
    async getFileContent(filePath: string): Promise<any> { return this.sendRequest('get_file_content', { filePath }); }
    async getFolderContent(folderPath: string, workspaceFolderUri: string): Promise<any> { return this.sendRequest('get_folder_content', { folderPath, workspaceFolderUri }); }
    async getEntireCodebase(workspaceFolderUri: string | null): Promise<any> { return this.sendRequest('get_entire_codebase', { workspaceFolderUri }); }
    async getActiveFileInfo(): Promise<any> { return this.sendRequest('get_active_file_info'); }
    async getOpenFiles(): Promise<any> { return this.sendRequest('get_open_files'); }
    async searchWorkspace(query: string, workspaceFolderUri: string | null): Promise<any> { return this.sendRequest('search_workspace', { query, workspaceFolderUri }); }
    async getFilterInfo(workspaceFolderUri: string | null): Promise<any> { return this.sendRequest('get_filter_info'); }


    public isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

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

// --- Message Handling from Content Scripts / UI ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(LOG_PREFIX_SW, 'Message received in service worker:', message, 'from sender:', sender?.tab?.id, sender?.url);

    if (message.type === 'GET_WORKSPACE_DETAILS_FOR_UI') {
        console.log(LOG_PREFIX_SW, 'Handling GET_WORKSPACE_DETAILS_FOR_UI');
        ipcClient.getWorkspaceDetails()
            .then(responsePayload => { // responsePayload is the entire payload from VSCE
                console.log(LOG_PREFIX_SW, 'Response for get_workspace_details:', responsePayload);
                if (responsePayload.success === false) { // Check success flag from VSCE payload
                    sendResponse({ success: false, error: responsePayload.error || 'Failed to get workspace details from VSCE.' });
                } else {
                    sendResponse({ success: true, data: responsePayload.data }); // Pass VSCE's data object directly
                }
            })
            .catch(error => {
                console.error(LOG_PREFIX_SW, 'Error in get_workspace_details IPC call:', error);
                sendResponse({ success: false, error: error.message || 'IPC call failed for get_workspace_details.' });
            });
        return true; // Indicates async response
    } else if (message.type === 'GET_FILE_TREE') {
        const { workspaceFolderUri } = message.payload;
        console.log(LOG_PREFIX_SW, `Handling GET_FILE_TREE for URI: ${workspaceFolderUri}`);
        ipcClient.getFileTree(workspaceFolderUri)
            .then(responsePayload => { // responsePayload is the entire payload from VSCE
                console.log(LOG_PREFIX_SW, 'Response for get_file_tree (raw payload from VSCE):', responsePayload);

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
                        // Pass other relevant top-level fields from VSCE response
                        workspaceFolderName: responsePayload.data.metadata?.workspaceFolderName || responsePayload.workspaceFolderName,
                        filterType: responsePayload.filterType,
                        workspaceFolderUri: responsePayload.workspaceFolderUri
                    });
                } else {
                    sendResponse({ success: false, error: 'Invalid file tree data from VSCE (missing data object or fileTreeString).' });
                }
            })
            .catch(error => {
                console.error(LOG_PREFIX_SW, 'Error in get_file_tree IPC call:', error);
                sendResponse({ success: false, error: error.message || 'IPC call failed for get_file_tree.' });
            });
        return true; // Indicates async response
    } else if (message.type === 'GET_ACTIVE_FILE_INFO') {
        console.log(LOG_PREFIX_SW, 'Handling GET_ACTIVE_FILE_INFO');
        ipcClient.getActiveFileInfo()
            .then(responsePayload => {
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
    } else if (message.type === 'GET_FILE_CONTENT') {
        const { filePath } = message.payload;
        console.log(LOG_PREFIX_SW, `Handling GET_FILE_CONTENT for path: ${filePath}`);
        ipcClient.getFileContent(filePath)
            .then(responsePayload => {
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
    } else if (message.type === 'GET_ENTIRE_CODEBASE') {
        const { workspaceFolderUri } = message.payload;
        console.log(LOG_PREFIX_SW, `Handling GET_ENTIRE_CODEBASE for URI: ${workspaceFolderUri}`);
        ipcClient.getEntireCodebase(workspaceFolderUri)
            .then(responsePayload => { // responsePayload is the entire payload from VSCE
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
                        workspaceFolderName: responsePayload.data.metadata?.workspaceFolderName || responsePayload.workspaceFolderName,
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
    } else if (message.action === 'settingsUpdated') {
        console.log(LOG_PREFIX_SW, 'Settings updated message received. Reloading configuration and reconnecting.');
        ipcClient.loadConfiguration().then(() => {
            ipcClient.disconnect();
            ipcClient.connectWithRetry();
        });
        return false;
    } else if (message.action === 'reconnectIPC') {
        console.log(LOG_PREFIX_SW, 'Received reconnectIPC message. Forcing reconnection.');
        ipcClient.disconnect();
        ipcClient.connectWithRetry();
        return false;
    } else if (message.action === 'getIPCConnectionStatus') {
        console.log(LOG_PREFIX_SW, 'Received request for current IPC status.');
        if (ipcClient.isConnected()) {
            sendResponse({
                type: "IPC_CONNECTION_STATUS",
                payload: { status: "connected", port: ipcClient.port, message: `Currently connected to VS Code on port ${ipcClient.port}.` }
            });
        } else {
            sendResponse({
                type: "IPC_CONNECTION_STATUS",
                payload: { status: "disconnected_unexpectedly", message: "Currently not connected to VS Code." }
            });
        }
        return false;
    } else if (message.type === 'GET_OPEN_FILES_FOR_UI') {
        console.log(LOG_PREFIX_SW, 'Handling GET_OPEN_FILES_FOR_UI');
        ipcClient.getOpenFiles()
            .then(responsePayload => {
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
    } else if (message.type === 'GET_CONTENTS_FOR_SELECTED_OPEN_FILES') {
        const { fileUris } = message.payload as { fileUris: string[] };
        console.log(LOG_PREFIX_SW, `Handling GET_CONTENTS_FOR_SELECTED_OPEN_FILES for URIs:`, fileUris);

        if (!Array.isArray(fileUris) || fileUris.length === 0) {
            sendResponse({ success: false, error: 'No file URIs provided.' });
            return false;
        }

        const fetchPromises = fileUris.map(uri =>
            ipcClient.getFileContent(uri)
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
    } else {
        console.warn(LOG_PREFIX_SW, `Received unhandled message type/action: ${message.type || message.action}`);
        return false;
    }
});


// --- Keep Alive for Service Worker ---
let keepAliveIntervalId: number | undefined;

function startKeepAlive() {
    if (keepAliveIntervalId !== undefined) return;
    keepAliveIntervalId = setInterval(() => {
        if (chrome.runtime && chrome.runtime.getPlatformInfo) {
            chrome.runtime.getPlatformInfo().then(_info => {
                // console.log(LOG_PREFIX_SW, 'Keep-alive ping, platform:', info.os);
            }).catch(_e => {
                // console.warn(LOG_PREFIX_SW, "Keep-alive: runtime not available, stopping.", e);
            });
        } else {
            // console.warn(LOG_PREFIX_SW, "Keep-alive: chrome.runtime or getPlatformInfo not available, stopping.");
        }
    }, 20 * 1000);
    console.log(LOG_PREFIX_SW, "Keep-alive interval started.");
}

function stopKeepAlive() {
    if (keepAliveIntervalId !== undefined) {
        clearInterval(keepAliveIntervalId);
        keepAliveIntervalId = undefined;
        console.log(LOG_PREFIX_SW, "Keep-alive interval stopped.");
    }
}

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

console.log(LOG_PREFIX_SW, 'Service worker script fully loaded and IPCClient instantiated.');