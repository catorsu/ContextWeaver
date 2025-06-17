/**
 * @file ipc-types.ts
 * @description Defines the TypeScript interfaces and types for Inter-Process Communication (IPC)
 * messages exchanged between the VS Code Extension (VSCE) and the Chrome Extension (CE).
 * @module ContextWeaver/Shared
 */

import { ContextBlockMetadata, FileData, SearchResult, DirectoryEntry, FilterType } from './data-models';

/**
 * Base structure for all IPC messages.
 * @property {"1.0"} protocol_version - The version of the IPC protocol.
 * @property {string} message_id - A unique identifier for the message, used for request/response matching.
 * @property {"request" | "response" | "push" | "error_response"} type - The classification of the message.
 */
export interface IPCBaseMessage {
    protocol_version: "1.0";
    message_id: string;
    type: "request" | "response" | "push" | "error_response";
}

// --- CE -> VSCE (Requests) ---

/**
 * Payload for requesting the VSCE to register an active LLM target tab.
 * @property {number} tabId - The ID of the browser tab to register as the active target.
 * @property {string} llmHost - The hostname of the LLM application (e.g., "chat.openai.com").
 */
export interface RegisterActiveTargetRequestPayload {
    tabId: number;
    llmHost: string;
}

/**
 * Payload for requesting the file tree of a workspace folder.
 * @property {string | null} workspaceFolderUri - The URI of the workspace folder to get the file tree for. Null for all workspace folders.
 */
export interface GetFileTreeRequestPayload {
    workspaceFolderUri: string | null;
}

/**
 * Payload for requesting the content of a specific file.
 * @property {string} filePath - The URI string of the file to retrieve.
 */
export interface GetFileContentRequestPayload {
    filePath: string;
}

/**
 * Payload for requesting the content of a specific folder.
 * @property {string} folderPath - The URI string of the folder to retrieve content from.
 * @property {string} workspaceFolderUri - The URI of the workspace folder this folderPath belongs to.
 */
export interface GetFolderContentRequestPayload {
    folderPath: string;
    workspaceFolderUri: string;
}

/**
 * Payload for requesting the entire codebase content of a workspace folder.
 * @property {string | null} workspaceFolderUri - The URI of the workspace folder to get the codebase for. Null for all workspace folders.
 */
export interface GetContentsForFilesRequestPayload {
    fileUris: string[];
}

export interface GetEntireCodebaseRequestPayload {
    workspaceFolderUri: string | null;
}


/**
 * Payload for requesting a workspace search.
 * @property {string} query - The search query string.
 * @property {string | null} workspaceFolderUri - The URI of the workspace folder to search within. Null for all workspace folders.
 */
export interface SearchWorkspaceRequestPayload {
    query: string;
    workspaceFolderUri: string | null;
}

/**
 * Payload for requesting filter information (e.g., .gitignore rules) for a workspace.
 * @property {string | null} workspaceFolderUri - The URI of the workspace folder to get filter info for. Null for all workspace folders.
 */
export interface GetFilterInfoRequestPayload {
    workspaceFolderUri: string | null;
}


/**
 * Payload for requesting a listing of folder contents.
 * @property {string} folderUri - The URI string of the folder to list contents for.
 * @property {string | null} workspaceFolderUri - The URI of the workspace folder this folder belongs to. Null if not part of a workspace.
 */
export interface ListFolderContentsRequestPayload {
    folderUri: string;
    workspaceFolderUri: string | null;
}

/**
 * Payload for requesting workspace problems.
 * @property {string} workspaceFolderUri - The URI of the workspace folder to retrieve problems for.
 */
export interface GetWorkspaceProblemsRequestPayload {
    workspaceFolderUri: string;
}


// --- VSCE -> CE (Responses) ---

/**
 * Generic acknowledgment response payload.
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {string | null} message - An optional message providing more details about the acknowledgment.
 */
export interface GenericAckResponsePayload {
    success: boolean;
    message: string | null;
}

/**
 * The data object within a successful FileTreeResponsePayload.
 * @property {string} fileTreeString - The formatted string representation of the file tree.
 * @property {ContextBlockMetadata} metadata - Metadata for the context block to be created.
 * @property {string} windowId - The unique identifier for the source VS Code window, crucial for multi-window environments.
 */
export interface FileTreeResponseData {
    fileTreeString: string;
    metadata: ContextBlockMetadata;
    windowId: string;
}
/**
 * Response payload for a file tree request.
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {FileTreeResponseData | null} data - The response data if successful, otherwise null.
 * @property {string | null} error - An error message if the operation failed.
 * @property {string} [errorCode] - A machine-readable error code if the operation failed.
 * @property {string | null} workspaceFolderUri - The URI of the workspace folder that was processed.
 * @property {FilterType} filterType - The type of filter that was applied during the operation.
 */
export interface FileTreeResponsePayload {
    success: boolean;
    data: FileTreeResponseData | null;
    error: string | null;
    errorCode?: string;
    workspaceFolderUri: string | null;
    filterType: FilterType;
}

/**
 * The data object within a successful FileContentResponsePayload.
 * @property {FileData} fileData - The content and metadata of the requested file.
 * @property {ContextBlockMetadata} metadata - Metadata for the context block to be created.
 * @property {string} windowId - The unique identifier for the source VS Code window, crucial for multi-window environments.
 */
export interface FileContentResponseData {
    fileData: FileData;
    metadata: ContextBlockMetadata;
    windowId: string;
}
/**
 * Response payload for a file content request.
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {FileContentResponseData | null} data - The response data if successful, otherwise null.
 * @property {string | null} error - An error message if the operation failed.
 * @property {string} [errorCode] - A machine-readable error code if the operation failed.
 * @property {string} filePath - The URI of the file whose content was requested (echoed back).
 * @property {FilterType} filterType - The type of filter applied (typically 'not_applicable' for single files).
 */
export interface FileContentResponsePayload {
    success: boolean;
    data: FileContentResponseData | null;
    error: string | null;
    errorCode?: string;
    filePath: string;
    filterType: FilterType;
}

/**
 * The data object within a successful FolderContentResponsePayload.
 * @property {FileData[]} filesData - An array of file data objects for the files within the folder.
 * @property {ContextBlockMetadata} metadata - Metadata for the context block to be created.
 * @property {string} windowId - The unique identifier for the source VS Code window, crucial for multi-window environments.
 */
export interface FolderContentResponseData {
    filesData: FileData[];
    metadata: ContextBlockMetadata;
    windowId: string;
}
/**
 * Response payload for a folder content request.
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {FolderContentResponseData | null} data - The response data if successful, otherwise null.
 * @property {string | null} error - An error message if the operation failed.
 * @property {string} [errorCode] - A machine-readable error code if the operation failed.
 * @property {string} folderPath - The URI of the folder whose content was requested (echoed back).
 * @property {FilterType} filterType - The type of filter that was applied during the operation.
 * @property {string} [workspaceFolderUri] - The URI of the workspace folder this folder belongs to.
 */
export interface FolderContentResponsePayload {
    success: boolean;
    data: FolderContentResponseData | null;
    error: string | null;
    errorCode?: string;
    folderPath: string;
    filterType: FilterType;
    workspaceFolderUri?: string;
}

/**
 * Response payload for a multiple file content request.
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {FileContentResponseData[] | null} data - An array of successful file data responses.
 * @property {Array<{ uri: string; error: string; errorCode?: string }> | null} errors - An array of errors for files that failed.
 * @property {string | null} error - A general error message if the entire operation failed.
 * @property {string} [errorCode] - A machine-readable error code if the operation failed.
 */
export interface ContentsForFilesResponsePayload {
    success: boolean;
    data: FileContentResponseData[] | null;
    errors: Array<{ uri: string; error: string; errorCode?: string }> | null;
    error: string | null;
    errorCode?: string;
}

/**
 * The data object within a successful EntireCodebaseResponsePayload.
 * @property {FileData[]} filesData - An array of file data objects for the entire codebase.
 * @property {ContextBlockMetadata} metadata - Metadata for the context block to be created.
 * @property {string} windowId - The unique identifier for the source VS Code window, crucial for multi-window environments.
 * @property {string} [fileTreeString] - Optional: The formatted string representation of the file tree, if requested.
 */
export interface EntireCodebaseResponseData {
    filesData: FileData[];
    metadata: ContextBlockMetadata;
    windowId: string;
}
/**
 * Response payload for an entire codebase request.
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {EntireCodebaseResponseData | null} data - The response data if successful, otherwise null.
 * @property {string | null} error - An error message if the operation failed.
 * @property {string} [errorCode] - A machine-readable error code if the operation failed.
 * @property {string | null} workspaceFolderUri - The URI of the processed workspace.
 * @property {FilterType} filterType - The type of filter that was applied during the operation.
 * @property {string} [workspaceFolderName] - The name of the workspace folder.
 * @property {string} [projectPath] - The absolute path to the project root.
 */
export interface EntireCodebaseResponsePayload {
    success: boolean;
    data: EntireCodebaseResponseData | null;
    error: string | null;
    errorCode?: string;
    workspaceFolderUri: string | null;
    filterType: FilterType;
    workspaceFolderName?: string;
    projectPath?: string;
}

/**
 * The data object within a successful ActiveFileInfoResponsePayload.
 * @property {string} activeFilePath - The URI string of the currently active file.
 * @property {string} activeFileLabel - A user-friendly label for the active file.
 * @property {string | null} workspaceFolderUri - The URI of the workspace folder the active file belongs to.
 * @property {string | null} workspaceFolderName - The name of the workspace folder the active file belongs to.
 * @property {string} windowId - The unique identifier for the source VS Code window, crucial for multi-window environments.
 */
export interface ActiveFileInfoResponseData {
    activeFilePath: string;
    activeFileLabel: string;
    workspaceFolderUri: string | null;
    workspaceFolderName: string | null;
    windowId: string;
}
/**
 * Response payload for an active file information request.
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {ActiveFileInfoResponseData | null} data - The response data if successful, otherwise null.
 * @property {string | null} error - An error message if the operation failed.
 * @property {string} [errorCode] - A machine-readable error code if the operation failed.
 */
export interface ActiveFileInfoResponsePayload {
    success: boolean;
    data: ActiveFileInfoResponseData | null;
    error: string | null;
    errorCode?: string;
}

/**
 * The data object within a successful OpenFilesResponsePayload.
 * @property {Array<{ path: string; name: string; workspaceFolderUri: string | null; workspaceFolderName: string | null; windowId: string; }>} openFiles - An array of objects, each representing an open file.
 * @property {string} openFiles[].path - The URI string of the open file.
 * @property {string} openFiles[].name - The display name of the open file.
 * @property {string | null} openFiles[].workspaceFolderUri - The URI of the workspace folder the open file belongs to.
 * @property {string | null} openFiles[].workspaceFolderName - The name of the workspace folder the open file belongs to.
 * @property {string} openFiles[].windowId - The unique identifier for the VS Code window instance that provided the data.
 */
export interface OpenFilesResponseData {
    openFiles: Array<{
        path: string;
        name: string;
        workspaceFolderUri: string | null;
        workspaceFolderName: string | null;
        windowId: string;
    }>;
}
/**
 * Response payload for an open files request.
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {OpenFilesResponseData | null} data - The response data if successful, otherwise null.
 * @property {string | null} error - An error message if the operation failed.
 * @property {string} [errorCode] - A machine-readable error code if the operation failed.
 */
export interface OpenFilesResponsePayload {
    success: boolean;
    data: OpenFilesResponseData | null;
    error: string | null;
    errorCode?: string;
}

/**
 * The data object within a successful SearchWorkspaceResponsePayload.
 * @property {SearchResult[]} results - An array of search result items.
 * @property {string} windowId - The unique identifier for the source VS Code window, crucial for multi-window environments.
 */
export interface SearchWorkspaceResponseData {
    results: SearchResult[];
    windowId: string;
}
/**
 * Response payload for a workspace search request.
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {SearchWorkspaceResponseData | null} data - The response data if successful, otherwise null.
 * @property {string | null} error - An error message if the operation failed.
 * @property {string} [errorCode] - A machine-readable error code if the operation failed.
 * @property {string} query - The search query that was performed (echoed back).
 */
export interface SearchWorkspaceResponsePayload {
    success: boolean;
    data: SearchWorkspaceResponseData | null;
    error: string | null;
    errorCode?: string;
    query: string;
}

/**
 * The data object within a successful WorkspaceDetailsResponsePayload.
 * @property {boolean} isTrusted - Indicates if the workspace is trusted.
 * @property {Array<{ uri: string; name: string; isTrusted: boolean; }> | null} workspaceFolders - An array of workspace folder objects, or null if no folders are open.
 * @property {string} workspaceFolders[].uri - The URI of the workspace folder.
 * @property {string} workspaceFolders[].name - The name of the workspace folder.
 * @property {boolean} workspaceFolders[].isTrusted - Indicates if this specific workspace folder is trusted.
 * @property {string} [workspaceName] - An optional name for the overall workspace, if available.
 */
export interface WorkspaceDetailsResponseData {
    isTrusted: boolean;
    workspaceFolders: Array<{
        uri: string;
        name: string;
        isTrusted: boolean;
    }> | null;
    workspaceName?: string;
}
/**
 * Response payload for a workspace details request.
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {WorkspaceDetailsResponseData | null} data - The response data if successful, otherwise null.
 * @property {string | null} error - An error message if the operation failed.
 * @property {string} [errorCode] - A machine-readable error code if the operation failed.
 */
export interface WorkspaceDetailsResponsePayload {
    success: boolean;
    data: WorkspaceDetailsResponseData | null;
    error: string | null;
    errorCode?: string;
}

/**
 * The data object within a successful FilterInfoResponsePayload.
 * @property {FilterType} filterType - The type of filter applied to the workspace.
 * @property {string | null} workspaceFolderUri - The URI of the workspace folder the filter information pertains to.
 */
export interface FilterInfoResponseData {
    filterType: FilterType;
    workspaceFolderUri: string | null;
}
/**
 * Response payload for a filter information request.
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {FilterInfoResponseData | null} data - The response data if successful, otherwise null.
 * @property {string | null} error - An error message if the operation failed.
 * @property {string} [errorCode] - A machine-readable error code if the operation failed.
 */
export interface FilterInfoResponsePayload {
    success: boolean;
    data: FilterInfoResponseData | null;
    error: string | null;
    errorCode?: string;
}

/**
 * The data object within a successful ListFolderContentsResponsePayload.
 * @property {DirectoryEntry[]} entries - An array of directory entries (files and folders) within the requested folder.
 * @property {string} parentFolderUri - The URI of the parent folder whose contents were listed (echoed back).
 * @property {FilterType} filterTypeApplied - The type of filter that was applied during the listing operation.
 * @property {string} windowId - The unique identifier for the source VS Code window, crucial for multi-window environments.
 */
export interface ListFolderContentsResponseData {
    entries: DirectoryEntry[];
    parentFolderUri: string;
    filterTypeApplied: FilterType;
    windowId: string;
}
/**
 * Response payload for a list folder contents request.
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {ListFolderContentsResponseData | null} data - The response data if successful, otherwise null.
 * @property {string | null} error - An error message if the operation failed.
 * @property {string} [errorCode] - A machine-readable error code if the operation failed.
 */
export interface ListFolderContentsResponsePayload {
    success: boolean;
    data: ListFolderContentsResponseData | null;
    error: string | null;
    errorCode?: string;
}

/**
 * The data object within a successful WorkspaceProblemsResponsePayload.
 * @property {string} problemsString - A formatted string representation of the workspace problems.
 * @property {number} problemCount - The total number of problems found in the workspace.
 * @property {ContextBlockMetadata} metadata - Metadata for the context block to be created.
 * @property {string} windowId - The unique identifier for the source VS Code window, crucial for multi-window environments.
 */
export interface WorkspaceProblemsResponseData {
    problemsString: string;
    problemCount: number;
    metadata: ContextBlockMetadata;
    windowId: string;
}
/**
 * Response payload for a workspace problems request.
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {WorkspaceProblemsResponseData | null} data - The response data if successful, otherwise null.
 * @property {string | null} error - An error message if the operation failed.
 * @property {string} [errorCode] - A machine-readable error code if the operation failed.
 * @property {string} workspaceFolderUri - The URI of the workspace folder for which problems were requested (echoed back).
 */
export interface WorkspaceProblemsResponsePayload {
    success: boolean;
    data: WorkspaceProblemsResponseData | null;
    error: string | null;
    errorCode?: string;
    workspaceFolderUri: string;
}

/**
 * Standard error response payload for IPC messages.
 * @property {false} success - Always false for error responses.
 * @property {string} error - A human-readable error message.
 * @property {string} errorCode - A machine-readable code identifying the error type.
 * @property {string} [originalCommand] - The command of the original request that caused the error.
 */
export interface ErrorResponsePayload {
    success: false;
    error: string;
    errorCode: string;
    originalCommand?: string | null;
}

// --- VSCE -> CE (Pushes) ---

/**
 * Payload for pushing a code snippet from VS Code to the Chrome Extension.
 * @property {string} snippet - The selected code snippet text.
 * @property {string} language - The VS Code language identifier for the snippet.
 * @property {string} filePath - The full file system path of the source file.
 * @property {string} relativeFilePath - The path of the source file relative to its workspace.
 * @property {number} startLine - The 1-indexed starting line number of the snippet.
 * @property {number} endLine - The 1-indexed ending line number of the snippet.
 * @property {ContextBlockMetadata} metadata - Metadata for the context block to be created.
 * @property {number} targetTabId - The ID of the browser tab to push the snippet to.
 * @property {string} windowId - The unique identifier for the source VS Code window, crucial for multi-window environments.
 */
export interface PushSnippetPayload {
    snippet: string;
    language: string;
    filePath: string;
    relativeFilePath: string;
    startLine: number;
    endLine: number;
    metadata: ContextBlockMetadata;
    targetTabId: number;
    windowId: string;
}


/**
 * A discriminated union of all possible request message types sent from the CE to the VSCE.
 * The `command` property serves as the discriminant.
 */
export type IPCRequest =
    | { command: "register_active_target"; payload: RegisterActiveTargetRequestPayload }
    | { command: "get_FileTree"; payload: GetFileTreeRequestPayload }
    | { command: "get_file_content"; payload: GetFileContentRequestPayload }
    | { command: "get_contents_for_files"; payload: GetContentsForFilesRequestPayload }
    | { command: "get_folder_content"; payload: GetFolderContentRequestPayload }
    | { command: "get_entire_codebase"; payload: GetEntireCodebaseRequestPayload }
    | { command: "get_active_file_info"; payload: {} }
    | { command: "get_open_files"; payload: {} }
    | { command: "search_workspace"; payload: SearchWorkspaceRequestPayload }
    | { command: "get_filter_info"; payload: GetFilterInfoRequestPayload }
    | { command: "get_workspace_details"; payload: {} }
    | { command: "list_folder_contents"; payload: ListFolderContentsRequestPayload }
    | { command: "get_workspace_problems"; payload: GetWorkspaceProblemsRequestPayload }
    | { command: "register_secondary"; payload: { windowId: string; port: number } }
    | { command: "forward_request_to_secondaries"; payload: { originalRequest: IPCMessageRequest } }
    | { command: "unregister_secondary"; payload: { windowId: string } };

/**
 * A discriminated union of all possible response message types sent from the VSCE to the CE.
 * The `command` property serves as the discriminant.
 */
export type IPCResponse =
    | { command: "response_generic_ack"; payload: GenericAckResponsePayload }
    | { command: "response_FileTree"; payload: FileTreeResponsePayload }
    | { command: "response_file_content"; payload: FileContentResponsePayload }
    | { command: "response_contents_for_files"; payload: ContentsForFilesResponsePayload }
    | { command: "response_folder_content"; payload: FolderContentResponsePayload }
    | { command: "response_entire_codebase"; payload: EntireCodebaseResponsePayload }
    | { command: "response_active_file_info"; payload: ActiveFileInfoResponsePayload }
    | { command: "response_open_files"; payload: OpenFilesResponsePayload }
    | { command: "response_search_workspace"; payload: SearchWorkspaceResponsePayload }
    | { command: "response_workspace_details"; payload: WorkspaceDetailsResponsePayload }
    | { command: "response_filter_info"; payload: FilterInfoResponsePayload }
    | { command: "response_list_folder_contents"; payload: ListFolderContentsResponsePayload }
    | { command: "response_workspace_problems"; payload: WorkspaceProblemsResponsePayload }
    | { command: "response_unregister_secondary_ack"; payload: GenericAckResponsePayload };

/**
 * A discriminated union of all possible push message types sent from the VSCE to the CE.
 * These are one-way messages that do not expect a response.
 */
export type IPCPush =
    | { command: "push_snippet"; payload: PushSnippetPayload }
    | { command: "forward_response_to_primary"; payload: { originalMessageId: string; responsePayload: any } }
    | { command: "forward_push_to_primary"; payload: { originalPushPayload: PushSnippetPayload } };

/** A complete IPC request message, combining the base structure with a specific request type. */
export type IPCMessageRequest = IPCBaseMessage & { type: "request" } & IPCRequest;
/** A complete IPC response message, combining the base structure with a specific response type. */
export type IPCMessageResponse = IPCBaseMessage & { type: "response" } & IPCResponse;
/** 
 * A complete IPC push message, combining the base structure with a specific push type.
 * The `message_id` is optional for pushes but recommended for tracing.
 */
export type IPCMessagePush = IPCBaseMessage & { type: "push"; message_id?: string } & IPCPush;
/** A complete IPC error response message, sent when a request fails. */
export type IPCMessageErrorResponse = IPCBaseMessage & { type: "error_response"; command: "error_response" | IPCRequest['command'] } & { payload: ErrorResponsePayload };

/**
 * A union of all possible IPC message types, useful for generic message handlers.
 */
export type AnyIPCMessage = IPCMessageRequest | IPCMessageResponse | IPCMessagePush | IPCMessageErrorResponse;
