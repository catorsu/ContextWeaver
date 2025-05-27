# Troubleshooting and Lessons Learned Log - ContextWeaver

This document records significant issues encountered during the development of the ContextWeaver project, the solutions implemented, and key lessons learned. The aim is to build a knowledge base for future maintenance, development, and to avoid repeating past mistakes.

## Entry Format

Each new entry should follow the format below:

---

## [YYYY-MM-DD] - [Brief, Descriptive Title of Issue or Lesson]

**Phase/Task in Development Plan:** (e.g., Phase 3, Task 4 - Context Block Indicator Management)

**Problem Encountered:**
*   **Symptoms:** (Detailed description of what went wrong. What was the expected behavior? What was the actual behavior? Include specific error messages, unexpected UI behavior, or incorrect data handling.)
*   **Context:** (Relevant conditions, e.g., specific user input, state of VSCE/CE, browser version if applicable.)
*   **Initial Diagnosis/Hypothesis (if any):** (What was initially thought to be the cause?)

**Investigation & Iterations:**
*   (Briefly describe the key steps taken to diagnose the issue. What approaches were tried that didn't work? What information was crucial for diagnosis – e.g., specific API documentation, user-provided clarification?)

**Solution Implemented:**
*   (Clear description of the final fix or approach that worked. If code changes were made via tools, summarize the nature of the changes, e.g., "Modified file X to correctly handle null values from IPC message Y by adding a conditional check.")
*   (If specific tool calls were critical, mention their purpose, e.g., "Used `write_to_file` to update the error handling logic in `ipcClient.ts`.")

**Key Takeaway(s) / How to Avoid in Future:**
*   (What was learned from this experience? Are there broader implications for design, testing, or API usage?)
*   (e.g., "Lesson: Always validate payload structures received over IPC, even if they are expected to conform to a schema, to prevent runtime errors." or "Takeaway: The `someChromeApi.featureX` has an undocumented edge case when parameter Y is an empty string; ensure this is handled explicitly.")
*   (e.g., "Prevention: Add more specific unit tests for IPC message parsing.")

---

## 2025-05-27 - VSCE Fails to Activate When Debugging from Monorepo Root

**Phase/Task in Development Plan:** Phase 1, Task 3 - VSCE - Basic Server Implementation

**Problem Encountered:**
*   **Symptoms:** The ContextWeaver VS Code Extension (VSCE) was not activating when debugging was initiated from the monorepo root (`C:\project\ContextWeaver`). No logs prefixed with `[ContextWeaver]` appeared in the VS Code Debug Console or the dedicated "ContextWeaver VSCE" Output Channel. The Extension Development Host would launch, but the extension itself seemed inactive.
*   **Context:** The project is structured as a monorepo with the VSCE located in `packages/vscode-extension`. The root directory also contained a `package.json`.
*   **Initial Diagnosis/Hypothesis:** VS Code was either not correctly identifying the extension to load, or an error in one of the `package.json` files (root or extension-specific) was preventing the Extension Host or our extension from loading/activating properly.

**Investigation & Iterations:**
*   Initially, errors appeared in the main VS Code's Developer Tools Console related to the root `package.json`:
    1.  `property \`engines\` is mandatory and must be of type \`object\``
    2.  `property \`engines.vscode\` is mandatory and must be of type \`string\``
*   Attempts were made to fix the root `package.json` by adding these fields. While these specific errors were resolved, the extension still did not show signs of activation (no logs in its Output Channel).
*   The user suggested changing the debugging context by opening the `packages/vscode-extension` folder directly as the root in VS Code and then launching the debugger (F5).
*   Upon doing this, the extension activated correctly, and logs appeared in the dedicated Output Channel and Debug Console.
*   The user then (correctly) removed the `engines` modifications from the root `package.json` as they were no longer causing issues when debugging the extension in its own focused workspace.

**Solution Implemented:**
*   The primary solution was to change the debugging workflow: **Open the specific extension folder (`packages/vscode-extension`) as the root workspace in VS Code before starting a debugging session (F5).** This provides VS Code with the correct context for extension development.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson 1 (Debugging Context):** For VS Code extension development, especially within a monorepo, always open the individual extension's subfolder as the root in VS Code for debugging. This ensures VS Code correctly identifies the extension manifest and avoids conflicts or misinterpretations arising from other `package.json` files in parent directories.
*   **Lesson 2 (VS Code Manifest Validation):** VS Code validates `package.json` files it encounters. If the root of an opened workspace contains a `package.json`, VS Code might apply stricter validation rules (expecting fields like `engines` or `engines.vscode`) as if it were an extension manifest itself. This can lead to misleading errors if the intention is to debug a nested extension.
*   **Lesson 3 (Output Channels):** Using a dedicated `vscode.OutputChannel` is crucial for isolating extension-specific logs, making debugging much easier when the main Debug Console is noisy with messages from other extensions or the Extension Host itself.
*   **Prevention:** Document the correct debugging procedure (opening the extension subfolder) in the project's `README.md` or a contributor's guide.

---

## 2025-05-27 - CE IPC Client Connection & UI Issues

**Phase/Task in Development Plan:** Phase 1, Task 4 - CE - Basic Client Implementation

**Problem Encountered:**
*   **Symptoms:**
    1.  **Manifest Errors:** Initially, the CE failed to load due to "Manifest file is missing or unreadable" when loading the `dist` folder, then "Failed to load background script 'serviceWorker.js'" when loading the extension root because `manifest.json` pointed to the wrong service worker path.
    2.  **Connection Refused:** After fixing manifest paths, the CE service worker console showed `net::ERR_CONNECTION_REFUSED` when trying to connect to the VSCE WebSocket server at `ws://localhost:30001`. VSCE logs showed it was listening but received no connection attempts.
    3.  **Resource Loading Errors:** After establishing a WebSocket connection (by changing CE to connect to `127.0.0.1`), errors like "Unable to download all specified images" (for `chrome.notifications`) and `net::ERR_FILE_NOT_FOUND` for `options.js` / `popup.js` appeared.
    4.  **Multiple Notifications:** Saving settings on the options page triggered multiple "Disconnected" / "Connected" notifications.
    5.  **Messaging Error:** Service worker showed "Receiving end does not exist" when trying to send `ipcConnectionStatus` messages to the options page.

*   **Context:** Developing the CE basic client. VSCE basic server was running. Issues occurred during initial loading and testing of the CE in Chrome.

**Investigation & Iterations:**
1.  **Manifest Errors:**
    *   Corrected "Load unpacked" path from `dist/` to the extension root (`packages/chrome-extension`).
    *   Updated `manifest.json`'s `background.service_worker` path from `serviceWorker.js` to `dist/serviceWorker.js`.
    *   Corrected `scripts` in `packages/chrome-extension/package.json` to include a `compile` command.
2.  **Connection Refused:**
    *   Verified VSCE server was listening.
    *   Temporarily changed VSCE server to listen on all interfaces (removed `host: 'localhost'`). This didn't solve it.
    *   Changed CE client's WebSocket URL from `ws://localhost:30001` to `ws://127.0.0.1:30001`. This successfully established the connection.
3.  **Resource Loading Errors:**
    *   For notification icons: Changed `iconUrl: 'images/icon48.png'` to `iconUrl: chrome.runtime.getURL('images/icon48.png')` in `serviceWorker.ts`.
    *   For HTML script tags: Changed `<script src="options.js">` to `<script src="dist/options.js">` (and similarly for `popup.js`) in `options.html` and `popup.html`. Ensured extension was properly reloaded in Chrome after these HTML changes.
4.  **Multiple Notifications:**
    *   Identified that explicit `ws.close()` in the settings update handler, combined with retry logic and `onerror` potentially re-triggering `onclose`, caused multiple notifications.
    *   Introduced an `isIntentionalDisconnect` flag in `IPCClient` (`serviceWorker.ts`).
    *   Modified `onclose` to check this flag and suppress notifications for intentional disconnects.
    *   Refined `onerror` to avoid redundant `onclose` triggers.
5.  **Messaging Error ("Receiving end does not exist"):**
    *   Realized that the options page (`options.ts`) needed an active `chrome.runtime.onMessage.addListener` for `ipcConnectionStatus` at the time the service worker sent these messages.
    *   The service worker was also changed to send these status updates via `chrome.runtime.sendMessage` instead of global notifications.
    *   `options.ts` was updated to listen for these messages and also to request an initial status update from the service worker on load.

**Solution Implemented:**
*   Corrected paths in `manifest.json` and HTML files to point to compiled/correct locations.
*   Used `127.0.0.1` for WebSocket client connection from CE.
*   Used `chrome.runtime.getURL()` for icon paths in service worker notifications.
*   Refactored `IPCClient` in `serviceWorker.ts` to use an `isIntentionalDisconnect` flag and `chrome.runtime.sendMessage` for status updates to the options page, which now listens for these messages.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson 1 (Manifest & HTML Paths):** Double-check all paths in `manifest.json` and HTML files, ensuring they point to the correct locations of compiled/bundled assets relative to the extension's root.
*   **Lesson 2 (Extension Resource URLs):** Use `chrome.runtime.getURL()` for reliable access to extension resources (like images) from service workers or other extension contexts.
*   **Lesson 3 (`localhost` vs. `127.0.0.1`):** Be aware that `127.0.0.1` can sometimes be more reliable than `localhost` for local WebSocket connections from within a Chrome extension's service worker, potentially due to OS/network stack nuances.
*   **Lesson 4 (Service Worker to Extension Page Communication):** For updating UI on specific extension pages (like options or popups) based on background events (like WebSocket status), use targeted `chrome.runtime.sendMessage` from the service worker to those pages, and ensure the pages have active listeners. Global notifications are less suitable for page-specific UI updates.
*   **Lesson 5 (Stateful Reconnect Logic):** Carefully manage state (e.g., `isIntentionalDisconnect`) during connection/reconnection sequences, especially when initiated by UI actions, to prevent unintended side-effects like repeated notifications or actions.
*   **Lesson 6 (Chrome Extension Reloading):** After making changes to HTML files or `manifest.json`, ensure the unpacked extension is fully reloaded in `chrome://extensions` for changes to take effect. Simple tab refreshes are not always sufficient.

---
<!-- New entries should be added below this line, following the format above. -->