import * as swClient from '../../serviceWorkerClient';
import {
    SearchWorkspaceResponsePayload,
    WorkspaceDetailsResponsePayload,
    FileTreeResponsePayload,
    ActiveFileInfoResponsePayload,
    FileContentResponsePayload,
    EntireCodebaseResponsePayload,
    OpenFilesResponsePayload,
    ContentsForFilesResponsePayload,
    FolderContentResponsePayload,
    ListFolderContentsResponsePayload,
    WorkspaceProblemsResponsePayload
} from '@contextweaver/shared';

/**
 * A service that abstracts all communication with the service worker.
 */
export class ContextAPIService {
    public async searchWorkspace(query: string, workspaceFolderUri: string | null): Promise<SearchWorkspaceResponsePayload> {
        return swClient.searchWorkspace(query, workspaceFolderUri);
    }

    public async getWorkspaceDetails(): Promise<WorkspaceDetailsResponsePayload> {
        return swClient.getWorkspaceDetails();
    }

    public async getFileTree(workspaceFolderUri: string | null): Promise<FileTreeResponsePayload> {
        return swClient.getFileTree(workspaceFolderUri);
    }

    public async getActiveFileInfo(): Promise<ActiveFileInfoResponsePayload> {
        return swClient.getActiveFileInfo();
    }

    public async getFileContent(filePath: string): Promise<FileContentResponsePayload> {
        return swClient.getFileContent(filePath);
    }

    public async getEntireCodebase(workspaceFolderUri: string | null): Promise<EntireCodebaseResponsePayload> {
        return swClient.getEntireCodebase(workspaceFolderUri);
    }

    public async getOpenFiles(): Promise<OpenFilesResponsePayload> {
        return swClient.getOpenFiles();
    }

    public async getContentsForSelectedOpenFiles(fileUris: string[]): Promise<ContentsForFilesResponsePayload> {
        return swClient.getContentsForSelectedOpenFiles(fileUris);
    }

    public async getFolderContent(folderPath: string, workspaceFolderUri: string | null): Promise<FolderContentResponsePayload> {
        return swClient.getFolderContent(folderPath, workspaceFolderUri);
    }

    public async listFolderContents(folderUri: string, workspaceFolderUri: string | null): Promise<ListFolderContentsResponsePayload> {
        return swClient.listFolderContents(folderUri, workspaceFolderUri);
    }

    public async getWorkspaceProblems(workspaceFolderUri: string): Promise<WorkspaceProblemsResponsePayload> {
        return swClient.getWorkspaceProblems(workspaceFolderUri);
    }
}