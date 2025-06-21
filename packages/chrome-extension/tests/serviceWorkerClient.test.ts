/**
 * @file serviceWorkerClient.test.ts
 * @description Unit tests for service worker client API functions
 * @module ContextWeaver/CE/Tests
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import {
    searchWorkspace,
    getWorkspaceDetails,
    getFileTree,
    getActiveFileInfo,
    getFileContent,
    getEntireCodebase,
    getOpenFiles,
    getContentsForSelectedOpenFiles,
    getFolderContent,
    listFolderContents,
    getWorkspaceProblems
} from '../src/serviceWorkerClient';
import { ContextWeaverError, ContentsForFilesResponsePayload } from '@contextweaver/shared';

// Mock chrome.runtime API
const mockChrome = {
    runtime: {
        sendMessage: jest.fn() as any,
        lastError: null as { message?: string } | null
    }
};

// Mock the Logger
jest.mock('@contextweaver/shared', () => {
    const actual = jest.requireActual('@contextweaver/shared') as any;
    return {
        ...actual,
        Logger: jest.fn().mockImplementation(() => ({
            debug: jest.fn(),
            trace: jest.fn(),
            error: jest.fn(),
            warn: jest.fn()
        })),
        ContextWeaverError: actual.ContextWeaverError
    };
});

// Setup global chrome mock
(global as any).chrome = mockChrome;

describe('serviceWorkerClient', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockChrome.runtime.lastError = null;
    });

    describe('searchWorkspace', () => {
        test('should send search request and return successful response', async () => {
            const mockResponse = {
                success: true,
                data: {
                    results: [
                        {
                            path: '/test/file.ts',
                            name: 'file.ts',
                            type: 'file',
                            uri: 'file:///test/file.ts',
                            content_source_id: 'file:///test/file.ts',
                            workspaceFolderUri: 'file:///test',
                            workspaceFolderName: 'test',
                            relativePath: 'file.ts',
                            windowId: 'window-123'
                        }
                    ],
                    windowId: 'window-123'
                },
                error: null,
                query: 'test'
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await searchWorkspace('test', 'file:///test');

            expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'SEARCH_WORKSPACE',
                payload: { query: 'test', workspaceFolderUri: 'file:///test' }
            });
            expect(result).toEqual(mockResponse);
        });

        test('should handle search with null workspace URI', async () => {
            const mockResponse = {
                success: true,
                data: { results: [], windowId: 'window-123' },
                error: null,
                query: 'test'
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await searchWorkspace('test', null);

            expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'SEARCH_WORKSPACE',
                payload: { query: 'test', workspaceFolderUri: null }
            });
            expect(result).toEqual(mockResponse);
        });

        test('should handle search failure response', async () => {
            const mockResponse = {
                success: false,
                error: 'Search failed',
                errorCode: 'SEARCH_ERROR'
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            await expect(searchWorkspace('test', null)).rejects.toThrow(ContextWeaverError);
            await expect(searchWorkspace('test', null)).rejects.toThrow('Search failed');
        });

        test('should handle chrome runtime error', async () => {
            mockChrome.runtime.lastError = { message: 'Extension context invalidated' };
            mockChrome.runtime.sendMessage.mockResolvedValue(undefined);

            await expect(searchWorkspace('test', null)).rejects.toThrow('Extension context invalidated');
        });
    });

    describe('getWorkspaceDetails', () => {
        test('should get workspace details successfully', async () => {
            const mockResponse = {
                success: true,
                data: {
                    windowId: 'window-123',
                    workspaces: [
                        {
                            uri: 'file:///workspace1',
                            name: 'Workspace1',
                            index: 0
                        }
                    ]
                },
                error: null
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await getWorkspaceDetails();

            expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'GET_WORKSPACE_DETAILS_FOR_UI'
            });
            expect(result).toEqual(mockResponse);
        });

        test('should handle empty workspace response', async () => {
            const mockResponse = {
                success: true,
                data: {
                    windowId: 'window-123',
                    workspaces: []
                },
                error: null
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await getWorkspaceDetails();

            expect(result).toEqual(mockResponse);
        });
    });

    describe('getFileTree', () => {
        test('should get file tree for specific workspace', async () => {
            const mockResponse = {
                success: true,
                data: {
                    tree: {
                        name: 'root',
                        path: '/workspace',
                        type: 'directory',
                        children: [
                            {
                                name: 'src',
                                path: '/workspace/src',
                                type: 'directory',
                                children: []
                            }
                        ]
                    },
                    windowId: 'window-123'
                },
                error: null,
                workspaceFolderUri: 'file:///workspace'
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await getFileTree('file:///workspace');

            expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'GET_FileTree',
                payload: { workspaceFolderUri: 'file:///workspace' }
            });
            expect(result).toEqual(mockResponse);
        });

        test('should handle null workspace URI', async () => {
            const mockResponse = {
                success: false,
                error: 'Workspace not found',
                errorCode: 'WORKSPACE_NOT_FOUND'
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            await expect(getFileTree(null)).rejects.toThrow(ContextWeaverError);
        });
    });

    describe('getActiveFileInfo', () => {
        test('should get active file info successfully', async () => {
            const mockResponse = {
                success: true,
                data: {
                    fileData: {
                        fullPath: '/workspace/active.ts',
                        content: 'const x = 1;',
                        languageId: 'typescript'
                    },
                    metadata: {
                        unique_block_id: 'id-123',
                        content_source_id: 'file:///workspace/active.ts',
                        type: 'file_content' as const,
                        label: 'active.ts',
                        workspaceFolderUri: 'file:///workspace',
                        workspaceFolderName: 'workspace',
                        windowId: 'window-123'
                    },
                    windowId: 'window-123'
                },
                error: null
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await getActiveFileInfo();

            expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'GET_ACTIVE_FILE_INFO'
            });
            expect(result).toEqual(mockResponse);
        });

        test('should handle no active file', async () => {
            const mockResponse = {
                success: false,
                error: 'No active file',
                errorCode: 'NO_ACTIVE_FILE'
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            await expect(getActiveFileInfo()).rejects.toThrow(ContextWeaverError);
        });
    });

    describe('getFileContent', () => {
        test('should get file content successfully', async () => {
            const mockResponse = {
                success: true,
                data: {
                    fileData: {
                        fullPath: '/test/file.ts',
                        content: 'console.log("test");',
                        languageId: 'typescript'
                    },
                    metadata: {
                        unique_block_id: 'id-123',
                        content_source_id: 'file:///test/file.ts',
                        type: 'file_content' as const,
                        label: 'file.ts',
                        workspaceFolderUri: 'file:///test',
                        workspaceFolderName: 'test',
                        windowId: 'window-123'
                    },
                    windowId: 'window-123'
                },
                error: null,
                filePath: '/test/file.ts',
                filterType: 'not_applicable' as any
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await getFileContent('/test/file.ts');

            expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'GET_FILE_CONTENT',
                payload: { filePath: '/test/file.ts' }
            });
            expect(result).toEqual(mockResponse);
        });

        test('should handle file not found', async () => {
            const mockResponse = {
                success: false,
                error: 'File not found',
                errorCode: 'FILE_NOT_FOUND'
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            await expect(getFileContent('/nonexistent.ts')).rejects.toThrow(ContextWeaverError);
            await expect(getFileContent('/nonexistent.ts')).rejects.toThrow('File not found');
        });
    });

    describe('getEntireCodebase', () => {
        test('should get entire codebase successfully', async () => {
            const mockResponse = {
                success: true,
                data: {
                    filesData: [
                        {
                            fullPath: '/workspace/file1.ts',
                            content: 'content1',
                            languageId: 'typescript'
                        },
                        {
                            fullPath: '/workspace/file2.js',
                            content: 'content2',
                            languageId: 'javascript'
                        }
                    ],
                    metadata: {
                        unique_block_id: 'id-123',
                        content_source_id: 'file:///workspace',
                        type: 'entire_codebase' as const,
                        label: 'Entire Codebase',
                        workspaceFolderUri: 'file:///workspace',
                        workspaceFolderName: 'workspace',
                        windowId: 'window-123'
                    },
                    windowId: 'window-123'
                },
                error: null,
                workspaceFolderUri: 'file:///workspace'
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await getEntireCodebase('file:///workspace');

            expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'GET_ENTIRE_CODEBASE',
                payload: { workspaceFolderUri: 'file:///workspace' }
            });
            expect(result).toEqual(mockResponse);
        });

        test('should handle large codebase response', async () => {
            const mockResponse = {
                success: true,
                data: {
                    filesData: Array(1000).fill(null).map((_, i) => ({
                        fullPath: `/workspace/file${i}.ts`,
                        content: `content${i}`,
                        languageId: 'typescript'
                    })),
                    metadata: {
                        unique_block_id: 'id-123',
                        content_source_id: 'file:///workspace',
                        type: 'entire_codebase' as const,
                        label: 'Entire Codebase',
                        workspaceFolderUri: 'file:///workspace',
                        workspaceFolderName: 'workspace',
                        windowId: 'window-123'
                    },
                    windowId: 'window-123'
                },
                error: null,
                workspaceFolderUri: 'file:///workspace'
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await getEntireCodebase('file:///workspace');

            expect(result.data?.filesData).toHaveLength(1000);
        });
    });

    describe('getOpenFiles', () => {
        test('should get open files successfully', async () => {
            const mockResponse = {
                success: true,
                data: {
                    openFiles: [
                        {
                            uri: 'file:///workspace/file1.ts',
                            name: 'file1.ts',
                            languageId: 'typescript',
                            isDirty: false,
                            isActive: true
                        },
                        {
                            uri: 'file:///workspace/file2.js',
                            name: 'file2.js',
                            languageId: 'javascript',
                            isDirty: true,
                            isActive: false
                        }
                    ],
                    windowId: 'window-123'
                },
                error: null
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await getOpenFiles();

            expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'GET_OPEN_FILES_FOR_UI'
            });
            expect(result).toEqual(mockResponse);
        });

        test('should handle no open files', async () => {
            const mockResponse = {
                success: true,
                data: {
                    openFiles: [],
                    windowId: 'window-123'
                },
                error: null
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await getOpenFiles();

            expect(result.data?.openFiles).toHaveLength(0);
        });
    });

    describe('getContentsForSelectedOpenFiles', () => {
        test('should get contents for selected files', async () => {
            const fileUris = [
                'file:///workspace/file1.ts',
                'file:///workspace/file2.js'
            ];

            const mockResponse: ContentsForFilesResponsePayload = {
                success: true,
                data: [
                    {
                        fileData: {
                            fullPath: '/workspace/file1.ts',
                            content: 'content1',
                            languageId: 'typescript'
                        },
                        metadata: {
                            unique_block_id: 'id-123-1',
                            content_source_id: 'file:///workspace/file1.ts',
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
                            fullPath: '/workspace/file2.js',
                            content: 'content2',
                            languageId: 'javascript'
                        },
                        metadata: {
                            unique_block_id: 'id-123-2',
                            content_source_id: 'file:///workspace/file2.js',
                            type: 'file_content',
                            label: 'file2.js',
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

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await getContentsForSelectedOpenFiles(fileUris);

            expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'GET_CONTENTS_FOR_SELECTED_OPEN_FILES',
                payload: { fileUris }
            });
            expect(result).toEqual(mockResponse);
        });

        test('should handle partial failures', async () => {
            const fileUris = ['file:///workspace/file1.ts', 'file:///workspace/missing.js'];

            const mockResponse: ContentsForFilesResponsePayload = {
                success: true,
                data: [
                    {
                        fileData: {
                            fullPath: '/workspace/file1.ts',
                            content: 'content1',
                            languageId: 'typescript'
                        },
                        metadata: {
                            unique_block_id: 'id-123-1',
                            content_source_id: 'file:///workspace/file1.ts',
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
                        uri: 'file:///workspace/missing.js',
                        error: 'File not found'
                    }
                ],
                error: null
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await getContentsForSelectedOpenFiles(fileUris);

            expect(result.data).toHaveLength(1);
            expect(result.errors).toHaveLength(1);
        });

        test('should handle empty file list', async () => {
            const mockResponse: ContentsForFilesResponsePayload = {
                success: true,
                data: [],
                errors: [],
                error: null
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await getContentsForSelectedOpenFiles([]);

            expect(result.data).toHaveLength(0);
        });
    });

    describe('getFolderContent', () => {
        test('should get folder content successfully', async () => {
            const mockResponse = {
                success: true,
                data: {
                    filesData: [
                        {
                            fullPath: '/workspace/folder/file1.ts',
                            content: 'content1',
                            languageId: 'typescript'
                        }
                    ],
                    metadata: {
                        unique_block_id: 'id-123',
                        content_source_id: 'file:///workspace/folder',
                        type: 'folder_content' as const,
                        label: 'folder',
                        workspaceFolderUri: 'file:///workspace',
                        workspaceFolderName: 'workspace',
                        windowId: 'window-123'
                    },
                    windowId: 'window-123'
                },
                error: null,
                folderPath: '/workspace/folder'
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await getFolderContent('/workspace/folder', 'file:///workspace');

            expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'GET_FOLDER_CONTENT',
                payload: { folderPath: '/workspace/folder', workspaceFolderUri: 'file:///workspace' }
            });
            expect(result).toEqual(mockResponse);
        });

        test('should handle folder with null workspace URI', async () => {
            const mockResponse = {
                success: false,
                error: 'Workspace not specified',
                errorCode: 'INVALID_REQUEST'
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            await expect(getFolderContent('/folder', null)).rejects.toThrow(ContextWeaverError);
        });
    });

    describe('listFolderContents', () => {
        test('should list folder contents successfully', async () => {
            const mockResponse = {
                success: true,
                data: {
                    entries: [
                        {
                            name: 'file1.ts',
                            path: '/workspace/folder/file1.ts',
                            type: 'file' as const,
                            uri: 'file:///workspace/folder/file1.ts'
                        },
                        {
                            name: 'subfolder',
                            path: '/workspace/folder/subfolder',
                            type: 'directory' as const,
                            uri: 'file:///workspace/folder/subfolder'
                        }
                    ],
                    parentFolderUri: 'file:///workspace/folder',
                    filterTypeApplied: 'none' as any,
                    windowId: 'window-123'
                },
                error: null,
                folderUri: 'file:///workspace/folder'
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await listFolderContents('file:///workspace/folder', 'file:///workspace');

            expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'LIST_FOLDER_CONTENTS',
                payload: { folderUri: 'file:///workspace/folder', workspaceFolderUri: 'file:///workspace' }
            });
            expect(result).toEqual(mockResponse);
        });

        test('should handle empty folder', async () => {
            const mockResponse = {
                success: true,
                data: {
                    entries: [],
                    parentFolderUri: 'file:///workspace/empty',
                    filterTypeApplied: 'none' as any,
                    windowId: 'window-123'
                },
                error: null,
                folderUri: 'file:///workspace/empty'
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await listFolderContents('file:///workspace/empty', 'file:///workspace');

            expect(result.data?.entries).toHaveLength(0);
        });
    });

    describe('getWorkspaceProblems', () => {
        test('should get workspace problems successfully', async () => {
            const mockResponse = {
                success: true,
                data: {
                    problemsString: 'file:///workspace/file1.ts(1,0): Variable is not defined [typescript]',
                    problemCount: 1,
                    metadata: {
                        unique_block_id: 'id-123',
                        content_source_id: 'file:///workspace',
                        type: 'workspace_problems' as const,
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

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await getWorkspaceProblems('file:///workspace');

            expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'GET_WORKSPACE_PROBLEMS',
                payload: { workspaceFolderUri: 'file:///workspace' }
            });
            expect(result).toEqual(mockResponse);
        });

        test('should handle no problems', async () => {
            const mockResponse = {
                success: true,
                data: {
                    problemsString: '',
                    problemCount: 0,
                    metadata: {
                        unique_block_id: 'id-123',
                        content_source_id: 'file:///workspace',
                        type: 'workspace_problems' as const,
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

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            const result = await getWorkspaceProblems('file:///workspace');

            expect(result.data?.problemCount).toBe(0);
            expect(result.data?.problemsString).toBe('');
        });
    });

    describe('Error handling', () => {
        test('should handle network errors', async () => {
            const networkError = new Error('Network error');
            mockChrome.runtime.sendMessage.mockRejectedValue(networkError);

            await expect(getFileContent('/test.ts')).rejects.toThrow('Network error');
        });

        test('should handle chrome runtime without lastError property', async () => {
            // Simulate chrome.runtime.lastError being undefined but response is undefined
            mockChrome.runtime.lastError = { message: undefined };
            mockChrome.runtime.sendMessage.mockResolvedValue(undefined);

            await expect(getFileContent('/test.ts')).rejects.toThrow('Service worker communication error');
        });

        test('should handle response with success=false but no error message', async () => {
            const mockResponse = {
                success: false,
                errorCode: 'UNKNOWN_ERROR'
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            await expect(getFileContent('/test.ts')).rejects.toThrow(ContextWeaverError);
            await expect(getFileContent('/test.ts')).rejects.toThrow('Operation GET_FILE_CONTENT failed.');
        });

        test('should preserve error codes in ContextWeaverError', async () => {
            const mockResponse = {
                success: false,
                error: 'Custom error message',
                errorCode: 'CUSTOM_ERROR_CODE'
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            try {
                await getFileContent('/test.ts');
            } catch (error) {
                expect(error).toBeInstanceOf(ContextWeaverError);
                expect((error as ContextWeaverError).message).toBe('Custom error message');
                expect((error as ContextWeaverError).errorCode).toBe('CUSTOM_ERROR_CODE');
            }
        });

        test('should handle undefined error code', async () => {
            const mockResponse = {
                success: false,
                error: 'Error without code'
            };

            mockChrome.runtime.sendMessage.mockResolvedValue(mockResponse);

            try {
                await getFileContent('/test.ts');
            } catch (error) {
                expect(error).toBeInstanceOf(ContextWeaverError);
                expect((error as ContextWeaverError).errorCode).toBeUndefined();
            }
        });
    });
});