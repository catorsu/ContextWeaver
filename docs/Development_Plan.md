## Development Plan: ContextWeaver

This development plan outlines the phases and key tasks for creating the ContextWeaver, comprising a VS Code Extension (VSCE) and a Chrome Extension (CE). Throughout the development lifecycle, task status markers will be used to track progress:

*   `[ ]` - Task not started/in progress
*   `[√]` - Task successfully completed  
*   `[x]` - Task attempted but failed/blocked (requires explanation in logs)

This tracking system helps monitor progress and identify impediments during development. Your diligent status updates are essential for effective project management.

---

**Phase 1: Foundation & IPC Design** `[ ]`
*   **Goal:** Establish the project structure, define the core communication protocol, and create basic functional shells for both extensions.
*   **Key Tasks:**
    1.  **Project Setup** `[√]`
        *   Establish separate version control repositories (or a monorepo structure) for the VSCE and CE. `[√]`
        *   Set up build systems for both extensions (e.g., TypeScript compilation, bundlers if necessary). `[√]`
    2.  **Detailed Inter-Plugin Communication (IPC) Protocol Design** `[Pending Review]`
        *   Artifact: `docs/IPC_Protocol_Design.md`
        *   Finalize the choice of IPC mechanism (e.g., WebSockets). `[√]`
        *   Define all message types or API endpoints required for each functional requirement (e.g., requesting file tree, file content, folder content, entire codebase, search, registering active Chrome tab, sending snippet from VS Code). `[√]`
        *   Specify precise JSON schemas (or equivalent structured format) for all request and response payloads. This includes the metadata for context block indicators (`unique_block_id`, `content_source_id`, `type`, `label`). `[√]`
        *   Define the authentication mechanism (e.g., user-configured shared secret token) for IPC. `[√]`
        *   Outline the format for error messages to be exchanged over IPC. `[√]`
        *   Determine and document the port configuration and discovery strategy (as per FR-IPC-002). `[√]`
    3.  **VSCE - Basic Server Implementation** `[√]`
        *   Implement the chosen server (e.g., WebSocket server) listening on `localhost`. `[√]`
        *   Implement basic connection handling and the agreed-upon authentication mechanism. `[√]`
        *   Create stub handlers for all defined IPC messages that return placeholder data according to the defined schemas. `[√]`
    4.  **CE - Basic Client Implementation** `[ ]`
        *   Implement the client logic to connect to the VSCE server. `[ ]`
        *   Implement the client-side of the agreed-upon authentication mechanism. `[ ]`
        *   Create stub functions to send all defined IPC messages and log/handle placeholder responses. `[ ]`
    5.  **Initial "Handshake" Test** `[ ]`
        *   Implement a simple "status" or "ping" request/response flow to verify basic IPC connectivity and authentication between the fully stubbed VSCE server and CE client. `[ ]`

---

**Phase 2: VS Code Extension - Core Logic Implementation** `[ ]`
*   **Goal:** Implement all data provision and service functionalities within the VSCE.
*   **Key Tasks:**
    1.  **File System Data Provisioning** `[ ]`
        *   Implement logic to generate a textual representation of the file and folder hierarchy for a given workspace/folder (for FR-VSCE-001). `[ ]`
        *   Implement logic to read and provide the full UTF-8 text content of specified files, including silent skipping of binary files (for FR-VSCE-002). `[ ]`
        *   Implement logic to read and concatenate content of all text files within a specified folder and its subfolders (for FR-VSCE-003). `[ ]`
        *   Implement logic to read and concatenate content of all text files within the entire active workspace folder(s) (for FR-VSCE-004). `[ ]`
    2.  **Content Filtering Logic** `[ ]`
        *   Implement parsing of the root `.gitignore` file for each workspace folder. `[ ]`
        *   Apply parsed `.gitignore` rules to exclude files/folders from content provision operations. `[ ]`
        *   Implement fallback to a predefined set of default exclusion patterns if `.gitignore` is missing or malformed (for FR-VSCE-005). `[ ]`
        *   Ensure the active filter set (project or default) can be reported to the CE. `[ ]`
    3.  **Search Service Implementation** `[ ]`
        *   Implement a service to search for files and folders within trusted workspace folders based on a query string (for FR-VSCE-006). `[ ]`
        *   Ensure search results include necessary metadata for CE display and `content_source_id` generation. `[ ]`
    4.  **Snippet Sending Functionality** `[ ]`
        *   Implement the VS Code context menu item for initiating snippet sending (for FR-VSCE-007). `[ ]`
        *   Implement the logic to extract selected text, file path, line numbers, and language ID. `[ ]`
        *   Implement the IPC mechanism to push snippet data (including indicator metadata) to the registered active CE target. `[ ]`
    5.  **Workspace and State Management** `[ ]`
        *   Implement support for multi-root workspaces, ensuring data from different folders is distinguishable and `content_source_id`s are unique (for FR-VSCE-008). `[ ]`
        *   Integrate Workspace Trust checks before any file system access (for FR-VSCE-009). `[ ]`
        *   Implement logic to detect and report "no project open" state via IPC. `[ ]`
    6.  **IPC Integration and Metadata Generation** `[ ]`
        *   Replace all stub IPC handlers in the VSCE server with the actual core logic implementations. `[ ]`
        *   Ensure all data responses to the CE include the required metadata for context block indicators (`unique_block_id`, `content_source_id`, `type`, `label`) as per FR-IPC-005. `[ ]`
    7.  **VSCE Unit and Integration Testing** `[ ]`
        *   Develop unit tests for individual modules (filtering, search, data extraction). `[ ]`
        *   Develop integration tests for IPC endpoints using a mock client. `[ ]`

---

**Phase 3: Chrome Extension - UI and Functionality Implementation** `[ ]`
*   **Goal:** Develop the user interface and client-side logic for the CE.
*   **Key Tasks:**
    1.  **Floating UI and Trigger Mechanism** `[ ]`
        *   Implement the content script logic to detect the `@` trigger in designated LLM chat input fields (for FR-CE-001). `[ ]`
        *   Develop the fundamental structure, styling, and basic interactive elements of the floating UI (for FR-CE-002, UI-CE-001). `[ ]`
        *   Implement UI dismissal logic (Escape key, click-outside, post-insertion) (for FR-CE-011). `[ ]`
    2.  **Implementation of Core Actions (Non-Search)** `[ ]`
        *   Implement the "Insert Project File Directory Structure" option, including IPC request and content insertion (for FR-CE-004). `[ ]`
        *   Implement the "Insert Entire Codebase Content" option (for FR-CE-005). `[ ]`
        *   Implement the "Insert Active File's Content" option (for FR-CE-006). `[ ]`
        *   Implement the "Insert Content of Currently Open Files" option, including the UI for selecting files from a list provided by VSCE (for FR-CE-007). `[ ]`
    3.  **Search Functionality Implementation** `[ ]`
        *   Implement the UI for search query input within the floating panel. `[ ]`
        *   Implement sending search queries to VSCE via IPC and dynamically updating the floating UI with results (for FR-CE-003). `[ ]`
        *   Implement the "Insert Searched File Content" action (for FR-CE-008). `[ ]`
        *   Implement the hybrid UX for "Insert Searched Folder Content", including the "Browse" functionality with a tree-like view and checkboxes (for FR-CE-009, UI-CE-005). `[ ]`
    4.  **Context Block Indicator Management** `[ ]`
        *   Implement the dynamic display of context block indicators above the LLM chat input area based on received metadata (for FR-CE-014, UI-CE-006). `[ ]`
        *   Implement the close button functionality for each indicator, including removal of the indicator and the corresponding text block from the chat input (for FR-CE-015). `[ ]`
    5.  **Duplicate Content Prevention** `[ ]`
        *   Implement client-side logic to maintain a list of active `content_source_id`s (for FR-CE-016). `[ ]`
        *   Implement checks before requesting content to prevent insertion of duplicate sources (except snippets). `[ ]`
        *   Implement UI notifications for duplicate insertion attempts (for UI-CE-007). `[ ]`
    6.  **Snippet Receiving and Insertion** `[ ]`
        *   Implement the IPC listener (e.g., WebSocket message handler) to receive pushed snippet data from VSCE. `[ ]`
        *   Implement logic to insert the received snippet content and display its indicator (for FR-CE-013). `[ ]`
    7.  **State, Error Handling, and UI Refinements** `[ ]`
        *   Implement display of loading indicators in the floating UI during IPC operations (for UI-CE-002). `[ ]`
        *   Implement display of all specified error and status messages (for ERR-001 to ERR-005, UI-CE-003). `[ ]`
        *   Implement UI grouping for multi-project/multi-folder data received from VSCE (for FR-CE-012, UI-CE-004). `[ ]`
    8.  **CE Unit and Integration Testing** `[ ]`
        *   Develop unit tests for UI components and client-side logic. `[ ]`
        *   Develop integration tests for IPC client logic using a mock VSCE server. `[ ]`

---

**Phase 4: Full Integration, System Testing & Refinement** `[ ]`
*   **Goal:** Ensure both extensions work together seamlessly, robustly, and performantly.
*   **Key Tasks:**
    1.  **End-to-End (E2E) System Testing** `[ ]`
        *   Test all user flows as defined in the SRS, using the actual VSCE and CE. `[ ]`
        *   Verify correct data insertion, formatting, and indicator management. `[ ]`
        *   Test duplicate prevention logic thoroughly. `[ ]`
    2.  **IPC Robustness Testing** `[ ]`
        *   Test scenarios like VSCE server not running, connection drops, timeouts, and authentication failures. `[ ]`
    3.  **Performance Testing** `[ ]`
        *   Test with large workspaces, numerous files, and large individual files. `[ ]`
        *   Measure UI responsiveness for search and dynamic updates. `[ ]`
    4.  **Security Review** `[ ]`
        *   Validate IPC authentication mechanism and `localhost`-only binding of the VSCE server. `[ ]`
        *   Ensure VSCE correctly handles Workspace Trust. `[ ]`
    5.  **Usability Testing & Feedback Collection** `[ ]`
        *   Conduct internal or limited user testing to gather feedback on ease of use, clarity of UI, and overall workflow. `[ ]`
    6.  **Bug Fixing and Refinement** `[ ]`
        *   Address all critical and major bugs identified during testing. `[ ]`
        *   Refine UI/UX based on feedback. `[ ]`
    7.  **Documentation Creation** `[ ]`
        *   Draft user guide covering installation, configuration (IPC token, port), and usage of all features. `[ ]`
        *   Prepare internal developer documentation (e.g., notes on build process, IPC protocol details for maintenance). `[ ]`

---

**Phase 5: Packaging & Release Preparation** `[ ]`
*   **Goal:** Prepare the extensions for distribution.
*   **Key Tasks:**
    1.  **Final Code Freeze and Testing** `[ ]`
        *   Perform final regression testing. `[ ]`
    2.  **Packaging** `[ ]`
        *   Create the installable `.vsix` file for the VS Code extension. `[ ]`
        *   Create the installable `.zip` file for the Chrome extension. `[ ]`
    3.  **Marketplace Asset Preparation** `[ ]`
        *   Prepare icons, screenshots, feature lists, and detailed descriptions for the VS Code Marketplace and Chrome Web Store. `[ ]`
        *   Finalize user documentation. `[ ]`
    4.  **Publishing (Staging/Private if possible, then Public)** `[ ]`
        *   Publish the VSCE to the VS Code Marketplace. `[ ]`
        *   Publish the CE to the Chrome Web Store. `[ ]`
    5.  **Post-Release Monitoring Plan** `[ ]`
        *   Establish a plan for monitoring user feedback, reviews, and bug reports post-launch. `[ ]`

---

**Key Milestones (Illustrative):**

*   Phase 1 Completion: IPC Protocol Document v1.0 finalized. Basic "ping" and authentication successfully tested between stubbed extensions. `[ ]`
*   Phase 2 Completion: VSCE core logic fully implemented and unit/integration tested against a mock client. All data provision and service functionalities are operational. `[ ]`
*   Phase 3 Completion: CE UI and client-side logic fully implemented and unit/integration tested against a mock server. All user interactions and indicator functionalities are operational. `[ ]`
*   Phase 4 Completion: System fully integrated. E2E testing, performance testing, and security review completed. Major bugs resolved. User documentation drafted. Release Candidate available. `[ ]`
*   Phase 5 Completion: Extensions successfully packaged and published to respective marketplaces. `[ ]`

This detailed plan should provide a solid roadmap for you. Remember that flexibility is key, and this plan may need adjustments as development progresses.