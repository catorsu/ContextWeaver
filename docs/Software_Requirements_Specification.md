## Software Requirements Specification: ContextWeaver

**Version:** 1.1
**Date:** May 26, 2025

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
This document specifies the requirements for the "ContextWeaver," a system comprising a VS Code extension and a Chrome browser extension. The system aims to provide users with a convenient and efficient way to add content and context from their VS Code projects directly into Large Language Model (LLM) chat interfaces (e.g., Google AI Studio's Gemini interface).

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
*   Support communication with multiple separate VS Code *windows* simultaneously in V1 (focus is on multi-root workspaces within a single VS Code window).

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
    *   The CE shall detect when the user types `@` in the chat input field of supported LLM web interfaces (e.g., Google AI Studio).
    *   Upon detection, a floating UI shall be displayed near the chat input.

*   **FR-CE-002: Floating UI - Basic Options (No Search Query):**
    *   If `@` is typed followed by a space or end of input, the floating UI shall present the following primary options:
        1.  "Insert Project File Directory Structure"
        2.  "Insert Entire Codebase Content (Filtered)"
        3.  "Insert Active File's Content" (from VS Code)
        4.  "Insert Content of Currently Open Files" (from VS Code)

*   **FR-CE-003: Floating UI - Search Functionality (`@<search_query>`):**
    *   If non-whitespace characters are typed immediately after `@` (e.g., `@my_file`), the CE shall interpret this as a search query.
    *   The CE shall send this query to the VSCE via IPC.
    *   The floating UI shall dynamically update to display a list of matching files and folders received from the VSCE.
    *   If no matches are found, the UI shall display "未找到与 ‘`@<search_query>`’ 匹配的文件或文件夹。" (No files or folders found matching '`@<search_query>`').

*   **FR-CE-004: Action - Insert Project File Directory Structure:**
    *   When selected, the CE shall check if a "File Tree" context block from the same project is already present. If so, it shall notify the user (e.g., "Project File Tree is already added.") and not proceed.
    *   Otherwise, the CE shall request the complete file and folder hierarchy of the active VS Code project(s) from the VSCE.
    *   The CE shall insert the received textual representation (formatted as per [3.3.1](#331-file-directory-structure-format)) into the LLM chat input and create a corresponding context block indicator (as per FR-CE-014).

*   **FR-CE-005: Action - Insert Entire Codebase Content (Filtered):**
    *   When selected, the CE shall check if an "Entire Codebase" context block from the same project is already present. If so, it shall notify the user (e.g., "Entire Codebase is already added.") and not proceed.
    *   Otherwise, the CE shall request the concatenated content of all files (respecting root `.gitignore` or default filters) from the active VS Code project(s) from the VSCE.
    *   The CE shall insert the received content (formatted as per [3.3.3](#333-folderfile-content-format)) into the LLM chat input and create a corresponding context block indicator.

*   **FR-CE-006: Action - Insert Active File's Content:**
    *   When selected, the CE shall request the identity (e.g., path) of the currently focused file from VSCE.
    *   The CE shall check if content from this specific file path is already represented by an active context block indicator. If so, it shall notify the user (e.g., "Content from `[filename]` is already added.") and not proceed.
    *   Otherwise, the CE shall request the content of the currently focused file in VS Code from the VSCE.
    *   The CE shall insert the received content (formatted as per [3.3.2](#332-single-file-content-format)) into the LLM chat input and create a corresponding context block indicator.

*   **FR-CE-007: Action - Insert Content of Currently Open Files:**
    *   When selected, the CE shall request a list of currently open files (with their paths) in VS Code from the VSCE.
    *   The floating UI shall display this list, allowing the user to select one or more files (e.g., via checkboxes). Files already represented by an active context block indicator may be visually distinguished (e.g., greyed out or with a note) but still selectable (allowing override if user insists, or simply re-inserting if the previous block was removed). **Decision for V1.3: If a file is already present, the option to select it again should be disabled or clearly indicate it's already added. Re-insertion of the same file content as a new block is disallowed.**
    *   Upon confirmation, for each selected file not already present, the CE shall request its content from the VSCE.
    *   The CE shall insert the received content (formatted as per [3.3.2](#332-single-file-content-format), one block per file) into the LLM chat input and create corresponding context block indicators.

*   **FR-CE-008: Action - Insert Searched File Content:**
    *   When a file is selected from the search results in the floating UI, the CE shall check if content from this specific file path is already represented by an active context block indicator. If so, it shall notify the user (e.g., "Content from `[filename]` is already added.") and not proceed.
    *   Otherwise, the CE shall request the full content of that specific file from the VSCE.
    *   The CE shall insert the received content (formatted as per [3.3.2](#332-single-file-content-format)) into the LLM chat input and create a corresponding context block indicator.

*   **FR-CE-009: Action - Insert Searched Folder Content (Hybrid UX):**
    *   When a folder is selected from the search results:
        *   **Option A (Primary):** "Insert content of all files in `<folder_name>`".
            *   The CE shall check if content from this specific folder path is already represented by an active context block indicator. If so, it shall notify the user (e.g., "Content from folder `[foldername]` is already added.") and not proceed.
            *   Otherwise, proceed as in version 1.2, inserting content and creating an indicator.
        *   **Option B (Secondary):** "Browse files in `<folder_name>`".
            *   The browse UI shall behave as in version 1.2. When selecting files/subfolders for insertion from this browse view, each item should be checked against existing context block indicators by its path. Attempting to add an already present file/folder should notify the user and prevent re-addition.
    *   Content insertion and indicator creation follow existing patterns.

*   **FR-CE-010: Content Insertion:**
    *   The CE shall insert the prepared text content directly into the LLM chat input field, replacing any existing `@` trigger text.
    *   Each inserted block of content must be identifiable (e.g., via unique IDs embedded in its wrapper tags) to facilitate its removal.

*   **FR-CE-011: UI Dismissal:**
    *   The floating UI shall be dismissible via the `Escape` key or by clicking outside the UI.
    *   The UI shall automatically dismiss after successfully inserting content.

*   **FR-CE-012: Handling Multiple VS Code Projects:**
    *   If the VSCE reports data from multiple workspace folders (in a multi-root workspace), the floating UI shall group options and search results by `workspace name + [project folder name]`.
    *   If only one project/folder is open in VS Code, this grouping layer shall be omitted in the UI for simplicity.

*   **FR-CE-013: Snippet Insertion from VS Code:**
    *   The CE (likely its service worker or a content script with an active WebSocket connection) shall listen for snippet data pushed from the VSCE.
    *   Upon receiving snippet data targeted for its active LLM input context, the CE shall insert the snippet (formatted as per [3.3.4](#334-code-snippet-format)) into the LLM chat input.
    *   Snippet insertions are exempt from duplicate content checks. Each snippet sent from VS Code will create a new, distinct context block and indicator.

*   **FR-CE-014: Context Block Indicator Display:**
    *   Upon successful insertion of content into the LLM chat input (from FR-CE-004, FR-CE-005, FR-CE-006, FR-CE-007, FR-CE-008, FR-CE-009, or FR-CE-013), the CE shall display a corresponding visual "context block indicator" above the LLM chat input area.
    *   Each indicator shall represent a distinct block of inserted content.
    *   Each indicator shall display:
        *   An icon visually representing the type of content (e.g., a generic tree icon for file tree, folder icon, file icon, snippet icon).
        *   A label:
            *   For "Insert Project File Directory Structure": "File Tree"
            *   For "Insert Entire Codebase Content": "Entire Codebase"
            *   For "Insert Active File's Content": The file name with extension (e.g., `auth.py`).
            *   For "Insert Content of Currently Open Files": One indicator per inserted file if multiple are selected from "Open Files".
            *   For "Insert Searched File Content": The file name with extension (e.g., `utils.js`).
            *   For "Insert Searched Folder Content": The folder name (e.g., `routers/`).
            *   For "Insert Snippet from VS Code": File name and line range (e.g., `auth.py (10-20)`).

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

##### 3.1.2. VS Code Extension (VSCE)

*   **FR-VSCE-001: Data Provider - File System Structure:**
    *   The VSCE shall be able to traverse the active workspace folder(s) and generate a textual representation of the file and folder hierarchy.
    *   This structure, along with metadata for its indicator (type: "file_tree", label: "File Tree", unique_block_id), shall be provided to the CE upon request.

*   **FR-VSCE-002: Data Provider - File Content:**
    *   The VSCE shall be able to read and provide the full UTF-8 text content of any specified file within the active workspace(s).
    *   Binary files shall be silently skipped.
    *   The content, along with metadata for its indicator (type: "file_content", label: file name with extension, unique_block_id, `content_source_id`: normalized file URI/path), shall be provided to the CE.

*   **FR-VSCE-003: Data Provider - Folder Content:**
    *   The VSCE shall be able to read and concatenate the content of all text files within a specified folder (and its subfolders) in the active workspace(s).
    *   This operation shall respect filtering rules (see FR-VSCE-005).
    *   The order of file concatenation shall match the order presented in the corresponding `<file_tree>` for that folder.
    *   The content, along with metadata for its indicator  (type: "folder_content", label: folder name, unique_block_id, `content_source_id`: normalized folder URI/path), shall be provided to the CE.

*   **FR-VSCE-004: Data Provider - Entire Codebase Content:**
    *   The VSCE shall be able to read and concatenate the content of all text files within a **specified active workspace folder** (identified by its URI in the IPC request).
    *   This operation shall respect filtering rules (see FR-VSCE-005).
    *   The order of file concatenation shall be consistent.
    *   The content, along with metadata for its indicator (type: "codebase_content", label: `"Entire Codebase - [folder name]"` (where `[folder name]` is the name of the specified workspace folder), unique_block_id, `content_source_id`: `specified_workspaceFolderUri.toString() + "::codebase"`), shall be provided to the CE.
    *   This operation is triggered by an IPC request that includes the URI of the target workspace folder.

*   **FR-VSCE-005: Filtering Logic:**
    *   The VSCE shall attempt to read and parse the `.gitignore` file from the root of each workspace folder.
    *   For V1, operations like "Insert Entire Codebase" or "Insert Folder Content" will initially use a predefined set of default exclusion patterns (e.g., `node_modules/`, `venv/`, `.git/`). Full `.gitignore` parsing and application for these operations is planned for a subsequent task (Phase 2, Task 2). The VSCE shall report to the CE which filter set (project's `.gitignore` or default) is active for a given operation/workspace.
    *   If a `.gitignore` file is missing or malformed for a workspace folder, the VSCE shall use a predefined set of default exclusion patterns (e.g., `node_modules/`, `venv/`, `.git/`, `dist/`, `build/`, `*.log`, `__pycache__/`).
    *   The VSCE shall report to the CE which filter set (project's `.gitignore` or default) is active for a given operation/workspace.

*   **FR-VSCE-006: Search Service:**
    *   The VSCE shall provide a search service that accepts a query string from the CE.
    *   The search shall match against file names and folder names within all open, trusted workspace folders.
    *   Search results (list of matching file/folder URIs, names, types for indicator labels, and their normalized URI/path as `content_source_id`) shall be returned to the CE.

*   **FR-VSCE-007: Snippet Sending:**
    *   The VSCE shall contribute a context menu item (e.g., "Send snippet to LLM context").
    *   When triggered, the VSCE shall extract selected text, file path, line numbers, and language ID.
    *   The VSCE shall send this data, along with metadata for its indicator  (type: "code_snippet", label: `[filename] (lines X-Y)`, unique_block_id, `content_source_id`: e.g., `normalized_file_uri + "::snippet::" + start_line + "-" + end_line` - ensuring this is unique per snippet instance if needed, though snippets are exempt from CE duplicate checks), to the currently registered "active LLM context target" via IPC.

*   **FR-VSCE-008: Handling Multiple Workspace Folders (Multi-root Workspace):**
    *   The VSCE shall be able to operate on all folders within `vscode.workspace.workspaceFolders`.
    *   Data provided to the CE (e.g., for file tree, codebase content, search results) shall be clearly associated with its originating workspace folder (e.g., by including `workspaceFolder.name`).
    *   Note:  `content_source_id`s must be unique across workspace folders, e.g., by prefixing with workspace folder URI/name.

*   **FR-VSCE-009: Workspace Trust:**
    *   The VSCE shall only perform file system operations (read, list) within workspace folders that are trusted by the user (`vscode.workspace.isTrusted`).
    *   If a workspace is not trusted, the VSCE should report an appropriate status/error to the CE.

##### 3.1.3. Inter-Plugin Communication (IPC)

*   **FR-IPC-001: Mechanism:**
    *   The VSCE shall host a local server (preferably WebSocket, fallback HTTP if necessary) listening on `localhost`.
    *   The CE shall act as a client to this server.

*   **FR-IPC-002: Port Configuration:**
    *   The VSCE shall attempt to use a default port (e.g., 30001).
    *   If the default port is unavailable, the VSCE shall attempt to bind to a small, predefined range of subsequent ports (e.g., up to 3 additional ports).
    *   The VSCE shall notify the user via a VS Code information message about the specific port it successfully bound to, or if it failed to bind to any port in the range.
    *   The CE shall allow the user to configure the target port in its settings.

*   **FR-IPC-003: Security:**
    *   The VSCE local server shall only bind to `localhost` (or `127.0.0.1`).
    *   Token-based authentication has been removed. Communication relies on the inherent security of `localhost` binding, assuming no malicious processes are running on the user's machine attempting to spoof ContextWeaver IPC messages.

*   **FR-CE-017: Manual IPC Reconnection:**
    *   The CE shall provide a user-accessible button (e.g., in its options page) to manually trigger a reconnection attempt to the VSCE IPC server.
    *   This button shall provide immediate feedback on the reconnection attempt status.

*   **FR-IPC-004: Data Exchange - CE to VSCE:**
    *   Requests for file tree, file content, folder content, entire codebase content (including the URI of the specific target workspace folder), search queries.
    *   Registration of an "active LLM context target" (e.g., tab ID) by the CE.

*   **FR-IPC-005: Data Exchange - VSCE to CE:**
    *   Responses containing:
        *   The requested data. For 'entire codebase' requests, the response pertains only to the single workspace folder specified in the request.
        *   **[NEW-MOD]** Metadata for each data block intended for insertion, including:
            *   `unique_block_id`: A unique identifier for this specific *instance* of inserted content.
            *   `content_source_id`: A canonical identifier for the *source* of the content (e.g., normalized file/folder path, special ID for tree/codebase) used for duplicate checking.
            *   `type`: A string indicating the type of content.
            *   `label`: A display label for the indicator.
    *   Status messages.
    *   Error messages.
    *   Pushing selected code snippet data (including its metadata) to the registered active target.

*   **FR-IPC-006: Connection Management:**
    *   The CE should gracefully handle connection failures to the VSCE server and inform the user.
    *   The VSCE server should handle client disconnections.

#### 3.2. User Interface (UI) Requirements (Chrome Extension)

*   **UI-CE-001: Floating UI Appearance:**
    *   The floating UI shall be non-intrusive and appear contextually near the LLM chat input.
    *   It shall list options and search results clearly.
    *   It shall use styling consistent with modern web UIs and be theme-aware if possible (respecting light/dark modes of the host page or browser).

*   **UI-CE-002: Loading Indicators:**
    *   The floating UI shall display loading indicators when waiting for data from the VSCE (e.g., during search, fetching large content).

*   **UI-CE-003: Error and Status Messages:**
    *   All errors (IPC, file read, etc.) and relevant status messages (e.g., "VS Code not connected", "No project open", "Using default .gitignore rules") shall be clearly displayed within the floating UI.
    *   An icon shall indicate whether project `.gitignore` or default ignore rules are being used by VSCE, based on information from VSCE.

*   **UI-CE-004: Multi-Project Display:**
    *   When VSCE provides data from a multi-root workspace, the floating UI shall group items (options, search results) by `workspace name + [project folder name]`.
    *   If only one project/folder is open, this grouping layer shall be omitted.

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

#### 3.3. Data Formatting Requirements
The content inserted into the LLM chat input shall be wrapped in specific XML-like tags.

*   **3.3.1. File Directory Structure Format:**
    The inserted content shall be wrapped in `<file_tree>` tags and formatted as an ASCII tree, for example:
    ```text
    <file_tree>
    C:/project/SmartInfo
    ├── backend
    │   └── api
    │       ├── dependencies
    │       │   ├── __init__.py
    │       │   └── dependencies.py
    │       ...
    └── README.md
    </file_tree>
    ```

*   **3.3.2. Single File Content Format:**
    The inserted content shall be wrapped in `<file_contents>` tags. It shall include the file path and use Markdown code blocks with language identifiers, for example:
    ```text
    <file_contents>
    file: C:/project/SmartInfo/backend/api/routers/auth.py
    ```python
    from fastapi import APIRouter
    # ... file content ...
    ```
    </file_contents>
    ```

*   **3.3.3. Folder/Entire Codebase Content Format:**
    When inserting content from a folder or the entire codebase, the content shall be wrapped in `<folder_contents path="C:/path/to/folder">` (or `<codebase_contents>` for entire project). This shall contain:
    1.  A `<file_tree>` section for the relevant scope (the folder or the entire project).
    2.  A `<file_contents>` section concatenating the content of all included files. Each individual file's content within this concatenation should be prefixed by `file: <full_path_to_file>` and then wrapped in its own Markdown code block with the appropriate language identifier.
    The order of file content shall match the order in the `<file_tree>` section.
    Example for a folder:
    ```text
    <folder_contents path="C:/project/SmartInfo/backend/api/routers">
    <file_tree>
    ├── __init__.py
    ├── auth.py
    ...
    </file_tree>
    <file_contents>
    file: C:/project/SmartInfo/backend/api/routers/__init__.py
    ```python
    # ... content of __init__.py ...
    ```

    file: C:/project/SmartInfo/backend/api/routers/auth.py
    ```python
    # ... content of auth.py ...
    ```
    (other file contents)
    </file_contents>
    </folder_contents>
    ```

*   **3.3.4. Code Snippet Format:**
    Inserted code snippets (from VS Code context menu) shall be wrapped in `<code_snippet>` tags. It shall include the file path, line numbers, and use Markdown code blocks with language identifiers, for example:
    ```text
    <code_snippet>
    file: C:/project/SmartInfo/backend/api/routers/auth.py
    lines: 10-20
    ```python
    # ... selected code snippet ...
    ```
    </code_snippet>
    ```

#### 3.4. Performance Requirements

*   **PERF-001: UI Responsiveness:** The Chrome extension's floating UI should remain responsive during interactions, especially while typing search queries.
*   **PERF-002: Data Fetching:** The VS Code extension should fetch and process data (file listings, content reading, searching) asynchronously to avoid blocking its own operations or VS Code.
*   **PERF-003: Large Data Handling:** For operations involving potentially large amounts of data (e.g., "Insert Entire Codebase"), visual feedback (loading indicators) must be provided in the CE.

#### 3.5. Security Requirements

*   **SEC-001: IPC Security:**
    *   The VSCE local server must bind only to `localhost`.
    *   Communication between CE and VSCE must be authenticated using a shared secret/token mechanism configured by the user.
*   **SEC-002: VS Code Workspace Trust:** The VSCE must respect VS Code's Workspace Trust feature and only access files in trusted workspaces. If a workspace is not trusted, an appropriate status should be communicated to the CE.
*   **SEC-003: Data Handling:** No sensitive data beyond file paths and file content from the user's workspace should be transmitted or stored unnecessarily.

#### 3.6. Error Handling and State Management

*   **ERR-001: VS Code Not Running/Extension Disabled:** If the CE cannot connect to the VSCE server, it shall display a message like "无法连接到 VS Code。请确保 VS Code 正在运行，已安装配套扩展，并且已打开项目。" (Cannot connect to VS Code. Please ensure VS Code is running with the companion extension installed and a project is open.)
*   **ERR-002: No Project Open in VS Code:** If the VSCE reports that no project/folder is open, the CE shall display "VS Code 中没有打开项目。请打开一个项目以使用此功能。" (No project open in VS Code. Please open a project to use this feature.)
*   **ERR-003: `.gitignore` File Issues:**
    *   If `.gitignore` is missing, the CE shall display a message like "未找到 .gitignore。将使用默认的过滤规则。" (No .gitignore found. Default filtering rules will be used.)
    *   If `.gitignore` is malformed and VSCE falls back to default rules, the CE UI shall indicate that default filtering rules are in use (e.g., via an icon).
*   **ERR-004: File Read Errors:** If the VSCE fails to read a specific file, it should skip the file and report the issue. The CE can then notify the user, e.g., "读取文件 [文件名] 时出错。该文件已被跳过。" (Error reading file [filename]. The file has been skipped.)
*   **ERR-005: IPC Communication Failure:** If IPC fails during an operation, the CE should indicate: "与 VS Code 的通信丢失。操作可能未完成。" (Communication with VS Code lost. Operation may not have completed.)
*   **ERR-006: Binary File Handling:** Binary files encountered during "entire codebase" or "folder content" operations shall be silently skipped by the VSCE.

---

### 4. Future Considerations / Out of Scope for V1
*   Support for `.gitignore` files in subdirectories.
*   Advanced search capabilities (e.g., content search, regex search).
*   More sophisticated IPC discovery mechanisms.
*   Support for selecting specific functions/classes via LSP integration.
*   Automatic chunking of content that exceeds LLM input limits.
*   Support for multiple, separate VS Code windows.
*   Displaying actual token counts for files/folders in the Chrome UI.

---

This document aims to provide a comprehensive set of requirements. It should be reviewed and updated as the project progresses and new insights are gained.