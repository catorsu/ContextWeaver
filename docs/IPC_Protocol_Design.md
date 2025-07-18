# ContextWeaver: Inter-Plugin Communication (IPC) Protocol Design

**Version:** 1.1.0

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
  // (Note: In this document, a type like `"string | null"` for an optional field generally corresponds to an optional property (`key?: type`) in the TypeScript definitions, meaning the key may be omitted from the JSON payload if it has no value.)
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

#### 3.1.2. `get_FileTree`
Requests the file and folder hierarchy for a specified workspace or the active one.

*   **`type`**: `"request"`
*   **`command`**: `"get_FileTree"`
*   **`payload`**:
    ```json
    {
      "workspaceFolderUri": "string | null" // URI of a specific workspace folder. If null and multiple workspace folders are open, an AMBIGUOUS_WORKSPACE error will be returned. If null and only one folder is open, that folder will be used.
    }
    ```
*   **VSCE Response**: `response_FileTree` (see 3.2.2)

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

#### 3.1.9. `get_filter_info`
Requests information about the active filter type (gitignore or default) for a workspace.

*   **`type`**: `"request"`
*   **`command`**: `"get_filter_info"`
*   **`payload`**:
    ```json
    {
      "workspaceFolderUri": "string | null" // URI of a specific workspace folder, or null for the (first) active one.
    }
    ```
*   **VSCE Response**: `response_filter_info` (see 3.2.9)

---

#### 3.1.10. `get_workspace_details`
Requests details about the currently open workspace(s), including their trust state.

*   **`type`**: `"request"`
*   **`command`**: `"get_workspace_details"`
*   **`payload`**: `{}`
*   **VSCE Response**: `response_workspace_details` (see 3.2.10)

---

#### 3.1.11. `list_folder_contents`
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

#### 3.1.12. `get_contents_for_files`
Requests the content of multiple specific files.

*   *(Note: Within the Chrome Extension, this IPC command is initiated by an internal `GET_CONTENTS_FOR_SELECTED_OPEN_FILES` message sent to the service worker.)*

*   **`type`**: `"request"`
*   **`command`**: `"get_contents_for_files"`
*   **`payload`**:
    ```json
    {
      "fileUris": ["string"] // Array of URI strings of the files to retrieve
    }
    ```
*   **VSCE Response**: `response_contents_for_files` (see 3.2.12)

---

#### 3.1.13. `register_secondary`
Registers a secondary VSCE instance with the primary VSCE for multi-window support.

*   **`type`**: `"request"`
*   **`command`**: `"register_secondary"`
*   **`payload`**:
    ```json
    {
      "windowId": "string", // Unique identifier for the secondary VS Code window instance
      "port": "number" // Port number (typically 0 when using the same WebSocket connection)
    }
    ```
*   **VSCE Response**: `response_generic_ack` (see 3.2.1)

---

#### 3.1.14. `forward_request_to_secondaries`
Used by the primary VSCE to forward requests from the Chrome Extension to secondary VSCE instances.

*   **`type`**: `"request"`
*   **`command`**: `"forward_request_to_secondaries"`
*   **`payload`**:
    ```json
    {
      "originalRequest": { // The original IPCMessageRequest from the Chrome Extension
        "protocol_version": "1.0",
        "message_id": "string",
        "type": "request",
        "command": "string", // Original command (e.g., "search_workspace", "get_open_files")
        "payload": {} // Original request payload
      }
    }
    ```
*   **Secondary VSCE Response**: Processes the original request and sends response via `forward_response_to_primary` push

---

#### 3.1.15. `get_workspace_problems`
Requests all diagnostics (errors, warnings, information, and hints) for a specified workspace folder.

*   **`type`**: `"request"`
*   **`command`**: `"get_workspace_problems"`
*   **`payload`**:
    ```json
    {
      "workspaceFolderUri": "string" // URI of the workspace folder to get problems for
    }
    ```
*   **VSCE Response**: `response_workspace_problems` (see 3.2.14)

---

#### 3.1.16. `unregister_secondary`
Unregisters a secondary VSCE instance from the primary VSCE.

*   **`type`**: `"request"`
*   **`command`**: `"unregister_secondary"`
*   **`payload`**:
    ```json
    {
      "windowId": "string" // Unique identifier for the secondary VS Code window instance to unregister
    }
    ```
*   **VSCE Response**: `response_unregister_secondary_ack` (see 3.2.15)

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

#### 3.2.2. `response_FileTree`
Response to `get_FileTree`.

*   **`type`**: `"response"`
*   **`command`**: `"response_FileTree"`
*   **`payload`**:
    ```json
    {
      "success": "boolean",
      "data": { // Present if success is true
        "fileTreeString": "string", // The raw, unwrapped ASCII tree representation. The client is responsible for wrapping this content in the final <FileTree> tag with an ID.
        "metadata": { // ContextBlockMetadata object
          "unique_block_id": "string",
          "content_source_id": "string", // e.g., "workspace_uri::FileTree"
          "type": "FileTree",
          "label": "string", // e.g., "MyProject" (the name of the workspace folder)
          "workspaceFolderUri": "string | null",
          "workspaceFolderName": "string | null",
          "windowId": "string" // Unique identifier for the VS Code window instance
        },
        "windowId": "string" // Unique identifier for the VS Code window instance
      } | null,
      "error": "string | null", // Present if success is false
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
          "workspaceFolderName": "string | null",
          "windowId": "string" // Unique identifier for the VS Code window instance
        },
        "windowId": "string" // Unique identifier for the VS Code window instance
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
          "workspaceFolderName": "string | null",
          "windowId": "string" // Unique identifier for the VS Code window instance
        },
        "windowId": "string" // Unique identifier for the VS Code window instance
      } | null,
  "error": "string | null", // Present if success is false
  "errorCode": "string | null", // Optional error code
  "folderPath": "string", // Original requested folder path
  "filterType": "'gitignore' | 'default' | 'none' | 'not_applicable'",
  "workspaceFolderUri": "string" // URI of the workspace folder this folderPath belongs to.
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
          "content_source_id": "string", // e.g., "uri_of_specified_workspace_folder::entire_codebase"
          "type": "codebase_content",
          "label": "string", // e.g., "folder_name"
          "workspaceFolderUri": "string | null", // URI of the processed workspace folder
          "workspaceFolderName": "string | null", // Name of the processed workspace folder
          "windowId": "string" // Unique identifier for the VS Code window instance
        },
        "windowId": "string" // Unique identifier for the VS Code window instance
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
        "workspaceFolderName": "string | null",
        "windowId": "string" // Unique identifier for the VS Code window instance
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
            "workspaceFolderName": "string | null",
            "windowId": "string" // Unique identifier for the VS Code window instance
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
            "filterTypeApplied": "'gitignore' | 'default' | 'none' | 'not_applicable' | null", // Optional, type FilterType
            "windowId": "string" // Unique identifier for the VS Code window instance that provided this result
          }
          // ... more results
        ],
        "errors": [ // Optional: Array of errors from specific windows, present only if some windows failed
          {
            "windowId": "string", // The window that encountered the error
            "error": "string", // Error message
            "errorCode": "string | null" // Optional error code
          }
          // ... more errors
        ] | undefined,
        "windowId": "string" // Unique identifier for the VS Code window instance
      } | null,
      "error": "string | null", // Present if success is false
      "errorCode": "string | null", // Optional error code
      "query": "string" // Original search query
    }
    ```

---

#### 3.2.9. `response_filter_info`
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

#### 3.2.10. `response_workspace_details`
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

#### 3.2.11. `error_response` (General Error)
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

#### 3.2.12. `response_contents_for_files`
Response to `get_contents_for_files`.

*   **`type`**: `"response"`
*   **`command`**: `"response_contents_for_files"`
*   **`payload`**:
    ```json
    {
      "success": "boolean",
      "data": [ // Array of successful file data responses. Always present, may be empty.
        {
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
            "workspaceFolderName": "string | null",
            "windowId": "string" // Unique identifier for the VS Code window instance
          },
          "windowId": "string" // Unique identifier for the VS Code window instance
        }
        // ... more successful files
      ],
      "errors": [ // Array of errors for files that failed. Always present, may be empty.
        {
          "uri": "string", // URI of the file that failed
          "error": "string", // Error message
          "errorCode": "string | null" // Optional error code
        }
        // ... more errors
      ],
      "error": "string | null", // Present if the entire operation failed
      "errorCode": "string | null" // Optional error code for the entire operation
    }
    ```

---

#### 3.2.13. `response_list_folder_contents`
Response to `list_folder_contents`.

The `entries` array contains a **flat list of all recursive descendants** (all files and folders within the target folder and all its subfolders) that are not ignored by filters. The client-side (`contentScript.ts`) is responsible for building the hierarchical tree view from this flat list.

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
            "content_source_id": "string", // Canonical ID, typically same as URI string
            "windowId": "string" // Unique identifier for the VS Code window instance that provided this entry
          }
          // ... more entries
        ],
        "parentFolderUri": "string", // Echo back the requested folderUri
        "filterTypeApplied": "'gitignore' | 'default' | 'none' | 'not_applicable'",
        "windowId": "string" // Unique identifier for the VS Code window instance
      } | null,
      "error": "string | null", // Present if success is false
      "errorCode": "string | null" // Optional error code
    }
    ```

---

#### 3.2.14. `response_workspace_problems`
Response to `get_workspace_problems`.

*   **`type`**: `"response"`
*   **`command`**: `"response_workspace_problems"`
*   **`payload`**:
    ```json
    {
      "success": "boolean",
      "data": { // Present if success is true
        "problemsString": "string", // Formatted list of all problems in the workspace
        "problemCount": "number", // Total number of problems found
        "metadata": { // ContextBlockMetadata object
          "unique_block_id": "string",
          "content_source_id": "string", // e.g., "workspace_uri::problems"
          "type": "WorkspaceProblems",
          "label": "string", // e.g., "WorkspaceName"
          "workspaceFolderUri": "string | null",
          "workspaceFolderName": "string | null",
          "windowId": "string" // Unique identifier for the VS Code window instance
        },
        "windowId": "string" // Unique identifier for the VS Code window instance
      } | null,
      "error": "string | null", // Present if success is false
      "errorCode": "string | null", // Optional error code
      "workspaceFolderUri": "string" // Echo back the requested workspace folder URI
    }
    ```

---

#### 3.2.15. `response_unregister_secondary_ack`
Response to `unregister_secondary`.

*   **`type`**: `"response"`
*   **`command`**: `"response_unregister_secondary_ack"`
*   **`payload`**:
    ```json
    {
      "success": "boolean",
      "message": "string | null" // Optional: message, e.g., "Secondary unregistered" or error details
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
        "type": "CodeSnippet",
        "label": "string", // e.g., "auth.py (10-20)"
        "workspaceFolderUri": "string | null",
        "workspaceFolderName": "string | null",
        "windowId": "string" // Unique identifier for the VS Code window instance from which the snippet originated
      },
      "targetTabId": "number", // DEPRECATED. This field is ignored by the service worker, which now broadcasts the snippet to all supported LLM tabs.
      "windowId": "string" // Unique identifier for the VS Code window instance that sent this snippet
    }
    ```

---

#### 3.3.2. `forward_response_to_primary`
Used by secondary VSCE instances to send responses back to the primary VSCE for aggregation.

*   **`type`**: `"push"`
*   **`command`**: `"forward_response_to_primary"`
*   **`payload`**:
    ```json
    {
      "originalMessageId": "string", // The message_id from the original request that was forwarded
      "responsePayload": {} // The response payload that would normally be sent directly to the Chrome Extension
    }
    ```

---

#### 3.3.3. `forward_push_to_primary`
Used by secondary VSCE instances to forward push messages (like snippets) to the primary VSCE for delivery to the Chrome Extension.

*   **`type`**: `"push"`
*   **`command`**: `"forward_push_to_primary"`
*   **`payload`**:
    ```json
    {
      "originalPushPayload": { // The original push payload (e.g., PushSnippetPayload)
        "snippet": "string",
        "language": "string",
        "filePath": "string",
        "relativeFilePath": "string",
        "startLine": "number",
        "endLine": "number",
        "metadata": {}, // ContextBlockMetadata object
        "targetTabId": "number",
        "windowId": "string"
      }
    }
    ```

## 4. ContextBlockMetadata Structure

This object is included in VSCE responses when providing data that will be inserted into the LLM chat and requires a visual indicator in the CE. It is defined in `packages/shared/src/data-models.ts` as follows:

```json
{
  "unique_block_id": "string", // UUID, e.g., "a1b2c3d4-e5f6-7890-1234-567890abcdef". Generated by VSCE for each distinct content block sent. Used by CE to identify and remove specific blocks from LLM input.
  "content_source_id": "string", // Canonical identifier for the source content itself. Used by CE for duplicate checking (except for snippets). Examples: "workspace_uri::FileTree", "normalized_file_uri", etc.
  "type": "'FileTree' | 'file_content' | 'folder_content' | 'codebase_content' | 'CodeSnippet' | 'WorkspaceProblems'", // Type of content.
  "label": "string",         // User-friendly label for the indicator in CE. Examples: "File Tree", "auth.py", "src/components/", "Entire Codebase", "utils.js (10-25)"
  "workspaceFolderUri": "string | null", // URI of the workspace folder this content belongs to. Null if not applicable or single root.
  "workspaceFolderName": "string | null", // Name of the workspace folder. Null if not applicable or single root.
  "windowId": "string" // Unique identifier for the VS Code window instance that provided this content.
}
```

## 5. Error Handling Conventions

*   All `response` messages from VSCE should include a `success: boolean` field in their payload.
*   If `success` is `false`, an `error: string` field in the payload should contain a human-readable error message.
*   The `error_response` message type can be used for general errors or if the original command context is lost.
*   The VSCE can also use `status_update` pushes with `statusType: 'error'` for asynchronous error reporting.

**Common Error Codes (sent in `errorCode` field of `error_response` or specific responses):**
*   `INVALID_MESSAGE_FORMAT`: Request message could not be parsed or has invalid JSON format.
*   `INVALID_MESSAGE_TYPE`: Request message has an unexpected message type.
*   `INVALID_PAYLOAD`: Request payload was missing required fields or had invalid values.
*   `UNSUPPORTED_PROTOCOL_VERSION`: Client's protocol version is not supported.
*   `UNKNOWN_COMMAND`: The requested command is not recognized.
*   `INTERNAL_SERVER_ERROR`: An unexpected error occurred on the server.
*   `WORKSPACE_NOT_TRUSTED`: The VS Code workspace is not trusted by the user.
*   `NO_WORKSPACE_OPEN`: No workspace folder is currently open in VS Code.
*   `WORKSPACE_FOLDER_NOT_FOUND`: A specified `workspaceFolderUri` does not match any open workspace folder.
*   `AMBIGUOUS_WORKSPACE`: An operation requires a single workspace folder context (e.g., via `workspaceFolderUri` in payload), but multiple folders are open and no specific one was provided.
*   `FileTree_ERROR`: Error during file tree generation.
*   `FILE_NOT_FOUND`: The requested file could not be found.
*   `FILE_READ_ERROR`: General error reading specific file content.
*   `FILE_BINARY_OR_READ_ERROR`: File is binary or could not be read (specific file content error).
*   `DIRECTORY_NOT_FOUND`: The requested directory could not be found.
*   `DIRECTORY_READ_ERROR`: Error during directory listing operation (e.g., for `list_folder_contents`).
*   `FOLDER_READ_ERROR`: General error reading content of a folder.
*   `FOLDER_CONTENT_UNEXPECTED_ERROR`: Unexpected error during folder content retrieval.
*   `CODEBASE_READ_ERROR`: General error reading content for the entire codebase.
*   `CODEBASE_CONTENT_UNEXPECTED_ERROR`: Unexpected error during entire codebase retrieval.
*   `INVALID_URI`: A provided string could not be parsed as a valid URI.
*   `SEARCH_ERROR`: Error during a workspace search operation.
*   `INVALID_PATH`: A provided path (e.g. folder path for `get_folder_content`) is invalid or not within the specified workspace.
*   `PROBLEMS_ERROR`: Error during workspace problems/diagnostics retrieval.
*   `NO_ACTIVE_FILE`: No file is currently active/focused in VS Code.

## 6. Version History

*   **1.0:** Initial design.
*   **1.0.1:** Added `list_folder_contents` command and `response_list_folder_contents` for browsing folder contents.
*   **1.1.0:** Added multi-window support via Primary/Secondary architecture:
    *   Added `windowId` field to `ContextBlockMetadata`, `SearchResult`, and `DirectoryEntry` data models.
    *   Added new IPC commands: `register_secondary`, `forward_request_to_secondaries`.
    *   Added new push commands: `forward_response_to_primary`, `forward_push_to_primary`.
    *   Added `get_workspace_problems` command and `response_workspace_problems` for fetching workspace diagnostics.
    *   Added `workspace_problems` type to `ContextBlockMetadata`.
    *   Updated `push_snippet` payload to include `windowId` field.