/**
 * @file ContextAPIService.test.ts
 * @description Unit tests for ContextAPIService
 * @module ContextWeaver/CE/Tests
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { ContextAPIService } from '../../../src/ui/services/ContextAPIService';
import * as swClient from '../../../src/serviceWorkerClient';
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

// Mock the service worker client module
jest.mock('../../../src/serviceWorkerClient');

describe('ContextAPIService', () => {
    let service: ContextAPIService;
    let mockSwClient: jest.Mocked<typeof swClient>;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ContextAPIService();
        mockSwClient = swClient as jest.Mocked<typeof swClient>;
    });

    describe('searchWorkspace', () => {
        test('should delegate to swClient.searchWorkspace with correct parameters', async () => {
            const mockResponse: SearchWorkspaceResponsePayload = {
                success: true,
                data: {
                    results: [
                        {
                            path: '/test/file.ts',
                            name: 'file.ts',
                            type: 'file',
                            uri: 'file:///test/file.ts',
                            content_source_id: 'file:///test/file.ts',
                            workspaceFolderUri: 'file:///workspace',
                            workspaceFolderName: 'workspace',
                            relativePath: 'src/file.ts',
                            windowId: 'window-123'
                        }
                    ],
                    windowId: 'window-123'
                },
                error: null,
                query: 'test query'
            };
            mockSwClient.searchWorkspace.mockResolvedValue(mockResponse);

            const result = await service.searchWorkspace('test query', 'file:///workspace');

            expect(mockSwClient.searchWorkspace).toHaveBeenCalledWith('test query', 'file:///workspace');
            expect(result).toEqual(mockResponse);
        });

        test('should handle null workspace folder URI', async () => {
            const mockResponse: SearchWorkspaceResponsePayload = {
                success: false,
                data: null,
                error: 'No workspace found',
                errorCode: 'WORKSPACE_NOT_FOUND',
                query: 'test query'
            };
            mockSwClient.searchWorkspace.mockResolvedValue(mockResponse);

            const result = await service.searchWorkspace('test query', null);

            expect(mockSwClient.searchWorkspace).toHaveBeenCalledWith('test query', null);
            expect(result).toEqual(mockResponse);
        });

        test('should propagate errors from swClient', async () => {
            const error = new Error('Network error');
            mockSwClient.searchWorkspace.mockRejectedValue(error);

            await expect(service.searchWorkspace('test', null)).rejects.toThrow('Network error');
        });
    });

    describe('getWorkspaceDetails', () => {
        test('should delegate to swClient.getWorkspaceDetails', async () => {
            const mockResponse: WorkspaceDetailsResponsePayload = {
                success: true,
                data: {
                    isTrusted: true,
                    workspaceFolders: [
                        {
                            uri: 'file:///workspace1',
                            name: 'Project 1',
                            isTrusted: true
                        }
                    ]
                },
                error: null
            };
            mockSwClient.getWorkspaceDetails.mockResolvedValue(mockResponse);

            const result = await service.getWorkspaceDetails();

            expect(mockSwClient.getWorkspaceDetails).toHaveBeenCalledWith();
            expect(result).toEqual(mockResponse);
        });

        test('should handle empty workspace', async () => {
            const mockResponse: WorkspaceDetailsResponsePayload = {
                success: true,
                data: {
                    isTrusted: true,
                    workspaceFolders: []
                },
                error: null
            };
            mockSwClient.getWorkspaceDetails.mockResolvedValue(mockResponse);

            const result = await service.getWorkspaceDetails();

            expect(result).toEqual(mockResponse);
        });
    });

    describe('getFileTree', () => {
        test('should delegate to swClient.getFileTree with workspace URI', async () => {
            const mockResponse: FileTreeResponsePayload = {
                success: true,
                data: {
                    fileTreeString: 'root/\n  src/',
                    metadata: {
                        unique_block_id: 'block-123',
                        content_source_id: 'source-123',
                        type: 'FileTree',
                        label: 'File Tree',
                        workspaceFolderUri: 'file:///workspace',
                        workspaceFolderName: 'workspace',
                        windowId: 'window-123'
                    },
                    windowId: 'window-123'
                },
                error: null,
                workspaceFolderUri: 'file:///workspace',
                filterType: 'gitignore'
            };
            mockSwClient.getFileTree.mockResolvedValue(mockResponse);

            const result = await service.getFileTree('file:///workspace');

            expect(mockSwClient.getFileTree).toHaveBeenCalledWith('file:///workspace');
            expect(result).toEqual(mockResponse);
        });

        test('should handle null workspace URI', async () => {
            const mockResponse: FileTreeResponsePayload = {
                success: false,
                data: null,
                error: 'Workspace not specified',
                errorCode: 'INVALID_REQUEST',
                workspaceFolderUri: null,
                filterType: 'none'
            };
            mockSwClient.getFileTree.mockResolvedValue(mockResponse);

            const result = await service.getFileTree(null);

            expect(mockSwClient.getFileTree).toHaveBeenCalledWith(null);
            expect(result).toEqual(mockResponse);
        });
    });

    describe('getActiveFileInfo', () => {
        test('should delegate to swClient.getActiveFileInfo', async () => {
            const mockResponse: ActiveFileInfoResponsePayload = {
                success: true,
                data: {
                    activeFilePath: 'file:///test/active.ts',
                    activeFileLabel: 'active.ts',
                    workspaceFolderUri: 'file:///workspace',
                    workspaceFolderName: 'workspace',
                    windowId: 'window-123'
                },
                error: null
            };
            mockSwClient.getActiveFileInfo.mockResolvedValue(mockResponse);

            const result = await service.getActiveFileInfo();

            expect(mockSwClient.getActiveFileInfo).toHaveBeenCalledWith();
            expect(result).toEqual(mockResponse);
        });

        test('should handle no active file', async () => {
            const mockResponse: ActiveFileInfoResponsePayload = {
                success: true,
                data: null,
                error: null
            };
            mockSwClient.getActiveFileInfo.mockResolvedValue(mockResponse);

            const result = await service.getActiveFileInfo();

            expect(result).toEqual(mockResponse);
        });
    });

    describe('getFileContent', () => {
        test('should delegate to swClient.getFileContent with file path', async () => {
            const mockResponse: FileContentResponsePayload = {
                success: true,
                data: {
                    fileData: {
                        fullPath: '/test/file.ts',
                        content: 'const hello = "world";',
                        languageId: 'typescript'
                    },
                    metadata: {
                        unique_block_id: 'block-123',
                        content_source_id: 'source-123',
                        type: 'file_content',
                        label: 'file.ts',
                        workspaceFolderUri: 'file:///workspace',
                        workspaceFolderName: 'workspace',
                        windowId: 'window-123'
                    },
                    windowId: 'window-123'
                },
                error: null,
                filePath: '/test/file.ts',
                filterType: 'not_applicable'
            };
            mockSwClient.getFileContent.mockResolvedValue(mockResponse);

            const result = await service.getFileContent('/test/file.ts');

            expect(mockSwClient.getFileContent).toHaveBeenCalledWith('/test/file.ts');
            expect(result).toEqual(mockResponse);
        });

        test('should handle file not found error', async () => {
            const mockResponse: FileContentResponsePayload = {
                success: false,
                data: null,
                error: 'File not found',
                errorCode: 'FILE_NOT_FOUND',
                filePath: '/nonexistent.ts',
                filterType: 'not_applicable'
            };
            mockSwClient.getFileContent.mockResolvedValue(mockResponse);

            const result = await service.getFileContent('/nonexistent.ts');

            expect(result).toEqual(mockResponse);
        });
    });

    describe('getEntireCodebase', () => {
        test('should delegate to swClient.getEntireCodebase', async () => {
            const mockResponse: EntireCodebaseResponsePayload = {
                success: true,
                data: {
                    filesData: [
                        {
                            fullPath: '/project/src/index.ts',
                            content: 'console.log("hello");',
                            languageId: 'typescript'
                        }
                    ],
                    metadata: {
                        unique_block_id: 'block-123',
                        content_source_id: 'source-123',
                        type: 'codebase_content',
                        label: 'Entire Codebase',
                        workspaceFolderUri: 'file:///workspace',
                        workspaceFolderName: 'workspace',
                        windowId: 'window-123'
                    },
                    windowId: 'window-123'
                },
                error: null,
                workspaceFolderUri: 'file:///workspace',
                filterType: 'gitignore'
            };
            mockSwClient.getEntireCodebase.mockResolvedValue(mockResponse);

            const result = await service.getEntireCodebase('file:///workspace');

            expect(mockSwClient.getEntireCodebase).toHaveBeenCalledWith('file:///workspace');
            expect(result).toEqual(mockResponse);
        });

        test('should handle null workspace URI', async () => {
            const mockResponse: EntireCodebaseResponsePayload = {
                success: false,
                data: null,
                error: 'Workspace not specified',
                errorCode: 'INVALID_REQUEST',
                workspaceFolderUri: null,
                filterType: 'none'
            };
            mockSwClient.getEntireCodebase.mockResolvedValue(mockResponse);

            const result = await service.getEntireCodebase(null);

            expect(mockSwClient.getEntireCodebase).toHaveBeenCalledWith(null);
            expect(result).toEqual(mockResponse);
        });
    });

    describe('getOpenFiles', () => {
        test('should delegate to swClient.getOpenFiles', async () => {
            const mockResponse: OpenFilesResponsePayload = {
                success: true,
                data: {
                    openFiles: [
                        {
                            path: 'file:///test/file1.ts',
                            name: 'file1.ts',
                            workspaceFolderUri: 'file:///workspace',
                            workspaceFolderName: 'workspace',
                            windowId: 'window-123'
                        },
                        {
                            path: 'file:///test/file2.ts',
                            name: 'file2.ts',
                            workspaceFolderUri: 'file:///workspace',
                            workspaceFolderName: 'workspace',
                            windowId: 'window-123'
                        }
                    ]
                },
                error: null
            };
            mockSwClient.getOpenFiles.mockResolvedValue(mockResponse);

            const result = await service.getOpenFiles();

            expect(mockSwClient.getOpenFiles).toHaveBeenCalledWith();
            expect(result).toEqual(mockResponse);
        });

        test('should handle empty open files', async () => {
            const mockResponse: OpenFilesResponsePayload = {
                success: true,
                data: {
                    openFiles: []
                },
                error: null
            };
            mockSwClient.getOpenFiles.mockResolvedValue(mockResponse);

            const result = await service.getOpenFiles();

            expect(result).toEqual(mockResponse);
        });
    });

    describe('getContentsForSelectedOpenFiles', () => {
        test('should delegate to swClient with file URIs', async () => {
            const fileUris = ['file:///test/file1.ts', 'file:///test/file2.ts'];
            const mockResponse: ContentsForFilesResponsePayload = {
                success: true,
                data: [
                    {
                        fileData: {
                            fullPath: '/test/file1.ts',
                            content: 'content1',
                            languageId: 'typescript'
                        },
                        metadata: {
                            unique_block_id: 'block-1',
                            content_source_id: 'source-1',
                            type: 'file_content',
                            label: 'file1.ts',
                            workspaceFolderUri: 'file:///workspace',
                            workspaceFolderName: 'workspace',
                            windowId: 'window-123'
                        },
                        windowId: 'window-123'
                    },
                    {
                        fileData: {
                            fullPath: '/test/file2.ts',
                            content: 'content2',
                            languageId: 'typescript'
                        },
                        metadata: {
                            unique_block_id: 'block-2',
                            content_source_id: 'source-2',
                            type: 'file_content',
                            label: 'file2.ts',
                            workspaceFolderUri: 'file:///workspace',
                            workspaceFolderName: 'workspace',
                            windowId: 'window-123'
                        },
                        windowId: 'window-123'
                    }
                ],
                errors: [],
                error: null
            };
            mockSwClient.getContentsForSelectedOpenFiles.mockResolvedValue(mockResponse);

            const result = await service.getContentsForSelectedOpenFiles(fileUris);

            expect(mockSwClient.getContentsForSelectedOpenFiles).toHaveBeenCalledWith(fileUris);
            expect(result).toEqual(mockResponse);
        });

        test('should handle empty file URIs array', async () => {
            const mockResponse: ContentsForFilesResponsePayload = {
                success: true,
                data: [],
                errors: [],
                error: null
            };
            mockSwClient.getContentsForSelectedOpenFiles.mockResolvedValue(mockResponse);

            const result = await service.getContentsForSelectedOpenFiles([]);

            expect(mockSwClient.getContentsForSelectedOpenFiles).toHaveBeenCalledWith([]);
            expect(result).toEqual(mockResponse);
        });

        test('should handle partial failures', async () => {
            const fileUris = ['file:///test/file1.ts', 'file:///test/nonexistent.ts'];
            const mockResponse: ContentsForFilesResponsePayload = {
                success: true,
                data: [
                    {
                        fileData: {
                            fullPath: '/test/file1.ts',
                            content: 'content1',
                            languageId: 'typescript'
                        },
                        metadata: {
                            unique_block_id: 'block-1',
                            content_source_id: 'source-1',
                            type: 'file_content',
                            label: 'file1.ts',
                            workspaceFolderUri: 'file:///workspace',
                            workspaceFolderName: 'workspace',
                            windowId: 'window-123'
                        },
                        windowId: 'window-123'
                    }
                ],
                errors: [
                    {
                        uri: 'file:///test/nonexistent.ts',
                        error: 'File not found',
                        errorCode: 'FILE_NOT_FOUND'
                    }
                ],
                error: null
            };
            mockSwClient.getContentsForSelectedOpenFiles.mockResolvedValue(mockResponse);

            const result = await service.getContentsForSelectedOpenFiles(fileUris);

            expect(result.data).toHaveLength(1);
        });
    });

    describe('getFolderContent', () => {
        test('should delegate to swClient with folder path and workspace URI', async () => {
            const mockResponse: FolderContentResponsePayload = {
                success: true,
                data: {
                    filesData: [
                        {
                            fullPath: '/src/index.ts',
                            content: 'export * from "./utils";',
                            languageId: 'typescript'
                        },
                        {
                            fullPath: '/src/utils.ts',
                            content: 'export const util = () => {};',
                            languageId: 'typescript'
                        }
                    ],
                    metadata: {
                        unique_block_id: 'block-123',
                        content_source_id: 'source-123',
                        type: 'folder_content',
                        label: 'src',
                        workspaceFolderUri: 'file:///workspace',
                        workspaceFolderName: 'workspace',
                        windowId: 'window-123'
                    },
                    windowId: 'window-123'
                },
                error: null,
                folderPath: '/src',
                filterType: 'gitignore'
            };
            mockSwClient.getFolderContent.mockResolvedValue(mockResponse);

            const result = await service.getFolderContent('/src', 'file:///workspace');

            expect(mockSwClient.getFolderContent).toHaveBeenCalledWith('/src', 'file:///workspace');
            expect(result).toEqual(mockResponse);
        });

        test('should handle null workspace URI', async () => {
            const mockResponse: FolderContentResponsePayload = {
                success: false,
                data: null,
                error: 'Workspace not specified',
                errorCode: 'INVALID_REQUEST',
                folderPath: '/src',
                filterType: 'none'
            };
            mockSwClient.getFolderContent.mockResolvedValue(mockResponse);

            const result = await service.getFolderContent('/src', null);

            expect(mockSwClient.getFolderContent).toHaveBeenCalledWith('/src', null);
            expect(result).toEqual(mockResponse);
        });
    });

    describe('listFolderContents', () => {
        test('should delegate to swClient with folder URI and workspace URI', async () => {
            const mockResponse: ListFolderContentsResponsePayload = {
                success: true,
                data: {
                    entries: [
                        {
                            name: 'index.ts',
                            type: 'file',
                            uri: 'file:///src/index.ts',
                            content_source_id: 'file:///src/index.ts',
                            windowId: 'window-123'
                        },
                        {
                            name: 'components',
                            type: 'folder',
                            uri: 'file:///src/components',
                            content_source_id: 'file:///src/components',
                            windowId: 'window-123'
                        }
                    ],
                    parentFolderUri: 'file:///src',
                    filterTypeApplied: 'gitignore',
                    windowId: 'window-123'
                },
                error: null
            };
            mockSwClient.listFolderContents.mockResolvedValue(mockResponse);

            const result = await service.listFolderContents('file:///src', 'file:///workspace');

            expect(mockSwClient.listFolderContents).toHaveBeenCalledWith('file:///src', 'file:///workspace');
            expect(result).toEqual(mockResponse);
        });

        test('should handle empty folder', async () => {
            const mockResponse: ListFolderContentsResponsePayload = {
                success: true,
                data: {
                    entries: [],
                    parentFolderUri: 'file:///empty',
                    filterTypeApplied: 'none',
                    windowId: 'window-123'
                },
                error: null
            };
            mockSwClient.listFolderContents.mockResolvedValue(mockResponse);

            const result = await service.listFolderContents('file:///empty', null);

            expect(result.data?.entries).toEqual([]);
        });
    });

    describe('getWorkspaceProblems', () => {
        test('should delegate to swClient with workspace folder URI', async () => {
            const mockResponse: WorkspaceProblemsResponsePayload = {
                success: true,
                data: {
                    problemsString: 'File: /test/file.ts\n  Line 10: Variable unused (warning)\n',
                    problemCount: 1,
                    metadata: {
                        unique_block_id: 'block-123',
                        content_source_id: 'source-123',
                        type: 'WorkspaceProblems',
                        label: 'Workspace Problems',
                        workspaceFolderUri: 'file:///workspace',
                        workspaceFolderName: 'workspace',
                        windowId: 'window-123'
                    },
                    windowId: 'window-123'
                },
                error: null,
                workspaceFolderUri: 'file:///workspace'
            };
            mockSwClient.getWorkspaceProblems.mockResolvedValue(mockResponse);

            const result = await service.getWorkspaceProblems('file:///workspace');

            expect(mockSwClient.getWorkspaceProblems).toHaveBeenCalledWith('file:///workspace');
            expect(result).toEqual(mockResponse);
        });

        test('should handle no problems', async () => {
            const mockResponse: WorkspaceProblemsResponsePayload = {
                success: true,
                data: {
                    problemsString: 'No problems found.',
                    problemCount: 0,
                    metadata: {
                        unique_block_id: 'block-123',
                        content_source_id: 'source-123',
                        type: 'WorkspaceProblems',
                        label: 'Workspace Problems',
                        workspaceFolderUri: 'file:///workspace',
                        workspaceFolderName: 'workspace',
                        windowId: 'window-123'
                    },
                    windowId: 'window-123'
                },
                error: null,
                workspaceFolderUri: 'file:///workspace'
            };
            mockSwClient.getWorkspaceProblems.mockResolvedValue(mockResponse);

            const result = await service.getWorkspaceProblems('file:///workspace');

            expect(result.data?.problemCount).toEqual(0);
        });

        test('should propagate errors', async () => {
            const error = new Error('Service unavailable');
            mockSwClient.getWorkspaceProblems.mockRejectedValue(error);

            await expect(service.getWorkspaceProblems('file:///workspace')).rejects.toThrow('Service unavailable');
        });
    });
});