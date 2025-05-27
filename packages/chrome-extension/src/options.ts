/**
 * @file options.ts
 * @description Logic for the ContextWeaver Chrome Extension options page.
 * @module ContextWeaver/CE
 */
const LOG_PREFIX_OPTIONS = '[ContextWeaver CE-Options]';

const portInput = document.getElementById('ipcPort') as HTMLInputElement;
const tokenInput = document.getElementById('ipcToken') as HTMLInputElement;
const saveButton = document.getElementById('saveSettings');
const saveStatusMessageElement = document.getElementById('saveStatusMessage');
const connectionStatusMessageElement = document.getElementById('connectionStatusMessage');

function showSaveStatus(message: string, type: 'success' | 'error' | 'info' = 'info') {
    if (saveStatusMessageElement) {
        saveStatusMessageElement.textContent = message;
        saveStatusMessageElement.className = `status ${type}`; // Apply class for styling
        saveStatusMessageElement.style.display = 'block';
        console.log(LOG_PREFIX_OPTIONS, `Save Status: ${message}`);
        setTimeout(() => {
            saveStatusMessageElement.textContent = '';
            saveStatusMessageElement.style.display = 'none';
        }, 4000);
    } else {
        console.log(LOG_PREFIX_OPTIONS, `Save Status (no element): ${message}`);
    }
}

function showConnectionStatus(message: string, type: 'success' | 'error' | 'info' = 'info') {
    if (connectionStatusMessageElement) {
        connectionStatusMessageElement.textContent = message;
        connectionStatusMessageElement.className = `status ${type}`; // Apply class for styling
        connectionStatusMessageElement.style.display = 'block';
        console.log(LOG_PREFIX_OPTIONS, `Connection Status: ${message}`);
        // This message can be more persistent or cleared by subsequent status updates
    } else {
        console.log(LOG_PREFIX_OPTIONS, `Connection Status (no element): ${message}`);
    }
}

async function saveOptions() {
    console.log(LOG_PREFIX_OPTIONS, 'saveOptions function called');
    const port = parseInt(portInput.value, 10);
    const token = tokenInput.value.trim();

    if (isNaN(port) || port < 1024 || port > 65535) {
        showSaveStatus('Error: Port must be a number between 1024 and 65535.', 'error');
        return;
    }

    try {
        await chrome.storage.sync.set({
            ipcPort: port,
            ipcToken: token
        });
        showSaveStatus('Settings saved successfully! Reconnecting if necessary...', 'success');
        console.log(LOG_PREFIX_OPTIONS, `Settings saved: Port=${port}, Token length=${token.length}`);

        // Notify service worker that settings have changed
        chrome.runtime.sendMessage({ action: 'settingsUpdated' }).catch(err => {
            console.warn(LOG_PREFIX_OPTIONS, "Could not send settingsUpdated message to service worker.", err);
            showSaveStatus('Could not notify service worker of settings change. Reload extension manually if connection issues persist.', 'error');
        });

    } catch (error: any) {
        showSaveStatus(`Error saving settings: ${error.message}`, 'error');
        console.error(LOG_PREFIX_OPTIONS, 'Error saving settings:', error);
    }
}

async function loadOptions() {
    try {
        const items = await chrome.storage.sync.get({
            ipcPort: 30001, // Default port
            ipcToken: ''    // Default empty token
        });
        portInput.value = items.ipcPort.toString();
        tokenInput.value = items.ipcToken;
        console.log(LOG_PREFIX_OPTIONS, `Settings loaded: Port=${items.ipcPort}, Token length=${items.ipcToken.length}`);
    } catch (error: any) {
        showSaveStatus(`Error loading settings: ${error.message}`, 'error'); // Use saveStatus for loading errors too
        console.error(LOG_PREFIX_OPTIONS, 'Error loading settings:', error);
    }
}

// Listen for messages from the service worker regarding IPC connection status
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'ipcConnectionStatus') {
        console.log(LOG_PREFIX_OPTIONS, 'Received ipcConnectionStatus:', message);
        switch (message.status) {
            case 'connected':
                showConnectionStatus(`Connected to VS Code on port ${message.port}.`, 'success');
                break;
            case 'disconnected_unexpectedly':
                showConnectionStatus(message.message || 'Unexpectedly disconnected from VS Code. Will attempt to reconnect.', 'error');
                break;
            case 'connection_error':
                showConnectionStatus(message.message || 'Error connecting to VS Code. Retrying...', 'error');
                break;
            case 'failed_max_retries':
                showConnectionStatus(message.message || 'Failed to connect after multiple retries. Check settings and VSCE.', 'error');
                break;
            default:
                showConnectionStatus(`Unknown IPC Status: ${message.status} - ${message.message || ''}`, 'info');
        }
    }
    // Keep the channel open for other listeners if any, or remove if this is the only one.
    // For this simple case, we don't need to return true.
});

// Request initial connection status when options page loads
function requestInitialConnectionStatus() {
    console.log(LOG_PREFIX_OPTIONS, 'Requesting initial IPC connection status from service worker.');
    chrome.runtime.sendMessage({ action: 'getIPCConnectionStatus' })
        .then(response => {
            if (response && response.action === 'ipcConnectionStatus') {
                console.log(LOG_PREFIX_OPTIONS, 'Initial IPC connection status received:', response);
                switch (response.status) {
                    case 'connected':
                        showConnectionStatus(`Currently connected to VS Code on port ${response.port}.`, 'success');
                        break;
                    case 'disconnected_unexpectedly':
                    case 'connection_error':
                    case 'failed_max_retries':
                        showConnectionStatus(response.message || 'Currently not connected to VS Code.', 'error');
                        break;
                    default:
                        showConnectionStatus('IPC status unknown or connecting...', 'info');
                }
            } else if (response && response.error) {
                showConnectionStatus(`Error getting status: ${response.error}`, 'error');
            }
        })
        .catch(err => {
            console.warn(LOG_PREFIX_OPTIONS, 'Error requesting initial IPC status (SW might not be ready or listening):', err);
            showConnectionStatus('Could not retrieve initial connection status. Service worker may be starting.', 'info');
        });
}


if (saveButton) {
    saveButton.addEventListener('click', saveOptions);
}

document.addEventListener('DOMContentLoaded', () => {
    loadOptions();
    requestInitialConnectionStatus(); // Request status once DOM is loaded
});