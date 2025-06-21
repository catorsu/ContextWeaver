/**
 * @file getFileContentHandler.test.ts
 * @description Unit tests for the GetFileContentHandler class.
 * @module ContextWeaver/VSCE/Tests
 */

// Mock uuid
jest.mock('uuid', () => ({
    v4: jest.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9))
}));

// Mock vscode module
jest.mock('vscode', () => ({
    Uri: {
        parse: (uri: string, strict?: boolean) => ({ 
            toString: () => uri, 
            fsPath: uri.replace('file://', '') 
        })
    },
    FileSystemError: class FileSystemError extends Error {
        code: string = 'FileNotFound';
        constructor(message?: string) { super(message); }
    }
}));

// Mock Logger
jest.mock('@contextweaver/shared', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        trace: jest.fn()
    }))
}));

import * as vscode from 'vscode';
import { GetFileContentHandler } from '../../../src/adapters/primary/ipc/handlers/GetFileContentHandler';
import { WorkspaceService } from '../../../src/core/services/WorkspaceService';
import { FileSystemService } from '../../../src/core/services/FileSystemService';
import { ClientContext } from '../../../src/adapters/primary/ipc/types';
import { GetFileContentRequestPayload, FileContentResponsePayload } from '@contextweaver/shared';

describe('GetFileContentHandler', () => {
    let handler: GetFileContentHandler;
    let mockWorkspaceService: jest.Mocked<WorkspaceService>;
    let mockFileSystemService: jest.Mocked<FileSystemService>;
    let mockClient: ClientContext;
    const windowId = 'test-window-id';

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockWorkspaceService = {
            getWorkspaceFolder: jest.fn(),
            getWorkspaceFolders: jest.fn()
        } as any;

        mockFileSystemService = {
            getFileContentWithLanguageId: jest.fn()
        } as any;

        handler = new GetFileContentHandler(
            mockWorkspaceService,
            mockFileSystemService,
            windowId
        );

        mockClient = {
            ws: {} as any,
            isAuthenticated: true,
            ip: '127.0.0.1'
        };
    });

    describe('Input Validation', () => {
        it('should throw error when filePath is missing', async () => {
            const payload: GetFileContentRequestPayload = {
                filePath: undefined as any
            };

            await expect(handler.handle({
                payload,
                client: mockClient
            })).rejects.toThrow('Missing or invalid filePath in payload.');
        });

        it('should throw error when filePath is not a string', async () => {
            const payload = {
                filePath: 123 as any
            };

            await expect(handler.handle({
                payload,
                client: mockClient
            })).rejects.toThrow('Missing or invalid filePath in payload.');
        });

        it('should throw error when filePath is empty string', async () => {
            const payload: GetFileContentRequestPayload = {
                filePath: ''
            };

            await expect(handler.handle({
                payload,
                client: mockClient
            })).rejects.toThrow('Missing or invalid filePath in payload.');
        });
    });

    describe('File Reading Success', () => {
        it('should read file content with workspace folder', async () => {
            const mockWorkspaceFolder = {
                uri: { 
                    toString: () => 'file:///workspace',
                    fsPath: '/workspace'
                },
                name: 'TestWorkspace',
                index: 0
            };

            const fileContent = 'console.log("Hello World");';
            const languageId = 'javascript';

            mockWorkspaceService.getWorkspaceFolder.mockReturnValue(mockWorkspaceFolder as any);
            mockFileSystemService.getFileContentWithLanguageId.mockResolvedValue({
                content: fileContent,
                languageId: languageId
            } as any);

            const payload: GetFileContentRequestPayload = {
                filePath: 'file:///workspace/src/index.js'
            };

            const result = await handler.handle({
                payload,
                client: mockClient
            });

            expect(mockFileSystemService.getFileContentWithLanguageId).toHaveBeenCalledWith(
                expect.objectContaining({
                    toString: expect.any(Function),
                    fsPath: '/workspace/src/index.js'
                })
            );

            expect(result).toMatchObject<FileContentResponsePayload>({
                success: true,
                data: {
                    fileData: {
                        fullPath: '/workspace/src/index.js',
                        content: fileContent,
                        languageId: languageId
                    },
                    metadata: {
                        unique_block_id: expect.stringMatching(/^mock-uuid-/),
                        content_source_id: 'file:///workspace/src/index.js',
                        type: 'file_content',
                        label: 'index.js',
                        workspaceFolderUri: 'file:///workspace',
                        workspaceFolderName: 'TestWorkspace',
                        windowId: windowId
                    },
                    windowId: windowId
                },
                error: null,
                errorCode: undefined,
                filePath: 'file:///workspace/src/index.js',
                filterType: 'not_applicable'
            });
        });

        it('should find workspace folder by path when getWorkspaceFolder returns undefined', async () => {
            const mockWorkspaceFolders = [
                {
                    uri: { 
                        toString: () => 'file:///workspace1',
                        fsPath: '/workspace1'
                    },
                    name: 'Workspace1',
                    index: 0
                },
                {
                    uri: { 
                        toString: () => 'file:///workspace2',
                        fsPath: '/workspace2'
                    },
                    name: 'Workspace2',
                    index: 1
                }
            ];

            mockWorkspaceService.getWorkspaceFolder.mockReturnValue(undefined);
            mockWorkspaceService.getWorkspaceFolders.mockReturnValue(mockWorkspaceFolders as any);
            mockFileSystemService.getFileContentWithLanguageId.mockResolvedValue({
                content: 'content',
                languageId: 'text'
            } as any);

            const payload: GetFileContentRequestPayload = {
                filePath: 'file:///workspace2/subdir/file.txt'
            };

            const result = await handler.handle({
                payload,
                client: mockClient
            });

            expect(result.data?.metadata.workspaceFolderUri).toBe('file:///workspace2');
            expect(result.data?.metadata.workspaceFolderName).toBe('Workspace2');
        });

        it('should handle file outside of any workspace', async () => {
            mockWorkspaceService.getWorkspaceFolder.mockReturnValue(undefined);
            mockWorkspaceService.getWorkspaceFolders.mockReturnValue([]);
            mockFileSystemService.getFileContentWithLanguageId.mockResolvedValue({
                content: 'standalone file content',
                languageId: 'plaintext'
            } as any);

            const payload: GetFileContentRequestPayload = {
                filePath: 'file:///tmp/standalone.txt'
            };

            const result = await handler.handle({
                payload,
                client: mockClient
            });

            expect(result.data?.metadata.workspaceFolderUri).toBe(null);
            expect(result.data?.metadata.workspaceFolderName).toBe(null);
            expect(result.data?.fileData.content).toBe('standalone file content');
        });
    });

    describe('Error Handling', () => {
        it('should handle file not found error', async () => {
            const fileNotFoundError = new vscode.FileSystemError('File not found');
            (fileNotFoundError as any).code = 'FileNotFound';

            mockFileSystemService.getFileContentWithLanguageId.mockRejectedValue(fileNotFoundError);

            const payload: GetFileContentRequestPayload = {
                filePath: 'file:///workspace/missing.js'
            };

            await expect(handler.handle({
                payload,
                client: mockClient
            })).rejects.toThrow('Error reading file: File not found');

            const mockLogger = (handler as any).logger;
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Error reading file file:///workspace/missing.js: File not found'
            );
        });

        it('should handle null result from file system service', async () => {
            mockFileSystemService.getFileContentWithLanguageId.mockResolvedValue(null as any);

            const payload: GetFileContentRequestPayload = {
                filePath: 'file:///workspace/empty.js'
            };

            await expect(handler.handle({
                payload,
                client: mockClient
            })).rejects.toThrow('Error reading file: Failed to read file content.');
        });

        it('should handle generic file read errors', async () => {
            mockFileSystemService.getFileContentWithLanguageId.mockRejectedValue(
                new Error('Permission denied')
            );

            const payload: GetFileContentRequestPayload = {
                filePath: 'file:///workspace/protected.js'
            };

            await expect(handler.handle({
                payload,
                client: mockClient
            })).rejects.toThrow('Error reading file: Permission denied');
        });

        it('should handle non-Error exceptions', async () => {
            mockFileSystemService.getFileContentWithLanguageId.mockRejectedValue(
                'String error'
            );

            const payload: GetFileContentRequestPayload = {
                filePath: 'file:///workspace/error.js'
            };

            await expect(handler.handle({
                payload,
                client: mockClient
            })).rejects.toThrow('Error reading file: String error');
        });
    });

    describe('Special File Cases', () => {
        it('should handle files with special characters in path', async () => {
            mockFileSystemService.getFileContentWithLanguageId.mockResolvedValue({
                content: 'special content',
                languageId: 'javascript'
            } as any);

            const payload: GetFileContentRequestPayload = {
                filePath: 'file:///workspace/src/my%20file%20(copy).js'
            };

            const result = await handler.handle({
                payload,
                client: mockClient
            });

            expect(result.data?.metadata.label).toBe('my%20file%20(copy).js');
            expect(result.data?.fileData.fullPath).toBe('/workspace/src/my%20file%20(copy).js');
        });

        it('should handle files with no extension', async () => {
            mockFileSystemService.getFileContentWithLanguageId.mockResolvedValue({
                content: '#!/bin/bash',
                languageId: 'shellscript'
            } as any);

            const payload: GetFileContentRequestPayload = {
                filePath: 'file:///workspace/Dockerfile'
            };

            const result = await handler.handle({
                payload,
                client: mockClient
            });

            expect(result.data?.metadata.label).toBe('Dockerfile');
            expect(result.data?.fileData.languageId).toBe('shellscript');
        });

        it('should handle empty file content', async () => {
            mockFileSystemService.getFileContentWithLanguageId.mockResolvedValue({
                content: '',
                languageId: 'plaintext'
            } as any);

            const payload: GetFileContentRequestPayload = {
                filePath: 'file:///workspace/empty.txt'
            };

            const result = await handler.handle({
                payload,
                client: mockClient
            });

            expect(result.success).toBe(true);
            expect(result.data?.fileData.content).toBe('');
        });

        it('should handle binary file indication', async () => {
            mockFileSystemService.getFileContentWithLanguageId.mockResolvedValue({
                content: '[Binary file]',
                languageId: 'binary'
            } as any);

            const payload: GetFileContentRequestPayload = {
                filePath: 'file:///workspace/image.png'
            };

            const result = await handler.handle({
                payload,
                client: mockClient
            });

            expect(result.data?.fileData.content).toBe('[Binary file]');
            expect(result.data?.fileData.languageId).toBe('binary');
        });
    });

    describe('Logger Usage', () => {
        it('should log debug messages during processing', async () => {
            mockFileSystemService.getFileContentWithLanguageId.mockResolvedValue({
                content: 'test',
                languageId: 'text'
            } as any);

            const mockLogger = (handler as any).logger;
            const filePath = 'file:///workspace/test.txt';

            await handler.handle({
                payload: { filePath },
                client: mockClient
            });

            expect(mockLogger.debug).toHaveBeenCalledWith(
                `Processing get_file_content for: ${filePath}`
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `Read file content for ${filePath} for 127.0.0.1`
            );
        });
    });
});