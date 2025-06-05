// packages/shared/src/ipc-types.ts

import { ContextBlockMetadata, FileData, SearchResult, DirectoryEntry, FilterType } from './data-models';

/**
 * @description Base structure for all IPC messages.
 */
export interface IPCBaseMessage {
    protocol_version: "1.0";
    message_id: string; // UUID for requests, echoed in responses. Optional for pushes.
    type: "request" | "response" | "push" | "error_response";
    // Command will be narrowed in specific message types
}

// --- CE -> VSCE (Requests) ---

export interface RegisterActiveTargetRequestPayload {
    tabId: number;
    llmHost: string;
}

export interface GetFileTreeRequestPayload {
    workspaceFolderUri: string | null;
}

export interface GetFileContentRequestPayload {
    filePath: string; // Normalized, absolute path or URI string
}

export interface GetFolderContentRequestPayload {
    folderPath: string; // Normalized, absolute path or URI string
    workspaceFolderUri: string; // URI of the workspace folder this folderPath belongs to
}

export interface GetEntireCodebaseRequestPayload {
    workspaceFolderUri: string | null; // Changed to allow null
}

// GetActiveFileInfoRequestPayload is empty: {}
// GetOpenFilesRequestPayload is empty: {}

export interface SearchWorkspaceRequestPayload {
    query: string;
    workspaceFolderUri: string | null;
}

// GetFilterInfoRequestPayload
export interface GetFilterInfoRequestPayload {
    workspaceFolderUri: string | null;
}

// GetWorkspaceDetailsRequestPayload is empty: {}

export interface ListFolderContentsRequestPayload {
    folderUri: string; // URI string of the folder to list
    workspaceFolderUri: string | null; // Changed to allow null
}


// --- VSCE -> CE (Responses) ---

export interface GenericAckResponsePayload {
    success: boolean;
    message: string | null;
}

export interface FileTreeResponseData {
    fileTreeString: string;
    metadata: ContextBlockMetadata;
}
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
}
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
}
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
    // fileTreeString?: string; // Optional, as per IPC doc
}
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
}
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
    }>;
}
export interface OpenFilesResponsePayload {
    success: boolean;
    data: OpenFilesResponseData | null;
    error: string | null;
    errorCode?: string;
}

export interface SearchWorkspaceResponseData {
    results: SearchResult[];
}
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
}
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
}
export interface ListFolderContentsResponsePayload {
    success: boolean;
    data: ListFolderContentsResponseData | null;
    error: string | null;
    errorCode?: string;
}

export interface ErrorResponsePayload {
    success: false; // Always false
    error: string;
    errorCode: string;
    originalCommand?: string | null;
}

// --- VSCE -> CE (Pushes) ---

export interface PushSnippetPayload {
    snippet: string;
    language: string;
    filePath: string; // Full fsPath
    relativeFilePath: string;
    startLine: number; // 1-indexed
    endLine: number; // 1-indexed
    metadata: ContextBlockMetadata;
    targetTabId: number; // Tab ID for CE to target
}

// --- IPC Message Type Definitions (Combining Base with Payloads) ---
// These help define the structure of messages sent over WebSocket

export type IPCRequest =
    | { command: "register_active_target"; payload: RegisterActiveTargetRequestPayload }
    | { command: "get_file_tree"; payload: GetFileTreeRequestPayload }
    | { command: "get_file_content"; payload: GetFileContentRequestPayload }
    | { command: "get_folder_content"; payload: GetFolderContentRequestPayload }
    | { command: "get_entire_codebase"; payload: GetEntireCodebaseRequestPayload }
    | { command: "get_active_file_info"; payload: {} }
    | { command: "get_open_files"; payload: {} }
    | { command: "search_workspace"; payload: SearchWorkspaceRequestPayload }
    | { command: "get_filter_info"; payload: GetFilterInfoRequestPayload }
    | { command: "get_workspace_details"; payload: {} }
    | { command: "list_folder_contents"; payload: ListFolderContentsRequestPayload };

export type IPCResponse =
    | { command: "response_generic_ack"; payload: GenericAckResponsePayload }
    | { command: "response_file_tree"; payload: FileTreeResponsePayload }
    | { command: "response_file_content"; payload: FileContentResponsePayload }
    | { command: "response_folder_content"; payload: FolderContentResponsePayload }
    | { command: "response_entire_codebase"; payload: EntireCodebaseResponsePayload }
    | { command: "response_active_file_info"; payload: ActiveFileInfoResponsePayload }
    | { command: "response_open_files"; payload: OpenFilesResponsePayload }
    | { command: "response_search_workspace"; payload: SearchWorkspaceResponsePayload }
    | { command: "response_workspace_details"; payload: WorkspaceDetailsResponsePayload }
    | { command: "response_filter_info"; payload: FilterInfoResponsePayload }
    | { command: "response_list_folder_contents"; payload: ListFolderContentsResponsePayload };
// error_response is handled separately or as part of specific responses with success:false

export type IPCPush =
    | { command: "push_snippet"; payload: PushSnippetPayload };

// Full message types
export type IPCMessageRequest = IPCBaseMessage & { type: "request" } & IPCRequest;
export type IPCMessageResponse = IPCBaseMessage & { type: "response" } & IPCResponse;
export type IPCMessagePush = IPCBaseMessage & { type: "push"; message_id?: string } & IPCPush; // message_id optional for pushes
export type IPCMessageErrorResponse = IPCBaseMessage & { type: "error_response"; command: "error_response" | IPCRequest['command'] } & { payload: ErrorResponsePayload };

export type AnyIPCMessage = IPCMessageRequest | IPCMessageResponse | IPCMessagePush | IPCMessageErrorResponse;