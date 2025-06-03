## Development Plan: ContextWeaver

**Note for Updaters:**
This document outlines the phases and key tasks for creating the ContextWeaver. To maintain clarity and track progress effectively, please adhere to the following conventions when updating this plan:
1.  **Task Status Markers:**
    *   Use `[ ]` for tasks not started or in progress.
    *   Use `[√]` for successfully completed tasks.
    *   Use `[x]` for tasks attempted but failed or blocked (requires an explanation in `docs/TROUBLESHOOTING_AND_LESSONS_LEARNED.md`).
    *   Place the status marker at the **beginning** of each task or step line, followed by a single space. Ensure all markers are visually aligned.
2.  **Completed Tasks (`[√]`):**
    *   For each task or sub-task marked as `[√]`, append a remark specifying the primary source code files involved in its completion.
    *   Format: `(Relevant files: path/to/file1.ext, path/to/file2.ext, ...)`
    *   Exclude documentation files (e.g., `.md` files from `docs/`) from this remark. Focus on actual code or configuration files (e.g., `.ts`, `.html`, `.json` like `package.json`, `tsconfig.json`).
    *   Aim for 1-5 key files. For very broad tasks, a general description like `(Relevant files: multiple configuration files and core modules)` is acceptable. If a task primarily produced documentation and no direct code changes, state `(Relevant files: No specific code files for this task)`.

Diligent status updates are essential for effective project management.

---

**Phase 1: Foundation & IPC Design** 
*   **Goal:** Establish the project structure, define the core communication protocol, and create basic functional shells for both extensions.
*   **Key Tasks:**
    *   [√] **Project Setup** (Relevant files: `.gitignore`, `package.json` (root, vscode-extension, chrome-extension, shared), `tsconfig.json` (vscode-extension, chrome-extension, shared), `.eslintrc.json` (vscode-extension, chrome-extension))
        *   [√] Establish separate version control repositories (or a monorepo structure) for the VSCE and CE.
        *   [√] Set up build systems for both extensions (e.g., TypeScript compilation, bundlers if necessary).
    *   [√] **Detailed Inter-Plugin Communication (IPC) Protocol Design** (Relevant files: No specific new code files for this design task; implementation occurs in IPC server/client.)
        *   [√] Artifact: `docs/IPC_Protocol_Design.md`
        *   [√] Finalize the choice of IPC mechanism (e.g., WebSockets).
        *   [√] Define all message types or API endpoints required for each functional requirement (e.g., requesting file tree, file content, folder content, entire codebase, search, registering active Chrome tab, sending snippet from VS Code).
        *   [√] Specify precise JSON schemas (or equivalent structured format) for all request and response payloads. This includes the metadata for context block indicators (`unique_block_id`, `content_source_id`, `type`, `label`).
        *   [√] Define the authentication mechanism (e.g., user-configured shared secret token) for IPC.
        *   [√] Outline the format for error messages to be exchanged over IPC.
        *   [√] Determine and document the port configuration and discovery strategy (as per FR-IPC-002).
    *   [√] **VSCE - Basic Server Implementation** (Relevant files: `packages/vscode-extension/src/ipcServer.ts`, `packages/vscode-extension/src/extension.ts`)
        *   [√] Implement the chosen server (e.g., WebSocket server) listening on `localhost`.
        *   [√] Implement basic connection handling and the agreed-upon authentication mechanism.
        *   [√] Create stub handlers for all defined IPC messages that return placeholder data according to the defined schemas.
    *   [√] **CE - Basic Client Implementation** (Relevant files: `packages/chrome-extension/src/serviceWorker.ts`, `packages/chrome-extension/options.html`, `packages/chrome-extension/src/options.ts`, `packages/chrome-extension/manifest.json`)
        *   [√] Implement the client logic to connect to the VSCE server.
        *   [√] Implement the client-side of the agreed-upon authentication mechanism.
        *   [√] Create stub functions to send all defined IPC messages and log/handle placeholder responses.
    *   [√] **Initial "Handshake" Test** (Relevant files: `packages/vscode-extension/src/ipcServer.ts`, `packages/chrome-extension/src/serviceWorker.ts`, `packages/chrome-extension/src/popup.ts`)

---

**Phase 2: VS Code Extension - Core Logic Implementation**
*   **Goal:** Implement all data provision and service functionalities within the VSCE.
*   **Key Tasks:**
    *   [√] **File System Data Provisioning** (Relevant files: `packages/vscode-extension/src/fileSystemService.ts`, `packages/vscode-extension/src/ipcServer.ts`)
        *   [√] Implement logic to generate a textual representation of the file and folder hierarchy for a given workspace/folder (for FR-VSCE-001).
        *   [√] Implement logic to read and provide the full UTF-8 text content of specified files, including silent skipping of binary files (for FR-VSCE-002).
        *   [√] Implement logic to read and concatenate content of all text files within a specified folder and its subfolders (for FR-VSCE-003).
        *   [√] Implement logic to read and concatenate content of all text files within a **specified active workspace folder** (identified by URI in the IPC request, for FR-VSCE-004).
        *   [√] Initial implementation will use default ignore patterns; full `.gitignore` integration for this feature is part of Task 2 (Content Filtering Logic).
    *   [√] **Content Filtering Logic** (Relevant files: `packages/vscode-extension/src/fileSystemService.ts`, `packages/vscode-extension/tests/unit/fileSystemService.test.ts`)
        *   [√] Implement parsing of the root `.gitignore` file for each workspace folder.
        *   [√] Apply parsed `.gitignore` rules to exclude files/folders from content provision operations (e.g., `get_folder_content`, `get_entire_codebase` once integrated).
        *   [√] Implement fallback to a predefined set of default exclusion patterns if `.gitignore` is missing or malformed (for FR-VSCE-005).
        *   [√] Ensure the active filter set (project or default) can be reported to the CE.
    *   [√] **Search Service Implementation** (Relevant files: `packages/vscode-extension/src/searchService.ts`, `packages/vscode-extension/src/ipcServer.ts`, `packages/vscode-extension/tests/unit/searchService.test.ts`)
        *   [√] Implement a service to search for files and folders within trusted workspace folders based on a query string (for FR-VSCE-006).
        *   [√] Ensure search results include necessary metadata for CE display and `content_source_id` generation.
    *   [√] **Snippet Sending Functionality** (Relevant files: `packages/vscode-extension/src/snippetService.ts`, `packages/vscode-extension/src/extension.ts`, `packages/vscode-extension/src/ipcServer.ts`, `packages/vscode-extension/tests/unit/snippetService.test.ts`, `packages/vscode-extension/tests/unit/extensionCommandHandlers.test.ts`)
        *   [√] Implement the VS Code context menu item for initiating snippet sending (for FR-VSCE-007).
        *   [√] Implement the logic to extract selected text, file path, line numbers, and language ID.
        *   [√] Implement the IPC mechanism to push snippet data (including indicator metadata) to the registered active CE target.
    *   [√] **Workspace and State Management** (Relevant files: `packages/vscode-extension/src/workspaceService.ts`, `packages/vscode-extension/src/ipcServer.ts`, `packages/vscode-extension/src/extension.ts`, `packages/vscode-extension/tests/unit/workspaceService.test.ts`)
        *   [√] Implement support for multi-root workspaces, ensuring data from different folders is distinguishable and `content_source_id`s are unique (for FR-VSCE-008).
        *   [√] Integrate Workspace Trust checks before any file system access (for FR-VSCE-009).
        *   [√] Implement logic to detect and report "no project open" state via IPC.
    *   [√] **IPC Integration and Metadata Generation** (Relevant files: `packages/vscode-extension/src/ipcServer.ts`)
        *   [√] Replace all stub IPC handlers in the VSCE server with the actual core logic implementations.
        *   [√] Ensure all data responses to the CE include the required metadata for context block indicators (`unique_block_id`, `content_source_id`, `type`, `label`) as per FR-IPC-005.
    *   [√] **VSCE Unit and Integration Testing** (Relevant files: `packages/vscode-extension/tests/unit/ipcServer.test.ts`, `packages/vscode-extension/tests/unit/fileSystemService.test.ts`, `packages/vscode-extension/tests/unit/searchService.test.ts`, `packages/vscode-extension/tests/unit/snippetService.test.ts`, `packages/vscode-extension/tests/unit/workspaceService.test.ts`, `packages/vscode-extension/tests/unit/extensionCommandHandlers.test.ts`)
        *   [√] Develop unit tests for individual modules (filtering, search, data extraction).
        *   [√] Develop integration tests for IPC endpoints using a mock client.

---

**Phase 3: Chrome Extension - UI and Functionality Implementation**
*   **Goal:** Develop the user interface and client-side logic for the CE.
*   **Key Tasks:**
    *   [√] **Floating UI and Trigger Mechanism** (Relevant files: `packages/chrome-extension/src/contentScript.ts`, `packages/chrome-extension/manifest.json`)
        *   [√] Implement the content script logic to detect the `@` trigger in designated LLM chat input fields (for FR-CE-001).
        *   [√] Develop the fundamental structure, styling, and basic interactive elements of the floating UI (for FR-CE-002, UI-CE-001).
        *   [√] Implement UI dismissal logic (Escape key, click-outside, post-insertion) (for FR-CE-011).
    *   [√] **Implementation of Core Actions (Non-Search)** (Relevant files: packages/chrome-extension/src/contentScript.ts, packages/chrome-extension/src/serviceWorker.ts. Note: UI for direct invocation of File Tree / Full Codebase per FR-CE-002 needs review; Active File duplicate check missing.)
        *   [√] Implement the "Insert Project File Directory Structure" option, including IPC request and content insertion (for FR-CE-004).
        *   [√] Implement the "Insert Entire Codebase Content" option (for FR-CE-005).
        *   [√] Implement the "Insert Active File's Content" option (for FR-CE-006).
        *   [√] Implement the "Insert Content of Currently Open Files" option, including the UI for selecting files from a list provided by VSCE (for FR-CE-007).
    *   [√] **Search Functionality Implementation** (Relevant files: `packages/chrome-extension/src/contentScript.ts`, `packages/chrome-extension/src/serviceWorker.ts`, `packages/vscode-extension/src/ipcServer.ts`, `packages/vscode-extension/src/fileSystemService.ts`)
        *   [√] Implement the UI for search query input within the floating panel. (Relevant files: packages/chrome-extension/src/contentScript.ts)
            *   *(Note: Implementation evolved to real-time search based on LLM input, rather than a separate input field in the panel, fulfilling the objective of UI for search query handling).*
        *   [√] Implement sending search queries to VSCE via IPC and dynamically updating the floating UI with results (for FR-CE-003). (Relevant files: packages/chrome-extension/src/contentScript.ts, packages/chrome-extension/src/serviceWorker.ts)
        *   [√] Implement the "Insert Searched File Content" action (for FR-CE-008). (Relevant files: packages/chrome-extension/src/contentScript.ts)
        *   [√] Implement the hybrid UX for "Insert Searched Folder Content", including the "Browse" functionality with a tree-like view and checkboxes (for FR-CE-009, UI-CE-005). (Relevant files: packages/chrome-extension/src/contentScript.ts, packages/chrome-extension/src/serviceWorker.ts, packages/vscode-extension/src/ipcServer.ts, packages/vscode-extension/src/fileSystemService.ts)
            *   *(This also covers the VSCE mini-task for `list_folder_contents` as it was a dependency for this specific sub-task's full implementation).*
    *   [√] **Context Block Indicator Management** (Relevant files: `packages/chrome-extension/src/contentScript.ts`)
        *   [√] Implement the dynamic display of context block indicators above the LLM chat input area based on received metadata (for FR-CE-014, UI-CE-006). (Relevant files: `packages/chrome-extension/src/contentScript.ts` - `renderContextIndicators` and its callers)
        *   [√] Implement the close button functionality for each indicator, including removal of the indicator and the corresponding text block from the chat input (for FR-CE-015). (Relevant files: `packages/chrome-extension/src/contentScript.ts` - `renderContextIndicators`'s `closeBtn.onclick` handler)
    *   [√] **Duplicate Content Prevention** (Relevant files: `packages/chrome-extension/src/contentScript.ts`)
        *   [√] Implement client-side logic to maintain a list of active `content_source_id`s (for FR-CE-016). (Relevant files: `packages/chrome-extension/src/contentScript.ts` - `activeContextBlocks` array and its usage)
        *   [√] Implement checks before requesting content to prevent insertion of duplicate sources (except snippets). (Relevant files: `packages/chrome-extension/src/contentScript.ts` - in `renderWorkspaceFolders` for File Tree/Full Codebase, and in `activeFileButton.onclick`)
        *   [√] Implement UI notifications for duplicate insertion attempts (for UI-CE-007). (Relevant files: `packages/chrome-extension/src/contentScript.ts` - in relevant click handlers)
    *   [√] **Snippet Receiving and Insertion** (Relevant files: `packages/chrome-extension/src/contentScript.ts`, `packages/chrome-extension/src/serviceWorker.ts`)
        *   [√] Implement the IPC listener (e.g., WebSocket message handler) to receive pushed snippet data from VSCE. (Relevant files: `packages/chrome-extension/src/serviceWorker.ts` - `IPCClient.handleServerMessage` and `chrome.tabs.sendMessage` usage)
        *   [√] Implement logic to insert the received snippet content and display its indicator (for FR-CE-013). (Relevant files: `packages/chrome-extension/src/contentScript.ts` - `chrome.runtime.onMessage` handler for `push_snippet`)
    *   [√] **State, Error Handling, and UI Refinements** (Relevant files: packages/chrome-extension/src/contentScript.ts, packages/chrome-extension/src/options.ts. Note: Filter type icon (UI-CE-003) is pending.)
        *   [√] Implement display of loading indicators in the floating UI during IPC operations (for UI-CE-002).
        *   [ ] Implement display of all specified error and status messages (for ERR-001 to ERR-005, UI-CE-003).
        *   [ ] Implement UI grouping for multi-project/multi-folder data received from VSCE (for FR-CE-012, UI-CE-004).
    *   [ ] **CE Unit and Integration Testing**
        *   [ ] Develop unit tests for UI components and client-side logic.
        *   [ ] Develop integration tests for IPC client logic using a mock VSCE server.

---

**Phase 4: Full Integration, System Testing & Refinement**
*   **Goal:** Ensure both extensions work together seamlessly, robustly, and performantly.
*   **Key Tasks:**
    *   [ ] **End-to-End (E2E) System Testing**
        *   [ ] Test all user flows as defined in the SRS, using the actual VSCE and CE.
        *   [ ] Verify correct data insertion, formatting, and indicator management.
        *   [ ] Test duplicate prevention logic thoroughly.
    *   [ ] **IPC Robustness Testing**
        *   [ ] Test scenarios like VSCE server not running, connection drops, timeouts, and authentication failures.
    *   [ ] **Performance Testing**
        *   [ ] Test with large workspaces, numerous files, and large individual files.
        *   [ ] Measure UI responsiveness for search and dynamic updates.
    *   [ ] **Security Review**
        *   [ ] Validate IPC authentication mechanism and `localhost`-only binding of the VSCE server.
        *   [ ] Ensure VSCE correctly handles Workspace Trust.
    *   [ ] **Usability Testing & Feedback Collection**
        *   [ ] Conduct internal or limited user testing to gather feedback on ease of use, clarity of UI, and overall workflow.
    *   [ ] **Bug Fixing and Refinement**
        *   [ ] Address all critical and major bugs identified during testing.
        *   [ ] Refine UI/UX based on feedback.
    *   [ ] **Documentation Creation**
        *   [ ] Draft user guide covering installation, configuration (IPC token, port), and usage of all features.
        *   [ ] Prepare internal developer documentation (e.g., notes on build process, IPC protocol details for maintenance).

---

**Phase 5: Packaging & Release Preparation**
*   **Goal:** Prepare the extensions for distribution.
*   **Key Tasks:**
    *   [ ] **Final Code Freeze and Testing**
        *   [ ] Perform final regression testing.
    *   [ ] **Packaging**
        *   [ ] Create the installable `.vsix` file for the VS Code extension.
        *   [ ] Create the installable `.zip` file for the Chrome extension.
    *   [ ] **Marketplace Asset Preparation**
        *   [ ] Prepare icons, screenshots, feature lists, and detailed descriptions for the VS Code Marketplace and Chrome Web Store.
        *   [ ] Finalize user documentation.
    *   [ ] **Publishing (Staging/Private if possible, then Public)**
        *   [ ] Publish the VSCE to the VS Code Marketplace.
        *   [ ] Publish the CE to the Chrome Web Store.
    *   [ ] **Post-Release Monitoring Plan**
        *   [ ] Establish a plan for monitoring user feedback, reviews, and bug reports post-launch.

---

**Key Milestones (Illustrative):**

*   [√] Phase 1 Completion: IPC Protocol Document v1.0 finalized. Basic "ping" and connection successfully tested between extensions (token authentication removed, port fallback implemented).
*   [√] Phase 2 Completion: VSCE core logic fully implemented and unit/integration tested against a mock client. All data provision and service functionalities are operational.
*   [ ] Phase 3 Completion: CE UI and client-side logic fully implemented and unit/integration tested against a mock server. All user interactions and indicator functionalities are operational.
*   [ ] Phase 4 Completion: System fully integrated. E2E testing, performance testing, and security review completed. Major bugs resolved. User documentation drafted. Release Candidate available.
*   [ ] Phase 5 Completion: Extensions successfully packaged and published to respective marketplaces.

This detailed plan should provide a solid roadmap for you. Remember that flexibility is key, and this plan may need adjustments as development progresses.
