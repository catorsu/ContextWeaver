/**
 * @file serviceWorkerClient.ts
 * @description Provides a client-side API for content scripts and UI pages to communicate with the
 * Chrome Extension's service worker, abstracting away the message passing details.
 * @module ContextWeaver/CE
 */

import {
    SearchWorkspaceRequestPayload, SearchWorkspaceResponsePayload,
    WorkspaceDetailsResponsePayload,
    GetFileTreeRequestPayload, FileTreeResponsePayload,     ActiveFileInfoResponsePayload,
    GetFileContentRequestPayload, FileContentResponsePayload, GetContentsForFilesRequestPayload, ContentsForFilesResponsePayload,     GetEntireCodebaseRequestPayload, EntireCodebaseResponsePayload,     OpenFilesResponsePayload,
    GetFolderContentRequestPayload, FolderContentResponsePayload,     ListFolderContentsRequestPayload, ListFolderContentsResponsePayload,
    GetWorkspaceProblemsRequestPayload, WorkspaceProblemsResponsePayload
    } from '@contextweaver/shared';

const LOG_PREFIX_SW_CLIENT = '[ContextWeaver SWClient]';

/**
 * Defines the structure for messages sent from content scripts/UI to the service worker,
 * requesting an API call to the VSCE.
 */
interface SWApiRequestMessage {
    type: string; // e.g., 'SEARCH_WORKSPACE', 'GET_FILE_CONTENT'
    // TODO: This could be typed more strictly using a discriminated union of all possible request payloads.
    payload?: any;
}

/**
 * Sends a message to the Chrome Extension's service worker and waits for a response.
 * This is the central communication function for this module, handling errors and response validation.
 * @template TResponsePayload The expected type of the response payload.
 * @param message The message object to send to the service worker.
 * @returns A Promise that resolves with the typed response payload from the service worker.
 * @throws An error if the service worker communication fails or the operation itself returns an error.
 */
async function sendMessageToSW<TResponsePayload>(message: SWApiRequestMessage): Promise<TResponsePayload> {
    console.log(LOG_PREFIX_SW_CLIENT, 'Sending message to SW:', message);
    try {
        const response = await chrome.runtime.sendMessage(message);
        if (chrome.runtime.lastError) {
            console.error(LOG_PREFIX_SW_CLIENT, `Error sending message to SW or SW responded with error: ${chrome.runtime.lastError.message}`, message);
            throw new Error(chrome.runtime.lastError.message || 'Service worker communication error');
        }
        if (response && response.success === false) { // Check for business logic errors from SW/VSCE
            console.error(LOG_PREFIX_SW_CLIENT, `Service worker reported failure for ${message.type}:`, response.error, `Code: ${response.errorCode}`);
            const error = new Error(response.error || `Operation ${message.type} failed.`);
            (error as any).errorCode = response.errorCode; // Attach errorCode if present
            throw error;
        }
        console.log(LOG_PREFIX_SW_CLIENT, `Response from SW for ${message.type}:`, response);
        return response as TResponsePayload; // The caller expects the full response payload
    } catch (error) {
        console.error(LOG_PREFIX_SW_CLIENT, `Exception during sendMessageToSW for ${message.type}:`, error);
        throw error; // Re-throw to be caught by the caller
    }
}


/**
 * Initiates a workspace search via the service worker.
 * @param query The search query string.
 * @param workspaceFolderUri Optional. The URI of the workspace folder to search within.
 * @returns A Promise that resolves with the search results payload.
 */
export async function searchWorkspace(query: string, workspaceFolderUri: string | null): Promise<SearchWorkspaceResponsePayload> {
    return sendMessageToSW<SearchWorkspaceResponsePayload>({
        type: 'SEARCH_WORKSPACE',
        payload: { query, workspaceFolderUri } as SearchWorkspaceRequestPayload
    });
}

/**
 * Requests workspace details from the service worker.
 * @returns A Promise that resolves with the workspace details payload.
 */
export async function getWorkspaceDetails(): Promise<WorkspaceDetailsResponsePayload> {
    return sendMessageToSW<WorkspaceDetailsResponsePayload>({ type: 'GET_WORKSPACE_DETAILS_FOR_UI' });
}

/**
 * Requests the file tree for a specified workspace folder via the service worker.
 * @param workspaceFolderUri The URI of the workspace folder.
 * @returns A Promise that resolves with the file tree payload.
 */
export async function getFileTree(workspaceFolderUri: string | null): Promise<FileTreeResponsePayload> {
    return sendMessageToSW<FileTreeResponsePayload>({
        type: 'GET_FileTree',
        payload: { workspaceFolderUri } as GetFileTreeRequestPayload     });
}

/**
 * Requests information about the currently active file in VS Code via the service worker.
 * @returns A Promise that resolves with the active file info payload.
 */
export async function getActiveFileInfo(): Promise<ActiveFileInfoResponsePayload> {
    return sendMessageToSW<ActiveFileInfoResponsePayload>({ type: 'GET_ACTIVE_FILE_INFO' });
}

/**
 * Requests the content of a specific file via the service worker.
 * @param filePath The path of the file to retrieve.
 * @returns A Promise that resolves with the file content payload.
 */
export async function getFileContent(filePath: string): Promise<FileContentResponsePayload> {
    return sendMessageToSW<FileContentResponsePayload>({
        type: 'GET_FILE_CONTENT',
        payload: { filePath } as GetFileContentRequestPayload     });
}

/**
 * Requests the entire codebase content for a specified workspace folder via the service worker.
 * @param workspaceFolderUri The URI of the workspace folder.
 * @returns A Promise that resolves with the entire codebase payload.
 */
export async function getEntireCodebase(workspaceFolderUri: string | null): Promise<EntireCodebaseResponsePayload> {
    return sendMessageToSW<EntireCodebaseResponsePayload>({
        type: 'GET_ENTIRE_CODEBASE',
        payload: { workspaceFolderUri } as GetEntireCodebaseRequestPayload     });
}

/**
 * Requests a list of currently open files in VS Code via the service worker.
 * @returns A Promise that resolves with the open files payload.
 */
export async function getOpenFiles(): Promise<OpenFilesResponsePayload> {
    return sendMessageToSW<OpenFilesResponsePayload>({ type: 'GET_OPEN_FILES_FOR_UI' });
}


/**
 * Requests the content for a list of selected open files via the service worker.
 * @param fileUris An array of file URIs for which to retrieve content.
 * @returns A Promise that resolves with a payload containing file data and any errors.
 */
export async function getContentsForSelectedOpenFiles(fileUris: string[]): Promise<ContentsForFilesResponsePayload> {
    return sendMessageToSW<ContentsForFilesResponsePayload>({
        type: 'GET_CONTENTS_FOR_SELECTED_OPEN_FILES',
        payload: { fileUris } as GetContentsForFilesRequestPayload
    });
}

/**
 * Requests the content of a specific folder via the service worker.
 * @param folderPath The path of the folder to retrieve.
 * @param workspaceFolderUri The URI of the workspace folder the folder belongs to.
 * @returns A Promise that resolves with the folder content payload.
 */
export async function getFolderContent(folderPath: string, workspaceFolderUri: string | null): Promise<FolderContentResponsePayload> {
    return sendMessageToSW<FolderContentResponsePayload>({
        type: 'GET_FOLDER_CONTENT',
        payload: { folderPath, workspaceFolderUri } as GetFolderContentRequestPayload     });
}

/**
 * Requests a listing of contents (files and subfolders) for a specified folder via the service worker.
 * @param folderUri The URI of the folder to list.
 * @param workspaceFolderUri The URI of the workspace folder the folder belongs to.
 * @returns A Promise that resolves with the folder contents listing payload.
 */
export async function listFolderContents(folderUri: string, workspaceFolderUri: string | null): Promise<ListFolderContentsResponsePayload> {
    return sendMessageToSW<ListFolderContentsResponsePayload>({
        type: 'LIST_FOLDER_CONTENTS',
        payload: { folderUri, workspaceFolderUri } as ListFolderContentsRequestPayload
    });
}

/**
 * Requests workspace problems for a specified workspace folder via the service worker.
 * @param workspaceFolderUri The URI of the workspace folder.
 * @returns A Promise that resolves with the workspace problems payload.
 */
export async function getWorkspaceProblems(workspaceFolderUri: string): Promise<WorkspaceProblemsResponsePayload> {
    return sendMessageToSW<WorkspaceProblemsResponsePayload>({
        type: 'GET_WORKSPACE_PROBLEMS',
        payload: { workspaceFolderUri } as GetWorkspaceProblemsRequestPayload
    });
}
