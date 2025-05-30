/**
 * @file workspaceService.test.ts
 * @description Unit tests for the WorkspaceService class.
 * @module ContextWeaver/VSCE/Tests/Unit
 */

import { WorkspaceService, WorkspaceServiceError } from '../../src/workspaceService';
import * as vscode from 'vscode'; // Keep the import for type usage

// Mock the vscode module
jest.mock('vscode', () => {
  // This object will store the current mock values that can be changed by tests
  const MOCK_STATE = {
    isTrusted: true, // Default value, tests can change this
    workspaceFolders: undefined as readonly vscode.WorkspaceFolder[] | undefined, // Default value
  };

  const mockWorkspaceInternal = {
    // Use a getter to return the current MOCK_STATE.isTrusted value
    get isTrusted() { return MOCK_STATE.isTrusted; },
    // Use a getter/setter for workspaceFolders to allow tests to modify it
    get workspaceFolders() { return MOCK_STATE.workspaceFolders; },
    set workspaceFolders(value: readonly vscode.WorkspaceFolder[] | undefined) {
      MOCK_STATE.workspaceFolders = value;
    },
    getWorkspaceFolder: jest.fn(), // This remains a simple mock function
  };

  const mockOutputChannelInternal = {
    appendLine: jest.fn(),
    append: jest.fn(),
    clear: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
    name: 'MockOutputChannel',
    replace: jest.fn(),
  };

  return {
    workspace: mockWorkspaceInternal,
    Uri: {
      parse: jest.fn(str => ({
        toString: () => str,
        fsPath: str.startsWith('file://') ? str.substring(7) : str
      })),
      file: jest.fn(path => ({
        toString: () => `file://${path}`,
        fsPath: path
      })),
    },
    window: {
      createOutputChannel: jest.fn().mockImplementation(() => mockOutputChannelInternal),
    },
    // Expose MOCK_STATE and the output channel mock for tests to manipulate/assert
    __MOCK_STATE: MOCK_STATE,
    __mockOutputChannelInternal: mockOutputChannelInternal,
  };
}, { virtual: true });

describe('WorkspaceService', () => {
  let workspaceService: WorkspaceService;
  let mockOutputChannelForAssertions: { [key: string]: jest.Mock | any }; // To assert calls on output channel methods

  // Access the internal mock state for direct manipulation in tests
  const actualVsCodeMock = vscode as any;
  const MOCK_STATE = actualVsCodeMock.__MOCK_STATE;

  beforeEach(() => {
    // Reset MOCK_STATE for isTrusted and workspaceFolders to defaults
    MOCK_STATE.isTrusted = true;
    MOCK_STATE.workspaceFolders = undefined;

    // Reset mock function calls on vscode.workspace methods
    (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReset();

    // Reset calls on the shared output channel mock methods
    mockOutputChannelForAssertions = actualVsCodeMock.__mockOutputChannelInternal;
    Object.values(mockOutputChannelForAssertions).forEach(mockFn => {
      if (typeof mockFn === 'function' && 'mockReset' in mockFn) {
        (mockFn as jest.Mock).mockReset();
      }
    });

    // The WorkspaceService will get the mockOutputChannelInternal via createOutputChannel
    const outputChannelInstance = vscode.window.createOutputChannel('TestChannel');
    workspaceService = new WorkspaceService(outputChannelInstance);
  });

  describe('isWorkspaceTrusted', () => {
    it('should return true when vscode.workspace.isTrusted is true', () => {
      MOCK_STATE.isTrusted = true;
      expect(workspaceService.isWorkspaceTrusted()).toBe(true);
      expect(mockOutputChannelForAssertions.appendLine).toHaveBeenCalledWith(expect.stringContaining('Workspace trusted: true'));
    });

    it('should return false when vscode.workspace.isTrusted is false', () => {
      MOCK_STATE.isTrusted = false;
      expect(workspaceService.isWorkspaceTrusted()).toBe(false);
      expect(mockOutputChannelForAssertions.appendLine).toHaveBeenCalledWith(expect.stringContaining('Workspace trusted: false'));
    });
  });

  describe('getWorkspaceFolders', () => {
    it('should return undefined if vscode.workspace.workspaceFolders is undefined', () => {
      MOCK_STATE.workspaceFolders = undefined;
      expect(workspaceService.getWorkspaceFolders()).toBeUndefined();
      expect(mockOutputChannelForAssertions.appendLine).toHaveBeenCalledWith(expect.stringContaining('No workspace folders found.'));
    });

    it('should return an empty array if vscode.workspace.workspaceFolders is an empty array', () => {
      MOCK_STATE.workspaceFolders = [];
      expect(workspaceService.getWorkspaceFolders()).toEqual([]);
      expect(mockOutputChannelForAssertions.appendLine).toHaveBeenCalledWith(expect.stringContaining('No workspace folders found.'));
    });

    it('should return workspace folders if they exist', () => {
      const mockFolders = [
        { uri: vscode.Uri.file('/project/folder1'), name: 'folder1', index: 0 },
        { uri: vscode.Uri.file('/project/folder2'), name: 'folder2', index: 1 },
      ] as readonly vscode.WorkspaceFolder[];
      MOCK_STATE.workspaceFolders = mockFolders;
      expect(workspaceService.getWorkspaceFolders()).toEqual(mockFolders);
      expect(mockOutputChannelForAssertions.appendLine).toHaveBeenCalledWith(expect.stringContaining(`Found ${mockFolders.length} workspace folder(s).`));
    });
  });

  describe('getWorkspaceFolder', () => {
    const testUri = vscode.Uri.file('/project/folder1');
    const mockFolder = { uri: testUri, name: 'folder1', index: 0 } as vscode.WorkspaceFolder;

    it('should return the workspace folder if found', () => {
      (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(mockFolder);
      expect(workspaceService.getWorkspaceFolder(testUri)).toEqual(mockFolder);
      expect(vscode.workspace.getWorkspaceFolder).toHaveBeenCalledWith(testUri);
      expect(mockOutputChannelForAssertions.appendLine).toHaveBeenCalledWith(expect.stringContaining(`Workspace folder found for URI ${testUri.toString()}: folder1`));
    });

    it('should return undefined if workspace folder is not found', () => {
      (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(undefined);
      expect(workspaceService.getWorkspaceFolder(testUri)).toBeUndefined();
      expect(vscode.workspace.getWorkspaceFolder).toHaveBeenCalledWith(testUri);
      expect(mockOutputChannelForAssertions.appendLine).toHaveBeenCalledWith(expect.stringContaining(`No workspace folder found for URI ${testUri.toString()}`));
    });
  });

  describe('getWorkspaceDetailsForIPC', () => {
    it('should return null if no workspace folders are open (undefined)', () => {
      MOCK_STATE.workspaceFolders = undefined;
      expect(workspaceService.getWorkspaceDetailsForIPC()).toBeNull();
      expect(mockOutputChannelForAssertions.appendLine).toHaveBeenCalledWith(expect.stringContaining('No workspace open, returning null for IPC details.'));
    });

    it('should return null if workspace folders array is empty', () => {
      MOCK_STATE.workspaceFolders = [];
      expect(workspaceService.getWorkspaceDetailsForIPC()).toBeNull();
      expect(mockOutputChannelForAssertions.appendLine).toHaveBeenCalledWith(expect.stringContaining('No workspace open, returning null for IPC details.'));
    });

    it('should return folder details with overall trust status (trusted)', () => {
      const folderUri1 = vscode.Uri.file('/project/folder1');
      const folderUri2 = vscode.Uri.file('/project/folder2');
      const mockFolders = [
        { uri: folderUri1, name: 'folder1', index: 0 },
        { uri: folderUri2, name: 'folder2', index: 1 },
      ] as readonly vscode.WorkspaceFolder[];
      MOCK_STATE.workspaceFolders = mockFolders;
      MOCK_STATE.isTrusted = true;

      const expectedDetails = [
        { uri: folderUri1.toString(), name: 'folder1', isTrusted: true },
        { uri: folderUri2.toString(), name: 'folder2', isTrusted: true },
      ];
      expect(workspaceService.getWorkspaceDetailsForIPC()).toEqual(expectedDetails);
    });

    it('should return folder details with overall trust status (not trusted)', () => {
      const folderUri1 = vscode.Uri.file('/project/folder1');
      const mockFolders = [{ uri: folderUri1, name: 'folder1', index: 0 }] as readonly vscode.WorkspaceFolder[];
      MOCK_STATE.workspaceFolders = mockFolders;
      MOCK_STATE.isTrusted = false;

      const expectedDetails = [
        { uri: folderUri1.toString(), name: 'folder1', isTrusted: false },
      ];
      expect(workspaceService.getWorkspaceDetailsForIPC()).toEqual(expectedDetails);
    });
  });

  describe('ensureWorkspaceTrustedAndOpen', () => {
    it('should throw WorkspaceServiceError if workspace is not trusted', async () => {
      MOCK_STATE.isTrusted = false;
      MOCK_STATE.workspaceFolders = [{ uri: vscode.Uri.file('/project/folder1'), name: 'folder1', index: 0 }] as readonly vscode.WorkspaceFolder[];

      await expect(workspaceService.ensureWorkspaceTrustedAndOpen()).rejects.toThrow(WorkspaceServiceError);
      await expect(workspaceService.ensureWorkspaceTrustedAndOpen()).rejects.toMatchObject({
        code: 'WORKSPACE_NOT_TRUSTED',
        message: 'Workspace is not trusted. Please trust the workspace to use this feature.',
      });
      expect(mockOutputChannelForAssertions.appendLine).toHaveBeenCalledWith(expect.stringContaining('Error: Workspace is not trusted.'));
    });

    it('should throw WorkspaceServiceError if no workspace folders are open (undefined)', async () => {
      MOCK_STATE.isTrusted = true;
      MOCK_STATE.workspaceFolders = undefined;

      await expect(workspaceService.ensureWorkspaceTrustedAndOpen()).rejects.toThrow(WorkspaceServiceError);
      await expect(workspaceService.ensureWorkspaceTrustedAndOpen()).rejects.toMatchObject({
        code: 'NO_WORKSPACE_OPEN',
        message: 'No workspace folder is open. Please open a folder or workspace.',
      });
      expect(mockOutputChannelForAssertions.appendLine).toHaveBeenCalledWith(expect.stringContaining('Error: No workspace folder is open.'));
    });

    it('should throw WorkspaceServiceError if workspace folders array is empty', async () => {
      MOCK_STATE.isTrusted = true;
      MOCK_STATE.workspaceFolders = [];

      await expect(workspaceService.ensureWorkspaceTrustedAndOpen()).rejects.toThrow(WorkspaceServiceError);
      await expect(workspaceService.ensureWorkspaceTrustedAndOpen()).rejects.toMatchObject({
        code: 'NO_WORKSPACE_OPEN',
        message: 'No workspace folder is open. Please open a folder or workspace.',
      });
      expect(mockOutputChannelForAssertions.appendLine).toHaveBeenCalledWith(expect.stringContaining('Error: No workspace folder is open.'));
    });

    it('should resolve if workspace is trusted and folders are open', async () => {
      MOCK_STATE.isTrusted = true;
      MOCK_STATE.workspaceFolders = [{ uri: vscode.Uri.file('/project/folder1'), name: 'folder1', index: 0 }] as readonly vscode.WorkspaceFolder[];

      await expect(workspaceService.ensureWorkspaceTrustedAndOpen()).resolves.toBeUndefined();
    });
  });
});