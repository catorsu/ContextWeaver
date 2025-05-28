# ContextWeaver: Inter-Plugin Communication (IPC) Protocol Design

**Version:** 1.0
**Date:** May 27, 2025

## 1. Overview

This document defines the Inter-Plugin Communication (IPC) protocol used between the ContextWeaver VS Code Extension (VSCE) and the Chrome Extension (CE).

*   **Transport:** WebSockets
*   **Server:** VSCE (listens on `localhost` and attempts port fallback if default is busy)
*   **Client:** CE
*   **Format:** JSON
*   **Authentication:** Removed. Communication relies on `localhost` binding for security.

## 2. Core Message Structure

All messages exchanged between the VSCE and CE will adhere to the following JSON structure:

```json
{
  "protocol_version": "1.0",
  "message_id": "string",    // Unique UUID for requests, echoed in responses. Not required for pushes.
  "type": "request | response | push | error_response", // Category of the message
  "command": "string",       // Specific action or event name
  "payload": {}              // Command-specific data object
}
```

## 3. Message Types and Commands

### 3.1. CE -> VSCE (Requests)

These messages are initiated by the Chrome Extension and sent to the VS Code Extension.

---

#### 3.1.1. `register_active_target`
Registers the current LLM tab with the VSCE so it knows where to push snippets.

*   **`type`**: `"request"`
*   **`command`**: `"register_active_target"`
*   **`payload`**:
    ```json
    {
      "tabId": "number", // Chrome tab ID
      "llmHost": "string"  // Hostname of the LLM interface (e.g., "gemini.google.com")
    }
    ```
*   **VSCE Response**: `response_generic_ack` (see 3.2.1)

---

#### 3.1.2. `get_file_tree`
Requests the file and folder hierarchy for a specified workspace or the active one.

*   **`type`**: `"request"`
*   **`command`**: `"get_file_tree"`
*   **`payload`**:
    ```json
    {
      "workspaceFolderUri": "string | null" // URI of a specific workspace folder in a multi-root setup, or null for the (first) active one.
    }
    ```
*   **VSCE Response**: `response_file_tree` (see 3.2.2)

---

#### 3.1.3. `get_file_content`
Requests the content of a specific file.

*   **`type`**: `"request"`
*   **`command`**: `"get_file_content"`
*   **`payload`**:
    ```json
    {
      "filePath": "string" // Normalized, absolute path to the file
    }
    ```
*   **VSCE Response**: `response_file_content` (see 3.2.3)

---

#### 3.1.4. `get_folder_content`
Requests the concatenated content of all files within a specified folder (respecting filters).

*   **`type`**: `"request"`
*   **`command`**: `"get_folder_content"`
*   **`payload`**:
    ```json
    {
      "folderPath": "string" // Normalized, absolute path to the folder
    }
    ```
*   **VSCE Response**: `response_folder_content` (see 3.2.4)

---

#### 3.1.5. `get_entire_codebase`
Requests the concatenated content of all files in a workspace (respecting filters).

*   **`type`**: `"request"`
*   **`command`**: `"get_entire_codebase"`
*   **`payload`**:
    ```json
    {
      "workspaceFolderUri": "string" // URI of the specific workspace folder (required)
    }
    ```
    The `workspaceFolderUri` field is required and specifies the URI of the workspace folder for which the entire codebase content is requested.
*   **VSCE Response**: `response_entire_codebase` (see 3.2.5)

---

#### 3.1.6. `get_active_file_info`
Requests information (path) about the currently active/focused file in VS Code. The CE will then typically make a `get_file_content` request.

*   **`type`**: `"request"`
*   **`command`**: `"get_active_file_info"`
*   **`payload`**: `{}`
*   **VSCE Response**: `response_active_file_info` (see 3.2.6)

---

#### 3.1.7. `get_open_files`
Requests a list of currently open files in VS Code.

*   **`type`**: `"request"`
*   **`command`**: `"get_open_files"`
*   **`payload`**: `{}`
*   **VSCE Response**: `response_open_files` (see 3.2.7)

---

#### 3.1.8. `search_workspace`
Requests a search for files and folders within the workspace.

*   **`type`**: `"request"`
*   **`command`**: `"search_workspace"`
*   **`payload`**:
    ```json
    {
      "query": "string",
      "workspaceFolderUri": "string | null" // Optional: URI of a specific workspace folder to search within. If null, search all.
    }
    ```
*   **VSCE Response**: `response_search_workspace` (see 3.2.8)

---

#### 3.1.9. `check_workspace_trust`
Requests the trust state of the current VS Code workspace(s).

*   **`type`**: `"request"`
*   **`command`**: `"check_workspace_trust"`
*   **`payload`**: `{}`
*   **VSCE Response**: `response_workspace_trust` (see 3.2.9)

---

#### 3.1.10. `get_filter_info`
Requests information about the active filter type (gitignore or default) for a workspace.

*   **`type`**: `"request"`
*   **`command`**: `"get_filter_info"`
*   **`payload`**:
    ```json
    {
      "workspaceFolderUri": "string | null" // URI of a specific workspace folder, or null for the (first) active one.
    }
    ```
*   **VSCE Response**: `response_filter_info` (see 3.2.10)

---

### 3.2. VSCE -> CE (Responses)

These messages are sent by the VS Code Extension in response to requests from the Chrome Extension. The `message_id` will match the `message_id` of the original request.

---

#### 3.2.1. `response_generic_ack`
Generic acknowledgment for simple requests.

*   **`type`**: `"response"`
*   **`command`**: `"response_generic_ack"`
*   **`payload`**:
    ```json
    {
      "success": "boolean",
      "message": "string | null" // Optional: message, e.g., "Target registered" or error details
    }
    ```

---

#### 3.2.2. `response_file_tree`
Response to `get_file_tree`.

*   **`type`**: `"response"`
*   **`command`**: `"response_file_tree"`
*   **`payload`**:
    ```json
    {
      "success": "boolean",
      "data": { // Present if success is true
        "fileTree": "string", // ASCII tree representation
        "metadata": { // ContextBlockMetadata object
          "unique_block_id": "string",
          "content_source_id": "string", // e.g., "workspace_uri::file_tree"
          "type": "file_tree",
          "label": "File Tree",
          "workspaceFolderUri": "string | null",
          "workspaceFolderName": "string | null"
        }
      } | null,
      "error": "string | null", // Present if success is false
      "workspaceFolderUri": "string | null", // URI of the workspace folder this tree is for
      "filterType": "'gitignore' | 'default' | 'none'" // Indicates which filter was applied or if none (e.g. untrusted workspace)
    }
    ```

---

#### 3.2.3. `response_file_content`
Response to `get_file_content`.

*   **`type`**: `"response"`
*   **`command`**: `"response_file_content"`
*   **`payload`**:
    ```json
    {
      "success": "boolean",
      "data": { // Present if success is true
        "content": "string", // File content
        "metadata": { // ContextBlockMetadata object
          "unique_block_id": "string",
          "content_source_id": "string", // Normalized file URI/path
          "type": "file_content",
          "label": "string", // filename.ext
          "workspaceFolderUri": "string | null",
          "workspaceFolderName": "string | null"
        }
      } | null,
      "error": "string | null", // Present if success is false
      "filePath": "string", // Original requested file path
      "filterType": "'gitignore' | 'default' | 'none' | 'not_applicable'" // e.g. 'not_applicable' if file is outside filtered scope or binary
    }
    ```

---

#### 3.2.4. `response_folder_content`
Response to `get_folder_content`.

*   **`type`**: `"response"`
*   **`command`**: `"response_folder_content"`
*   **`payload`**:
    ```json
    {
      "success": "boolean",
      "data": { // Present if success is true
        "content": "string", // Concatenated content of files in folder
        "metadata": { // ContextBlockMetadata object
          "unique_block_id": "string",
          "content_source_id": "string", // Normalized folder URI/path
          "type": "folder_content",
          "label": "string", // foldername
          "workspaceFolderUri": "string | null",
          "workspaceFolderName": "string | null"
        }
      } | null,
      "error": "string | null", // Present if success is false
      "folderPath": "string", // Original requested folder path
      "filterType": "'gitignore' | 'default' | 'none'"
    }
    ```

---

#### 3.2.5. `response_entire_codebase`
Response to `get_entire_codebase`.

*   **`type`**: `"response"`
*   **`command`**: `"response_entire_codebase"`
*   **`payload`**:
    ```json
    {
      "success": "boolean",
      "data": { // Present if success is true
        "fileTree": "string", // Textual representation of the file tree for the specified workspace folder
        "concatenatedContent": "string", // Concatenated content of all files in the specified workspace folder
        "metadata": { // ContextBlockMetadata object
          "unique_block_id": "string",
          "content_source_id": "string", // e.g., "uri_of_specified_workspace_folder::codebase"
          "type": "codebase_content",
          "label": "string", // e.g., "Entire Codebase - [folder_name]"
          "workspaceFolderUri": "string", // URI of the processed workspace folder
          "workspaceFolderName": "string" // Name of the processed workspace folder
        }
      } | null,
      "error": "string | null", // Present if success is false
      "workspaceFolderUri": "string | null",
      "filterType": "'gitignore' | 'default' | 'none'" // For V1 of get_entire_codebase, this will be 'default' as full .gitignore parsing for this command is deferred.
    }
    ```

---

#### 3.2.6. `response_active_file_info`
Response to `get_active_file_info`.

*   **`type`**: `"response"`
*   **`command`**: `"response_active_file_info"`
*   **`payload`**:
    ```json
    {
      "success": "boolean",
      "data": { // Present if success is true
        "activeFilePath": "string", // Normalized path of the active file
        "activeFileLabel": "string", // Filename for label
        "workspaceFolderUri": "string | null",
        "workspaceFolderName": "string | null"
      } | null,
      "error": "string | null" // e.g., "No active text editor found."
    }
    ```

---

#### 3.2.7. `response_open_files`
Response to `get_open_files`.

*   **`type`**: `"response"`
*   **`command`**: `"response_open_files"`
*   **`payload`**:
    ```json
    {
      "success": "boolean",
      "data": { // Present if success is true
        "openFiles": [
          {
            "path": "string", // Normalized path
            "name": "string", // Filename for display
            "workspaceFolderUri": "string | null",
            "workspaceFolderName": "string | null"
          }
          // ... more files
        ]
      } | null,
      "error": "string | null"
    }
    ```

---

#### 3.2.8. `response_search_workspace`
Response to `search_workspace`.

*   **`type`**: `"response"`
*   **`command`**: `"response_search_workspace"`
*   **`payload`**:
    ```json
    {
      "success": "boolean",
      "data": { // Present if success is true
        "results": [
          {
            "path": "string", // Normalized path
            "name": "string", // Name for display
            "type": "'file' | 'folder'",
            "content_source_id": "string", // Normalized URI/path for duplicate checking
            "workspaceFolderUri": "string | null",
            "workspaceFolderName": "string | null"
          }
          // ... more results
        ]
      } | null,
      "error": "string | null", // Present if success is false
      "query": "string" // Original search query
    }
    ```

---

#### 3.2.9. `response_workspace_trust`
Response to `check_workspace_trust`.

*   **`type`**: `"response"`
*   **`command`**: `"response_workspace_trust"`
*   **`payload`**:
    ```json
    {
      "success": "boolean",
      "data": { // Present if success is true
        "isTrusted": "boolean", // Overall trust status of the workspace
        "workspaceFolders": [ // Information about each folder
          {
            "uri": "string",
            "name": "string",
            "isTrusted": "boolean" // Trust status of this specific folder
          }
          // ... more folders if multi-root
        ]
      } | null,
      "error": "string | null" // e.g., "No workspace open."
    }
    ```

---

#### 3.2.10. `response_filter_info`
Response to `get_filter_info`.

*   **`type`**: `"response"`
*   **`command`**: `"response_filter_info"`
*   **`payload`**:
    ```json
    {
      "success": "boolean",
      "data": { // Present if success is true
        "filterType": "'gitignore' | 'default' | 'none'", // 'none' if untrusted or no workspace
        "workspaceFolderUri": "string | null"
      } | null,
      "error": "string | null"
    }
    ```

---

#### 3.2.11. `error_response` (General Error)
A generic error response if a more specific one isn't suitable, or for unhandled errors.

*   **`type`**: `"error_response"`
*   **`command`**: `"error_response"` (or could echo original command)
*   **`payload`**:
    ```json
    {
      "success": false, // Always false for error_response
      "error": "string", // Detailed error message
      "originalCommand": "string | null" // Command that triggered this error, if applicable
    }
    ```

---

### 3.3. VSCE -> CE (Pushes)

These messages are initiated by the VS Code Extension and pushed to the Chrome Extension. They do not typically have a `message_id` unless they are a response to a long-polling request (not planned for V1).

---

#### 3.3.1. `push_snippet`
VSCE pushes a selected code snippet to the CE.

*   **`type`**: `"push"`
*   **`command`**: `"push_snippet"`
*   **`payload`**:
    ```json
    {
      "snippet": "string", // The code snippet text
      "language": "string", // Language ID (e.g., "python", "javascript")
      "filePath": "string", // Normalized path of the source file
      "startLine": "number",
      "endLine": "number",
      "metadata": { // ContextBlockMetadata object
        "unique_block_id": "string",
        "content_source_id": "string", // e.g., "normalized_file_uri::snippet::start_line-end_line"
        "type": "code_snippet",
        "label": "string", // e.g., "auth.py (10-20)"
        "workspaceFolderUri": "string | null",
        "workspaceFolderName": "string | null"
      },
      "targetTabId": "number" // The tabId registered by `register_active_target`
    }
    ```

---

#### 3.3.2. `status_update`

VSCE sends general status updates or asynchronous error notifications to CE. This includes updates on the IPC server's status, such as the port it successfully bound to after potential fallback attempts.

VSCE sends general status updates or asynchronous error notifications to CE.

*   **`type`**: `"push"`
*   **`command`**: `"status_update"`
*   **`payload`**:
    ```json
    {
      "message": "string", // The status message
      "statusType": "'info' | 'warning' | 'error' | 'connection_status' | 'workspace_status'",
      // Examples for statusType:
      // 'connection_status': "VSCE Server started on port 30001."
      // 'workspace_status': "No project open in VS Code." or "Workspace is not trusted."
      // 'info': "Using .gitignore for filtering."
      "details": {} // Optional additional details specific to the status
    }
    ```

## 4. ContextBlockMetadata Structure

This object is included in VSCE responses when providing data that will be inserted into the LLM chat and requires a visual indicator in the CE.

```json
{
  "unique_block_id": "string", // UUID, e.g., "a1b2c3d4-e5f6-7890-1234-567890abcdef"
                           // Generated by VSCE for each distinct content block sent.
                           // Used by CE to identify and remove specific blocks from LLM input.

  "content_source_id": "string", // Canonical identifier for the source content itself.
                               // Used by CE for duplicate checking (except for snippets).
                               // Examples:
                               // - File Tree: "workspace_uri::file_tree"
                               // - Entire Codebase: "workspace_uri::codebase"
                               // - File Content: "normalized_file_uri" (e.g., "file:///c:/project/file.ts")
                               // - Folder Content: "normalized_folder_uri" (e.g., "file:///c:/project/src/")
                               // - Snippet: "normalized_file_uri::snippet::start_line-end_line" (e.g., "file:///c:/project/file.ts::snippet::10-25")

  "type": "string",        // Type of content, e.g., "file_tree", "file_content", "folder_content", "codebase_content", "code_snippet"

  "label": "string",         // User-friendly label for the indicator in CE.
                           // Examples: "File Tree", "auth.py", "src/components/", "Entire Codebase", "utils.js (10-25)"

  "workspaceFolderUri": "string | null", // URI of the workspace folder this content belongs to (for multi-root support).
                                      // Null if not applicable or single root.

  "workspaceFolderName": "string | null" // Name of the workspace folder (for multi-root display in CE).
                                       // Null if not applicable or single root.
}
```

## 5. Error Handling Conventions

*   All `response` messages from VSCE should include a `success: boolean` field in their payload.
*   If `success` is `false`, an `error: string` field in the payload should contain a human-readable error message.
*   The `error_response` message type can be used for general errors or if the original command context is lost.
*   The VSCE can also use `status_update` pushes with `statusType: 'error'` for asynchronous error reporting.

## 6. Version History

*   **1.0 (2025-05-26):** Initial design.