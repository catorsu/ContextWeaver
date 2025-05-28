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
    1.  property `engines` is mandatory and must be of type `object`
    2.  property `engines.vscode` is mandatory and must be of type `string`
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
## [2025-05-28] - IPC Simplification: Removal of Token Authentication and Port Fallback

**Phase/Task in Development Plan:** Phase 1, Task 3 (VSCE - Basic Server Implementation), Phase 1, Task 4 (CE - Basic Client Implementation), and subsequent IPC-related tasks.

**Problem Encountered:**
*   **Symptoms:** The initial IPC design included token-based authentication (FR-IPC-003) and a basic port configuration (FR-IPC-002). While functional, this added complexity to setup and troubleshooting for users, requiring manual token synchronization between VS Code settings and Chrome Extension options. The port handling in VSCE was also basic, failing if the default port was in use without attempting alternatives.
*   **Context:** Streamlining the user experience and reducing setup friction for the ContextWeaver project.
*   **Initial Diagnosis/Hypothesis:** The token-based authentication, while adding a layer of security, was deemed an unnecessary burden given the `localhost` binding of the IPC server. The port handling could be made more robust to improve reliability.

**Investigation & Iterations:**
1.  **Token Removal:**
    *   Analyzed the security implications of removing the token. Since the VSCE server binds exclusively to `127.0.0.1` (localhost), direct external access is prevented. The primary remaining risk would be from other malicious software *already running on the user's machine* attempting to spoof ContextWeaver IPC messages. Given the nature of the data exchanged (read-only file/workspace context), this risk was deemed acceptable for V1 in favor of ease of use.
    *   Modified `packages/vscode-extension/src/ipcServer.ts` to remove `expectedToken` property, constructor parameter, and all token validation logic. Clients are now considered authenticated upon successful connection.
    *   Modified `packages/vscode-extension/package.json` to remove the `contextweaver.ipc.token` configuration property.
    *   Modified `packages/vscode-extension/src/extension.ts` to remove the token parameter from `IPCServer` instantiation.
    *   Modified `packages/chrome-extension/src/serviceWorker.ts` to remove `token` property, `ipcToken` loading/saving from `chrome.storage.sync`, and the `token` field from outgoing messages.
    *   Modified `packages/chrome-extension/options.html` and `packages/chrome-extension/src/options.ts` to remove the IPC token input field and its associated logic.
2.  **Port Fallback:**
    *   Enhanced `packages/vscode-extension/src/ipcServer.ts` to implement a port fallback mechanism. The server now attempts to bind to the configured port. If `EADDRINUSE` (address in use) error occurs, it tries up to 3 subsequent ports (e.g., 30001, 30002, 30003, 30004).
    *   Added VS Code information messages to notify the user of the actual port the server successfully started on, or if all attempts failed.
3.  **Manual Reconnection:**
    *   Added a "Connect/Reconnect to VS Code" button to `packages/chrome-extension/options.html`.
    *   Implemented logic in `packages/chrome-extension/src/options.ts` to send a `reconnectIPC` message to the service worker when this button is clicked.
    *   Added a handler for the `reconnectIPC` message in `packages/chrome-extension/src/serviceWorker.ts` to force a disconnection (if connected) and then trigger `connectWithRetry()`.

**Solution Implemented:**
*   **Token Authentication Removed:** Simplified IPC setup by removing the need for a shared secret token, relying on `localhost` binding for security.
*   **Robust Port Handling:** VSCE now attempts multiple ports on startup if the default is busy, improving reliability. Users are informed of the active port.
*   **Manual Reconnection:** CE provides a UI button for users to manually trigger a reconnection, aiding troubleshooting.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson 1 (Security vs. Usability Trade-off):** For internal IPC over `localhost`, the overhead of token-based authentication might outweigh its benefits if the exposed API surface is read-only and the primary threat model is external network attacks. Simplifying setup can significantly improve user adoption and reduce support burden.
*   **Lesson 2 (Port Conflict Resolution):** Implementing a small range of port fallback attempts makes the VSCE more resilient to common `EADDRINUSE` errors, improving the out-of-the-box experience. Clear user notification about the active port is essential.
*   **Lesson 3 (User Control for Connectivity):** Providing a manual "Reconnect" button in the CE's options page empowers users to troubleshoot connection issues without needing to restart extensions or VS Code, enhancing the overall user experience.
*   **Prevention:** Continuously evaluate security measures against actual threat models and user experience impact. Prioritize robust connection management and clear user feedback for background services.

---
## [2025-05-28] - VSCE Workspace API Returns Empty/Undefined in Extension Development Host

**Phase/Task in Development Plan:** Phase 2, Task 1 - File System Data Provisioning (File Tree)

**Problem Encountered:**
*   **Symptoms:** During testing of the `get_file_tree` IPC command, the VS Code Extension (VSCE) consistently returned an error: "Failed to generate file tree. Workspace might be untrusted or not open." Debug logs within `fileSystemService.ts` revealed that `vscode.workspace.workspaceFolders` was always `undefined` or empty, and `vscode.workspace.getWorkspaceFolder(uri)` returned `undefined` even for valid URIs of open folders. This occurred despite the workspace being trusted (`vscode.workspace.isTrusted` was `true`).
*   **Context:** Testing was initially performed by launching the VSCE debugger (F5), which opens a new "Extension Development Host" (EDH) window. The test workspace/folders were open in the *main* VS Code window where the extension code was being developed, not in the EDH window.
*   **Initial Diagnosis/Hypothesis:** Potential timing issue with extension activation, or a misunderstanding of how `vscode.workspace.getWorkspaceFolder(uri)` functions with sub-folder URIs vs. root folder URIs.

**Investigation & Iterations:**
*   Added detailed logging to `fileSystemService.ts` to inspect the values of `vscode.workspace.workspaceFolders`, `vscode.workspace.isTrusted`, and the return value of `vscode.workspace.getWorkspaceFolder(uri)` at various points.
*   The logs consistently showed `vscode.workspace.workspaceFolders` as empty within the context of the running extension, even when folders were open in the main VS Code window.
*   User clarified their testing setup: they were opening folders in the main VS Code window, not the EDH window where the extension was actually running.
*   User further clarified their multi-root workspace setup in the EDH window:
    1.  `C:\project\ContextWeaver\packages\vscode-extension` (opened first)
    2.  `C:\project\ContextWeaver` (added to workspace)
*   This clarified that `vscode.workspace.getWorkspaceFolder()` would only work if the URI passed to it was one of these *exact root URIs*.

**Solution Implemented:**
*   The core solution was a procedural change in testing: **All workspace operations (opening folders, adding to workspace, trusting workspace) must be performed within the "Extension Development Host" (EDH) window where the VSCE is actively running during a debug session.**
*   No code changes were ultimately needed in `fileSystemService.ts` to fix this specific issue, as the API calls were behaving correctly given the (previously incorrect) testing environment. The detailed logging helped confirm the environment mismatch.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson:** VS Code extension APIs related to the workspace (e.g., `vscode.workspace.workspaceFolders`, `vscode.workspace.getWorkspaceFolder()`, `vscode.workspace.isTrusted`) operate on the state of the "Extension Development Host" (EDH) window, not the VS Code window where the extension's source code is being developed.
*   **Prevention (Testing):** Always ensure that the testing environment for VS Code extension features that interact with the workspace is the EDH window, properly configured with the desired open folders and trust settings.
*   **Prevention (Logging):** When diagnosing workspace-related issues, log the direct output of `vscode.workspace.workspaceFolders` and `vscode.workspace.isTrusted` at the beginning of the relevant function to quickly ascertain the extension's view of the workspace state.
*   **API Understanding:** `vscode.workspace.getWorkspaceFolder(uri)` returns a `WorkspaceFolder` if the given `uri` *exactly matches* the URI of one of the root folders in `vscode.workspace.workspaceFolders`. It does not resolve sub-folders to their parent root workspace folder.

---
## [2025-05-28] - Syntax Errors in .ts File After Appending Code with Escaped Literals via Tooling

**Phase/Task in Development Plan:** Phase 2, Task 1 - File System Data Provisioning (Folder Content)

**Problem Encountered:**
*   **Symptoms:** After appending a new function (`getFolderContents`) to `fileSystemService.ts` using the `filesystem.write_file` tool (by concatenating existing content with new code as a string), the TypeScript compiler reported multiple syntax errors like "Invalid character," "Unterminated template literal," and subsequent "Module has no exported member" errors in files importing from it.
*   **Context:** The new code block contained JavaScript template literals (using backticks `` ` ``) and string literals with newline characters (`\n`).
*   **Initial Diagnosis/Hypothesis:** The string content provided to the `filesystem.write_file` tool for the new function had its backticks, backslashes, and newlines over-escaped (e.g., `\\\`` instead of `` ` ``, `\\\\n` instead of `\n`). This happened because the code was prepared as a string within the AI's context, potentially undergoing multiple layers of escaping before being passed to the tool.

**Investigation & Iterations:**
*   The `code_checker` tool confirmed syntax errors in `fileSystemService.ts`.
*   Reading the file content after the problematic `write_file` call showed literal backslashes before backticks and within newline sequences (e.g., `console.log(\`[ContextWeaver...]\`);` appeared as `console.log(\\\`[ContextWeaver...]\\\`);` in the raw file).
*   Initial attempts to fix this with `filesystem.edit_file` by targeting specific escaped sequences were complex and also prone to `oldText` mismatch errors if the file wasn't exactly as predicted.

**Solution Implemented:**
*   The most reliable solution was to provide the **entire, syntactically correct content** of `fileSystemService.ts` (including the new function with proper string and template literals) in a single, clean block and use `filesystem.write_file` to overwrite the problematic file. This ensured that no unintended escaping artifacts from the AI's string generation or tool interaction were present in the final `.ts` file.
*   The user manually corrected the syntax errors in their local environment, confirming the approach.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson:** When using tools to write or edit source code files, especially with complex string literals, template literals, or special characters, be extremely cautious about how the string content is prepared and passed to the tool. Multiple layers of string escaping (one for the AI's internal representation, one for the tool's parameter format) can lead to literal escape characters being written into the code.
*   **Prevention (Tool Usage):** For adding large, complex blocks of new code, it's often safer to:
    1.  Have the AI generate the complete, clean code block as a distinct unit.
    2.  Read the existing file content.
    3.  Programmatically combine the existing content with the new, clean code block (e.g., simple string concatenation).
    4.  Use `filesystem.write_file` to overwrite the entire file with the combined, correct content.
    This avoids the brittleness of `filesystem.edit_file` for large additions and reduces the risk of escaping issues.
*   **Prevention (Verification):** Always run a code checker or linter immediately after a tool modifies source code to catch such syntax issues early.

---
## [2025-05-28] - Testing VSCE IPC Push Functionality with a Simple WebSocket Client

**Phase/Task in Development Plan:** Phase 2, Task 4 - Snippet Sending Functionality

**Problem Encountered:**
*   **Symptoms:** Needed to verify that the VSCE correctly prepares and pushes messages (e.g., `push_snippet`) to a connected and registered Chrome Extension (CE) client, even if the CE's receiving end for that specific message isn't fully implemented yet.
*   **Context:** Implementing IPC push features where the VSCE initiates the message without a direct prior request from the CE for that specific push.
*   **Initial Diagnosis/Hypothesis:** A lightweight, standalone WebSocket client could simulate the CE's basic connection and registration behavior to act as a target for VSCE push messages.

**Investigation & Iterations:**
*   Designed a simple Node.js script (`test-client.js`) using the `ws` and `uuid` packages.
*   The script connects to the VSCE IPC WebSocket server.
*   Upon connection, it sends a `register_active_target` message to the VSCE, mimicking the CE's behavior when an LLM tab becomes active. This provides the VSCE with a `targetTabId`.
*   The script listens for incoming messages and logs them, specifically looking for the `push_snippet` message.

**Solution Implemented:**
*   Created `test-client.js` and a corresponding `package.json` in a separate directory (`C:\project\TestWSClient`).
*   The VSCE was run in the Extension Development Host.
*   The `test-client.js` was run via `npm start`.
*   After the test client registered itself, the "Send Snippet to LLM Context" command was triggered in the VSCE.
*   The test client successfully received and logged the `push_snippet` message, confirming the VSCE's sending logic and data formatting.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson (IPC Push Testing):** When developing features where the VSCE pushes data to the CE (like snippets or status updates), a simple external WebSocket client script is an effective way to test the VSCE's sending logic in isolation before the CE's receiving and UI handling parts are complete.
*   **Lesson (Client Simulation):** The test client should mimic essential CE behaviors, such as sending `register_active_target`, to ensure the VSCE can correctly identify and communicate with the intended target.
*   **Prevention/Best Practice:** For features involving asynchronous pushes from server to client, consider creating a minimal test client early in the development of the server-side push logic to facilitate iterative testing and debugging. This helps decouple the development of the sender and receiver to some extent.

---
<!-- New troubleshooting entries should be added below this comment -->
