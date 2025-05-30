# Troubleshooting and Lessons Learned Log - ContextWeaver

This document records significant issues encountered during the development of the ContextWeaver project, the solutions implemented, and key lessons learned. The aim is to build a knowledge base for future maintenance, development, and to avoid repeating past mistakes.

**How to Add a New Entry:**
1.  Scroll to the very bottom of this document.
2.  Locate the comment line: `<!-- Add new log entries above this line | This comment must remain at the end of the file -->`.
3.  Insert your new log entry (following the "Entry Format" below) on the blank line *immediately above* this comment.
4.  Ensure this comment line remains the absolute last line in the file after you add your content.
5.  Follow the "Entry Format" for your new log.

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
## [2025-05-27] - VSCE Fails to Activate When Debugging from Monorepo Root

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
## [2025-05-27] - CE IPC Client Connection & UI Issues

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
## [2025-05-29] - Jest Mock Configuration for 'ignore' Library in File System Tests

**Phase/Task in Development Plan:** Phase 2, Task 1 - File System Data Provisioning (File Tree)

**Problem Encountered:**
*   **Symptoms:** The test "should apply .gitignore rules if gitignore is parsed" was failing with incorrect filterTypeApplied value ("default" instead of "gitignore") and incorrect tree formatting (using `├──` instead of `└──` for single file).
*   **Context:** Unit testing the `getFileTree` function in `fileSystemService.ts`, which uses the `ignore` library to handle .gitignore patterns.
*   **Initial Diagnosis/Hypothesis:** The jest mock for the `ignore` library wasn't properly configured to simulate gitignore filtering behavior.

**Investigation & Iterations:**
*   Initial implementation used a global mock that returned a fixed ignore instance:
    ```typescript
    jest.mock('ignore', () => {
      const ignoreInstance = {
        add: jest.fn().mockReturnThis(),
        ignores: jest.fn().mockReturnValue(false),
      };
      return jest.fn().mockReturnValue(ignoreInstance);
    });
    ```
*   This approach didn't allow individual tests to customize the ignore behavior.
*   Test data included multiple files, causing tree formatting issues when some files were filtered out.

**Solution Implemented:**
1. Simplified the global mock to just return a factory function:
   ```typescript
   jest.mock('ignore', () => {
     return jest.fn();
   });
   ```

2. Created test-specific mock instance with desired behavior:
   ```typescript
   const mockIgnoreInstance = {
     add: jest.fn().mockReturnThis(),
     ignores: jest.fn().mockImplementation((path: string) => {
       return path === 'folderA' || path === 'folderA/' || path === 'file2.ts';
     }),
   } as unknown as Ignore;
   
   const ignoreMock = jest.requireMock('ignore');
   ignoreMock.mockReturnValue(mockIgnoreInstance);
   mockParseGitignore.mockResolvedValue(mockIgnoreInstance);
   ```

3. Simplified test input to match expected output:
   ```typescript
   (vscode.workspace.fs.readDirectory as jest.Mock).mockResolvedValueOnce([
     ['file1.txt', vscode.FileType.File],
   ]);
   ```

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson 1 (Console Output in Tests):** When testing error handling paths, console.error messages are expected and part of the test coverage. For example, tests that mock failed directory reads will trigger console.error logs, which is the intended behavior being verified. These error messages in the test output do not indicate test failures.
*   **Lesson 2 (Mock Design):** When mocking libraries that return configurable instances (like `ignore`), prefer a minimal global mock that just returns a factory function. This allows individual tests to provide their own mock instances with test-specific behavior.
*   **Lesson 2 (Test Data):** When testing complex formatting (like tree structures), start with minimal test data that exactly matches the expected output. This makes it easier to identify whether failures are due to the logic being tested or due to test data complexity.
*   **Lesson 3 (Mock Chain):** Pay attention to the complete chain of mock configurations. In this case, both the `ignore()` factory function AND the `parseGitignore` function needed to be properly mocked to return the same mock instance.
*   **Prevention:** Always review the actual implementation to understand how mocked dependencies are used before designing mocks. In this case, understanding that `parseGitignore` returns the ignore instance that affects the `filterTypeApplied` value was crucial.

---
## [2025-05-29] - TypeScript Error Accessing Mocked `vscode` Module Properties in Jest

**Phase/Task in Development Plan:** Unit Testing (IPCServer)

**Problem Encountered:**
*   **Symptoms:** When unit testing modules that import `vscode`, and `vscode` is mocked using `jest.mock('vscode', () => ({ ... }))`, TypeScript would throw error TS2339: "Property 'SomeVSCodeProperty' does not exist on type 'typeof import("vscode")'". This occurred even if 'SomeVSCodeProperty' (e.g., `ExtensionContext`) was defined in the mock factory.
*   **Example:** `mockContext = (vscode.ExtensionContext as jest.Mock)();` would fail with TS2339 if `vscode.ExtensionContext` was not directly cast.
*   **Context:** Jest unit tests for VS Code extension components, specifically when trying to instantiate or call mocked parts of the `vscode` API like `ExtensionContext`.

**Investigation & Iterations:**
*   The `jest.mock('vscode', factory)` correctly replaced the runtime `vscode` object with the factory's return value.
*   The mock factory defined properties like `ExtensionContext: jest.fn(() => ({ subscriptions: [], ... }))`.
*   The issue was identified as TypeScript, at compile-time, still using the type definition of the *actual* `vscode` module for the imported `vscode` variable. The actual `vscode` namespace might not directly export `ExtensionContext` as a value that can be called as a constructor or function in the same way the mock was structured, or its type was not seen as callable/constructible by TypeScript without a cast.

**Solution Implemented:**
*   To resolve the TypeScript compile-time error when accessing a mocked property on the `vscode` object that TypeScript couldn't find on the original type, `vscode` was cast to `any` before accessing the mocked property:
    ```typescript
    mockExtensionContext = ((vscode as any).ExtensionContext as jest.Mock)();
    ```
*   This tells TypeScript to bypass its static type checking for the `vscode.ExtensionContext` access, trusting that the property exists on the `vscode` object at runtime (due to the mock) and that it's a callable mock function.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson:** When mocking entire modules like `vscode` in Jest, TypeScript's static type checking will still refer to the original module's type declarations for the imported module variable. If your mock's structure provides functions or class-like mocks for properties that don't align perfectly with the original module's type signature (or how TypeScript infers it for direct access), you may need to use type assertions (like `(mockedModule as any).mockedProperty`) to bridge the gap between TypeScript's compile-time understanding and Jest's runtime reality.
*   **Prevention:** Be mindful of this discrepancy. When a mocked property on a module mock (like `vscode.ExtensionContext`) is not found by TypeScript or is considered not callable/constructible in the desired way, casting the base mocked object to `any` (e.g., `(vscode as any).ExtensionContext`) before further operations or casting can effectively bypass the compile-time check, allowing the Jest mock to function as intended at runtime.

---
---
## [2025-05-29] - Mocking Custom Errors and `instanceof` Checks in Jest Tests

**Phase/Task in Development Plan:** Unit Testing (IPCServer - Workspace Pre-checks)

**Problem Encountered:**
*   **Symptoms:** Unit tests for error handling logic in `IPCServer.handleMessage` were failing. The code under test used `error instanceof WorkspaceServiceError` to differentiate error types. Tests were mocking a service method (`workspaceService.ensureWorkspaceTrustedAndOpen`) to reject with a plain object `{ name: 'WorkspaceServiceError', message: 'Test Workspace Error', code: 'WORKSPACE_NOT_TRUSTED' }`.
*   **Context:** Testing a method in `IPCServer.ts` that catches errors from `WorkspaceService` and handles them differently based on whether the error is an instance of the custom error class `WorkspaceServiceError`.
*   **Initial Diagnosis/Hypothesis:** The plain error object, despite having similar properties, would not satisfy the `instanceof WorkspaceServiceError` check, leading the code to take an unintended error handling path.

**Investigation & Iterations:**
*   The test output showed that an `INTERNAL_SERVER_ERROR` was being sent by `IPCServer` instead of the expected error code derived from the mocked `WorkspaceServiceError` (e.g., `WORKSPACE_NOT_TRUSTED`).
*   This confirmed that the `else` block in the `try...catch` (where `error instanceof WorkspaceServiceError` was false) was being executed.

**Solution Implemented:**
*   Ensured the custom error class (`WorkspaceServiceError`) was exported from its module (`workspaceService.ts`).
*   Imported the actual `WorkspaceServiceError` class into the test file (`ipcServer.test.ts`).
*   Modified the mock service method in the test to reject with a true instance of the custom error: 
    ```typescript
    const workspaceError = new WorkspaceServiceError('WORKSPACE_NOT_TRUSTED', 'Test Workspace Error'); 
    (mockWorkspaceService.ensureWorkspaceTrustedAndOpen as jest.Mock).mockRejectedValue(workspaceError);
    ```
*   This ensured that the `error instanceof WorkspaceServiceError` check in `IPCServer.handleMessage` evaluated to `true`, leading to the correct error handling path. Test assertions for specific error codes and messages then passed.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson:** When testing code that uses `instanceof` to check for custom error types, creating a plain object with the same properties as the custom error is insufficient for the `instanceof` check to pass. The mock must reject with (or throw) an actual instance of the custom error class (`new CustomError(...)`).
*   **Prevention:** If a custom error class is integral to error handling logic (especially for `instanceof` checks), ensure it's properly exported from its defining module. In unit tests, when mocking methods that are supposed to produce this custom error, always instantiate the custom error class to ensure type checks behave as expected in the code under test.

---
---
## [2025-05-29] - Jest's `toHaveBeenCalledWith` Fails for Structurally Identical Object Instances

**Phase/Task in Development Plan:** Unit Testing (IPCServer - Command Handlers like `handleGetFolderContent`)

**Problem Encountered:**
*   **Symptoms:** A Jest unit test using `expect(mockFn).toHaveBeenCalledWith(expectedObject)` was failing. The diff output in the test failure showed that the `- Expected` and `+ Received` objects were structurally identical (all properties and their primitive values matched), but the test still indicated a mismatch.
*   **Context:** This occurred when `expectedObject` was created inline within the test assertion (e.g., using `vscode.Uri.parse(...)` or `new MyClass(...)`), while the `mockFn` (a mocked service method) was called by the code under test with an object that was created within that code. Although their properties were the same, they were different instances in memory.
*   **Example from `ipcServer.test.ts` for `handleGetFolderContent`:**
    ```typescript
    // Test assertion:
    expect(mockWorkspaceService.getWorkspaceFolder).toHaveBeenCalledWith(vscode.Uri.parse(mockWorkspaceUriString, true));
    // Code under test (simplified from getTargetWorkspaceFolder):
    // const requestedUri = vscode.Uri.parse(requestedUriString, true);
    // this.workspaceService.getWorkspaceFolder(requestedUri);
    ```
    This failed because the `vscode.Uri.parse` in the test created a new URI instance, different from the instance created inside `getTargetWorkspaceFolder`, even if their `fsPath`, `scheme`, etc., were identical.

**Investigation & Iterations:**
*   Confirmed that `toHaveBeenCalledWith` performs a deep equality check. However, for objects, especially those created via constructors or factory functions (like `vscode.Uri.parse` which is also mocked), being different instances in memory can cause the deep equality to fail if the comparison logic isn't robust enough for all internal properties (e.g., function references within the object like a `toString` method that might be different mock instances themselves).

**Solution Implemented:**
*   Replaced `toHaveBeenCalledWith(expectedObjectInstance)` with `toHaveBeenCalledWith(expect.objectContaining(subsetOfKeyExpectedProperties))`. This matcher verifies that the mock function was called with an object that includes the specified key-value pairs, without requiring strict instance equality for the entire object or comparing all properties.
*   **Example Fix:**
    ```typescript
    // Old failing assertion:
    // expect(mockWorkspaceService.getWorkspaceFolder).toHaveBeenCalledWith(vscode.Uri.parse(mockWorkspaceUriString, true));
    
    // New passing assertion:
    expect(mockWorkspaceService.getWorkspaceFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath: mockWorkspacePath, // e.g., '/test/project'
        scheme: 'file'
      })
    );
    ```

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson:** When asserting that a mock function was called with an object argument, if the exact instance of the object is not critical for the test's intent (or is hard to reproduce identically in the test assertion), using `expect.objectContaining({...})` is a more robust approach. This is especially true when the object arguments are created dynamically (e.g., `new MyClass()`, `factoryFunction()`) within the code under test.
*   **Prevention:** For object arguments in `toHaveBeenCalledWith` (and similar Jest matchers like `toEqual`), prefer `expect.objectContaining` to check for the presence and values of essential properties rather than relying on deep equality of potentially different object instances. This makes tests less brittle to implementation details of object creation and focuses on the significant data being passed.

---
## [2025-05-29] - `edit_file` Tool Issues: Incorrect `oldText` Mismatch Reports and Code Duplication

**Phase/Task in Development Plan:** Unit Testing (IPCServer - adding multiple command handler test suites)

**Problem Encountered:**
*   **Symptoms:**
    1.  The `edit_file` tool sometimes reported "Could not find exact match for edit" for the `oldText` even when the provided `oldText` seemed correct based on prior `read_file` outputs. This often occurred when targeting the very end of a file. A likely cause was the "No newline at end of file" warning from previous successful edits, which subtly altered the exact final characters of the file, making the `oldText` no longer an exact match.
    2.  On other occasions, an `edit_file` operation intended to append new code (by replacing a specific end-of-block marker like `}); // End of ... describe`) resulted in the new code block being duplicated or inserted at an incorrect location. This happened when the `oldText` was not unique enough and matched an earlier, similar marker in the file structure.
*   **Context:** Iteratively adding multiple `describe` blocks for different command handlers to `ipcServer.test.ts` using the `edit_file` tool to append new test suites.

**Investigation & Iterations:**
*   For symptom 1 (false mismatch): It was observed that after a successful `edit_file` operation that modified the end of the file (and potentially resulted in a "No newline" warning from the tool's diff output), subsequent `edit_file` calls using `oldText` based on the pre-edit file state would fail. Re-reading the file with `filesystem.read_file` was necessary to get the absolute latest file ending to formulate correct `oldText`.
*   For symptom 2 (duplication): Analysis of the diff from an erroneous edit (e.g., call_id 67) showed that the `oldText` intended to mark the end of the file for appending was matched prematurely within a nested structure, causing the new block to be inserted there. The tool then might have processed further, or the `newText` (which often includes the `oldText` to achieve an append) caused the duplication.

**Solution Implemented:**
*   **For false mismatch / end-of-file issues:** Always re-read the file content with `filesystem.read_file` immediately before an `edit_file` call if the exact content of `oldText` is critical (especially at file boundaries or after previous edits that might alter line endings/final characters) and might have been altered by previous tool operations.
*   **For duplication / incorrect append:**
    *   Ensure `oldText` used for appending is as unique and specific as possible, targeting a very distinctive sequence of closing braces, comments, or other structural elements to pinpoint the exact insertion/replacement point.
    *   If duplication occurs, the recovery process involves: 1. Reading the malformed file. 2. Identifying the start and end of the entire duplicated code block. 3. Using `filesystem.edit_file` with this entire duplicated block as `oldText` and an empty string (or the content it erroneously overwrote) as `newText` to remove the duplicate cleanly.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson 1 (Tool Sensitivity to Exact Matches):** The `edit_file` tool requires an exact string match for `oldText`, including all whitespace, line endings, and even the presence/absence of a final newline. Previous edits, especially those that might remove a final newline, can easily invalidate `oldText` for subsequent edits if not accounted for.
*   **Lesson 2 (Appending Robustness):** When appending large blocks of code by replacing a known end-marker, that marker (`oldText`) must be highly unique. If not, the risk of incorrect placement or duplication is high. Consider making the marker very specific (e.g., a unique comment string) if appending iteratively.
*   **Prevention:**
    *   When performing sequential `edit_file` operations, especially appends or modifications near the end of the file, it's safest to re-read the file with `filesystem.read_file` before each edit to ensure `oldText` is based on the most current file state.
    *   For appending, if a tool that directly supports "append content to file" becomes available, it would be inherently safer than using a text replacement strategy for this purpose.
    *   If complex multi-hunk edits are needed, ensure each `oldText` is unique and unambiguous within the file at the time of its intended application.

## [2025-05-30] - Fixing Gitignore Tests: Filter Type Propagation and Mock Configuration

**Phase/Task in Development Plan:** Phase 2, Task 1 - File System Data Provisioning (File Tree)

**Problem Encountered:**
*   **Symptoms:** The test "should apply gitignore rules" in `fileSystemService.test.ts` was failing. The test expected a `filterTypeApplied` value of "gitignore" but received "default", and the file tree included files that should have been filtered out by the gitignore rules.
*   **Context:** Unit testing the file system service's gitignore handling functionality.
*   **Initial Diagnosis/Hypothesis:** Either the mock implementation for the `ignore` library wasn't being applied correctly, or the `filterTypeApplied` flag wasn't being properly propagated through the file system traversal.

**Investigation & Iterations:**
1.  **Initial Mock Implementation:**
    ```typescript
    jest.mock('ignore', () => {
      const getDefaultMockInstance = () => ({
        add: jest.fn().mockReturnThis(),
        ignores: jest.fn().mockReturnValue(false)
      });
      return jest.fn(() => getDefaultMockInstance());
    });
    ```
    This didn't allow tests to provide custom ignore behavior.

2.  **Test Setup:**
    ```typescript
    const mockIgnoreInstance = {
      add: jest.fn().mockReturnThis(),
      ignores: jest.fn().mockImplementation((path: string) => {
        return path === 'secret.txt' || path === 'targetFolder/secret.txt';
      })
    } as unknown as Ignore;
    (parseGitignore as jest.Mock).mockResolvedValue(mockIgnoreInstance);
    ```
    The mock was correctly ignoring files, but the `filterTypeApplied` flag wasn't being set to "gitignore".

3.  **Filter Type Issue:**
    The code was using a dynamic flag `anyFilteredByGitignore` to determine the filter type, but this approach was flawed. The presence of a valid gitignore instance should determine the filter type, not whether any files were actually filtered.

**Solution Implemented:**
1.  Fixed the `ignore` library mock to better support ES modules:
    ```typescript
    jest.mock('ignore', () => ({
      __esModule: true,
      default: jest.fn(() => getDefaultMockInstance())
    }));
    ```

2.  Modified the filter type determination:
    ```typescript
    let filterTypeApplied: 'gitignore' | 'default' = gitignoreFilter ? 'gitignore' : 'default';
    ```
    This sets the filter type based on the presence of a valid gitignore instance, not on whether files were filtered.

3.  Simplified the mock setup in tests:
    ```typescript
    const gitignoreContent = 'secret.txt';
    const gitignoreUri = vscode.Uri.joinPath(workspaceFolder.uri, '.gitignore');
    MOCK_FS_STATE.readFileContent[gitignoreUri.fsPath] = mockTextEncoder.encode(gitignoreContent);

    const mockIgnoreInstance = {
      add: jest.fn().mockReturnThis(),
      ignores: jest.fn().mockImplementation((path: string) => {
        return path === 'secret.txt' || path === 'targetFolder/secret.txt';
      })
    } as unknown as Ignore;
    const ignoreMock = require('ignore');
    ignoreMock.default.mockImplementation(() => mockIgnoreInstance);
    ```

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson 1 (Test Design):** When testing filter or rules-based functionality, carefully consider what determines the "mode" of operation (in this case, gitignore vs. default filtering). The presence of valid rules/configuration often should determine the mode, not whether those rules actually filtered anything.
*   **Lesson 2 (ES Module Mocking):** When mocking ES modules with Jest, ensure the mock includes `__esModule: true` and provides the module's exports in the correct format (e.g., `default` export for the primary function).
*   **Lesson 3 (Test State Setup):** For complex features like gitignore filtering that involve both file content (the .gitignore file) and behavior (the ignore library), set up all required mock state (file content, mock implementations) before running tests.
*   **Prevention:** Add clear comments in the implementation about what determines filter types or modes of operation. This helps future maintainers understand the logic and write correct tests.

---
## [2025-05-30] - Jest Mock Initialization Order and TypeScript Errors with Custom Mock Properties

**Phase/Task in Development Plan:** Phase 2, Task 7 - VSCE Unit and Integration Testing (SearchService)

**Problem Encountered:**
*   **Symptoms:**
    1.  **ReferenceError:** Unit tests failed to run, throwing `ReferenceError: Cannot access 'mockVariableName' before initialization`. This occurred when `jest.mock('moduleName', factory)` was used, and the `factory` function referred to mock implementation variables (e.g., `vscodeWorkspaceFsReadDirectoryMock`) that were declared using `const` or `let` elsewhere in the test file. Jest's hoisting of `jest.mock` calls caused the factory to execute before these variable declarations.
    2.  **TypeScript Error (TS2339):** After resolving the ReferenceError by switching to `jest.doMock` (which is not hoisted) or ensuring declarations preceded `jest.mock`, a TypeScript error `TS2339: Property 'customProperty' does not exist on type 'OriginalType'` appeared. This happened when a mock object (e.g., for an `ignore` instance) was augmented with custom properties (e.g., `patterns: string[]`) for the mock's internal logic, and then these custom properties were accessed without proper type assertion.
*   **Context:** Unit testing `searchService.ts`, which depends on the `vscode` API and other local modules (`workspaceService`, `fileSystemService`, `ignore` library). The `vscode` API is extensive, requiring a complex mock setup.

**Investigation & Iterations:**
1.  **ReferenceError (Hoisting Issue):**
    *   Initial attempts involved moving variable declarations for mock implementations (e.g., `vscodeWorkspaceFsReadDirectoryMock = jest.fn();`) to the top of the file, before the `jest.mock('vscode', ...)` call. This sometimes worked for simple cases but became unwieldy and still failed if the mock factory itself was complex.
    *   The issue was confirmed to be Jest's hoisting behavior for `jest.mock`.
2.  **Switch to `jest.doMock`:**
    *   Refactored all `jest.mock` calls to `jest.doMock`. This ensures that mocks are applied at the point they appear in the code, not hoisted.
    *   All `jest.doMock` calls were placed at the top of the test file, before any `import` statements for modules that would consume these mocks (including the module under test, `searchService.ts`).
    *   Mock implementation functions (e.g., `vscodeUriParseMock = jest.fn(...)`) were defined before the `jest.doMock('vscode', ...)` call that used them.
    *   Inside `beforeEach` and tests, `await import('vscode')` was used to get a reference to the (now correctly) mocked `vscode` module.
3.  **TypeScript Error (TS2339 for Custom Mock Properties):**
    *   In the `.gitignore` test, the `mockGitignoreInstanceForTest` (typed as `Ignore`) had a custom `patterns` array added to it for the mock's `ignores` function to use.
    *   Accessing `mockGitignoreInstanceForTest.patterns` directly caused TS2339 because the `Ignore` type doesn't define `patterns`.

**Solution Implemented:**
1.  **ReferenceError Fix (Hoisting):**
    *   Adopted `jest.doMock` for all module mocks (`vscode`, `workspaceService`, `fileSystemService`, `ignore`).
    *   Ensured all `jest.doMock` calls are at the very top of the test file, before any `import` statements for modules that rely on these mocks.
    *   All variables (e.g., `jest.fn()` instances) referenced *inside* a `jest.doMock` factory function were declared *before* that `jest.doMock` call.
2.  **TypeScript Error Fix (Custom Mock Properties):**
    *   When accessing custom properties added to a mock object for its internal implementation (like `patterns` on the `mockGitignoreInstanceForTest`), cast the mock object to `any` before accessing the custom property: `((mockGitignoreInstanceForTest as any).patterns as string[])`. This tells TypeScript to bypass static type checking for that specific access, trusting that the property exists at runtime due to the mock's setup.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson 1 (Jest Hoisting with `jest.mock`):** Be acutely aware that `jest.mock` is hoisted. If its factory function refers to variables declared with `let` or `const` in the module scope, `ReferenceError`s are likely. For complex mocks or when precise control over initialization order is needed, `jest.doMock` is a more robust alternative as it's not hoisted.
*   **Lesson 2 (Order with `jest.doMock`):** When using `jest.doMock`, place these calls at the top of your test file, *before* importing the module under test or any other modules that depend on the mocked dependencies. Variables used within the `jest.doMock` factory must be declared before the `jest.doMock` call itself.
*   **Lesson 3 (TypeScript and Custom Mock Properties):** If you add custom properties to a typed mock object for the mock's internal logic, TypeScript will complain if those properties aren't part of the original type. Use a type assertion (e.g., `(myMock as any).customProp`) to bypass this for internal mock details. Alternatively, define a more specific interface for your mock that includes these custom properties, though this can be more verbose.
*   **Lesson 4 (Iterative Mock Refinement):** Mocking complex dependencies like the `vscode` API can be iterative. Start with the parts of the API directly used by the module under test and expand the mock as needed. Test failures often guide the refinement of the mock's structure and behavior.
*   **Prevention:** For modules with many dependencies or complex external APIs like `vscode`, consider establishing the `jest.doMock` pattern early. When adding custom properties to mocks for internal implementation convenience, remember to handle TypeScript's type checking appropriately (e.g., with `as any`).

---
## [2025-05-30] - Jest Test Issues with IPC Server and Async Mock Object Handling

**Phase/Task in Development Plan:** Phase 2, Task 7 - VSCE Unit and Integration Testing (IPCServer)

**Problem Encountered:**
*   **Symptoms:** Jest tests for the IPCServer class were failing due to issues with mocked object references, asynchronous timing, and mock implementation setups. Specific failing test: "should return file tree for a specified valid workspace folder" in ipcServer.test.ts. The test cases required handling complex WebSocket interactions, workspace checks, and file tree generation.
*   **Context:** Unit testing IPCServer message handling functionality, particularly focusing on the `get_file_tree` command.
*   **Initial Diagnosis/Hypothesis:** The test failures appeared to be related to either incorrect mock setup, message handling timing issues, or mock object reference inconsistencies. Mock objects for vscode.Uri and workspace folders weren't being compared correctly.

**Investigation & Iterations:**
1.  **Initial Attempt (Basic Mock Setup):**
    ```typescript
    const mockClientWsInstance = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      removeAllListeners: jest.fn(),
      terminate: jest.fn()
    };
    capturedConnectionCallback(mockClientWsInstance as any, mockRequest);
    ```
    This approach failed to properly capture and handle message callbacks.

2.  **Second Attempt (Message Callback Handling):**
    ```typescript
    const messageHandler = (mockClientWsInstance.on as jest.Mock).mock.calls
      .find((call: any[]) => call[0] === 'message')?.[1];
    await messageHandler(message);
    ```
    This improved message routing but still had issues with workspace folder object comparisons.

3.  **Final Solution (Mock Reference Management and Helper Functions):**
    ```typescript
    // Created helper for consistent message handling
    const sendTestMessage = async (message: any): Promise<void> => {
      const messageString = typeof message === 'string' ? message : JSON.stringify(message);
      await new Promise<void>((resolve) => {
        mockClientWsInstance.send.mockImplementation(() => {
          resolve();
        });
        capturedClientMessageCallback(messageString);
      });
    };

    // Maintained consistent object references
    const mockUri = mockUri1; // Shared reference object
    const mockWsFolder = mockWorkspaceFolder1; // Shared reference object
    const mockUriString = mockWorkspaceFolder1Uri;

    // Setup mocks with known reference objects
    (vscode.Uri.parse as jest.Mock).mockReturnValue(mockUri);
    mockWorkspaceServiceGetFolder.mockReturnValue(mockWsFolder);
    ```

**Solution Implemented:**
1. Created `sendTestMessage` helper function to wrap message handling in a promise and ensure proper async flow
2. Established shared reference objects for Uri and workspace folder instances to ensure consistent comparisons
3. Simplified mock implementations to use direct mockReturnValue instead of complex mockImplementation where possible
4. Added better cleanup in beforeEach to prevent test interference
5. Added explicit console logs for debugging object references

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson 1 (Mock Object References):** When testing code that compares objects (like VS Code URIs or workspace folders), maintain consistent object references throughout the test. Create objects once and reuse the same references to avoid comparison mismatches.
*   **Lesson 2 (Async Test Helpers):** For complex async operations like WebSocket message handling, create helper functions that wrap the async flow in promises and provide clear resolution points. This makes tests more reliable and easier to understand.
*   **Lesson 3 (Jest beforeEach Cleanup):** Ensure thorough cleanup in beforeEach to prevent test interference. Clear all mocks, reset event listeners, and re-establish clean mock instances.
*   **Lesson 4 (Object Reference Debugging):** Use explicit console.log statements in tests to understand object reference behavior. Log stringified objects to see their actual structure and properties.
*   **Prevention:**
    - Create shared mock objects as test-wide constants when they need consistent references
    - Add helper functions for common async test patterns
    - Use TypeScript to catch potential object shape mismatches
    - Keep mock implementations as simple as possible

---
## [2025-05-31] - Jest Test Failures with WebSocket Message Handling in IPCServer

**Phase/Task in Development Plan:** Phase 2, Task 7 - VSCE Unit and Integration Testing (IPCServer)

**Problem Encountered:**
*   **Symptoms:** Three unit tests for the `get_folder_content` command handler in `IPCServer` were failing:
    1. For the successful path test (`should return folder content for a valid path and workspace`), `expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1)` failed with 0 calls.
    2. For the error path tests (`should send FOLDER_CONTENT_ERROR...` and `should send FOLDER_CONTENT_UNEXPECTED_ERROR...`), attempts to parse `mockClientWsInstance.send.mock.calls[0][0]` resulted in a `TypeError` because `mock.calls[0]` was undefined (meaning `send` was not called).
*   **Context:** Unit testing the WebSocket message handling in IPCServer, particularly for folder content operations that involve complex interactions between URI handling, workspace folders, and async message processing.
*   **Initial Diagnosis/Hypothesis:** The mock setup for URI handling and workspace folder references wasn't properly managing object identities and async message processing, leading to WebSocket send calls not being made.

**Investigation & Iterations:**
1. **First Attempt:**
   - Improved mock implementations for vscode.Uri.parse and vscode.Uri.file
   - Made workspace folder references more consistent
   - Enhanced mock setup for URI handling
   - Test still failed due to WebSocket messages not being sent

2. **Second Attempt:**
   - Added Promise wrapping around message handling
   - Added proper mock reset and cleanup
   - Improved URI mock behavior
   - Some tests passed but some still failed due to async timing issues

3. **Final Solution:**
   - Used jest.clearAllMocks() for consistent test state
   - Improved URI mocking to match VS Code behavior
   - Added Promise resolution for async message handling
   - Fixed workspace folder path checking logic
   - All tests passed successfully

**Solution Implemented:**
1. Improved mock setup and state management:
   ```typescript
   // Clear all mocks to ensure clean state
   jest.clearAllMocks();

   // Mock workspace folder lookup with precise control
   mockWorkspaceServiceGetFolder.mockImplementation((uri) => {
     if (uri.toString() === mockWorkspaceFolder1UriString || 
         uri.fsPath.startsWith(mockWorkspaceFolder1.uri.fsPath)) {
       return mockWorkspaceFolder1;
     }
     return undefined;
   });

   // Mock URI functions consistently
   (vscode.Uri.file as jest.Mock).mockImplementation((path) => ({
     fsPath: path,
     path: path,
     scheme: 'file',
     toString: () => `file://${path}`,
     with: jest.fn().mockReturnThis()
   }));
   ```

2. Added proper async handling:
   ```typescript
   // Send message and wait for response
   await new Promise<void>((resolve) => {
     mockClientWsInstance.send.mockImplementation(() => {
       resolve();
     });
     capturedClientMessageCallback(JSON.stringify(message));
   });
   ```

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson 1 (Mock State Management):** Use jest.clearAllMocks() to ensure consistent test state when dealing with multiple mocks (WebSocket, URI, workspace folders). This is more reliable than resetting individual mocks.

*   **Lesson 2 (VS Code URI Mocking):** VS Code's URI system requires careful mocking. Uri.file and Uri.parse mocks must return objects with consistent behavior, especially toString() and fsPath properties that match actual VS Code behavior.

*   **Lesson 3 (Async WebSocket Testing):** Always wrap WebSocket message handling in Promises that resolve when the send mock is called. This ensures all async operations complete before making assertions.

*   **Lesson 4 (Object References):** When testing with complex objects like workspace folders and URIs:
    - Maintain consistent object references throughout the test
    - Use precise path checking logic in mocks
    - Consider using shared reference objects for URI and workspace folder instances

*   **Prevention:**
    - Create helper functions for common test setups (URI, workspace folders)
    - Use Promise wrappers for async message handling tests
    - Document expected mock behavior, especially for complex objects like vscode.Uri
    - Clear all mocks at the start of each test to ensure clean state

---
## [2025-05-31] - Verifying Error Logging: Mocking `console.error` in Tests

**Phase/Task in Development Plan:** Unit Testing IPCServer (stop method)

**Problem Encountered:**
*   **Symptoms:** Needed to verify that `console.error` was called with specific arguments when an error occurs during a non-critical part of an operation (e.g., failing to close one client WebSocket during server shutdown, while other operations should continue).
*   **Context:** Testing the `ipcServer.stop()` method's error handling for individual client cleanup.

**Solution Implemented:**
*   Used `jest.spyOn(console, 'error').mockImplementation(() => {});` in the `beforeEach` of the relevant test suite to spy on `console.error` and suppress its output during tests.
*   Asserted `expect(console.error).toHaveBeenCalledWith(...)` in the test case.
*   Restored the original `console.error` using `mockConsoleError.mockRestore()` in an `afterEach` block to prevent interference with other tests.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson:** When testing code that is expected to log errors to the console (e.g., `console.error`, `console.warn`), use `jest.spyOn` to verify these calls and their arguments. Mocking the implementation (e.g., with an empty function) can also keep test output clean.
*   **Prevention:** Always restore spies on global objects like `console` in an `afterEach` or `afterAll` block to ensure test isolation.

---
## [2025-05-31] - Unit Testing Server Methods by Direct State Manipulation

**Phase/Task in Development Plan:** Unit Testing IPCServer (pushSnippetToTarget, stop methods)

**Problem Encountered:**
*   **Symptoms:** Needed to test public methods of `IPCServer` (like `pushSnippetToTarget` or `stop`) that depend on internal server state (e.g., the list of connected clients, the active WebSocket server instance `wss`) without going through the full complexity of simulating client connections and message sequences for each test case.
*   **Context:** Testing methods that are not direct message handlers but operate on the server's established state.

**Solution Implemented:**
*   In the `beforeEach` or specific tests for these methods, directly accessed and manipulated the internal state of the `ipcServer` instance. For example:
    *   `(ipcServer as any).clients.set(mockClientWs, mockClientState);` to add mock clients.
    *   `(ipcServer as any).wss = mockWebSocketServerInstance;` to simulate an active server.
    *   `(ipcServer as any).wss = null;` to simulate a stopped server.
*   This allowed for precise setup of the conditions required to test the target method's logic in isolation.

**Key Takeaway(s) / How to Avoid in Future:**
*   **Lesson:** For unit testing specific public methods of a stateful class (like a server), it can be effective to directly manipulate the class's internal state for test setup if the alternative (simulating all prerequisite actions) is overly complex or not the focus of the test. Use type assertions like `(instance as any).internalProperty` to bypass TypeScript's visibility checks for this purpose.
*   **Caution:** This technique should be used judiciously for unit tests where internal state setup is necessary and clearly documented. It makes tests more reliant on internal implementation details. Integration tests should still verify the methods through more external interactions.
*   **Prevention:** Clearly delineate which tests rely on internal state manipulation and why. Ensure `jest.clearAllMocks()` and proper `beforeEach` setup prevent state leakage between tests.

---

<!-- Add new log entries above this line | This comment must remain at the end of the file -->