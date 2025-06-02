/**
 * @file popup.ts
 * @description Logic for the ContextWeaver Chrome Extension popup.
 * @module ContextWeaver/CE
 */
const LOG_PREFIX_POPUP = '[ContextWeaver CE-Popup]';

const statusElement = document.getElementById('status');
const testConnectionBtn = document.getElementById('testConnectionBtn');

function updateStatus(message: string, isError: boolean = false) {
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.color = isError ? 'red' : 'green';
    }
    console.log(LOG_PREFIX_POPUP, message);
}

async function testIPCConnection() {
    updateStatus('Testing connection...');
    try {
        // Send a message to the service worker, asking it to ping the VSCE
        const response = await chrome.runtime.sendMessage({
            type: 'GET_WORKSPACE_DETAILS_FOR_UI',
            command: 'get_workspace_details', // Using get_workspace_details to test connection
            payload: {}
        });

        console.log(LOG_PREFIX_POPUP, 'Response from service worker:', response);
        if (response && response.success && response.data) {
            updateStatus(`Connected! Workspace trusted: ${response.data.isTrusted}. Folders: ${response.data.workspaceFolders ? response.data.workspaceFolders.length : 0}`);
        } else if (response && response.error) {
            updateStatus(`Error: ${response.error}`, true);
        } 
        else {
            updateStatus('No/unexpected response from VSCE via service worker.', true);
        }
    } catch (error: any) {
        console.error(LOG_PREFIX_POPUP, 'Error sending message to service worker or during IPC:', error);
        updateStatus(`IPC Error: ${error.message || 'Unknown error'}`, true);
    }
}

if (testConnectionBtn) {
    testConnectionBtn.addEventListener('click', testIPCConnection);
}

// Initial status check (optional, could be more sophisticated)
updateStatus('Ready. Click test or configure settings.');

// You might want to listen for status updates from the service worker here too
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   if (message.type === 'IPC_STATUS_UPDATE') {
//     updateStatus(message.status, message.isError);
//   }
// });