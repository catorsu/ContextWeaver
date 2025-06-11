/**
 * @file ipc-types.ts
 * @description Defines the TypeScript interfaces and types for Inter-Process Communication (IPC)
 * messages exchanged between the VS Code Extension (VSCE) and the Chrome Extension (CE).
 * @module ContextWeaver/Shared
 */

import { ContextBlockMetadata, FileData, SearchResult, DirectoryEntry, FilterType } from './data-models';

/**
 * Base structure for all IPC messages.
 */
export interface IPCBaseMessage {
    protocol_version: "1.0";
    message_id: string; // UUID for requests, echoed in responses. Optional for pushes.
    type: "request" | "response" | "push" | "error_response";
    // Command will be narrowed in specific message types
}

// --- CE -> VSCE (Requests) ---

/**
 * Payload for requesting the VSCE to register an active LLM target tab.
 */
export interface RegisterActiveTargetRequestPayload {
    tabId: number;
    llmHost: string;
}

/**
 * Payload for requesting the file tree of a workspace folder.
 */
export interface GetFileTreeRequestPayload {
    workspaceFolderUri: string | null;
}

/**
 * Payload for requesting the content of a specific file.
 */
export interface GetFileContentRequestPayload {
    filePath: string; // Normalized, absolute path or URI string
}

/**
 * Payload for requesting the content of a specific folder.
 */
export interface GetFolderContentRequestPayload {
    folderPath: string; // Normalized, absolute path or URI string
    workspaceFolderUri: string; // URI of the workspace folder this folderPath belongs to
}

/**
 * Payload for requesting the entire codebase content of a workspace folder.
 */
export interface GetEntireCodebaseRequestPayload {
    workspaceFolderUri: string | null; // Changed to allow null
}

// GetActiveFileInfoRequestPayload is empty: {}
// GetOpenFilesRequestPayload is empty: {}

/**
 * Payload for requesting a workspace search.
 */
export interface SearchWorkspaceRequestPayload {
    query: string;
    workspaceFolderUri: string | null;
}

// GetFilterInfoRequestPayload
/**
 * Payload for requesting filter information (e.g., .gitignore rules) for a workspace.
 */
export interface GetFilterInfoRequestPayload {
    workspaceFolderUri: string | null;
}

// GetWorkspaceDetailsRequestPayload is empty: {}

/**
 * Payload for requesting a listing of folder contents.
 */
export interface ListFolderContentsRequestPayload {
    folderUri: string; // URI string of the folder to list
    workspaceFolderUri: string | null; // Changed to allow null
}


// --- VSCE -> CE (Responses) ---

/**
 * Generic acknowledgment response payload.
 */
export interface GenericAckResponsePayload {
    success: boolean;
    message: string | null;
}

export interface FileTreeResponseData {
    fileTreeString: string;
    metadata: ContextBlockMetadata;
    windowId: string; // Unique identifier for the VS Code window instance
}
/**
 * Response payload for a file tree request.
 */
export interface FileTreeResponsePayload {
    success: boolean;
    data: FileTreeResponseData | null;
    error: string | null;
    errorCode?: string;
    workspaceFolderUri: string | null;
    filterType: FilterType;
}

export interface FileContentResponseData {
    fileData: FileData;
    metadata: ContextBlockMetadata;
    windowId: string; // Unique identifier for the VS Code window instance
}
/**
 * Response payload for a file content request.
 */
export interface FileContentResponsePayload {
    success: boolean;
    data: FileContentResponseData | null;
    error: string | null;
    errorCode?: string;
    filePath: string; // Echoed back
    filterType: FilterType; // 'not_applicable' for single file
}

export interface FolderContentResponseData {
    filesData: FileData[];
    metadata: ContextBlockMetadata;
    windowId: string; // Unique identifier for the VS Code window instance
}
/**
 * Response payload for a folder content request.
 */
export interface FolderContentResponsePayload {
    success: boolean;
    data: FolderContentResponseData | null;
    error: string | null;
    errorCode?: string;
    folderPath: string; // Echoed back
    filterType: FilterType;
    workspaceFolderUri?: string; // Added from ipcServer.ts implementation
}

export interface EntireCodebaseResponseData {
    filesData: FileData[];
    metadata: ContextBlockMetadata;
    windowId: string; // Unique identifier for the VS Code window instance
    // fileTreeString?: string; // Optional, as per IPC doc
}
/**
 * Response payload for an entire codebase request.
 */
export interface EntireCodebaseResponsePayload {
    success: boolean;
    data: EntireCodebaseResponseData | null;
    error: string | null;
    errorCode?: string;
    workspaceFolderUri: string | null; // URI of the processed workspace
    filterType: FilterType;
    workspaceFolderName?: string; // Added from ipcServer.ts implementation
    projectPath?: string; // Added from ipcServer.ts implementation
}

export interface ActiveFileInfoResponseData {
    activeFilePath: string; // URI string
    activeFileLabel: string;
    workspaceFolderUri: string | null;
    workspaceFolderName: string | null;
    windowId: string; // Unique identifier for the VS Code window instance
}
/**
 * Response payload for an active file information request.
 */
export interface ActiveFileInfoResponsePayload {
    success: boolean;
    data: ActiveFileInfoResponseData | null;
    error: string | null;
    errorCode?: string;
}

export interface OpenFilesResponseData {
    openFiles: Array<{
        path: string; // URI string
        name: string;
        workspaceFolderUri: string | null;
        workspaceFolderName: string | null;
        windowId: string; // Unique identifier for the VS Code window instance
    }>;
}
/**
 * Response payload for an open files request.
 */
export interface OpenFilesResponsePayload {
    success: boolean;
    data: OpenFilesResponseData | null;
    error: string | null;
    errorCode?: string;
}

export interface SearchWorkspaceResponseData {
    results: SearchResult[];
    windowId: string; // Unique identifier for the VS Code window instance
}
/**
 * Response payload for a workspace search request.
 */
export interface SearchWorkspaceResponsePayload {
    success: boolean;
    data: SearchWorkspaceResponseData | null;
    error: string | null;
    errorCode?: string;
    query: string; // Echoed back
}

export interface WorkspaceDetailsResponseData {
    isTrusted: boolean;
    workspaceFolders: Array<{
        uri: string;
        name: string;
        isTrusted: boolean; // Overall workspace trust applied here
    }> | null;
    workspaceName?: string; // Optional workspace name for UI display
}
/**
 * Response payload for a workspace details request.
 */
export interface WorkspaceDetailsResponsePayload {
    success: boolean;
    data: WorkspaceDetailsResponseData | null;
    error: string | null;
    errorCode?: string;
}

export interface FilterInfoResponseData {
    filterType: FilterType;
    workspaceFolderUri: string | null;
}
/**
 * Response payload for a filter information request.
 */
export interface FilterInfoResponsePayload {
    success: boolean;
    data: FilterInfoResponseData | null;
    error: string | null;
    errorCode?: string;
}

export interface ListFolderContentsResponseData {
    entries: DirectoryEntry[];
    parentFolderUri: string; // Echoed back
    filterTypeApplied: FilterType;
    windowId: string; // Unique identifier for the VS Code window instance
}
/**
 * Response payload for a list folder contents request.
 */
export interface ListFolderContentsResponsePayload {
    success: boolean;
    data: ListFolderContentsResponseData | null;
    error: string | null;
    errorCode?: string;
}

/**
 * Standard error response payload for IPC messages.
 */
export interface ErrorResponsePayload {
    success: false; // Always false
    error: string;
    errorCode: string;
    originalCommand?: string | null;
}

// --- VSCE -> CE (Pushes) ---

/**
 * Payload for pushing a code snippet to the Chrome Extension.
 */
export interface PushSnippetPayload {
    snippet: string;
    language: string;
    filePath: string; // Full fsPath
    relativeFilePath: string;
    startLine: number; // 1-indexed
    endLine: number; // 1-indexed
    metadata: ContextBlockMetadata;
    targetTabId: number; // Tab ID for CE to target
    windowId: string; // Unique identifier for the VS Code window instance
}

// --- IPC Message Type Definitions (Combining Base with Payloads) ---
// These help define the structure of messages sent over WebSocket

/**
 * Represents a request message sent from the Chrome Extension to the VS Code Extension.
 */
export type IPCRequest =
    | { command: "register_active_target"; payload: RegisterActiveTargetRequestPayload }
    | { command: "get_FileTree"; payload: GetFileTreeRequestPayload }
    | { command: "get_file_content"; payload: GetFileContentRequestPayload }
    | { command: "get_folder_content"; payload: GetFolderContentRequestPayload }
    | { command: "get_entire_codebase"; payload: GetEntireCodebaseRequestPayload }
    | { command: "get_active_file_info"; payload: {} }
    | { command: "get_open_files"; payload: {} }
    | { command: "search_workspace"; payload: SearchWorkspaceRequestPayload }
    | { command: "get_filter_info"; payload: GetFilterInfoRequestPayload }
    | { command: "get_workspace_details"; payload: {} }
    | { command: "list_folder_contents"; payload: ListFolderContentsRequestPayload }
    | { command: "register_secondary"; payload: { windowId: string; port: number } }
    | { command: "forward_request_to_secondaries"; payload: { originalRequest: IPCMessageRequest } }
    | { command: "unregister_secondary"; payload: { windowId: string } };

/**
 * Represents a response message sent from the VS Code Extension to the Chrome Extension.
 */
export type IPCResponse =
    | { command: "response_generic_ack"; payload: GenericAckResponsePayload }
    | { command: "response_FileTree"; payload: FileTreeResponsePayload }
    | { command: "response_file_content"; payload: FileContentResponsePayload }
    | { command: "response_folder_content"; payload: FolderContentResponsePayload }
    | { command: "response_entire_codebase"; payload: EntireCodebaseResponsePayload }
    | { command: "response_active_file_info"; payload: ActiveFileInfoResponsePayload }
    | { command: "response_open_files"; payload: OpenFilesResponsePayload }
    | { command: "response_search_workspace"; payload: SearchWorkspaceResponsePayload }
    | { command: "response_workspace_details"; payload: WorkspaceDetailsResponsePayload }
    | { command: "response_filter_info"; payload: FilterInfoResponsePayload }
    | { command: "response_list_folder_contents"; payload: ListFolderContentsResponsePayload }
    | { command: "response_unregister_secondary_ack"; payload: GenericAckResponsePayload };
// error_response is handled separately or as part of specific responses with success:false

/**
 * Represents a push message sent from the VS Code Extension to the Chrome Extension.
 */
export type IPCPush =
    | { command: "push_snippet"; payload: PushSnippetPayload }
    | { command: "forward_response_to_primary"; payload: { originalMessageId: string; responsePayload: any } }
    | { command: "forward_push_to_primary"; payload: { originalPushPayload: PushSnippetPayload } };

// Full message types
export type IPCMessageRequest = IPCBaseMessage & { type: "request" } & IPCRequest;
export type IPCMessageResponse = IPCBaseMessage & { type: "response" } & IPCResponse;
export type IPCMessagePush = IPCBaseMessage & { type: "push"; message_id?: string } & IPCPush; // message_id optional for pushes
export type IPCMessageErrorResponse = IPCBaseMessage & { type: "error_response"; command: "error_response" | IPCRequest['command'] } & { payload: ErrorResponsePayload };

/**
 * Represents any possible IPC message type.
 */
export type AnyIPCMessage = IPCMessageRequest | IPCMessageResponse | IPCMessagePush | IPCMessageErrorResponse;
