/**
 * @file workspaceService.test.ts
 * @description Unit tests for WorkspaceService
 * @module ContextWeaver/VSCE/Tests
 */

// Mock vscode module before importing
jest.mock('vscode', () => ({
    Uri: {
        file: (path: string) => ({ 
            toString: () => `file://${path}`, 
            fsPath: path,
            scheme: 'file',
            path: path
        }),
        parse: (uri: string) => ({ 
            toString: () => uri, 
            fsPath: uri.replace('file://', ''),
            scheme: 'file',
            path: uri.replace('file://', '')
        })
    },
    workspace: {
        isTrusted: true,
        workspaceFolders: [],
        getWorkspaceFolder: jest.fn()
    }
}));

import { WorkspaceService, WorkspaceServiceError } from '../../src/core/services/WorkspaceService';
import * as vscode from 'vscode';

describe('WorkspaceService', () => {
    let workspaceService: WorkspaceService;
    let mockWorkspace: jest.Mocked<typeof vscode.workspace>;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        
        // Set up mock workspace
        mockWorkspace = vscode.workspace as jest.Mocked<typeof vscode.workspace>;
        
        // Create WorkspaceService instance
        workspaceService = new WorkspaceService();
    });

    describe('isWorkspaceTrusted', () => {
        test('should return true when workspace is trusted', () => {
            Object.defineProperty(mockWorkspace, 'isTrusted', {
                value: true,
                configurable: true
            });
            
            const result = workspaceService.isWorkspaceTrusted();
            
            expect(result).toBe(true);
        });

        test('should return false when workspace is not trusted', () => {
            Object.defineProperty(mockWorkspace, 'isTrusted', {
                value: false,
                configurable: true
            });
            
            const result = workspaceService.isWorkspaceTrusted();
            
            expect(result).toBe(false);
        });
    });

    describe('getWorkspaceFolders', () => {
        test('should return workspace folders when available', () => {
            const mockFolders: vscode.WorkspaceFolder[] = [
                {
                    uri: vscode.Uri.file('/workspace1'),
                    name: 'Workspace1',
                    index: 0
                },
                {
                    uri: vscode.Uri.file('/workspace2'),
                    name: 'Workspace2',
                    index: 1
                }
            ];
            
            Object.defineProperty(mockWorkspace, 'workspaceFolders', {
                value: mockFolders,
                configurable: true
            });
            
            const result = workspaceService.getWorkspaceFolders();
            
            expect(result).toEqual(mockFolders);
        });

        test('should return undefined when no workspace folders', () => {
            Object.defineProperty(mockWorkspace, 'workspaceFolders', {
                value: undefined,
                configurable: true
            });
            
            const result = workspaceService.getWorkspaceFolders();
            
            expect(result).toBeUndefined();
        });

        test('should return empty array when workspace folders is empty', () => {
            Object.defineProperty(mockWorkspace, 'workspaceFolders', {
                value: [],
                configurable: true
            });
            
            const result = workspaceService.getWorkspaceFolders();
            
            expect(result).toEqual([]);
        });
    });

    describe('getWorkspaceFolder', () => {
        test('should return workspace folder for matching URI', () => {
            const targetUri = vscode.Uri.file('/workspace1/file.ts');
            const mockFolder: vscode.WorkspaceFolder = {
                uri: vscode.Uri.file('/workspace1'),
                name: 'Workspace1',
                index: 0
            };
            
            mockWorkspace.getWorkspaceFolder = jest.fn().mockReturnValue(mockFolder);
            
            const result = workspaceService.getWorkspaceFolder(targetUri);
            
            expect(result).toEqual(mockFolder);
            expect(mockWorkspace.getWorkspaceFolder).toHaveBeenCalledWith(targetUri);
        });

        test('should return undefined for non-matching URI', () => {
            const targetUri = vscode.Uri.file('/unknown/file.ts');
            
            mockWorkspace.getWorkspaceFolder = jest.fn().mockReturnValue(undefined);
            
            const result = workspaceService.getWorkspaceFolder(targetUri);
            
            expect(result).toBeUndefined();
            expect(mockWorkspace.getWorkspaceFolder).toHaveBeenCalledWith(targetUri);
        });
    });

    describe('getWorkspaceDetailsForIPC', () => {
        test('should return workspace details when workspace is trusted', () => {
            const mockFolders: vscode.WorkspaceFolder[] = [
                {
                    uri: vscode.Uri.file('/workspace1'),
                    name: 'Workspace1',
                    index: 0
                },
                {
                    uri: vscode.Uri.file('/workspace2'),
                    name: 'Workspace2',
                    index: 1
                }
            ];
            
            Object.defineProperty(mockWorkspace, 'workspaceFolders', {
                value: mockFolders,
                configurable: true
            });
            Object.defineProperty(mockWorkspace, 'isTrusted', {
                value: true,
                configurable: true
            });
            
            const result = workspaceService.getWorkspaceDetailsForIPC();
            
            expect(result).toEqual([
                {
                    uri: 'file:///workspace1',
                    name: 'Workspace1',
                    isTrusted: true
                },
                {
                    uri: 'file:///workspace2',
                    name: 'Workspace2',
                    isTrusted: true
                }
            ]);
        });

        test('should return workspace details with isTrusted false when workspace is not trusted', () => {
            const mockFolders: vscode.WorkspaceFolder[] = [
                {
                    uri: vscode.Uri.file('/workspace1'),
                    name: 'Workspace1',
                    index: 0
                }
            ];
            
            Object.defineProperty(mockWorkspace, 'workspaceFolders', {
                value: mockFolders,
                configurable: true
            });
            Object.defineProperty(mockWorkspace, 'isTrusted', {
                value: false,
                configurable: true
            });
            
            const result = workspaceService.getWorkspaceDetailsForIPC();
            
            expect(result).toEqual([
                {
                    uri: 'file:///workspace1',
                    name: 'Workspace1',
                    isTrusted: false
                }
            ]);
        });

        test('should return null when no workspace folders', () => {
            Object.defineProperty(mockWorkspace, 'workspaceFolders', {
                value: undefined,
                configurable: true
            });
            
            const result = workspaceService.getWorkspaceDetailsForIPC();
            
            expect(result).toBeNull();
        });

        test('should return null when workspace folders is empty', () => {
            Object.defineProperty(mockWorkspace, 'workspaceFolders', {
                value: [],
                configurable: true
            });
            
            const result = workspaceService.getWorkspaceDetailsForIPC();
            
            expect(result).toBeNull();
        });
    });

    describe('ensureWorkspaceTrustedAndOpen', () => {
        test('should resolve when workspace is trusted and has folders', async () => {
            Object.defineProperty(mockWorkspace, 'isTrusted', {
                value: true,
                configurable: true
            });
            Object.defineProperty(mockWorkspace, 'workspaceFolders', {
                value: [
                    {
                        uri: vscode.Uri.file('/workspace1'),
                        name: 'Workspace1',
                        index: 0
                    }
                ],
                configurable: true
            });
            
            await expect(workspaceService.ensureWorkspaceTrustedAndOpen()).resolves.toBeUndefined();
        });

        test('should throw WorkspaceServiceError when workspace is not trusted', async () => {
            Object.defineProperty(mockWorkspace, 'isTrusted', {
                value: false,
                configurable: true
            });
            Object.defineProperty(mockWorkspace, 'workspaceFolders', {
                value: [
                    {
                        uri: vscode.Uri.file('/workspace1'),
                        name: 'Workspace1',
                        index: 0
                    }
                ],
                configurable: true
            });
            
            await expect(workspaceService.ensureWorkspaceTrustedAndOpen()).rejects.toThrow(WorkspaceServiceError);
            await expect(workspaceService.ensureWorkspaceTrustedAndOpen()).rejects.toThrow('Workspace is not trusted. Please trust the workspace to use this feature.');
            
            try {
                await workspaceService.ensureWorkspaceTrustedAndOpen();
            } catch (error) {
                expect(error).toBeInstanceOf(WorkspaceServiceError);
                expect((error as WorkspaceServiceError).code).toBe('WORKSPACE_NOT_TRUSTED');
            }
        });

        test('should throw WorkspaceServiceError when no workspace folders', async () => {
            Object.defineProperty(mockWorkspace, 'isTrusted', {
                value: true,
                configurable: true
            });
            Object.defineProperty(mockWorkspace, 'workspaceFolders', {
                value: undefined,
                configurable: true
            });
            
            await expect(workspaceService.ensureWorkspaceTrustedAndOpen()).rejects.toThrow(WorkspaceServiceError);
            await expect(workspaceService.ensureWorkspaceTrustedAndOpen()).rejects.toThrow('No workspace folder is open. Please open a folder or workspace.');
            
            try {
                await workspaceService.ensureWorkspaceTrustedAndOpen();
            } catch (error) {
                expect(error).toBeInstanceOf(WorkspaceServiceError);
                expect((error as WorkspaceServiceError).code).toBe('NO_WORKSPACE_OPEN');
            }
        });

        test('should throw WorkspaceServiceError when workspace folders is empty', async () => {
            Object.defineProperty(mockWorkspace, 'isTrusted', {
                value: true,
                configurable: true
            });
            Object.defineProperty(mockWorkspace, 'workspaceFolders', {
                value: [],
                configurable: true
            });
            
            await expect(workspaceService.ensureWorkspaceTrustedAndOpen()).rejects.toThrow(WorkspaceServiceError);
            await expect(workspaceService.ensureWorkspaceTrustedAndOpen()).rejects.toThrow('No workspace folder is open. Please open a folder or workspace.');
        });
    });

    describe('WorkspaceServiceError', () => {
        test('should create error with code and message', () => {
            const error = new WorkspaceServiceError('TEST_CODE', 'Test error message');
            
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(WorkspaceServiceError);
            expect(error.code).toBe('TEST_CODE');
            expect(error.message).toBe('Test error message');
            expect(error.name).toBe('WorkspaceServiceError');
        });
    });
});