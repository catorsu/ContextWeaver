# ContextWeaver: Inter-Plugin Communication (IPC) Protocol Design

**Version:** 1.0.1
**Date:** June 02, 2025

**Important Note:** This document provides a human-readable overview of the IPC protocol. For the definitive and normative specification of all message structures, request/response payloads, and shared data models, please refer to the TypeScript interfaces defined in the `packages/shared/src/` directory, primarily within `ipc-types.ts` and `data-models.ts`. In case of any discrepancy, the TypeScript definitions are authoritative.

## 1. Overview

This document defines the Inter-Plugin Communication (IPC) protocol used between the ContextWeaver VS Code Extension (VSCE) and the Chrome Extension (CE).

*   **Transport:** WebSockets
*   **Server:** VSCE (listens on `localhost` and attempts port fallback if default is busy)
*   **Client:** CE
*   **Format:** JSON
*   **Authentication:** Removed. Communication relies on `localhost` binding for security.

## 2. Core Message Structure

All messages exchanged between the VSCE and CE will adhere to a base JSON structure. The specific `command` and `payload` fields are determined by the `type` of the message, as detailed in the shared TypeScript definitions (e.g., `IPCMessageRequest`, `IPCMessageResponse`).

**Base Structure (see `IPCBaseMessage` in `shared/ipc-types.ts`):**
```json
{
  "protocol_version": "1.0",
  "message_id": "string",    // Unique UUID for requests, echoed in responses. Optional for pushes.
  "type": "request | response | push | error_response" // Category of the message
  // "command" and "payload" are specific to each message type and command combination.
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
      "workspaceFolderUri": "string | null" // URI of a specific workspace folder. If null and multiple workspace folders are open, an AMBIGUOUS_WORKSPACE error will be returned. If null and only one folder is open, that folder will be used.
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
      "filePath": "string" // Normalized, absolute path or URI string to the file
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
      "folderPath": "string", // Normalized, absolute path or URI string to the folder
      "workspaceFolderUri": "string" // URI of the workspace folder this folderPath belongs to. Required.
    }
    ```
    The `workspaceFolderUri` is required to correctly contextualize the `folderPath` and apply appropriate filters.
*   **VSCE Response**: `response_folder_content` (see 3.2.4)

---

#### 3.1.5. `get_entire_codebase`
Requests the concatenated content of all files in a workspace (respecting filters).

*   **`type`**: `"request"`
*   **`command`**: `"get_entire_codebase"`
*   **`payload`**:
    ```json
    {
      "workspaceFolderUri": "string | null" // URI of the specific workspace folder. If null, the VSCE will attempt to use the active workspace.
    }
    ```
    The `workspaceFolderUri` field specifies the URI of the workspace folder for which the entire codebase content is requested. If null, the VSCE will attempt to use the active workspace.
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
**[DEPRECATED]** Use `get_workspace_details` (3.1.11) instead.
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

#### 3.1.11. `get_workspace_details`
Requests details about the currently open workspace(s), including their trust state. This replaces the need for `check_workspace_trust`.

*   **`type`**: `"request"`
*   **`command`**: `"get_workspace_details"`
*   **`payload`**: `{}`
*   **VSCE Response**: `response_workspace_details` (see 3.2.12)

---

#### 3.1.12. `list_folder_contents`
Requests a listing of immediate files and subdirectories within a specified folder, respecting filters.

*   **`type`**: `"request"`
*   **`command`**: `"list_folder_contents"`
*   **`payload`**:
    ```json
    {
      "folderUri": "string", // URI of the folder whose contents are to be listed
      "workspaceFolderUri": "string | null" // URI of the workspace folder this folderUri belongs to (for context, filtering). Null if not applicable or single root.
    }
    ```
*   **VSCE Response**: `response_list_folder_contents` (see 3.2.13)

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
        "fileTreeString": "string", // ASCII tree representation
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
  "errorCode": "string | null", // Optional error code
  "errorCode": "string | null", // Optional error code
      "workspaceFolderUri": "string | null", // URI of the workspace folder this tree is for
      "filterType": "'gitignore' | 'default' | 'none' | 'not_applicable'" // Indicates which filter was applied or if none (e.g. untrusted workspace)
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
        "fileData": { // Object containing file details
          "fullPath": "string", // Normalized, absolute path to the file
          "content": "string", // File content
          "languageId": "string" // Language ID of the file
        },
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
      "filePath": "string", // Original requested file path (echoed back)
      "filterType": "'gitignore' | 'default' | 'none' | 'not_applicable'"
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
        "filesData": [ // Array of FileData objects
          {
            "fullPath": "string",
            "content": "string",
            "languageId": "string"
          }
          // ... more files
        ],
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
  "errorCode": "string | null", // Optional error code
  "folderPath": "string", // Original requested folder path
  "filterType": "'gitignore' | 'default' | 'none' | 'not_applicable'", // Updated to include 'not_applicable'
  "workspaceFolderUri": "string | null" // Added from ipcServer.ts implementation
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
        "filesData": [ // Array of FileData objects for all files in the workspace
          {
            "fullPath": "string",
            "content": "string",
            "languageId": "string"
          }
          // ... more files
        ],
        // "fileTreeString": "string", // Optional: Textual representation of the file tree. Currently not sent by default.
        "metadata": { // ContextBlockMetadata object
          "unique_block_id": "string",
          "content_source_id": "string", // e.g., "uri_of_specified_workspace_folder::codebase"
          "type": "codebase_content",
          "label": "string", // e.g., "Entire Codebase - [folder_name]"
      "workspaceFolderUri": "string | null", // URI of the processed workspace folder
      "workspaceFolderName": "string | null" // Name of the processed workspace folder
    }
  } | null,
  "error": "string | null", // Present if success is false
  "errorCode": "string | null", // Optional error code
  "workspaceFolderUri": "string | null",
  "filterType": "'gitignore' | 'default' | 'none' | 'not_applicable'", // Indicates the filter type applied during content collection.
  "workspaceFolderName": "string | null", // Added from ipcServer.ts implementation
  "projectPath": "string | null" // Added from ipcServer.ts implementation
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
      "data": {
        "activeFilePath": "string",
        "activeFileLabel": "string", 
        "workspaceFolderUri": "string | null",
        "workspaceFolderName": "string | null"
      } | null,
  "error": "string | null", // e.g., "No active text editor found."
  "errorCode": "string | null" // Optional error code
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
  "error": "string | null",
  "errorCode": "string | null" // Optional error code
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
          { // Structure of each item in the results array
            "path": "string", // Normalized path
            "name": "string", // Name for display
            "relativePath": "string", // Path relative to workspace root for disambiguation
            "type": "'file' | 'folder'",
            "uri": "string", // Full URI string of the entry
            "content_source_id": "string", // Canonical ID, typically same as URI string
            "workspaceFolderUri": "string", // URI of the workspace folder (non-nullable as per shared type)
            "workspaceFolderName": "string", // Name of the workspace folder (non-nullable as per shared type)
            "filterTypeApplied": "'gitignore' | 'default' | 'none' | 'not_applicable' | null" // Optional, type FilterType
          }
          // ... more results
        ]
      } | null,
      "error": "string | null", // Present if success is false
      "errorCode": "string | null", // Optional error code
      "query": "string" // Original search query
    }
    ```

---

#### 3.2.9. `response_workspace_trust`
**[DEPRECATED]** See `response_workspace_details` (3.2.11).
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
    "filterType": "'gitignore' | 'default' | 'none' | 'not_applicable'", // 'none' if untrusted or no workspace
    "workspaceFolderUri": "string | null"
  } | null,
  "error": "string | null",
  "errorCode": "string | null" // Optional error code
}
    ```

---

#### 3.2.11. `response_workspace_details`
Response to `get_workspace_details`.

*   **`type`**: `"response"`
*   **`command`**: `"response_workspace_details"`
*   **`payload`**:
    ```json
    {
      "success": "boolean",
      "data": { // Present if success is true
        "isTrusted": "boolean", // Overall trust status of the VS Code workspace environment
        "workspaceFolders": [ // Array of open workspace folders. Null if no workspace is open.
          {
            "uri": "string", // URI of the workspace folder
            "name": "string", // Name of the workspace folder
            "isTrusted": "boolean" // Reflects the overall workspace trust status for this folder
          }
          // ... more folders if multi-root
        ] | null,
        "workspaceName": "string | null" // Optional name of the overall workspace (e.g., from .code-workspace file)
      } | null,
  "error": "string | null", // Present if success is false
  "errorCode": "string | null" // Optional error code
}
    ```

---

#### 3.2.12. `error_response` (General Error)
A generic error response if a more specific one isn't suitable, or for unhandled errors.

*   **`type`**: `"error_response"`
*   **`command`**: `"error_response"` (or could echo original command)
*   **`payload`**:
    ```json
    {
      "success": false, // Always false for error_response
  "error": "string", // Detailed error message
  "errorCode": "string", // Specific error code
  "originalCommand": "string | null" // Optional: command that triggered this error
}
    ```

---

#### 3.2.13. `response_list_folder_contents`
Response to `list_folder_contents`.

*   **`type`**: `"response"`
*   **`command`**: `"response_list_folder_contents"`
*   **`payload`**:
    ```json
    {
      "success": "boolean",
      "data": { // Present if success is true
        "entries": [
          {
            "name": "string", // Name of the file or folder
            "type": "'file' | 'folder'",
            "uri": "string", // Full URI string of the entry
            "content_source_id": "string" // Canonical ID, typically same as URI string
          }
          // ... more entries
        ],
        "parentFolderUri": "string", // Echo back the requested folderUri
    "filterTypeApplied": "'gitignore' | 'default' | 'none' | 'not_applicable'"
  } | null,
      "error": "string | null", // Present if success is false
      "errorCode": "string | null" // Optional error code
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
      "relativeFilePath": "string", // Path relative to workspace folder
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

## 4. ContextBlockMetadata Structure

This object is included in VSCE responses when providing data that will be inserted into the LLM chat and requires a visual indicator in the CE. It is defined in `packages/shared/src/data-models.ts` as follows:

```json
{
  "unique_block_id": "string", // UUID, e.g., "a1b2c3d4-e5f6-7890-1234-567890abcdef". Generated by VSCE for each distinct content block sent. Used by CE to identify and remove specific blocks from LLM input.
  "content_source_id": "string", // Canonical identifier for the source content itself. Used by CE for duplicate checking (except for snippets). Examples: "workspace_uri::file_tree", "normalized_file_uri", etc.
  "type": "'file_tree' | 'file_content' | 'folder_content' | 'codebase_content' | 'code_snippet'", // Type of content.
  "label": "string",         // User-friendly label for the indicator in CE. Examples: "File Tree", "auth.py", "src/components/", "Entire Codebase", "utils.js (10-25)"
  "workspaceFolderUri": "string | null", // URI of the workspace folder this content belongs to. Null if not applicable or single root.
  "workspaceFolderName": "string | null" // Name of the workspace folder. Null if not applicable or single root.
}
```

## 5. Error Handling Conventions

*   All `response` messages from VSCE should include a `success: boolean` field in their payload.
*   If `success` is `false`, an `error: string` field in the payload should contain a human-readable error message.
*   The `error_response` message type can be used for general errors or if the original command context is lost.
*   The VSCE can also use `status_update` pushes with `statusType: 'error'` for asynchronous error reporting.

**Common Error Codes (sent in `errorCode` field of `error_response` or specific responses):**
*   `INVALID_PAYLOAD`: Request payload was missing required fields or had invalid values.
*   `UNSUPPORTED_PROTOCOL_VERSION`: Client's protocol version is not supported.
*   `UNKNOWN_COMMAND`: The requested command is not recognized.
*   `INTERNAL_SERVER_ERROR`: An unexpected error occurred on the server.
*   `WORKSPACE_NOT_TRUSTED`: The VS Code workspace is not trusted by the user.
*   `NO_WORKSPACE_OPEN`: No workspace folder is currently open in VS Code.
*   `WORKSPACE_FOLDER_NOT_FOUND`: A specified `workspaceFolderUri` does not match any open workspace folder.
*   `AMBIGUOUS_WORKSPACE`: An operation requires a single workspace folder context (e.g., via `workspaceFolderUri` in payload), but multiple folders are open and no specific one was provided.
*   `FILE_TREE_GENERATION_FAILED`: Error during file tree generation.
*   `FILE_CONTENT_ERROR`: General error reading specific file content.
*   `FILE_BINARY_OR_READ_ERROR`: File is binary or could not be read (specific file content error).
*   `FOLDER_CONTENT_ERROR`: General error reading content of a folder.
*   `FOLDER_CONTENT_UNEXPECTED_ERROR`: Unexpected error during folder content retrieval.
*   `CODEBASE_CONTENT_ERROR`: General error reading content for the entire codebase.
*   `CODEBASE_CONTENT_UNEXPECTED_ERROR`: Unexpected error during entire codebase retrieval.
*   `INVALID_URI`: A provided string could not be parsed as a valid URI.
*   `SEARCH_ERROR`: Error during a workspace search operation.
*   `INVALID_PATH`: A provided path (e.g. folder path for `get_folder_content`) is invalid or not within the specified workspace.
*   `FOLDER_LISTING_ERROR`: Error during directory listing operation (e.g., for `list_folder_contents`).

## 6. Version History

*   **1.0 (2025-05-26):** Initial design.
*   **1.0.1 (2025-06-02):** Added `list_folder_contents` command and `response_list_folder_contents` for browsing folder contents.
