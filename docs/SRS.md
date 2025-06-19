## Software Requirements Specification: ContextWeaver

**Table of Contents:**

1.  **Introduction**
    1.1. Purpose
    1.2. Scope
    1.3. Definitions, Acronyms, and Abbreviations
    1.4. Overview
2.  **Overall Description**
    2.1. Product Perspective
    2.2. Product Functions
    2.3. User Characteristics
    2.4. Constraints
    2.5. Assumptions and Dependencies
3.  **Specific Requirements**
    3.1. Functional Requirements
        3.1.1. Chrome Extension
        3.1.2. VS Code Extension
        3.1.3. Inter-Plugin Communication (IPC)
    3.2. User Interface (UI) Requirements (Chrome Extension)
    3.3. Data Formatting Requirements
    3.4. Performance Requirements
    3.5. Security Requirements
    3.6. Error Handling and State Management
4.  **Future Considerations / Out of Scope for V1**

---

### 1. Introduction

#### 1.1. Purpose
This document specifies the requirements for the "ContextWeaver," a system comprising a VS Code extension and a Chrome browser extension. The system aims to provide users with a convenient and efficient way to add content and context from their VS Code projects directly into Large Language Model (LLM) chat interfaces (e.g., chat.deepseek.com).

#### 1.2. Scope
The system will:
*   Allow users to trigger a context-aware UI from within supported LLM web interfaces.
*   Enable users to insert project file/folder structures, entire codebase content (filtered by `.gitignore`), specific file contents, or specific folder contents from their active VS Code workspace(s) into the LLM chat input.
*   Enable users to search for files/folders within their VS Code workspace(s) and insert their content.
*   Allow users to send selected code snippets from VS Code to the LLM chat input.
*   Handle communication between the Chrome extension and the VS Code extension.
*   Provide visual indicators for content blocks inserted into the LLM chat, allowing users to see at a glance what context has been added and to remove specific blocks.
*   Prevent the insertion of duplicate file or folder content if that exact content source is already represented by an active context block indicator (code snippets are exempt from this check).


The system will **not**:
*   Impose or manage LLM context token limits; this is the user's responsibility.
*   Provide summaries or abstracts of code; full content insertion is the goal.
*   Support complex `.gitignore` parsing beyond the project's root `.gitignore` file for V1.

#### 1.3. Definitions, Acronyms, and Abbreviations
*   **LLM:** Large Language Model
*   **IDE:** Integrated Development Environment (referring to VS Code)
*   **IPC:** Inter-Plugin Communication
*   **UI:** User Interface
*   **VSCE:** VS Code Extension
*   **CE:** Chrome Extension

#### 1.4. Overview
This document details the functional and non-functional requirements for both the VSCE and CE components, their interaction, data formatting, error handling, and security considerations.

---

### 2. Overall Description

#### 2.1. Product Perspective
The ContextWeaver is a developer tool designed to augment the experience of interacting with web-based LLMs. It acts as a bridge between the developer's local coding environment (VS Code) and the LLM interface in the browser, reducing context-switching and manual copy-pasting.

#### 2.2. Product Functions
*   **Chrome Extension (CE):**
    *   Detects user intent to add context (via `@` trigger).
    *   Displays a floating UI for context selection.
    *   Communicates with the VSCE to request project data.
    *   Inserts selected/retrieved data into the LLM chat input.
*   **VS Code Extension (VSCE):**
    *   Acts as a data provider for project structure and file content.
    *   Filters content based on the root `.gitignore` file or default rules.
    *   Provides search functionality across workspace files and folders.
    *   Hosts a local server for IPC with the CE.
    *   Allows sending selected code snippets to the CE.

#### 2.3. User Characteristics
The target users are software developers and other technical users who:
*   Use VS Code as their primary IDE.
*   Interact with web-based LLMs for coding assistance, documentation, or learning.
*   Need to frequently provide code or project context to LLMs.

#### 2.4. Constraints
*   The system relies on the APIs provided by VS Code and Google Chrome.
*   IPC will occur over localhost.
*   The VSCE will run a local server (HTTP/WebSocket).
*   The CE will run as a content script and potentially a service worker in the browser.

#### 2.5. Assumptions and Dependencies
*   Users have VS Code and Google Chrome installed.
*   Users have both the VSCE and CE installed and enabled.
*   The VSCE is running and a project/workspace is open in VS Code for data to be available.
*   The target LLM interface is web-based and accessible to Chrome content scripts.

---

### 3. Specific Requirements

#### 3.1. Functional Requirements

##### 3.1.1. Chrome Extension (CE)

*   **FR-CE-001: Trigger Activation:**
    *   The CE shall detect when the user types `@` in the chat input field of supported LLM web interfaces (e.g., chat.deepseek.com).
    *   Upon detection, a floating UI shall be displayed near the chat input.

*   FR-CE-002: Floating UI - Basic Options (No Search Query):
    *   If `@` is typed followed by a space or end of input, the floating UI shall present the following primary options:
        1.  "Insert Active File's Content" (from VS Code)
        2.  "Insert Content of Currently Open Files" (from VS Code)
    *   Additionally, for each detected workspace folder from VS Code, the UI shall present options such as:
        1.  "File Tree" (for that workspace folder)
        2.  "Full Codebase" (for that workspace folder)
        3.  "Problems" (for that workspace folder)

*   **FR-CE-003: Floating UI - Search Functionality (`@<search_query>`):**
    *   If non-whitespace characters are typed immediately after `@` (e.g., `@my_file`), the CE shall interpret this as a search query.
    *   As the user types or modifies the query, the CE shall (with debouncing) send this query to the VSCE via IPC.
    *   The floating UI shall dynamically update in real-time to display a list of matching files and folders received from the VSCE.
    *   If no matches are found, the UI shall display "No results found for '@<search_query>'".

*   **FR-CE-004: Action - Insert Project File Directory Structure:**
    *   When selected, the CE shall initiate the unified content insertion process (as per FR-CE-019) with metadata specifying type "FileTree", the workspace folder URI, and appropriate content source ID.

*   **FR-CE-005: Action - Insert Entire Codebase Content (Filtered):**
    *   When selected, the CE shall initiate the unified content insertion process (as per FR-CE-019) with metadata specifying type "codebase_content", the workspace folder URI, and appropriate content source ID.

*   **FR-CE-006: Action - Insert Active File's Content:**
    *   When selected, the CE shall first request the identity (e.g., path) of the currently focused file from VSCE, then initiate the unified content insertion process (as per FR-CE-019) with metadata specifying type "file", the file URI, and appropriate content source ID.

*   **FR-CE-007: Action - Insert Content of Currently Open Files:**
    *   When selected, the CE shall request a list of currently open files (with their paths) in VS Code from the VSCE.
    *   The floating UI shall display this list, allowing the user to select one or more files (e.g., via checkboxes). **If a file is already present (i.e., its `content_source_id` matches an active context block indicator), the option to select it again shall be disabled or clearly indicate it's already added, and re-insertion of the same file content as a new block is disallowed.**
    *   Upon confirmation, for each selected file not already present, the CE shall initiate the unified content insertion process (as per FR-CE-019) with metadata specifying type "file", the file URI, and appropriate content source ID.

*   **FR-CE-008: Action - Insert Searched File Content:**
    *   When a file is selected from the search results in the floating UI, the CE shall initiate the unified content insertion process (as per FR-CE-019) with metadata specifying type "file", the file URI, and appropriate content source ID.

*   **FR-CE-009: Action - Folder Insertion (Browse View):**
    *   When a folder is clicked in search results, the CE shall open a hierarchical, recursive "browse view" that displays the folder's contents in a tree structure.
    *   The CE shall request a flat recursive list of all contents (files and subfolders) of the specified folder from the VSCE using the `list_folder_contents` IPC command.
    *   The CE shall be responsible for building the hierarchical tree structure from the flat list provided by the backend, organizing items by their parent-child relationships.
    *   The browse view shall display items in a hierarchical tree structure with checkboxes, allowing the user to select multiple files and folders for insertion.
    *   The browse view shall support cascading selection where selecting a folder automatically selects all its descendants.
    *   When items are selected for insertion from this browse view, the CE shall initiate the unified content insertion process (as per FR-CE-019) for each selected item with appropriate metadata (type "file" or "folder", URI, and content source ID).

*   **FR-CE-010: Content Insertion:**
    *   The CE shall insert the prepared text content directly into the LLM chat input field, replacing any existing `@` trigger text.
    *   When new context is inserted, it will be placed after any existing ContextWeaver content blocks but before any subsequent user-written text. This ensures that all managed context stays grouped together at the top of the prompt.
    *   Each inserted block of content must be identifiable (e.g., via unique IDs embedded in its wrapper tags) to facilitate its removal.

*   **FR-CE-011: UI Dismissal:**
    *   The floating UI shall be dismissible via the `Escape` key or by clicking outside the UI.
    *   The UI shall automatically dismiss after successfully inserting content.

*   **FR-CE-012: Handling Multiple VS Code Projects:**
    *   If data (e.g., search results, list of open files) originates from multiple workspace folders, the floating UI shall group these items under headers corresponding to their respective workspace folder names.
    *   Results shall be consistently grouped by workspace to provide a predictable user experience, even if only one workspace is involved.
    *   For general workspace actions (like "File Tree", "Full Codebase") in `populateFloatingUiContent`: if only one workspace folder is open, the per-folder sectioning/titling for these buttons will be omitted for a simpler UI. If multiple workspace folders are open, actions will be presented under their respective folder names.

*   **FR-CE-013: Snippet Insertion from VS Code:**
    *   The CE service worker shall listen for snippet data pushed from the VSCE.
    *   Upon receiving a `push_snippet` message, the CE service worker shall broadcast the snippet to all open tabs that match the supported LLM host permissions (e.g., `chat.deepseek.com`), not just a single target tab.
    *   Each content script in matching tabs will receive the broadcast and handle the insertion if it has a valid input target.
    *   Snippet insertions are exempt from duplicate content checks. Each snippet sent from VS Code is intended to create a new, distinct context block and indicator.

*   **FR-CE-014: Context Block Indicator Display:**
    *   Upon successful insertion of content into the LLM chat input (from FR-CE-004, FR-CE-005, FR-CE-006, FR-CE-007, FR-CE-008, FR-CE-009, FR-CE-013, or FR-CE-017), the CE shall display a corresponding visual "context block indicator" above the LLM chat input area.
    *   Each indicator shall represent a distinct block of inserted content.
    *   Each indicator shall display:
        *   An icon visually representing the type of content (e.g., a generic tree icon for file tree, folder icon, file icon, snippet icon, problems icon).
        *   A label:
            *   For "Insert Project File Directory Structure": "[WorkspaceFolderName]" (where [WorkspaceFolderName] is the name of the relevant workspace folder)
            *   For "Insert Entire Codebase Content": "[WorkspaceFolderName]"
            *   For "Insert Active File's Content": The file name with extension (e.g., `auth.py`).
            *   For "Insert Content of Currently Open Files": One indicator per inserted file if multiple are selected from "Open Files".
            *   For "Insert Searched File Content": The file name with extension (e.g., `utils.js`).
            *   For "Insert Searched Folder Content": The folder name (e.g., `routers/`).
            *   For "Insert Snippet from VS Code": File name and line range (e.g., `auth.py (10-20)`).
            *   For "Insert Workspace Problems": "Problems ([WorkspaceFolderName])" (where [WorkspaceFolderName] is the name of the relevant workspace folder).

*   **FR-CE-015: Context Block Indicator Removal:**
    *   Each context block indicator shall feature a close button (e.g., an "x" icon).
    *   When a close button on an indicator is clicked:
        1.  The CE shall identify the corresponding block of inserted text in the LLM chat input field (using the unique block ID).
        2.  The CE shall remove that entire text block from the LLM chat input field.
        3.  The CE shall remove the context block indicator UI element itself.
        4.  When an indicator is removed, the CE shall update its internal list of active content source identifiers.

*   **FR-CE-016: Duplicate Content Prevention Logic:**
    *   The CE shall maintain an internal list of `content_source_id`s (e.g., normalized file paths, folder paths, special IDs for "File Tree" / "Entire Codebase") for all currently active context block indicators.
    *   Before requesting content for insertion (except for code snippets), the CE shall determine the `content_source_id` of the item to be inserted.
    *   If this `content_source_id` already exists in the CE's list of active indicators for the same project/workspace, the insertion shall be prevented, and a user notification (as per UI-CE-007) shall be displayed.

*   **FR-CE-017: Action - Insert Workspace Problems:**
    *   When the "Problems" option is selected for a workspace folder, the CE shall initiate the unified content insertion process (as per FR-CE-019) with metadata specifying type "WorkspaceProblems", the workspace folder URI, and appropriate content source ID.

*   **FR-CE-019: Unified Content Processing:**
    *   All content insertion actions (File Tree, Codebase, File, Folder, Workspace Problems, etc.) shall be handled by a unified processing function. This function takes a metadata object describing the requested content (including its type, name, URI, and `contentSourceId`). It is responsible for:
        1.  Performing the duplicate content check using the `contentSourceId`.
        2.  Displaying a loading indicator with appropriate feedback messages.
        3.  Making the appropriate IPC request to the service worker based on the content `type` (e.g., `getFileContent` for files, `getFileTree` for file trees, `getEntireCodebase` for codebase content).
        4.  Receiving the response and formatting the content with the correct wrapper tag (e.g., `<FileTree>`, `<FileContents>`, `<WorkspaceProblems>`).
        5.  Inserting the final formatted block into the LLM input field, replacing any existing `@` trigger text.
        6.  Creating the corresponding context block indicator and updating the internal state.
        7.  Handling errors gracefully with appropriate user notifications and UI state restoration.

*   **FR-CE-018: Context Block Indicator Inspection:**
    *   When a user clicks on a context block indicator (not on its close button), the CE shall display a modal window.
    *   This modal will show the full, original content of the corresponding text block from the LLM input field, allowing the user to inspect the context they have added.

##### 3.1.2. VS Code Extension (VSCE)

*   **FR-VSCE-001: Data Provider - File System Structure:**
    *   The VSCE shall be able to traverse the active workspace folder(s) and generate a textual representation of the file and folder hierarchy.
    *   This structure, along with metadata for its indicator (type: "FileTree", label: "[WorkspaceFolderName]", unique_block_id, where [WorkspaceFolderName] is the name of the workspace folder), shall be provided to the CE upon request.

*   **FR-VSCE-002: Data Provider - File Content:**
    *   The VSCE shall be able to read and provide the full UTF-8 text content of any specified file within the active workspace(s).
    *   Binary files shall be silently skipped.
    *   The content, along with metadata for its indicator (type: "file_content", label: file name with extension, unique_block_id, `content_source_id`: normalized file URI/path), shall be provided to the CE.

*   **FR-VSCE-003: Data Provider - Folder Content:**
    *   The VSCE shall be able to read and concatenate the content of all text files within a specified folder (and its subfolders) in the active workspace(s).
    *   This operation shall respect filtering rules (see FR-VSCE-005).
    *   The order of file concatenation shall match the order presented in the corresponding `<FileTree>` for that folder.
    *   The content, along with metadata for its indicator  (type: "folder_content", label: folder name, unique_block_id, `content_source_id`: normalized folder URI/path), shall be provided to the CE.

*   **FR-VSCE-004: Data Provider - Entire Codebase Content:**
    *   The VSCE shall be able to read and concatenate the content of all text files within a **specified active workspace folder** (identified by its URI in the IPC request).
    *   This operation shall respect filtering rules (see FR-VSCE-005).
    *   The order of file concatenation shall be consistent.
    *   The content, along with metadata for its indicator (type: "codebase_content", label: `"[folder name]"` (where `[folder name]` is the name of the specified workspace folder), unique_block_id, `content_source_id`: `specified_workspaceFolderUri.toString() + "::codebase"`), shall be provided to the CE.
    *   This operation is triggered by an IPC request that includes the URI of the target workspace folder.
    *   ...label: `"[folder name] Codebase"` (where `[folder name]` is the name of the specified workspace folder), unique_block_id, `content_source_id`: `specified_workspaceFolderUri.toString() + "::entire_codebase"`), shall be provided to the CE.

*   **FR-VSCE-005: Filtering Logic:**
    *   The VSCE shall attempt to read and parse the `.gitignore` file from the root of each workspace folder.
    *   A predefined set of default exclusion patterns (e.g., `node_modules/`, `venv/`, `.git/`, `dist/`, `build/`, `*.log`, `__pycache__/`) is always applied first.
    *   If a `.gitignore` file is found and parsed, its rules are applied in addition to the default patterns for operations like "Insert Entire Codebase" or "Insert Folder Content".
    *   If a `.gitignore` file is missing, empty, or malformed for a workspace folder, only the default exclusion patterns are used.
    *   The VSCE shall report to the CE which effective filter set (project's `.gitignore` rules augmenting default patterns, or only default patterns) is active for a given operation/workspace.

*   **FR-VSCE-006: Search Service:**
    *   The VSCE shall provide a search service that accepts a query string from the CE.
    *   The search shall match against file names and folder names within all open, trusted workspace folders.
    *   Search results (list of matching file/folder URIs, names, types for indicator labels, and their normalized URI/path as `content_source_id`) shall be returned to the CE.

*   **FR-VSCE-007: Snippet Sending:**
    *   The VSCE shall contribute a context menu item (e.g., "Send snippet to LLM context").
    *   When triggered, the VSCE shall extract selected text, file path, line numbers, and language ID.
    *   The VSCE shall send this data, along with metadata for its indicator  (type: "CodeSnippet", label: `[filename] (lines X-Y)`, unique_block_id, `content_source_id`: e.g., `normalized_file_uri + "::snippet::" + start_line + "-" + end_line` - ensuring this is unique per snippet instance if needed, though snippets are exempt from CE duplicate checks), to the CE service worker via IPC.

*   **FR-VSCE-008: Handling Multiple Workspace Folders (Multi-root Workspace):**
    *   The VSCE shall be able to operate on all folders within `vscode.workspace.workspaceFolders`.
    *   Data provided to the CE (e.g., for file tree, codebase content, search results) shall be clearly associated with its originating workspace folder (e.g., by including `workspaceFolder.name`).
    *   Note:  `content_source_id`s must be unique across workspace folders, e.g., by prefixing with workspace folder URI/name.

*   **FR-VSCE-009: Workspace Trust:**
    *   The VSCE shall only perform file system operations (read, list) within workspace folders that are trusted by the user (`vscode.workspace.isTrusted`).
    *   If a workspace is not trusted, the VSCE should report an appropriate status/error to the CE.

*   **FR-VSCE-010: Multi-Window Support via Primary/Secondary Architecture:**
    *   The VSCE shall implement a primary/secondary server model to support multiple VS Code windows simultaneously.
    *   When starting, each VSCE instance shall attempt to connect to an existing primary server across a predefined port range. If no primary is found, it shall become the primary server.
    *   The primary VSCE shall accept connections from both Chrome Extension clients and secondary VSCE instances.
    *   Secondary VSCE instances shall register themselves with the primary server using the `register_secondary` IPC command, providing their unique `windowId`.
    *   When the primary VSCE receives requests from the Chrome Extension that require workspace data aggregation (e.g., search, open files), it shall forward these requests to all registered secondary instances using the `forward_request_to_secondaries` command.
    *   Secondary VSCE instances shall process forwarded requests locally and send responses back to the primary using the `forward_response_to_primary` command.
    *   The primary VSCE shall aggregate responses from all secondary instances and its own local processing, then send the combined results to the Chrome Extension.
    *   All data returned to the Chrome Extension shall include a `windowId` field to identify which VS Code window instance the data originated from.

*   **FR-VSCE-011: Data Provider - Workspace Problems:**
    *   The VSCE shall provide a service that can collect and format all diagnostics (errors, warnings, information, and hints) for a given workspace folder.
    *   The service shall retrieve diagnostics from VS Code's language services using `vscode.languages.getDiagnostics()`.
    *   The service shall filter diagnostics to include only those belonging to files within the specified workspace folder.
    *   The service shall format each diagnostic with severity level, file path (relative to workspace), line and character position, diagnostic message, source, and code.
    *   The formatted problems list, along with metadata for its indicator (type: "WorkspaceProblems", label: "Problems ([WorkspaceFolderName])", unique_block_id, `content_source_id`: workspace URI + "::problems"), shall be provided to the CE.

##### 3.1.3. Inter-Plugin Communication (IPC)

*   **FR-IPC-001: Mechanism:**
    *   The VSCE shall host a local server (preferably WebSocket, fallback HTTP if necessary) listening on `localhost`.
    *   The CE shall act as a client to this server.

*   **FR-IPC-002: Port Configuration:**
    *   The VSCE shall attempt to use a default port (e.g., 30001).
    *   If the default port is unavailable, the VSCE shall attempt to bind to a small, predefined range of subsequent ports (e.g., up to 3 additional ports).
    *   The VSCE shall notify the user via a VS Code information message about the specific port it successfully bound to, or if it failed to bind to any port in the range.
    *   The CE shall automatically scan the same predefined port range as the VSCE to find and connect to the active server.

*   **FR-IPC-003: Security:**
    *   The VSCE local server shall only bind to `localhost` (or `127.0.0.1`).
    *   Token-based authentication has been removed. Communication relies on the inherent security of `localhost` binding, assuming no malicious processes are running on the user's machine attempting to spoof ContextWeaver IPC messages.

*   **FR-CE-017: Manual IPC Reconnection:**
*   The CE shall provide a user-accessible button (e.g., in its browser action popup) to manually trigger a reconnection attempt to the VSCE IPC server.
*   This button shall provide immediate feedback on the reconnection attempt status.

*   **FR-IPC-004: Data Exchange - CE to VSCE:**
    *   Requests for file tree, file content, folder content, entire codebase content (including the URI of the specific target workspace folder), search queries, workspace problems.
    *   Registration of an "active LLM context target" (e.g., tab ID) by the CE.

*   **FR-IPC-005: Data Exchange - VSCE to CE:**
    *   Responses containing:
        *   The requested data. For 'entire codebase' requests, the response pertains only to the single workspace folder specified in the request.
        *   **[NEW-MOD]** Metadata for each data block intended for insertion (conforming to the `ContextBlockMetadata` interface defined in `packages/shared/src/data-models.ts`), including:
            *   `unique_block_id`: `string` - A unique identifier (UUID) for this specific *instance* of inserted content. Generated by VSCE. Used by CE to identify and remove specific blocks from LLM input.
            *   `content_source_id`: `string` - A canonical identifier for the *source* of the content (e.g., normalized file/folder URI, special ID like `workspace_uri::FileTree`). Used by CE for duplicate checking (except for snippets).
            *   `type`: `"FileTree" | "file_content" | "folder_content" | "codebase_content" | "CodeSnippet" | "WorkspaceProblems"` - A string indicating the type of content.
            *   `label`: `string` - A user-friendly label for the context indicator displayed in the CE.
            *   `workspaceFolderUri`: `string | null` - The URI of the workspace folder this content belongs to. Null if not applicable (e.g., for a loose file not in a workspace) or if the context is global to the VS Code instance.
            *   `workspaceFolderName`: `string | null` - The name of the workspace folder. Null if not applicable.
            *   `windowId`: `string` - The unique identifier for the source VS Code window, crucial for multi-window environments.
    *   Status messages.
    *   Error messages.
    *   Pushing selected code snippet data (including its metadata) to the registered active target.

*   **FR-IPC-006: Connection Management:**
    *   The CE should gracefully handle connection failures to the VSCE server and inform the user.
    *   The VSCE server should handle client disconnections.


*   **FR-IPC-007: Data Exchange - List Folder Contents:**
    *   The CE shall be able to request a listing of immediate files and subdirectories for a specified folder URI from the VSCE.
    *   The VSCE shall provide this listing, respecting filters, including item names, types, URIs, and `content_source_id`s.

#### 3.2. User Interface (UI) Requirements (Chrome Extension)

The floating UI should use a standardized loading indicator (CSS spinner and message) for all operations that involve fetching data from the VSCE. This provides a consistent visual cue to the user.

*   **UI-CE-001: Floating UI Appearance:**
    *   The floating UI shall be non-intrusive and appear contextually near the LLM chat input.
    *   It shall list options and search results clearly.
    *   It shall use styling consistent with modern web UIs and be theme-aware if possible (respecting light/dark modes of the host page or browser).

*   **UI-CE-002: Loading Indicators:**
*   The floating UI shall provide clear visual feedback when waiting for data from the VSCE. For longer operations that do not involve real-time updates (e.g., inserting a large folder), a loading overlay with a spinner may be used. For rapid, real-time operations like search-as-you-type, the UI should appear without an initial content/loading placeholder to prevent visual jitter. The UI title (e.g., "Results for '@query'") provides sufficient feedback that an operation is in progress.

*   **UI-CE-003: Error and Status Messages:**
*   All errors (IPC, file read, etc.) shall be displayed using non-disruptive toast notifications. These notifications should appear briefly and then automatically dismiss without interrupting the user's workflow or clearing the floating UI's content.
*   Relevant status messages (e.g., "VS Code not connected", "No project open") shall also be displayed via toast notifications.
*   The CE UI shall clearly indicate if default filtering rules are in use by VSCE (e.g., when a `.gitignore` file is not found or is unparsable), based on information from VSCE. This is currently implemented for the "Browse Files" view by displaying a text message like "(Using default ignore rules for this listing)".

*   **UI-CE-004: Multi-Project and Multi-Window Display:**
    *   When displaying lists of items (e.g., search results, open files), the floating UI shall group results first by window, then by workspace within each window.
    *   Each window group shall display a header with the window identifier (e.g., "Window: 12345678") when multiple windows are detected.
    *   Within each window group, items shall be further grouped by workspace folder name when multiple workspace folders are present within that window.
    *   For single-window scenarios, the UI shall still use workspace folder grouping headers for consistency.
    *   If items do not belong to any known workspace, they will be grouped under a generic header like 'Unknown Workspace'.
    *   For general workspace-specific actions (like "File Tree", "Full Codebase" buttons): if only one workspace folder is active, the UI will not show an explicit grouping title for that single folder's actions, presenting them more directly. If multiple workspace folders are active, actions will be grouped under their respective folder names.

*   **UI-CE-005: Folder Browse View:**
    *   The folder browse view (triggered by "Browse" icon on a searched folder) shall display a hierarchical list of files and subfolders with checkboxes, as per the user-provided image reference.
    *   It shall include an "Insert selected items" button and navigation (e.g., "Back" button or breadcrumbs).

*   **UI-CE-006: Context Block Indicators Area:**
    *   A dedicated area shall appear above the LLM chat input field to display context block indicators when content has been inserted.
    *   Indicators shall be arranged horizontally. If the number of indicators exceeds the available width, horizontal scrolling should be enabled for this area.
    *   Each indicator shall be visually distinct, using icons and text labels as specified in FR-CE-014.
    *   Each indicator shall have an easily clickable close ("x") button.

*   **UI-CE-007: Duplicate Insertion Notification:**
    *   If the user attempts to insert content (file, folder, file tree, entire codebase) that is already represented by an active context block indicator, the floating UI (or a temporary toast/message) shall inform the user, e.g., "Content from `[source_name]` is already added." or "File Tree is already present." The specific option in the floating UI might be temporarily disabled or show a distinct visual cue.

*   **UI-CE-008: Theme Adaptation:**
    *   The Chrome Extension's UI components, including the floating panel and the browser action popup, shall detect the browser's preferred color scheme (light or dark). The UI will automatically apply a corresponding light or dark theme to its elements to ensure visual consistency with the user's environment.

#### 3.3. Data Formatting Requirements

To ensure robustness, before file content is wrapped in a code block, its text is scanned for any strings that look like ContextWeaver's own wrapper tags (e.g., `</FileContents>`). Any such occurrences within the code are 'neutralized' (e.g., by inserting a zero-width space) to prevent the premature closing of the main wrapper tag.

The content inserted into the LLM chat input shall be wrapped in specific XML-like tags. **Each distinct block of content MUST be wrapped in a single, top-level tag that includes a unique `id` attribute, which MUST be a Version 4 UUID (e.g., `<FileTree id="f81d4fae-7dec-11d0-a765-00a0c91e6bf6">`).** This `id` is critical for the management and removal of the content block via its corresponding context indicator.

*   **3.3.1. File Directory Structure Format:**
    The inserted content shall be wrapped in `<FileTree>` tags and formatted as an ASCII tree. The top-level tag must include a unique `id`. For example:
    ```text
    <FileTree id="a1b2c3d4-e5f6-4a5b-b6c7-d8e9f0a1b2c3">
    C:/project/SmartInfo
    ├── src
    │   ├── services
    │   │   └── userService.ts
    │   ├── config
    │   │   └── settings.ts
    │   └── utils.ts
    └── README.md
    </FileTree>
    ```

*   **3.3.2. File, Folder, or Codebase Content Format:**
    When inserting content, each logical unit (a single file, a folder's contents, a codebase's contents) is wrapped in its own tag (e.g., `<FileContents>`). When a user selects multiple items from a list (like the "Browse" or "Open Files" view), a separate content block and corresponding indicator will be created for each selected item.
    Within this tag, each file's content is represented by:
    1.  A `File: <full_path_to_file>` line.
    2.  The actual file content, enclosed in a Markdown code block with its determined language identifier (e.g., `javascript`, `python`, `plaintext`).

    For a single folder or codebase action, the contents of all contained files are concatenated within a single `<FileContents>` tag.

    Example (representing content from a single file):
    ```text
    <FileContents id="b4c5d6e7-f890-4c5d-a1b2-c3d4e5f6a7b8">
    File: C:/project/SmartInfo/src/utils.ts
    ```typescript
    // Some utility functions
    export function greet(name: string): string {
      return `Hello, ${name}!`;
    }

    export const DEFAULT_TIMEOUT = 1000;
    ```
    </FileContents>
    ```

    Example (representing content from multiple files):
    ```text
    <FileContents id="c7d8e9f0-1a2b-4e5f-b8c9-d0e1f2a3b4c5">
    File: C:/project/SmartInfo/src/services/userService.ts
    ```typescript
    interface User {
      id: number;
      username: string;
      email?: string;
    }

    export class UserService {
      private users: User[] = [];

      addUser(user: User): void {
        this.users.push(user);
      }

      getUser(id: number): User | undefined {
        return this.users.find(u => u.id === id);
      }
    }
    ```
    File: C:/project/SmartInfo/src/config/settings.ts
    ```typescript
    export interface AppSettings {
      apiUrl: string;
      featureFlags: {
        betaFeatureEnabled: boolean;
      };
    }

    export const settings: AppSettings = {
      apiUrl: "https://api.smartinfo.com/v1",
      featureFlags: {
        betaFeatureEnabled: true,
      },
    };
    ```
    </FileContents>
    ```

*   **3.3.3. Code Snippet Format:**
    Inserted code snippets shall be wrapped in `<CodeSnippet>` tags, which must include a unique `id`.
    Inside the `<CodeSnippet>` tag, the following information shall be included before the code block:
    1.  `File: <full_path_to_file>`: The path to the source file.
    2.  `lines: <start_line>-<end_line>`: The line numbers of the snippet.
    Followed by the code snippet itself, enclosed in a Markdown code block with its determined language identifier.

    Example:
    ```text
    <CodeSnippet id="d1e2f3a4-b5c6-4d7e-8f90-1a2b3c4d5e6f">
    File: C:/project/ContextWeaver/packages/chrome-extension/src/serviceWorker.ts
    lines: 20-30
    ```typescript
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
    ```
    </CodeSnippet>
    ```

*   **3.3.4. Workspace Problems Format:**
    Inserted workspace problems shall be wrapped in `<WorkspaceProblems>` tags, which must include a unique `id`.
    Inside the `<WorkspaceProblems>` tag, each diagnostic shall be formatted as:
    `[Severity] file_path:line:character - diagnostic_message (source:code)`
    
    Where:
    - `Severity` is one of: Error, Warning, Info, Hint
    - `file_path` is the relative path from the workspace root
    - `line` and `character` are 1-indexed positions
    - `source` is the diagnostic source (e.g., TypeScript, ESLint)
    - `code` is the diagnostic code if available

    Example:
    ```text
    <WorkspaceProblems id="e1f2a3b4-c5d6-4e7f-8a90-1b2c3d4e5f6a">
    [Error] src/ipcServer.ts:100:5 - Unused variable 'foo'. (eslint:no-unused-vars)
    [Warning] src/extension.ts:50:1 - Function 'bar' has a complexity of 15. (eslint:complexity)
    </WorkspaceProblems>
    ```

#### 3.4. Performance Requirements

*   **PERF-001: UI Responsiveness:** The Chrome extension's floating UI should remain responsive during interactions, especially while typing search queries.
*   **PERF-002: Data Fetching:** The VS Code extension should fetch and process data (file listings, content reading, searching) asynchronously to avoid blocking its own operations or VS Code.
*   **PERF-003: Large Data Handling:** For operations involving potentially large amounts of data (e.g., "Insert Entire Codebase"), visual feedback (loading indicators) must be provided in the CE.
*   **PERF-004: Virtual Scrolling:** To maintain UI responsiveness with large lists, the CE shall implement virtual scrolling for search results and the 'Open Files' list when the number of items is large (e.g., >50).

#### 3.5. Security Requirements

*   **SEC-001: IPC Security:**
    *   The VSCE local server must bind only to `localhost`.
    *   Token-based authentication has been removed. Communication relies on the inherent security of `localhost` binding, assuming no malicious processes are running on the user's machine attempting to spoof ContextWeaver IPC messages.
*   **SEC-002: VS Code Workspace Trust:** The VSCE must respect VS Code's Workspace Trust feature and only access files in trusted workspaces. If a workspace is not trusted, an appropriate status should be communicated to the CE.
*   **SEC-003: Data Handling:** No sensitive data beyond file paths and file content from the user's workspace should be transmitted or stored unnecessarily.

#### 3.6. Error Handling and State Management

*   **ERR-001: VS Code Not Running/Extension Disabled:** If the CE cannot connect to the VSCE server, it shall display a clear message in the floating UI's standardized error panel, indicating the connection failure and suggesting potential causes (e.g., "Error: Could not connect to VS Code. Please ensure it's running and ContextWeaver is active.").
*   **ERR-002: No Project Open in VS Code:** If the VSCE reports that no project/folder is open (e.g., via a 'NO_WORKSPACE_OPEN' error code), the CE shall display a clear message in the floating UI's standardized error panel (e.g., "Error: No workspace folder is open in VS Code. Please open a project.").
*   **ERR-003: `.gitignore` File Issues:**
    *   If `.gitignore` is missing, the VSCE will log this and use default rules. The CE shall indicate (e.g., via an icon or text in the UI as per UI-CE-003) that default filtering rules are in use, based on the 'filterType' received from VSCE.
    *   If `.gitignore` is malformed and VSCE falls back to default rules, the CE UI shall indicate that default filtering rules are in use (e.g., via an icon).
*   **ERR-004: File Read Errors:** If the VSCE fails to read a specific file (e.g., it's binary or a read error occurs, via `FILE_BINARY_OR_READ_ERROR` code), the CE shall display a message in the floating UI's standardized error panel (e.g., "Error: File is binary or could not be read: [filename]").
*   **ERR-005: IPC Communication Failure:** If IPC fails during an operation, the CE should indicate this in the floating UI's standardized error panel (e.g., "Communication Error: Communication with VS Code lost. Operation may not have completed.").
*   **ERR-006: Binary File Handling:** Binary files encountered during "entire codebase" or "folder content" operations shall be silently skipped by the VSCE.

---

This document aims to provide a comprehensive set of requirements. It should be reviewed and updated as the project progresses and new insights are gained.
