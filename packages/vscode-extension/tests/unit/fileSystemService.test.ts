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
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'FileSystemError';
  }
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

// Mock the Logger
jest.mock('@contextweaver/shared', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn()
  }))
}));

// Now import modules that use vscode
import * as vscode from 'vscode';
import * as path from 'path';
import { 
  getDirectoryListing, 
  getFileTree, 
  getFileContentWithLanguageId,
  getFolderContentsForIPC,
  getWorkspaceDataForIPC,
  FileSystemService 
} from '../../src/core/services/FileSystemService';
import { DirectoryEntry, FilterType, FileData } from '@contextweaver/shared';
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
    mockReadDirectory.mockRejectedValueOnce(new MockFileSystemError('Directory not found', 'FileNotFound'));

    await expect(getDirectoryListing(mockFolderUri, mockWorkspaceFolder, mockEmptyFilter))
      .rejects
      .toThrow('Directory not found');
  });

  it('should handle nested directories correctly', async () => {
    // Mock the initial directory existence check
    mockReadDirectory.mockResolvedValueOnce([
      ['src', vscode.FileType.Directory],
      ['package.json', vscode.FileType.File],
    ]);
    // Mock the top-level directory read in _traverseDirectoryRecursive
    mockReadDirectory.mockResolvedValueOnce([
      ['src', vscode.FileType.Directory],
      ['package.json', vscode.FileType.File],
    ]);
    // Mock the recursive read for 'src' directory
    mockReadDirectory.mockResolvedValueOnce([
      ['index.ts', vscode.FileType.File],
      ['utils', vscode.FileType.Directory],
    ]);
    // Mock the recursive read for 'utils' directory
    mockReadDirectory.mockResolvedValueOnce([
      ['helper.ts', vscode.FileType.File],
    ]);

    const result = await getDirectoryListing(mockFolderUri, mockWorkspaceFolder, mockEmptyFilter);

    expect(result.entries).toHaveLength(5);
    const names = result.entries.map(e => e.name);
    expect(names).toContain('package.json');
    expect(names).toContain('index.ts');
    expect(names).toContain('helper.ts');
    expect(names).toContain('src');
    expect(names).toContain('utils');
  });

  it('should handle permission errors gracefully', async () => {
    mockReadDirectory.mockRejectedValueOnce(new Error('Permission denied'));

    await expect(getDirectoryListing(mockFolderUri, mockWorkspaceFolder, mockEmptyFilter))
      .rejects
      .toThrow('Permission denied');
  });
});

describe('getFileTree', () => {
  const mockWorkspaceFolder: vscode.WorkspaceFolder = {
    uri: {
      fsPath: '/workspace/project',
      toString: () => 'file:///workspace/project',
    } as vscode.Uri,
    name: 'test-project',
    index: 0,
  };

  const mockFilter = {
    filter: ignore(),
    type: 'none' as FilterType
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should generate a simple file tree', async () => {
    // Root directory
    mockReadDirectory.mockResolvedValueOnce([
      ['file1.ts', vscode.FileType.File],
      ['file2.js', vscode.FileType.File],
      ['folder1', vscode.FileType.Directory],
    ]);
    // folder1 directory (empty)
    mockReadDirectory.mockResolvedValueOnce([]);

    const result = await getFileTree(mockWorkspaceFolder, mockFilter);

    expect(typeof result).toBe('object');
    if (typeof result === 'object') {
      expect(result.tree).toContain('/workspace/project');
      expect(result.tree).toContain('├── folder1');
      expect(result.tree).toContain('├── file1.ts');
      expect(result.tree).toContain('└── file2.js');
      expect(result.filterTypeApplied).toBe('none');
    }
  });

  it('should handle nested directories in file tree', async () => {
    // Root directory
    mockReadDirectory.mockResolvedValueOnce([
      ['src', vscode.FileType.Directory],
      ['README.md', vscode.FileType.File],
    ]);
    // src directory
    mockReadDirectory.mockResolvedValueOnce([
      ['index.ts', vscode.FileType.File],
      ['components', vscode.FileType.Directory],
    ]);
    // components directory
    mockReadDirectory.mockResolvedValueOnce([
      ['Button.tsx', vscode.FileType.File],
    ]);

    const result = await getFileTree(mockWorkspaceFolder, mockFilter);

    if (typeof result === 'object') {
      expect(result.tree).toContain('├── src');
      expect(result.tree).toContain('│   ├── components');
      expect(result.tree).toContain('│   │   └── Button.tsx');
      expect(result.tree).toContain('│   └── index.ts');
      expect(result.tree).toContain('└── README.md');
    }
  });

  it('should handle file tree generation errors', async () => {
    mockReadDirectory.mockRejectedValueOnce(new Error('Read error'));

    const result = await getFileTree(mockWorkspaceFolder, mockFilter);

    expect(typeof result).toBe('string');
    expect(result).toContain('Error generating file tree');
  });

  it('should apply gitignore filter in file tree', async () => {
    const gitignoreFilter = {
      filter: ignore().add(['node_modules/', '*.log']),
      type: 'gitignore' as FilterType
    };

    // Root directory
    mockReadDirectory.mockResolvedValueOnce([
      ['src', vscode.FileType.Directory],
      ['node_modules', vscode.FileType.Directory],
      ['debug.log', vscode.FileType.File],
      ['index.js', vscode.FileType.File],
    ]);
    // src directory (empty)
    mockReadDirectory.mockResolvedValueOnce([]);

    const result = await getFileTree(mockWorkspaceFolder, gitignoreFilter);

    if (typeof result === 'object') {
      expect(result.tree).toContain('├── src');
      expect(result.tree).toContain('└── index.js');
      expect(result.tree).not.toContain('node_modules');
      expect(result.tree).not.toContain('debug.log');
      expect(result.filterTypeApplied).toBe('gitignore');
    }
  });
});

describe('getFileContentWithLanguageId', () => {
  const mockFileUri = {
    fsPath: '/workspace/project/src/index.ts',
    toString: () => 'file:///workspace/project/src/index.ts',
  } as vscode.Uri;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should read text file content and detect language', async () => {
    const fileContent = 'const hello = "world";\nconsole.log(hello);';
    const encoder = new TextEncoder();
    mockReadFile.mockResolvedValueOnce(encoder.encode(fileContent));

    const result = await getFileContentWithLanguageId(mockFileUri);

    expect(result).toEqual({
      fullPath: '/workspace/project/src/index.ts',
      content: fileContent,
      languageId: 'typescript',
    });
  });

  it('should detect binary files by null bytes', async () => {
    const binaryData = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x00, 0x0D, 0x0A]);
    mockReadFile.mockResolvedValueOnce(binaryData);

    const result = await getFileContentWithLanguageId(mockFileUri);

    expect(result).toBeNull();
  });

  it('should handle UTF-8 decoding errors', async () => {
    const invalidUtf8 = new Uint8Array([0xFF, 0xFE, 0xFD]);
    mockReadFile.mockResolvedValueOnce(invalidUtf8);

    const result = await getFileContentWithLanguageId(mockFileUri);

    expect(result).toBeNull();
  });

  it('should handle file not found errors', async () => {
    mockReadFile.mockRejectedValueOnce(new MockFileSystemError('File not found', 'FileNotFound'));

    await expect(getFileContentWithLanguageId(mockFileUri))
      .rejects
      .toThrow('File not found');
  });

  it('should handle permission errors', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('Permission denied'));

    const result = await getFileContentWithLanguageId(mockFileUri);

    expect(result).toBeNull();
  });

  it('should detect various language types', async () => {
    const testCases = [
      { path: '/test.js', expectedLang: 'javascript' },
      { path: '/test.py', expectedLang: 'python' },
      { path: '/test.java', expectedLang: 'java' },
      { path: '/test.rs', expectedLang: 'rust' },
      { path: '/test.go', expectedLang: 'go' },
      { path: '/test.rb', expectedLang: 'ruby' },
      { path: '/test.unknown', expectedLang: 'plaintext' },
    ];

    for (const { path, expectedLang } of testCases) {
      const uri = { fsPath: path, toString: () => `file://${path}` } as vscode.Uri;
      const encoder = new TextEncoder();
      mockReadFile.mockResolvedValueOnce(encoder.encode('test content'));

      const result = await getFileContentWithLanguageId(uri);

      expect(result?.languageId).toBe(expectedLang);
    }
  });
});

describe('getFolderContentsForIPC', () => {
  const mockWorkspaceFolder: vscode.WorkspaceFolder = {
    uri: {
      fsPath: '/workspace/project',
      toString: () => 'file:///workspace/project',
    } as vscode.Uri,
    name: 'test-project',
    index: 0,
  };

  const mockFolderUri = {
    fsPath: '/workspace/project/src',
    toString: () => 'file:///workspace/project/src',
  } as vscode.Uri;

  const mockFilter = {
    filter: ignore(),
    type: 'none' as FilterType
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should get all text files in folder', async () => {
    mockReadDirectory.mockResolvedValueOnce([
      ['file1.ts', vscode.FileType.File],
      ['file2.js', vscode.FileType.File],
      ['.gitignore', vscode.FileType.File], // Should be excluded
    ]);

    const encoder = new TextEncoder();
    mockReadFile
      .mockResolvedValueOnce(encoder.encode('content of file1'))
      .mockResolvedValueOnce(encoder.encode('content of file2'));

    const result = await getFolderContentsForIPC(mockFolderUri, mockWorkspaceFolder, mockFilter);

    expect(typeof result).toBe('object');
    if (typeof result === 'object') {
      expect(result.filesData).toHaveLength(2);
      expect(result.filesData[0]).toEqual({
        fullPath: '/workspace/project/src/file1.ts',
        content: 'content of file1',
        languageId: 'typescript',
      });
      expect(result.filesData[1]).toEqual({
        fullPath: '/workspace/project/src/file2.js',
        content: 'content of file2',
        languageId: 'javascript',
      });
      expect(result.filterTypeApplied).toBe('none');
    }
  });

  it('should handle recursive folder traversal', async () => {
    // Root folder
    mockReadDirectory.mockResolvedValueOnce([
      ['index.ts', vscode.FileType.File],
      ['utils', vscode.FileType.Directory],
    ]);
    // utils folder
    mockReadDirectory.mockResolvedValueOnce([
      ['helper.ts', vscode.FileType.File],
    ]);

    const encoder = new TextEncoder();
    mockReadFile
      .mockResolvedValueOnce(encoder.encode('index content'))
      .mockResolvedValueOnce(encoder.encode('helper content'));

    const result = await getFolderContentsForIPC(mockFolderUri, mockWorkspaceFolder, mockFilter);

    if (typeof result === 'object') {
      expect(result.filesData).toHaveLength(2);
      const fileNames = result.filesData.map(f => path.basename(f.fullPath));
      expect(fileNames).toContain('index.ts');
      expect(fileNames).toContain('helper.ts');
    }
  });

  it('should skip binary files', async () => {
    mockReadDirectory.mockResolvedValueOnce([
      ['text.txt', vscode.FileType.File],
      ['binary.exe', vscode.FileType.File],
    ]);

    const encoder = new TextEncoder();
    // Mock based on file path to ensure correct order
    mockReadFile.mockImplementation(async (uri) => {
      if (uri.fsPath.includes('text.txt')) {
        return encoder.encode('text content');
      } else if (uri.fsPath.includes('binary.exe')) {
        return new Uint8Array([0x4D, 0x5A, 0x00]); // Binary with null byte
      }
      return encoder.encode('');
    });

    const result = await getFolderContentsForIPC(mockFolderUri, mockWorkspaceFolder, mockFilter);

    if (typeof result === 'object') {
      expect(result.filesData).toHaveLength(1);
      expect(result.filesData[0].fullPath).toContain('text.txt');
    }
  });

  it('should handle errors gracefully', async () => {
    mockReadDirectory.mockRejectedValueOnce(new Error('Read error'));

    const result = await getFolderContentsForIPC(mockFolderUri, mockWorkspaceFolder, mockFilter);

    expect(typeof result).toBe('string');
    expect(result).toContain('Error getting contents');
  });
});

describe('getWorkspaceDataForIPC', () => {
  const mockWorkspaceFolder: vscode.WorkspaceFolder = {
    uri: {
      fsPath: '/workspace/project',
      toString: () => 'file:///workspace/project',
    } as vscode.Uri,
    name: 'test-project',
    index: 0,
  };

  const mockFilter = {
    filter: ignore(),
    type: 'none' as FilterType
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return complete workspace data', async () => {
    // Mock for getFolderContentsForIPC
    mockReadDirectory.mockResolvedValueOnce([
      ['index.ts', vscode.FileType.File],
    ]);
    const encoder = new TextEncoder();
    mockReadFile.mockResolvedValueOnce(encoder.encode('index content'));

    // Mock for getFileTree
    mockReadDirectory.mockResolvedValueOnce([
      ['index.ts', vscode.FileType.File],
    ]);

    const result = await getWorkspaceDataForIPC(mockWorkspaceFolder, mockFilter);

    expect(typeof result).toBe('object');
    if (typeof result === 'object') {
      expect(result.filesData).toHaveLength(1);
      expect(result.fileTreeString).toContain('/workspace/project');
      expect(result.fileTreeString).toContain('└── index.ts');
      expect(result.workspaceName).toBe('test-project');
      expect(result.filterTypeApplied).toBe('none');
      expect(result.projectPath).toBe('/workspace/project');
    }
  });

  it('should handle folder content errors', async () => {
    mockReadDirectory.mockRejectedValueOnce(new Error('Folder read error'));

    const result = await getWorkspaceDataForIPC(mockWorkspaceFolder, mockFilter);

    expect(typeof result).toBe('string');
    expect(result).toContain('Error getting contents');
  });

  it('should handle file tree errors', async () => {
    // Mock successful folder contents
    mockReadDirectory.mockResolvedValueOnce([]);
    
    // Mock file tree error
    mockReadDirectory.mockRejectedValueOnce(new Error('Tree generation error'));

    const result = await getWorkspaceDataForIPC(mockWorkspaceFolder, mockFilter);

    expect(typeof result).toBe('string');
    expect(result).toContain('Error generating file tree');
  });
});

describe('FileSystemService class', () => {
  let service: FileSystemService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FileSystemService();
  });

  it('should create a new instance', () => {
    expect(service).toBeInstanceOf(FileSystemService);
  });

  it('should have all required methods', () => {
    expect(service.getFileTree).toBeDefined();
    expect(service.getFileContentWithLanguageId).toBeDefined();
    expect(service.getFolderContentsForIPC).toBeDefined();
    expect(service.getDirectoryListing).toBeDefined();
    expect(service.getWorkspaceDataForIPC).toBeDefined();
  });
});
