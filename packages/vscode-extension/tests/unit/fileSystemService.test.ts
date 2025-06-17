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
import { getDirectoryListing, getPathIgnoreInfo } from '../../src/fileSystemService'; // Import getPathIgnoreInfo
import { DirectoryEntry } from '@contextweaver/shared';
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should list files and folders correctly', async () => {
    // Mock the top-level directory read
    mockReadDirectory.mockResolvedValueOnce([
      ['file1.ts', vscode.FileType.File],
      ['file2.js', vscode.FileType.File],
      ['subfolder', vscode.FileType.Directory],
    ]);
    // Mock the recursive read for 'subfolder' to return an empty array
    mockReadDirectory.mockResolvedValueOnce([]);

    mockReadFile.mockResolvedValueOnce(Buffer.from('')); // Empty .gitignore

    const result = await getDirectoryListing(mockFolderUri, mockWorkspaceFolder);

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

describe('getPathIgnoreInfo', () => {
  const defaultIgnorePatterns = [
    'node_modules/', '.git/', '*.log', '*.exe', '*.zip',
  ];
  const defaultIgnoreFilter = ignore().add(defaultIgnorePatterns);

  it('should ignore files by default patterns', () => {
    const info = getPathIgnoreInfo('path/to/file.log', false, null, defaultIgnoreFilter);
    expect(info).toEqual({ ignored: true, filterSource: 'default' });
  });

  it('should ignore folders by default patterns', () => {
    const info = getPathIgnoreInfo('path/to/node_modules', true, null, defaultIgnoreFilter);
    expect(info).toEqual({ ignored: true, filterSource: 'default' });
  });

  it('should not ignore files not matching default patterns', () => {
    const info = getPathIgnoreInfo('path/to/file.txt', false, null, defaultIgnoreFilter);
    expect(info).toEqual({ ignored: false, filterSource: 'none' });
  });

  it('should ignore files by gitignore patterns', () => {
    const gitignoreFilter = ignore().add('custom-ignored.txt');
    const info = getPathIgnoreInfo('path/to/custom-ignored.txt', false, gitignoreFilter, defaultIgnoreFilter);
    expect(info).toEqual({ ignored: true, filterSource: 'gitignore' });
  });

  it('should ignore folders by gitignore patterns', () => {
    const gitignoreFilter = ignore().add('custom-ignored-folder/');
    const info = getPathIgnoreInfo('path/to/custom-ignored-folder', true, gitignoreFilter, defaultIgnoreFilter);
    expect(info).toEqual({ ignored: true, filterSource: 'gitignore' });
  });

  it('should prioritize default ignore over gitignore if both match (though current implementation checks default first)', () => {
    const gitignoreFilter = ignore().add('node_modules/'); // Also in default
    const info = getPathIgnoreInfo('path/to/node_modules', true, gitignoreFilter, defaultIgnoreFilter);
    expect(info).toEqual({ ignored: true, filterSource: 'default' });
  });

  it('should handle nested paths correctly for default patterns', () => {
    const info = getPathIgnoreInfo('nested/folder/node_modules/sub', true, null, defaultIgnoreFilter);
    expect(info).toEqual({ ignored: true, filterSource: 'default' });
  });

  it('should handle nested paths correctly for gitignore patterns', () => {
    const gitignoreFilter = ignore().add('nested/folder/temp/');
    const info = getPathIgnoreInfo('nested/folder/temp/file.txt', false, gitignoreFilter, defaultIgnoreFilter);
    expect(info).toEqual({ ignored: true, filterSource: 'gitignore' });
  });

  it('should correctly handle files within ignored folders', () => {
    const gitignoreFilter = ignore().add('build/');
    const info = getPathIgnoreInfo('build/output/app.js', false, gitignoreFilter, defaultIgnoreFilter);
    expect(info).toEqual({ ignored: true, filterSource: 'gitignore' });
  });

  it('should return none if no filters match', () => {
    const gitignoreFilter = ignore(); // Empty gitignore
    const info = getPathIgnoreInfo('src/main.ts', false, gitignoreFilter, defaultIgnoreFilter);
    expect(info).toEqual({ ignored: false, filterSource: 'none' });
  });
});
