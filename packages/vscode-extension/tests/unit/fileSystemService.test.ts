/**
 * @file fileSystemService.test.ts
 * @description Unit tests for the file system service functions.
 * @module ContextWeaver/VSCE/Tests
 */

// Mock vscode module before importing
const mockReadDirectory = jest.fn();

// Custom FileSystemError for testing
class MockFileSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileSystemError';
  }
  readonly code = 'FileNotFound';
}

// Mock the 'vscode' module to isolate file system functions for testing.
jest.mock('vscode', () => ({
  Uri: {
    joinPath: (uri: any, ...pathSegments: string[]) => ({
      ...uri,
      fsPath: require('path').join(uri.fsPath, ...pathSegments),
      toString: () => `file://${require('path').join(uri.fsPath, ...pathSegments)}`.replace(/\\/g, '/'),
    }),
  },
  FileType: {
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
  workspace: {
    fs: {
      readDirectory: async (...args: any[]) => mockReadDirectory(...args),
    },
  },
  FileSystemError: MockFileSystemError
}), { virtual: true });

// Now import modules that use vscode
import * as vscode from 'vscode';
import * as path from 'path';
import { getDirectoryListing } from '../../src/core/services/FileSystemService';
import { DirectoryEntry, FilterType } from '@contextweaver/shared';
import ignore, { Ignore } from 'ignore'; // Import Ignore type

describe('getDirectoryListing', () => {
  const mockWorkspaceFolder: vscode.WorkspaceFolder = {
    uri: {
      fsPath: '/workspace/root',
      toString: () => 'file:///workspace/root',
    } as vscode.Uri,
    name: 'test-workspace',
    index: 0,
  };

  const mockFolderUri = {
    fsPath: '/workspace/root/src',
    toString: () => 'file:///workspace/root/src',
  } as vscode.Uri;

  // Mock filter objects for testing
  const mockGitignoreFilter = {
    filter: ignore(),
    type: 'gitignore' as FilterType
  };

  const mockDefaultFilter = {
    filter: ignore().add(['node_modules/', '.git/', '*.log', '*.exe', '*.zip']),
    type: 'default' as FilterType
  };

  const mockEmptyFilter = {
    filter: ignore(),
    type: 'none' as FilterType
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should list files and folders correctly', async () => {
    // Mock the initial directory existence check
    mockReadDirectory.mockResolvedValueOnce([
      ['file1.ts', vscode.FileType.File],
      ['file2.js', vscode.FileType.File],
      ['subfolder', vscode.FileType.Directory],
    ]);
    // Mock the top-level directory read in _traverseDirectoryRecursive
    mockReadDirectory.mockResolvedValueOnce([
      ['file1.ts', vscode.FileType.File],
      ['file2.js', vscode.FileType.File],
      ['subfolder', vscode.FileType.Directory],
    ]);
    // Mock the recursive read for 'subfolder' to return an empty array
    mockReadDirectory.mockResolvedValueOnce([]);

    const result = await getDirectoryListing(mockFolderUri, mockWorkspaceFolder, mockGitignoreFilter);

    expect(result.entries).toHaveLength(3);
    expect(result.entries).toEqual([
      {
        name: 'file1.ts',
        type: 'file',
        uri: 'file:///workspace/root/src/file1.ts',
        content_source_id: 'file:///workspace/root/src/file1.ts',
        windowId: '',
      },
      {
        name: 'file2.js',
        type: 'file',
        uri: 'file:///workspace/root/src/file2.js',
        content_source_id: 'file:///workspace/root/src/file2.js',
        windowId: '',
      },
      {
        name: 'subfolder',
        type: 'folder',
        uri: 'file:///workspace/root/src/subfolder',
        content_source_id: 'file:///workspace/root/src/subfolder',
        windowId: '',
      },
    ]);
    expect(result.filterTypeApplied).toBe('gitignore');
  });

  it('should apply default ignore patterns', async () => {
    // Mock the initial directory existence check
    mockReadDirectory.mockResolvedValueOnce([
      ['file1.ts', vscode.FileType.File],
      ['node_modules', vscode.FileType.Directory],
      ['file.exe', vscode.FileType.File],
      ['.git', vscode.FileType.Directory],
    ]);
    // Mock the top-level directory read in _traverseDirectoryRecursive
    mockReadDirectory.mockResolvedValueOnce([
      ['file1.ts', vscode.FileType.File],
      ['node_modules', vscode.FileType.Directory],
      ['file.exe', vscode.FileType.File],
      ['.git', vscode.FileType.Directory],
    ]);

    const result = await getDirectoryListing(mockFolderUri, mockWorkspaceFolder, mockDefaultFilter);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toEqual({
      name: 'file1.ts',
      type: 'file',
      uri: 'file:///workspace/root/src/file1.ts',
      content_source_id: 'file:///workspace/root/src/file1.ts',
      windowId: '',
    });
    expect(result.filterTypeApplied).toBe('default');
  });

  it('should apply .gitignore rules', async () => {
    // Mock the initial directory existence check
    mockReadDirectory.mockResolvedValueOnce([
      ['file1.ts', vscode.FileType.File],
      ['ignored-folder', vscode.FileType.Directory],
      ['ignored-file.txt', vscode.FileType.File],
    ]);
    // Mock the top-level directory read in _traverseDirectoryRecursive
    mockReadDirectory.mockResolvedValueOnce([
      ['file1.ts', vscode.FileType.File],
      ['ignored-folder', vscode.FileType.Directory],
      ['ignored-file.txt', vscode.FileType.File],
    ]);
    
    const gitignoreFilter = {
      filter: ignore().add(['ignored-folder/', 'ignored-file.txt']),
      type: 'gitignore' as FilterType
    };

    const result = await getDirectoryListing(mockFolderUri, mockWorkspaceFolder, gitignoreFilter);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toEqual({
      name: 'file1.ts',
      type: 'file',
      uri: 'file:///workspace/root/src/file1.ts',
      content_source_id: 'file:///workspace/root/src/file1.ts',
      windowId: '',
    });
    expect(result.filterTypeApplied).toBe('gitignore');
  });

  it('should throw error for non-existent directory', async () => {
    mockReadDirectory.mockRejectedValueOnce(new MockFileSystemError('Directory not found'));

    await expect(getDirectoryListing(mockFolderUri, mockWorkspaceFolder, mockEmptyFilter))
      .rejects
      .toThrow('Directory not found');
  });
});
