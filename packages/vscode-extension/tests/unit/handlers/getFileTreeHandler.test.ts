/**
 * @file getFileTreeHandler.test.ts
 * @description Unit tests for the GetFileTreeHandler class.
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
import { GetFileTreeHandler } from '../../../src/adapters/primary/ipc/handlers/GetFileTreeHandler';
import { IFilterService } from '../../../src/core/ports/IFilterService';
import { WorkspaceService } from '../../../src/core/services/WorkspaceService';
import { FileSystemService } from '../../../src/core/services/FileSystemService';
import { ClientContext } from '../../../src/adapters/primary/ipc/types';
import { GetFileTreeRequestPayload, FileTreeResponsePayload } from '@contextweaver/shared';

describe('GetFileTreeHandler', () => {
    let handler: GetFileTreeHandler;
    let mockFilterService: jest.Mocked<IFilterService>;
    let mockWorkspaceService: jest.Mocked<WorkspaceService>;
    let mockFileSystemService: jest.Mocked<FileSystemService>;
    let mockClient: ClientContext;
    const windowId = 'test-window-id';

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockFilterService = {
            createFilterForWorkspace: jest.fn()
        } as any;

        mockWorkspaceService = {
            getWorkspaceFolders: jest.fn(),
            getWorkspaceFolder: jest.fn()
        } as any;

        mockFileSystemService = {
            getFileTree: jest.fn()
        } as any;

        handler = new GetFileTreeHandler(
            mockFilterService,
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

    describe('With Specified Workspace URI', () => {
        it('should generate file tree for specified workspace', async () => {
            const mockWorkspaceFolder = {
                uri: { toString: () => 'file:///workspace' },
                name: 'TestWorkspace',
                index: 0
            };

            const mockFilter = { test: jest.fn() };
            const fileTreeString = `TestWorkspace/
├── src/
│   ├── index.ts
│   └── utils.ts
└── package.json`;

            mockWorkspaceService.getWorkspaceFolder.mockReturnValue(mockWorkspaceFolder as any);
            mockFilterService.createFilterForWorkspace.mockResolvedValue(mockFilter as any);
            mockFileSystemService.getFileTree.mockResolvedValue({
                tree: fileTreeString,
                filterTypeApplied: 'gitignore'
            });

            const payload: GetFileTreeRequestPayload = {
                workspaceFolderUri: 'file:///workspace'
            };

            const result = await handler.handle({
                payload,
                client: mockClient
            });

            expect(mockWorkspaceService.getWorkspaceFolder).toHaveBeenCalledWith(
                expect.objectContaining({ toString: expect.any(Function) })
            );
            expect(mockFilterService.createFilterForWorkspace).toHaveBeenCalledWith(mockWorkspaceFolder);
            expect(mockFileSystemService.getFileTree).toHaveBeenCalledWith(mockWorkspaceFolder, mockFilter);

            expect(result).toMatchObject<FileTreeResponsePayload>({
                success: true,
                data: {
                    fileTreeString: fileTreeString,
                    metadata: {
                        unique_block_id: expect.stringMatching(/^mock-uuid-/),
                        content_source_id: 'file:///workspace::FileTree',
                        type: 'FileTree',
                        label: 'TestWorkspace',
                        workspaceFolderUri: 'file:///workspace',
                        workspaceFolderName: 'TestWorkspace',
                        windowId: windowId
                    },
                    windowId: windowId
                },
                error: null,
                errorCode: undefined,
                workspaceFolderUri: 'file:///workspace',
                filterType: 'gitignore'
            });
        });

        it('should handle invalid workspace URI', async () => {
            mockWorkspaceService.getWorkspaceFolder.mockImplementation(() => {
                throw new Error('Invalid URI');
            });

            const payload: GetFileTreeRequestPayload = {
                workspaceFolderUri: 'invalid://uri'
            };

            await expect(handler.handle({
                payload,
                client: mockClient
            })).rejects.toThrow('Invalid workspaceFolderUri: Invalid URI');
        });

        it('should handle non-existent workspace folder', async () => {
            mockWorkspaceService.getWorkspaceFolder.mockReturnValue(undefined);

            const payload: GetFileTreeRequestPayload = {
                workspaceFolderUri: 'file:///non-existent'
            };

            await expect(handler.handle({
                payload,
                client: mockClient
            })).rejects.toThrow("Specified workspace folder URI 'file:///non-existent' not found for get_FileTree.");
        });
    });

    describe('Without Specified Workspace URI', () => {
        it('should generate file tree for single workspace', async () => {
            const mockWorkspaceFolder = {
                uri: { toString: () => 'file:///single-workspace' },
                name: 'SingleWorkspace',
                index: 0
            };

            const mockFilter = { test: jest.fn() };
            const fileTreeString = `SingleWorkspace/
└── index.js`;

            mockWorkspaceService.getWorkspaceFolders.mockReturnValue([mockWorkspaceFolder] as any);
            mockFilterService.createFilterForWorkspace.mockResolvedValue(mockFilter as any);
            mockFileSystemService.getFileTree.mockResolvedValue({
                tree: fileTreeString,
                filterTypeApplied: 'default'
            });

            const payload: GetFileTreeRequestPayload = {
                workspaceFolderUri: null
            };

            const result = await handler.handle({
                payload,
                client: mockClient
            });

            expect(mockWorkspaceService.getWorkspaceFolders).toHaveBeenCalled();
            expect(result.data?.fileTreeString).toBe(fileTreeString);
            expect(result.filterType).toBe('default');
        });

        it('should error when multiple workspaces without URI', async () => {
            const mockWorkspaceFolders = [
                { uri: { toString: () => 'file:///workspace1' }, name: 'Workspace1', index: 0 },
                { uri: { toString: () => 'file:///workspace2' }, name: 'Workspace2', index: 1 }
            ];

            mockWorkspaceService.getWorkspaceFolders.mockReturnValue(mockWorkspaceFolders as any);

            const payload: GetFileTreeRequestPayload = {
                workspaceFolderUri: null
            };

            await expect(handler.handle({
                payload,
                client: mockClient
            })).rejects.toThrow("Multiple workspace folders open. Please specify 'workspaceFolderUri' for get_FileTree.");
        });

        it('should error when no workspace is open', async () => {
            mockWorkspaceService.getWorkspaceFolders.mockReturnValue([]);

            const payload: GetFileTreeRequestPayload = {
                workspaceFolderUri: null
            };

            await expect(handler.handle({
                payload,
                client: mockClient
            })).rejects.toThrow('No workspace folder open or specified for get_FileTree.');
        });

        it('should handle null workspace folders', async () => {
            mockWorkspaceService.getWorkspaceFolders.mockReturnValue(null as any);

            const payload: GetFileTreeRequestPayload = {
                workspaceFolderUri: null
            };

            await expect(handler.handle({
                payload,
                client: mockClient
            })).rejects.toThrow('No workspace folder open or specified for get_FileTree.');
        });
    });

    describe('Error Handling', () => {
        it('should handle file system service errors', async () => {
            const mockWorkspaceFolder = {
                uri: { toString: () => 'file:///workspace' },
                name: 'TestWorkspace',
                index: 0
            };

            mockWorkspaceService.getWorkspaceFolders.mockReturnValue([mockWorkspaceFolder] as any);
            mockFilterService.createFilterForWorkspace.mockResolvedValue({} as any);
            mockFileSystemService.getFileTree.mockResolvedValue('Error: Failed to read directory');

            const payload: GetFileTreeRequestPayload = {
                workspaceFolderUri: null
            };

            await expect(handler.handle({
                payload,
                client: mockClient
            })).rejects.toThrow('Error: Failed to read directory');
        });

        it('should handle filter service errors', async () => {
            const mockWorkspaceFolder = {
                uri: { toString: () => 'file:///workspace' },
                name: 'TestWorkspace',
                index: 0
            };

            mockWorkspaceService.getWorkspaceFolders.mockReturnValue([mockWorkspaceFolder] as any);
            mockFilterService.createFilterForWorkspace.mockRejectedValue(new Error('Filter creation failed'));

            const payload: GetFileTreeRequestPayload = {
                workspaceFolderUri: null
            };

            await expect(handler.handle({
                payload,
                client: mockClient
            })).rejects.toThrow('Filter creation failed');
        });
    });

    describe('Logger Usage', () => {
        it('should log debug message on successful file tree generation', async () => {
            const mockWorkspaceFolder = {
                uri: { toString: () => 'file:///workspace' },
                name: 'TestWorkspace',
                index: 0
            };

            mockWorkspaceService.getWorkspaceFolders.mockReturnValue([mockWorkspaceFolder] as any);
            mockFilterService.createFilterForWorkspace.mockResolvedValue({} as any);
            mockFileSystemService.getFileTree.mockResolvedValue({
                tree: 'tree content',
                filterTypeApplied: 'gitignore'
            });

            const mockLogger = (handler as any).logger;

            await handler.handle({
                payload: { workspaceFolderUri: null },
                client: mockClient
            });

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Generated file tree for file:///workspace (Filter: gitignore) for 127.0.0.1'
            );
        });

        it('should log warning for invalid workspace URI', async () => {
            mockWorkspaceService.getWorkspaceFolder.mockImplementation(() => {
                throw new Error('Parse error');
            });

            const mockLogger = (handler as any).logger;

            try {
                await handler.handle({
                    payload: { workspaceFolderUri: 'bad-uri' },
                    client: mockClient
                });
            } catch (e) {
                // Expected
            }

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Invalid workspaceFolderUri for get_FileTree: bad-uri')
            );
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty file tree', async () => {
            const mockWorkspaceFolder = {
                uri: { toString: () => 'file:///empty' },
                name: 'EmptyWorkspace',
                index: 0
            };

            mockWorkspaceService.getWorkspaceFolders.mockReturnValue([mockWorkspaceFolder] as any);
            mockFilterService.createFilterForWorkspace.mockResolvedValue({} as any);
            mockFileSystemService.getFileTree.mockResolvedValue({
                tree: 'EmptyWorkspace/',
                filterTypeApplied: 'default'
            });

            const result = await handler.handle({
                payload: { workspaceFolderUri: null },
                client: mockClient
            });

            expect(result.success).toBe(true);
            expect(result.data?.fileTreeString).toBe('EmptyWorkspace/');
        });

        it('should handle workspace with special characters in name', async () => {
            const mockWorkspaceFolder = {
                uri: { toString: () => 'file:///my%20project' },
                name: 'My Project (2024)',
                index: 0
            };

            mockWorkspaceService.getWorkspaceFolders.mockReturnValue([mockWorkspaceFolder] as any);
            mockFilterService.createFilterForWorkspace.mockResolvedValue({} as any);
            mockFileSystemService.getFileTree.mockResolvedValue({
                tree: 'My Project (2024)/',
                filterTypeApplied: 'gitignore'
            });

            const result = await handler.handle({
                payload: { workspaceFolderUri: null },
                client: mockClient
            });

            expect(result.data?.metadata.label).toBe('My Project (2024)');
            expect(result.data?.metadata.workspaceFolderName).toBe('My Project (2024)');
        });
    });
});