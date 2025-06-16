/**
 * @file fileSystemService.test.ts
 * @description Unit tests for the file system service functions.
 * @module ContextWeaver/VSCE/Tests
 */

// Mock vscode module before importing
const mockReadDirectory = jest.fn();
const mockReadFile = jest.fn();

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
      readFile: async (...args: any[]) => mockReadFile(...args),
    },
  },
  FileSystemError: MockFileSystemError
}), { virtual: true });

// Now import modules that use vscode
import * as vscode from 'vscode';
import * as path from 'path';
import { getDirectoryListing } from '../../src/fileSystemService';
import { DirectoryEntry } from '@contextweaver/shared';
import ignore from 'ignore';

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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should list files and folders correctly', async () => {
    mockReadDirectory.mockResolvedValueOnce([
      ['file1.ts', vscode.FileType.File],
      ['file2.js', vscode.FileType.File],
      ['subfolder', vscode.FileType.Directory],
    ]);

    mockReadFile.mockResolvedValueOnce(Buffer.from('')); // Empty .gitignore

    const result = await getDirectoryListing(mockFolderUri, mockWorkspaceFolder);

    expect(result.entries).toHaveLength(3);
    expect(result.entries).toEqual([
      {
        name: 'subfolder',
        type: 'folder',
        uri: 'file:///workspace/root/src/subfolder',
        content_source_id: 'file:///workspace/root/src/subfolder',
        windowId: '',
      },
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
    ]);
    expect(result.filterTypeApplied).toBe('gitignore');
  });

  it('should apply default ignore patterns', async () => {
    mockReadDirectory.mockResolvedValueOnce([
      ['file1.ts', vscode.FileType.File],
      ['node_modules', vscode.FileType.Directory],
      ['file.exe', vscode.FileType.File],
      ['.git', vscode.FileType.Directory],
    ]);

    mockReadFile.mockRejectedValueOnce(new MockFileSystemError('File not found')); // No .gitignore

    const result = await getDirectoryListing(mockFolderUri, mockWorkspaceFolder);

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
    mockReadDirectory.mockResolvedValueOnce([
      ['file1.ts', vscode.FileType.File],
      ['ignored-folder', vscode.FileType.Directory],
      ['ignored-file.txt', vscode.FileType.File],
    ]);

    mockReadFile.mockResolvedValueOnce(Buffer.from('ignored-folder/\nignored-file.txt')); // .gitignore content

    const result = await getDirectoryListing(mockFolderUri, mockWorkspaceFolder);

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
    mockReadFile.mockResolvedValueOnce(Buffer.from('')); // Empty .gitignore

    await expect(getDirectoryListing(mockFolderUri, mockWorkspaceFolder))
      .rejects
      .toThrow('Directory not found');
  });
});