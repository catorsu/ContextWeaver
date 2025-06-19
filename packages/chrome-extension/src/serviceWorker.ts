/**
 * @file serviceWorker.ts
 * @description Service worker for the ContextWeaver Chrome Extension.
 * Manages IPC client connection to VSCE, handles messages, and background tasks.
 * @module ContextWeaver/CE
 */

import {
    // Request Payloads (for methods sending requests)
    RegisterActiveTargetRequestPayload,
    // Response Payloads (for resolving promises)
    GenericAckResponsePayload,
    // IPC Message Structure Types
    IPCMessagePush
} from '@contextweaver/shared';
import { Logger, LogLevel } from '@contextweaver/shared';
import { BrowserConsoleLogger } from './ceLogger';
import { IPCClient } from './serviceWorker/ipcClient';
import { MessageHandlerMap } from './serviceWorker/handlers';

// Configure the logger for the service worker environment
Logger.setOutput(new BrowserConsoleLogger());
Logger.setLevel(LogLevel.INFO); // Default to INFO, can be changed for debugging
const logger = new Logger('ServiceWorker');

const ipcClient = new IPCClient();
const messageHandlers = new MessageHandlerMap();

const SUPPORTED_LLM_HOST_SUFFIXES = [
    'chat.deepseek.com',
    'aistudio.google.com'
];

// Define types for messages contentScript sends to serviceWorker
// These are not IPC messages themselves, but describe the action for the service worker
/**
 * Represents a message sent from the content script to the service worker,
 * typically requesting an API call to the VSCE.
 */
interface SWApiRequestMessage {
    type: string; // e.g., 'SEARCH_WORKSPACE', 'GET_FILE_CONTENT'
    payload?: unknown; // Payload type will be refined in each handler
}

/**
 * Represents a message sent from the options or popup page to the service worker,
 * typically for configuration updates or connection status requests.
 */
interface OptionsPageMessage {
    action: 'settingsUpdated' | 'reconnectIPC' | 'getIPCConnectionStatus';
    payload?: unknown; // Specific payload for each action
    status?: string; // For getIPCConnectionStatus response
    port?: number; // For getIPCConnectionStatus response
    message?: string; // For getIPCConnectionStatus response
}

type IncomingRuntimeMessage = SWApiRequestMessage | OptionsPageMessage | IPCMessagePush; // Added IPCMessagePush for direct pushes from VSCE

chrome.runtime.onMessage.addListener((message: IncomingRuntimeMessage, sender, sendResponse) => {
    logger.debug(`Message received in service worker. Type: ${('type' in message ? message.type : 'action' in message ? message.action : 'unknown')}, FromTab: ${sender?.tab?.id}`);

    if ('type' in message) { // Handle messages from contentScript (via serviceWorkerClient) or direct IPC pushes
        const typedMessage = message as SWApiRequestMessage | IPCMessagePush; // Type assertion for this block

        // Determine the message type and command for push messages
        let messageType = typedMessage.type;
        if (typedMessage.type === 'push' && (typedMessage as IPCMessagePush).command) {
            const pushMessage = typedMessage as IPCMessagePush;
            messageType = pushMessage.command;
        }

        // Get the appropriate handler
        const handler = messageHandlers.getHandler(messageType);
        
        if (handler) {
            logger.debug(`Handling ${messageType} with dedicated handler`);
            
            // Handle the message with the appropriate handler
            handler.handle(typedMessage.payload || typedMessage, ipcClient)
                .then((response) => {
                    if (response !== undefined) {
                        sendResponse(response);
                    }
                })
                .catch((error) => {
                    logger.error(`Error in ${messageType} handler:`, error);
                    sendResponse({ success: false, error: error.message || `Handler failed for ${messageType}.` });
                });
            
            // Return true for async response for all handlers except push_snippet
            return messageType !== 'push_snippet';
        } else {
            logger.warn(`Received unhandled message type: ${messageType}`);
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
