// packages/chrome-extension/src/serviceWorkerClient.ts
import {
    SearchWorkspaceRequestPayload, SearchWorkspaceResponsePayload,
    WorkspaceDetailsResponsePayload,
    GetFileTreeRequestPayload, FileTreeResponsePayload, // Corrected: GetFileTreeRequestPayload
    ActiveFileInfoResponsePayload,
    GetFileContentRequestPayload, FileContentResponsePayload, // Corrected: GetFileContentRequestPayload
    GetEntireCodebaseRequestPayload, EntireCodebaseResponsePayload, // Corrected: GetEntireCodebaseRequestPayload
    OpenFilesResponsePayload,
    GetFolderContentRequestPayload, FolderContentResponsePayload, // Corrected: GetFolderContentRequestPayload
    ListFolderContentsRequestPayload, ListFolderContentsResponsePayload
    // Add other request/response payload types from @contextweaver/shared as needed
} from '@contextweaver/shared';

const LOG_PREFIX_SW_CLIENT = '[ContextWeaver SWClient]';

// Define types for messages contentScript sends to serviceWorker
// These are not IPC messages themselves, but describe the action for the service worker
interface SWApiRequestMessage {
    type: string; // e.g., 'SEARCH_WORKSPACE', 'GET_FILE_CONTENT'
    payload?: any;
}

// Helper to simplify sendMessage and response handling
async function sendMessageToSW<TResponsePayload>(message: SWApiRequestMessage): Promise<TResponsePayload> {
    console.log(LOG_PREFIX_SW_CLIENT, `Sending message to SW:`, message);
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

// --- Exported API Functions ---

export async function searchWorkspace(query: string, workspaceFolderUri: string | null): Promise<SearchWorkspaceResponsePayload> {
    return sendMessageToSW<SearchWorkspaceResponsePayload>({
        type: 'SEARCH_WORKSPACE',
        payload: { query, workspaceFolderUri } as SearchWorkspaceRequestPayload
    });
}

export async function getWorkspaceDetails(): Promise<WorkspaceDetailsResponsePayload> {
    return sendMessageToSW<WorkspaceDetailsResponsePayload>({ type: 'GET_WORKSPACE_DETAILS_FOR_UI' });
}

export async function getFileTree(workspaceFolderUri: string | null): Promise<FileTreeResponsePayload> {
    return sendMessageToSW<FileTreeResponsePayload>({
        type: 'GET_FILE_TREE',
        payload: { workspaceFolderUri } as GetFileTreeRequestPayload // Corrected: GetFileTreeRequestPayload
    });
}

export async function getActiveFileInfo(): Promise<ActiveFileInfoResponsePayload> {
    return sendMessageToSW<ActiveFileInfoResponsePayload>({ type: 'GET_ACTIVE_FILE_INFO' });
}

export async function getFileContent(filePath: string): Promise<FileContentResponsePayload> {
    return sendMessageToSW<FileContentResponsePayload>({
        type: 'GET_FILE_CONTENT',
        payload: { filePath } as GetFileContentRequestPayload // Corrected: GetFileContentRequestPayload
    });
}

export async function getEntireCodebase(workspaceFolderUri: string | null): Promise<EntireCodebaseResponsePayload> {
    return sendMessageToSW<EntireCodebaseResponsePayload>({
        type: 'GET_ENTIRE_CODEBASE',
        payload: { workspaceFolderUri } as GetEntireCodebaseRequestPayload // Corrected: GetEntireCodebaseRequestPayload
    });
}

export async function getOpenFiles(): Promise<OpenFilesResponsePayload> {
    return sendMessageToSW<OpenFilesResponsePayload>({ type: 'GET_OPEN_FILES_FOR_UI' });
}

// Define these types if they are not already in @contextweaver/shared
// For now, assuming they are similar to what serviceWorker expects
interface GetContentsForSelectedOpenFilesRequestPayloadSW {
    fileUris: string[];
}
// The response payload from serviceWorker for this specific message
interface GetContentsForSelectedOpenFilesResponsePayloadSW {
    success: boolean;
    data?: { fileData: any, metadata: any }[]; // From serviceWorker response
    errors?: any[];
    error?: string;
    errorCode?: string;
}

export async function getContentsForSelectedOpenFiles(fileUris: string[]): Promise<GetContentsForSelectedOpenFilesResponsePayloadSW> {
    return sendMessageToSW<GetContentsForSelectedOpenFilesResponsePayloadSW>({
        type: 'GET_CONTENTS_FOR_SELECTED_OPEN_FILES',
        payload: { fileUris } as GetContentsForSelectedOpenFilesRequestPayloadSW
    });
}

export async function getFolderContent(folderPath: string, workspaceFolderUri: string | null): Promise<FolderContentResponsePayload> {
    return sendMessageToSW<FolderContentResponsePayload>({
        type: 'GET_FOLDER_CONTENT',
        payload: { folderPath, workspaceFolderUri } as GetFolderContentRequestPayload // Corrected: GetFolderContentRequestPayload
    });
}

export async function listFolderContents(folderUri: string, workspaceFolderUri: string | null): Promise<ListFolderContentsResponsePayload> {
    return sendMessageToSW<ListFolderContentsResponsePayload>({
        type: 'LIST_FOLDER_CONTENTS',
        payload: { folderUri, workspaceFolderUri } as ListFolderContentsRequestPayload
    });
}