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
    public isIntentionalDisconnect: boolean = false; // Made public for settings update handler
    private pendingRequests: Map<string, { resolve: (value: any) => void, reject: (reason?: any) => void }> = new Map();


    constructor() {
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
        this.connectionPromise = new Promise((resolve, reject) => {
            this.resolveConnectionPromise = resolve;
            this.rejectConnectionPromise = reject;
        });
    }

    public async ensureConnected(): Promise<void> {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }
        if (!this.connectionPromise || this.ws?.readyState === WebSocket.CLOSED) { // Ensure retry if promise exists but socket is closed
            this.connectWithRetry();
        }
        return this.connectionPromise!;
    }


    private connect(): void {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            console.log(LOG_PREFIX_SW, 'WebSocket connection already open or connecting.');
            if (this.ws.readyState === WebSocket.OPEN && this.resolveConnectionPromise) {
                this.resolveConnectionPromise();
            }
            return;
        }

        this.initializeConnectionPromise();
        const serverUrl = `ws://127.0.0.1:${this.port}`;
        console.log(LOG_PREFIX_SW, `Attempting to connect to VSCE IPC Server at ${serverUrl}`);

        try {
            this.ws = new WebSocket(serverUrl);

            this.ws.onopen = () => {
                console.log(LOG_PREFIX_SW, `Successfully connected to ${serverUrl}`);
                // Removed proactive message sending. UI pages should request status when ready.
                if (this.resolveConnectionPromise) this.resolveConnectionPromise();
            };

            this.ws.onmessage = (event) => {
                this.handleServerMessage(event.data);
            };

            this.ws.onclose = (event) => {
                const wasIntentional = this.isIntentionalDisconnect;
                this.isIntentionalDisconnect = false; // Reset flag immediately

                if (wasIntentional) {
                    console.log(LOG_PREFIX_SW, `Intentionally disconnected from ${serverUrl}. Code: ${event.code}, Reason: ${event.reason}.`);
                } else {
                    console.warn(LOG_PREFIX_SW, `Disconnected from ${serverUrl}. Code: ${event.code}, Reason: ${event.reason}. Clean: ${event.wasClean}`);
                    chrome.runtime.sendMessage({
                        action: "ipcConnectionStatus",
                        status: "disconnected_unexpectedly",
                        message: `Unexpectedly disconnected from VS Code. Code: ${event.code}, Reason: ${event.reason}. Will attempt to reconnect.`
                    }).catch(err => console.warn(LOG_PREFIX_SW, "Error sending ipcConnectionStatus (disconnected_unexpectedly) message:", err));
                }
                this.ws = null;
                if (!wasIntentional && this.rejectConnectionPromise) {
                    this.rejectConnectionPromise(new Error('Connection closed unexpectedly.'));
                }
                this.initializeConnectionPromise();
            };

            this.ws.onerror = (errorEvent) => {
                console.error(LOG_PREFIX_SW, `WebSocket error with ${serverUrl}:`, errorEvent);
                const currentWs = this.ws;
                this.ws = null;

                if (this.rejectConnectionPromise) {
                    this.rejectConnectionPromise(new Error('WebSocket error.'));
                }
                this.initializeConnectionPromise();

                if (currentWs && (currentWs.readyState === WebSocket.OPEN || currentWs.readyState === WebSocket.CONNECTING)) {
                    // this.isIntentionalDisconnect = true; // Not strictly needed here as onclose will handle the message if it's unexpected
                    currentWs.close();
                }
                chrome.runtime.sendMessage({
                    action: "ipcConnectionStatus",
                    status: "connection_error",
                    message: `WebSocket error connecting to VS Code. Retrying...`
                }).catch(err => console.warn(LOG_PREFIX_SW, "Error sending ipcConnectionStatus (connection_error) message:", err));
            };
        } catch (error) {
            console.error(LOG_PREFIX_SW, `Error initializing WebSocket connection to ${serverUrl}:`, error);
            if (this.rejectConnectionPromise) this.rejectConnectionPromise(error);
            this.initializeConnectionPromise();
        }
    }

    public connectWithRetry(maxRetries = 5, delay = 3000): void {
        let attempt = 0;
        const tryConnect = () => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                return;
            }
            attempt++;
            console.log(LOG_PREFIX_SW, `Connection attempt ${attempt}`);
            this.connect();

            if (this.connectionPromise) {
                this.connectionPromise
                    .then(() => {
                        console.log(LOG_PREFIX_SW, "Connection successful after retry.");
                        // Successful connection message is now sent from onopen
                    })
                    .catch((error) => {
                        console.error(LOG_PREFIX_SW, `Connection attempt ${attempt} failed:`, error);
                        if (attempt < maxRetries) {
                            setTimeout(tryConnect, delay);
                        } else {
                            console.error(LOG_PREFIX_SW, "Max connection retries reached.");
                            chrome.runtime.sendMessage({
                                action: "ipcConnectionStatus",
                                status: "failed_max_retries",
                                message: `Could not connect to VS Code after ${maxRetries} attempts. Please check settings.`
                            }).catch(err => console.warn(LOG_PREFIX_SW, "Error sending ipcConnectionStatus (failed_max_retries) message:", err));
                        }
                    });
            }
        };
        tryConnect();
    }

    private handleServerMessage(messageData: any): void {
        try {
            const message = JSON.parse(messageData);
            console.log(LOG_PREFIX_SW, 'Received message from server:', message);

            if (message.type === 'response' || message.type === 'error_response') {
                const requestState = this.pendingRequests.get(message.message_id);
                if (requestState) {
                    if (message.payload?.success === false || message.type === 'error_response') {
                        requestState.reject(message.payload || { error: 'Unknown error from server' });
                    } else {
                        requestState.resolve(message.payload);
                    }
                    this.pendingRequests.delete(message.message_id);
                } else {
                    console.warn(LOG_PREFIX_SW, 'Received response for unknown message_id:', message.message_id);
                }
            } else if (message.type === 'push') {
                if (message.command === 'push_snippet') {
                    console.log(LOG_PREFIX_SW, 'Received snippet push:', message.payload);
                    // Example: chrome.runtime.sendMessage({ type: 'display_snippet', data: message.payload });
                } else if (message.command === 'status_update') {
                    console.log(LOG_PREFIX_SW, 'Status update from VSCE:', message.payload);
                    // This could also be a chrome.runtime.sendMessage to update UI if needed
                    chrome.notifications.create({ // Keeping general status updates as notifications for now
                        type: 'basic',
                        iconUrl: chrome.runtime.getURL('images/icon48.png'),
                        title: `ContextWeaver VSCE: ${message.payload.statusType || 'Status'}`,
                        message: message.payload.message
                    });
                }
            } else {
                console.warn(LOG_PREFIX_SW, 'Received unknown message type from server:', message.type);
            }
        } catch (error) {
            console.error(LOG_PREFIX_SW, 'Error processing server message:', error, 'Raw data:', messageData);
        }
    }

    public async sendRequest(command: string, payload: any = {}): Promise<any> {
        await this.ensureConnected();

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error(LOG_PREFIX_SW, 'WebSocket not connected. Cannot send request.');
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
                    console.warn(LOG_PREFIX_SW, `Request timed out: ${command} (ID: ${message_id})`);
                    this.pendingRequests.get(message_id)?.reject(new Error(`Request ${command} timed out`));
                    this.pendingRequests.delete(message_id);
                }
            }, 30000);
        });
    }

    async registerActiveTarget(tabId: number, llmHost: string): Promise<any> {
        return this.sendRequest('register_active_target', { tabId, llmHost });
    }

    async getFileTree(workspaceFolderUri: string | null): Promise<any> {
        return this.sendRequest('get_file_tree', { workspaceFolderUri });
    }

    async getFileContent(filePath: string): Promise<any> {
        return this.sendRequest('get_file_content', { filePath });
    }

    async getFolderContent(folderPath: string): Promise<any> {
        return this.sendRequest('get_folder_content', { folderPath });
    }

    async getEntireCodebase(workspaceFolderUri: string | null): Promise<any> {
        return this.sendRequest('get_entire_codebase', { workspaceFolderUri });
    }

    async getActiveFileInfo(): Promise<any> {
        return this.sendRequest('get_active_file_info');
    }

    async getOpenFiles(): Promise<any> {
        return this.sendRequest('get_open_files');
    }

    async searchWorkspace(query: string, workspaceFolderUri: string | null): Promise<any> {
        return this.sendRequest('search_workspace', { query, workspaceFolderUri });
    }

    async checkWorkspaceTrust(): Promise<any> {
        return this.sendRequest('check_workspace_trust');
    }

    async getFilterInfo(workspaceFolderUri: string | null): Promise<any> {
        return this.sendRequest('get_filter_info');
    }

    public isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    public disconnect(): void {
        if (this.ws) {
            this.ws.close();
        }
    }
}

const ipcClient = new IPCClient();

let keepAliveInterval: number | undefined;

function KEEPALIVE_INTERVAL_MS() { return 25 * 1000; }

function startKeepAlive() {
    if (keepAliveInterval !== undefined) {
        return;
    }
    keepAliveInterval = setInterval(() => {
        if (chrome.runtime?.getPlatformInfo) {
            chrome.runtime.getPlatformInfo((info) => {
                // console.log(LOG_PREFIX_SW, 'Keep-alive ping, platform:', info.os);
            });
        } else {
            stopKeepAlive();
        }
    }, KEEPALIVE_INTERVAL_MS());
    console.log(LOG_PREFIX_SW, "Keep-alive interval started.");
}

function stopKeepAlive() {
    if (keepAliveInterval !== undefined) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = undefined;
        console.log(LOG_PREFIX_SW, "Keep-alive interval stopped.");
    }
}

chrome.runtime.onStartup.addListener(() => {
    console.log(LOG_PREFIX_SW, 'Extension started up.');
    ipcClient.connectWithRetry();
    startKeepAlive();
});

chrome.runtime.onInstalled.addListener((details) => {
    console.log(LOG_PREFIX_SW, `Extension installed/updated: ${details.reason}`);
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        chrome.runtime.openOptionsPage();
    }
    ipcClient.connectWithRetry();
    startKeepAlive();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'settingsUpdated') {
        console.log(LOG_PREFIX_SW, 'Settings updated message received. Reloading configuration and reconnecting.');
        ipcClient.loadConfiguration().then(() => {
            if (ipcClient.isConnected()) {
                ipcClient.isIntentionalDisconnect = true;
                ipcClient.disconnect();
            }
            // connectWithRetry will handle the reconnection attempts and associated promise logic
            ipcClient.connectWithRetry();
        });
        // No sendResponse needed for this type of message, it's a one-way notification to SW
    } else if (message.action === 'reconnectIPC') {
        console.log(LOG_PREFIX_SW, 'Received reconnectIPC message. Forcing reconnection.');
        if (ipcClient.isConnected()) {
            ipcClient.isIntentionalDisconnect = true;
            ipcClient.disconnect();
        }
        ipcClient.connectWithRetry();
        // No sendResponse needed for this type of message, it's a one-way notification to SW
    } else if (message.action === 'sendIPCRequest') {
        ipcClient.sendRequest(message.command, message.payload)
            .then(response => sendResponse({ success: true, data: response }))
            .catch(error => sendResponse({ success: false, error: error.message || error }));
        return true; // Indicates asynchronous response
    } else if (message.action === 'getIPCConnectionStatus') {
        console.log(LOG_PREFIX_SW, 'Received request for current IPC status.');
        if (ipcClient.isConnected()) {
            sendResponse({
                action: "ipcConnectionStatus",
                status: "connected",
                port: ipcClient.port, // Assuming ipcClient has a public getter or stores port
                message: `Currently connected to VS Code on port ${ipcClient.port}.`
            });
        } else {
            // Could be more granular here based on last error or retry state
            sendResponse({
                action: "ipcConnectionStatus",
                status: "disconnected_unexpectedly", // Or a more generic "not_connected"
                message: "Currently not connected to VS Code."
            });
        }
        return false; // Synchronous response
    }
    // Ensure other message types are handled or ignored gracefully
    // return false; // Explicitly if not handling asynchronously for other types
});

if (typeof keepAliveInterval === 'undefined') {
    startKeepAlive();
}

console.log(LOG_PREFIX_SW, 'Service worker script loaded and IPCClient instantiated.');