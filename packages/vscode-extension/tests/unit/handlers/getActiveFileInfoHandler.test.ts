/**
 * @file getActiveFileInfoHandler.test.ts
 * @description Unit tests for the GetActiveFileInfoHandler class.
 * @module ContextWeaver/VSCE/Tests
 */

// Mock vscode module
jest.mock('vscode', () => ({
    window: {
        activeTextEditor: undefined
    },
    Uri: {
        parse: (uri: string) => ({ toString: () => uri, fsPath: uri.replace('file://', '') })
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
import { GetActiveFileInfoHandler } from '../../../src/adapters/primary/ipc/handlers/GetActiveFileInfoHandler';
import { WorkspaceService } from '../../../src/core/services/WorkspaceService';
import { ClientContext } from '../../../src/adapters/primary/ipc/types';
import { ActiveFileInfoResponsePayload } from '@contextweaver/shared';

describe('GetActiveFileInfoHandler', () => {
    let handler: GetActiveFileInfoHandler;
    let mockWorkspaceService: jest.Mocked<WorkspaceService>;
    let mockClient: ClientContext;
    const windowId = 'test-window-id';

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockWorkspaceService = {
            getWorkspaceFolder: jest.fn()
        } as any;

        handler = new GetActiveFileInfoHandler(mockWorkspaceService, windowId);

        mockClient = {
            ws: {} as any,
            isAuthenticated: true,
            ip: '127.0.0.1'
        };
    });

    describe('No Active Editor', () => {
        it('should return error when no active editor', async () => {
            (vscode.window as any).activeTextEditor = undefined;

            const result = await handler.handle({
                payload: undefined as any,
                client: mockClient
            });

            expect(result).toEqual<ActiveFileInfoResponsePayload>({
                success: false,
                data: null,
                error: 'No active file',
                errorCode: 'NO_ACTIVE_FILE'
            });
        });
    });

    describe('With Active Editor', () => {
        let mockActiveEditor: any;
        let mockDocument: any;
        let mockUri: any;

        beforeEach(() => {
            mockUri = {
                toString: () => 'file:///workspace/src/test.ts',
                fsPath: '/workspace/src/test.ts'
            };

            mockDocument = {
                uri: mockUri
            };

            mockActiveEditor = {
                document: mockDocument
            };

            (vscode.window as any).activeTextEditor = mockActiveEditor;
        });

        it('should return active file info with workspace folder', async () => {
            const mockWorkspaceFolder = {
                uri: { toString: () => 'file:///workspace' },
                name: 'TestWorkspace',
                index: 0
            };

            mockWorkspaceService.getWorkspaceFolder.mockReturnValue(mockWorkspaceFolder as any);

            const result = await handler.handle({
                payload: undefined as any,
                client: mockClient
            });

            expect(mockWorkspaceService.getWorkspaceFolder).toHaveBeenCalledWith(mockUri);
            
            expect(result).toEqual<ActiveFileInfoResponsePayload>({
                success: true,
                data: {
                    activeFilePath: 'file:///workspace/src/test.ts',
                    activeFileLabel: 'test.ts',
                    workspaceFolderUri: 'file:///workspace',
                    workspaceFolderName: 'TestWorkspace',
                    windowId: windowId
                },
                error: null,
                errorCode: undefined
            });
        });

        it('should return active file info without workspace folder', async () => {
            mockWorkspaceService.getWorkspaceFolder.mockReturnValue(undefined);

            const result = await handler.handle({
                payload: undefined as any,
                client: mockClient
            });

            expect(result).toEqual<ActiveFileInfoResponsePayload>({
                success: true,
                data: {
                    activeFilePath: 'file:///workspace/src/test.ts',
                    activeFileLabel: 'test.ts',
                    workspaceFolderUri: null,
                    workspaceFolderName: null,
                    windowId: windowId
                },
                error: null,
                errorCode: undefined
            });
        });

        it('should handle file with complex path', async () => {
            mockUri = {
                toString: () => 'file:///workspace/src/components/Header/Header.test.tsx',
                fsPath: '/workspace/src/components/Header/Header.test.tsx'
            };
            mockDocument.uri = mockUri;

            const mockWorkspaceFolder = {
                uri: { toString: () => 'file:///workspace' },
                name: 'MyProject',
                index: 0
            };

            mockWorkspaceService.getWorkspaceFolder.mockReturnValue(mockWorkspaceFolder as any);

            const result = await handler.handle({
                payload: undefined as any,
                client: mockClient
            });

            expect(result.data?.activeFileLabel).toBe('Header.test.tsx');
        });

        it('should handle file URIs with special characters', async () => {
            mockUri = {
                toString: () => 'file:///workspace/src/my%20file%20with%20spaces.js',
                fsPath: '/workspace/src/my file with spaces.js'
            };
            mockDocument.uri = mockUri;

            const result = await handler.handle({
                payload: undefined as any,
                client: mockClient
            });

            expect(result.data?.activeFileLabel).toBe('my file with spaces.js');
            expect(result.data?.activeFilePath).toBe('file:///workspace/src/my%20file%20with%20spaces.js');
        });
    });

    describe('Error Handling', () => {
        it('should handle errors during processing', async () => {
            const mockError = new Error('Unexpected error');
            
            const mockActiveEditor = {
                document: {
                    get uri() {
                        throw mockError;
                    }
                }
            };

            (vscode.window as any).activeTextEditor = mockActiveEditor;

            await expect(handler.handle({
                payload: undefined as any,
                client: mockClient
            })).rejects.toThrow('Error getting active file info: Unexpected error');
        });

        it('should handle non-Error exceptions', async () => {
            const mockActiveEditor = {
                document: {
                    get uri() {
                        throw 'String error';
                    }
                }
            };

            (vscode.window as any).activeTextEditor = mockActiveEditor;

            await expect(handler.handle({
                payload: undefined as any,
                client: mockClient
            })).rejects.toThrow('Error getting active file info: String error');
        });
    });

    describe('Logger Usage', () => {
        it('should log debug message on successful response', async () => {
            const mockUri = {
                toString: () => 'file:///workspace/test.ts',
                fsPath: '/workspace/test.ts'
            };

            const mockActiveEditor = {
                document: { uri: mockUri }
            };

            (vscode.window as any).activeTextEditor = mockActiveEditor;
            
            const mockLogger = (handler as any).logger;

            await handler.handle({
                payload: undefined as any,
                client: mockClient
            });

            expect(mockLogger.debug).toHaveBeenCalledWith('Sent active file info to 127.0.0.1');
        });

        it('should log error message on exception', async () => {
            const mockError = new Error('Test error');
            const mockActiveEditor = {
                document: {
                    get uri() {
                        throw mockError;
                    }
                }
            };

            (vscode.window as any).activeTextEditor = mockActiveEditor;
            
            const mockLogger = (handler as any).logger;

            try {
                await handler.handle({
                    payload: undefined as any,
                    client: mockClient
                });
            } catch (e) {
                // Expected
            }

            expect(mockLogger.error).toHaveBeenCalledWith('Error getting active file info: Test error');
        });
    });
});