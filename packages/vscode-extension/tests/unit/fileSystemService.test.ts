/**
 * @file fileSystemService.test.ts
 * @description Unit tests for the FileSystemService, focusing on getFolderContents functionality.
 * @module ContextWeaver/VSCE/Tests/Unit
 */

import * as vscode from 'vscode';
import * as path from 'path';
import ignore, { Ignore } from 'ignore';
import { parseGitignore, getFolderContents, getWorkspaceCodebaseContents, getFileTree } from '../../src/fileSystemService';

type FileResult = string | {
  tree: string;
  filterTypeApplied: 'default' | 'gitignore';
};

const fail = (msg: string) => { throw new Error(msg); };

function expectFileTreeResult(result: FileResult): asserts result is {
  tree: string;
  filterTypeApplied: 'default' | 'gitignore';
} {
  if (typeof result === 'string') {
    fail('Expected an object result, got string: ' + result);
  }
}

// Mock vscode module
jest.mock('vscode', () => {
  class FileSystemError extends Error {
    code?: string;
    constructor(message?: string, code?: string) {
      super(message);
      this.code = code;
    }
    static FileNotFound = () => new FileSystemError('File not found', 'FileNotFound');
  };

  const mockFsInternal = {
    readDirectory: jest.fn().mockReturnValue(Promise.resolve([])),
    readFile: jest.fn().mockReturnValue(Promise.resolve(new Uint8Array())),
  };

  const mockWorkspaceInternal = {
    fs: mockFsInternal,
  };

  return {
    workspace: mockWorkspaceInternal,
    Uri: {
      file: jest.fn(path => ({ scheme: 'file', path, fsPath: path })),
      joinPath: jest.fn((base, ...segments) => ({ scheme: base.scheme, path: path.join(base.path, ...segments), fsPath: path.join(base.fsPath, ...segments) })),
    },
    FileType: { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 },
    FileSystemError,
  };
}, { virtual: true });

// Mock ignore module
jest.mock('ignore', () => {
  const mockIgnore = jest.fn();
  mockIgnore.mockReturnValue({
    add: jest.fn().mockReturnThis(),
    ignores: jest.fn(),
  });
  return mockIgnore;
});

describe('fileSystemService', () => {
  const mockReadFile = vscode.workspace.fs.readFile as jest.Mock;
  const mockReadDirectory = vscode.workspace.fs.readDirectory as jest.Mock;
  const workspaceFolder: vscode.WorkspaceFolder = {
    uri: vscode.Uri.file('/test/workspace'),
    name: 'test-workspace',
    index: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseGitignore', () => {
    it('should return null if .gitignore file is empty', async () => {
      mockReadFile.mockResolvedValueOnce(Buffer.from(''));
      const result = await parseGitignore(workspaceFolder);
      expect(result).toBeNull();
    });

    it('should return Ignore instance if .gitignore has content', async () => {
      mockReadFile.mockResolvedValueOnce(Buffer.from('node_modules/\n*.log'));
      const result = await parseGitignore(workspaceFolder);
      expect(result).not.toBeNull();
      expect(ignore).toHaveBeenCalled();
    });

    it('should return null if .gitignore file not found', async () => {
      mockReadFile.mockRejectedValueOnce(vscode.FileSystemError.FileNotFound());
      const result = await parseGitignore(workspaceFolder);
      expect(result).toBeNull();
    });
  });

  describe('getFileTree', () => {
    beforeEach(() => {
      // Setup basic directory structure
      mockReadDirectory.mockImplementation(async (uri) => {
        if (uri.fsPath === '/test/workspace') {
          return [
            ['src', vscode.FileType.Directory],
            ['package.json', vscode.FileType.File],
          ];
        } else if (uri.fsPath === '/test/workspace/src') {
          return [
            ['index.ts', vscode.FileType.File],
            ['lib', vscode.FileType.Directory],
          ];
        } else if (uri.fsPath === '/test/workspace/src/lib') {
          return [
            ['utils.ts', vscode.FileType.File],
          ];
        }
        return [];
      });
    });

    it('should generate tree structure with filterTypeApplied', async () => {
      const result = await getFileTree(workspaceFolder);
      expectFileTreeResult(result);
      expect(result.filterTypeApplied).toBe('default');
      expect(result.tree).toContain('test-workspace');
      expect(result.tree).toContain('src');
      expect(result.tree).toContain('package.json');
    });

    it('should handle directory read errors', async () => {
      mockReadDirectory.mockRejectedValueOnce(vscode.FileSystemError.FileNotFound());
      const result = await getFileTree(workspaceFolder);
      expect(result).toContain('Error generating file tree');
    });
  });

  describe('getFolderContents', () => {
    const folderUri = vscode.Uri.file('/test/workspace/src');

    beforeEach(() => {
      mockReadDirectory.mockImplementation(async (uri) => {
        if (uri.fsPath === '/test/workspace/src') {
          return [
            ['index.ts', vscode.FileType.File],
            ['lib', vscode.FileType.Directory],
          ];
        } else if (uri.fsPath === '/test/workspace/src/lib') {
          return [
            ['utils.ts', vscode.FileType.File],
          ];
        }
        return [];
      });
    });

    it('should return tree structure with filterTypeApplied', async () => {
      const result = await getFolderContents(folderUri, workspaceFolder);
      expectFileTreeResult(result);
      expect(result.filterTypeApplied).toBe('default');
      expect(result.tree).toContain('index.ts');
      expect(result.tree).toContain('lib');
    });

    it('should handle directory read errors', async () => {
      mockReadDirectory.mockRejectedValueOnce(vscode.FileSystemError.FileNotFound());
      const result = await getFolderContents(folderUri, workspaceFolder);
      expect(result).toContain('Error getting contents for folder');
    });
  });

  describe('getWorkspaceCodebaseContents', () => {
    it('should return workspace-specific tree structure', async () => {
      mockReadDirectory.mockImplementation(async (uri) => {
        if (uri.fsPath === '/test/workspace') {
          return [
            ['src', vscode.FileType.Directory],
            ['package.json', vscode.FileType.File],
          ];
        }
        return [];
      });

      const result = await getWorkspaceCodebaseContents(workspaceFolder);
      expect(typeof result).not.toBe('string');
      if (typeof result !== 'string') {
        expect(result.workspaceName).toBe('test-workspace');
        expect(result.filterTypeApplied).toBe('default');
        expect(result.tree).toContain('src');
        expect(result.tree).toContain('package.json');
      }
    });

    it('should handle directory read errors', async () => {
      mockReadDirectory.mockRejectedValueOnce(vscode.FileSystemError.FileNotFound());
      const result = await getWorkspaceCodebaseContents(workspaceFolder);
      expect(result).toContain('Error getting contents for folder');
    });
  });
});
