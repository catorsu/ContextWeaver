/**
 * @file popup.ts
 * @description Logic for the ContextWeaver Chrome Extension popup.
 * @module ContextWeaver/CE
 */
const LOG_PREFIX_POPUP = '[ContextWeaver CE-Popup]';

const statusContainer = document.getElementById('status-container');
const statusIcon = document.getElementById('status-icon');
const tooltipText = document.getElementById('tooltip-text');
const reconnectButton = document.getElementById('reconnect-button');

// Theme detection
type Theme = 'light' | 'dark';

/**
 * Detects the current browser theme using prefers-color-scheme media query.
 * @returns The detected theme ('light' or 'dark').
 */
function detectBrowserTheme(): Theme {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/**
 * Applies the theme to the popup.
 * @param theme The theme to apply ('light' or 'dark').
 */
function applyTheme(theme: Theme): void {
  document.body.setAttribute('data-theme', theme);
  console.log(`${LOG_PREFIX_POPUP} Theme applied: ${theme}`);
}

/**
 * Initializes theme detection and sets up theme change listener.
 */
function initializeThemeDetection(): void {
  // Detect initial theme
  const detectedTheme = detectBrowserTheme();
  applyTheme(detectedTheme);
  
  // Listen for theme changes
  if (window.matchMedia) {
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Modern browsers support addEventListener
    if (darkModeMediaQuery.addEventListener) {
      darkModeMediaQuery.addEventListener('change', (e) => {
        const newTheme = e.matches ? 'dark' : 'light';
        applyTheme(newTheme);
      });
    } else if (darkModeMediaQuery.addListener) {
      // Fallback for older browsers
      darkModeMediaQuery.addListener((e) => {
        const newTheme = e.matches ? 'dark' : 'light';
        applyTheme(newTheme);
      });
    }
  }
  
  // Also check for stored theme preference
  chrome.storage.local.get(['theme'], (result) => {
    if (result.theme && (result.theme === 'light' || result.theme === 'dark')) {
      applyTheme(result.theme);
    }
  });
}

// Rationale: Use reliable, inline SVGs instead of Unicode characters to prevent rendering issues.
const STATUS_ICONS = {
    connected: `<svg viewBox="0 0 24 24" width="32" height="32"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"></path></svg>`,
    connecting: `<svg viewBox="0 0 24 24" width="32" height="32"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"></path></svg>`,
    failed: `<svg viewBox="0 0 24 24" width="32" height="32"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"></path></svg>`
};

/**
 * Updates the entire popup UI based on the connection state.
 * @param state The current connection state.
 * @param details An object containing optional details like port or message.
 */
function updateStatusUI(state: 'connected' | 'connecting' | 'failed', details: { port?: number, message?: string }) {
    if (!statusIcon || !tooltipText || !statusContainer) return;

    // Reset classes
    statusContainer.className = '';
    statusIcon.className = '';

    // Update browser action badge based on state
    switch (state) {
        case 'connected':
            statusIcon.innerHTML = STATUS_ICONS.connected;
            statusIcon.classList.add('status-connected');
            tooltipText.textContent = `Connected to VS Code on port ${details.port}.`;
            chrome.action.setBadgeText({ text: 'ON' });
            chrome.action.setBadgeBackgroundColor({ color: '#34a853' }); // Green
            break;
        case 'connecting':
            statusIcon.innerHTML = STATUS_ICONS.connecting;
            statusIcon.classList.add('status-connecting');
            tooltipText.textContent = details.message || 'Searching for VS Code server...';
            chrome.action.setBadgeText({ text: '...' });
            chrome.action.setBadgeBackgroundColor({ color: '#4285f4' }); // Blue
            break;
        case 'failed':
            statusIcon.innerHTML = STATUS_ICONS.failed;
            statusIcon.classList.add('status-failed');
            tooltipText.textContent = details.message || 'Connection failed. Check VS Code and click to reconnect.';
            chrome.action.setBadgeText({ text: 'OFF' });
            chrome.action.setBadgeBackgroundColor({ color: '#ea4335' }); // Red
            break;
    }
}

/**
 * Sends a message to the service worker to trigger a reconnection attempt.
 */
function triggerReconnect() {
    console.log(LOG_PREFIX_POPUP, 'Reconnect triggered. Sending message to service worker.');
    updateStatusUI('connecting', { message: 'Attempting to reconnect...' });
    chrome.runtime.sendMessage({ action: 'reconnectIPC' })
        .catch(err => {
            console.error(LOG_PREFIX_POPUP, 'Error sending reconnectIPC message:', err);
            updateStatusUI('failed', { message: 'Failed to send reconnect command.' });
        });
}

// Listen for status updates from the service worker
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'ipcConnectionStatus') {
        console.log(LOG_PREFIX_POPUP, 'Received ipcConnectionStatus:', message);
        const { status, payload } = message;
        switch (status) {
            case 'connected':
                updateStatusUI('connected', { port: payload.port });
                break;
            case 'connecting':
                updateStatusUI('connecting', { message: payload.message });
                break;
            case 'disconnected_unexpectedly':
            case 'connection_error':
            case 'failed_max_retries':
                updateStatusUI('failed', { message: payload.message });
                break;
        }
    }
});

/**
 * Requests the initial connection status from the service worker upon opening.
 */
function requestInitialConnectionStatus() {
    console.log(LOG_PREFIX_POPUP, 'Requesting initial IPC connection status.');
    updateStatusUI('connecting', { message: 'Checking status...' });
    chrome.runtime.sendMessage({ action: 'getIPCConnectionStatus' })
        .then(response => {
            if (chrome.runtime.lastError || !response) {
                updateStatusUI('failed', { message: 'Could not communicate with service worker.' });
                return;
            }
            if (response.action === 'ipcConnectionStatus') {
                const { status, payload } = response;
                switch (status) {
                    case 'connected':
                        updateStatusUI('connected', { port: payload.port });
                        break;
                    default:
                        updateStatusUI('failed', { message: payload.message });
                        break;
                }
            }
        })
        .catch(() => {
            updateStatusUI('failed', { message: 'Could not retrieve initial status.' });
        });
}

// Attach event listeners
if (reconnectButton) {
    reconnectButton.addEventListener('click', triggerReconnect);
}

if (statusContainer) {
    statusContainer.addEventListener('click', () => {
        // Only allow clicking the icon to reconnect if it's in a failed state
        if (statusIcon?.classList.contains('status-failed')) {
            triggerReconnect();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme detection
    initializeThemeDetection();
    
    requestInitialConnectionStatus();
    
    // Also ensure badge is updated when popup opens
    chrome.runtime.sendMessage({ action: 'updateBadge' })
        .catch(err => console.log(LOG_PREFIX_POPUP, 'Badge update request error:', err));
});