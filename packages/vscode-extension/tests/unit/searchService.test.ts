/**
 * @file searchService.test.ts
 * @description Unit tests for the SearchService.
 * @module ContextWeaver/VSCE/Tests
 */

// Import path and types first
import * as path from 'path';
import type { Ignore } from 'ignore';
import type * as vscode from 'vscode'; // Only for type annotations

// --- Start of explicit mock setup BEFORE importing the module under test ---

// Helper for creating Uri instances for the mock
const createMockUri = (fsPathVal: string, schemeVal: string = 'file'): vscode.Uri => ({
    fsPath: fsPathVal,
    path: fsPathVal.replace(/\\\\/g, '/'), // Adjusted for double backslashes from previous read
    scheme: schemeVal,
    toString: jest.fn(() => `${schemeVal}://${fsPathVal.replace(/\\\\/g, '/')}`.replace(/\\/g, '/')), // Adjusted
    with: jest.fn().mockImplementation((change) => createMockUri(change.path || fsPathVal, change.scheme || schemeVal)),
} as any as vscode.Uri);

const mockJoinPathImplementation = (base: vscode.Uri, ...paths: string[]): vscode.Uri => {
    const joinedFsPath = path.join(base.fsPath, ...paths);
    return createMockUri(joinedFsPath, base.scheme);
};

const mockParseImplementation = (uriString: string, strict?: boolean): vscode.Uri => {
    let fsPath = uriString;
    let scheme = 'file';
    const schemeMatch = uriString.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
    if (schemeMatch) {
        scheme = schemeMatch[1];
        fsPath = uriString.substring(schemeMatch[0].length);
        if (scheme === 'file' && fsPath.startsWith('/') && fsPath.length > 2 && fsPath[2] === ':') { // Handle file:///C:/
            fsPath = fsPath.substring(1);
        } else if (scheme === 'file' && fsPath.length > 1 && fsPath[1] === ':') { // Handle C:/
             // No change needed if it's already like C:/path
        }
    }
    fsPath = path.normalize(fsPath);
    return createMockUri(fsPath, scheme);
};


const mockFileImplementation = (filePath: string): vscode.Uri => {
    const normalizedPath = path.normalize(filePath);
    return createMockUri(normalizedPath);
};

// Declare ALL mock functions that will be used by the vscode mock factory
const vscodeUriJoinPathMock = jest.fn(mockJoinPathImplementation);
const vscodeUriParseMock = jest.fn(mockParseImplementation);
const vscodeUriFileMock = jest.fn(mockFileImplementation);

const vscodeWorkspaceFsReadDirectoryMock = jest.fn();
const vscodeWorkspaceFsStatMock = jest.fn();
const vscodeWorkspaceFsReadFileMock = jest.fn();

const vscodeOutputChannelMockInstance = {
    appendLine: jest.fn(),
    clear: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
    name: 'mockOutputChannelInstance_from_vscode_mock',
    replace: jest.fn(),
    append: jest.fn(),
};

// Use jest.doMock for 'vscode' as it's not hoisted
jest.doMock('vscode', () => ({
  workspace: {
    fs: {
      readDirectory: vscodeWorkspaceFsReadDirectoryMock,
      stat: vscodeWorkspaceFsStatMock,
      readFile: vscodeWorkspaceFsReadFileMock,
    },
  },
  Uri: {
    joinPath: vscodeUriJoinPathMock,
    parse: vscodeUriParseMock,
    file: vscodeUriFileMock,
  },
  // This is how vscode.createOutputChannel would be mocked
  createOutputChannel: jest.fn(() => vscodeOutputChannelMockInstance), 
  FileType: {
    File: 1,
    Directory: 2,
    Unknown: 0,
    SymbolicLink: 64,
  },
}), { virtual: true });


// Mock WorkspaceService
const mockWorkspaceServiceInstance = {
  getWorkspaceFolder: jest.fn(),
  getWorkspaceFolders: jest.fn(),
};
jest.doMock('../../src/workspaceService', () => ({
  WorkspaceService: jest.fn(() => mockWorkspaceServiceInstance),
}));

// Mock fileSystemService (specifically parseGitignore)
const mockParseGitignore = jest.fn();
jest.doMock('../../src/fileSystemService', () => ({
  parseGitignore: mockParseGitignore,
}));

// Mock 'ignore' library
const mockIgnoreInstance = {
  add: jest.fn().mockReturnThis(),
  ignores: jest.fn().mockReturnValue(false),
};
jest.doMock('ignore', () => ({
  __esModule: true,
  default: jest.fn(() => mockIgnoreInstance),
}));

// --- End of explicit mock setup ---

// Now, import the modules that use the mocked dependencies
import { SearchService, SearchResult } from '../../src/searchService';
import { WorkspaceService } from '../../src/workspaceService'; // Will be the mocked version
// vscode is already globally mocked by jest.doMock

describe('SearchService', () => {
  let searchService: SearchService;
  let mockActualOutputChannel: vscode.OutputChannel; // This is the channel instance passed to SearchService
  let vscodeMock: typeof vscode; // To access the mocked vscode namespace

  beforeEach(async () => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    vscodeMock = await import('vscode');


    mockActualOutputChannel = {
        appendLine: jest.fn(),
        clear: jest.fn(), show: jest.fn(), hide: jest.fn(), dispose: jest.fn(), name: 'SearchServiceOutputChannel', replace: jest.fn(), append: jest.fn()
    } as any as vscode.OutputChannel;
    
    (WorkspaceService as jest.Mock).mockImplementation(() => mockWorkspaceServiceInstance);
    const actualWorkspaceService = new WorkspaceService(mockActualOutputChannel); 

    searchService = new SearchService(mockActualOutputChannel, actualWorkspaceService);

    vscodeUriJoinPathMock.mockImplementation(mockJoinPathImplementation);
    vscodeUriParseMock.mockImplementation(mockParseImplementation);
    vscodeUriFileMock.mockImplementation(mockFileImplementation);
    
    mockParseGitignore.mockResolvedValue(null);
    mockWorkspaceServiceInstance.getWorkspaceFolders.mockReturnValue([]);
    mockWorkspaceServiceInstance.getWorkspaceFolder.mockReturnValue(undefined);
    
    (require('ignore') as any).default.mockReturnValue(mockIgnoreInstance);
    mockIgnoreInstance.ignores.mockReturnValue(false);
    mockIgnoreInstance.add.mockClear();
  });

  test('should be defined', () => {
    expect(searchService).toBeDefined();
  });

  describe('search', () => {
    test('should return an empty array if query is empty or whitespace', async () => {
      const resultsEmpty = await searchService.search('');
      expect(resultsEmpty).toEqual([]);
      expect(mockActualOutputChannel.appendLine).not.toHaveBeenCalledWith(expect.stringContaining('Searching for'));

      const resultsWhitespace = await searchService.search('   ');
      expect(resultsWhitespace).toEqual([]);
      expect(mockActualOutputChannel.appendLine).not.toHaveBeenCalledWith(expect.stringContaining('Searching for'));
    });

    test('should return an empty array if no workspace folders are available', async () => {
      mockWorkspaceServiceInstance.getWorkspaceFolders.mockReturnValue([]);
      const results = await searchService.search('testQuery');
      expect(results).toEqual([]);
      expect(mockActualOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('No workspace folders to search in.'));
    });
    
    test('should return empty array if specific workspace folder for search is not found', async () => {
        const specificUriInputString = 'C:/non_existent_ws';
        const specificUri = vscodeMock.Uri.file(specificUriInputString); 
        mockWorkspaceServiceInstance.getWorkspaceFolder.mockReturnValue(undefined);

        const results = await searchService.search('testQuery', specificUri);

        expect(results).toEqual([]);
        expect(mockWorkspaceServiceInstance.getWorkspaceFolder).toHaveBeenCalledWith(specificUri);
        expect(mockActualOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`Warning: Specified workspace folder for search not found: ${specificUri.toString()}`));
    });

    test('should find a file in a single workspace folder', async () => {
      const mockWorkspaceUriString = 'file:///C:/test/project';
      const mockWorkspaceFolder = {
        uri: vscodeMock.Uri.parse(mockWorkspaceUriString), 
        name: 'project',
        index: 0
      };
      mockWorkspaceServiceInstance.getWorkspaceFolders.mockReturnValue([mockWorkspaceFolder]);
      mockWorkspaceServiceInstance.getWorkspaceFolder.mockImplementation((uri) => 
        uri.toString() === mockWorkspaceUriString ? mockWorkspaceFolder : undefined
      );

      const query = 'file1';
      const fileEntryUri = vscodeMock.Uri.joinPath(mockWorkspaceFolder.uri, 'file1.txt'); 

      vscodeWorkspaceFsReadDirectoryMock.mockImplementation(async (uri: vscode.Uri) => { 
        if (uri.toString() === mockWorkspaceFolder.uri.toString()) {
          return [
            ['file1.txt', vscodeMock.FileType.File],
            ['another.txt', vscodeMock.FileType.File],
          ];
        }
        return [];
      });

      const results = await searchService.search(query);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(expect.objectContaining({
        name: 'file1.txt',
        type: 'file',
        path: fileEntryUri.fsPath,
        uri: fileEntryUri.toString(),
        content_source_id: fileEntryUri.toString(),
        workspaceFolderUri: mockWorkspaceFolder.uri.toString(),
        workspaceFolderName: mockWorkspaceFolder.name,
        filterTypeApplied: 'default',
      }));
      expect(mockParseGitignore).toHaveBeenCalledWith(mockWorkspaceFolder);
      expect(mockActualOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`Found 1 results for query '${query}'`));
    });

    test('should find a folder in a single workspace folder', async () => {
      const mockWorkspaceUriString = 'file:///C:/test/project';
      const mockWorkspaceFolder = {
        uri: vscodeMock.Uri.parse(mockWorkspaceUriString), 
        name: 'project',
        index: 0
      };
      mockWorkspaceServiceInstance.getWorkspaceFolders.mockReturnValue([mockWorkspaceFolder]);

      const query = 'folderA';
      const folderEntryUri = vscodeMock.Uri.joinPath(mockWorkspaceFolder.uri, 'folderA'); 

      vscodeWorkspaceFsReadDirectoryMock.mockImplementation(async (uri: vscode.Uri) => { 
        if (uri.toString() === mockWorkspaceFolder.uri.toString()) {
          return [
            ['file1.txt', vscodeMock.FileType.File],
            ['folderA', vscodeMock.FileType.Directory],
          ];
        }
        if (uri.toString() === folderEntryUri.toString()) {
            return [];
        }
        return [];
      });

      const results = await searchService.search(query);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(expect.objectContaining({
        name: 'folderA',
        type: 'folder',
        path: folderEntryUri.fsPath,
        uri: folderEntryUri.toString(),
        content_source_id: folderEntryUri.toString(),
        workspaceFolderUri: mockWorkspaceFolder.uri.toString(),
        workspaceFolderName: mockWorkspaceFolder.name,
        filterTypeApplied: 'default',
      }));
      expect(mockParseGitignore).toHaveBeenCalledWith(mockWorkspaceFolder);
    });

    test('should return empty array if query does not match any items', async () => {
      const mockWorkspaceUriString = 'file:///C:/test/project';
      const mockWorkspaceFolder = {
        uri: vscodeMock.Uri.parse(mockWorkspaceUriString), 
        name: 'project',
        index: 0
      };
      mockWorkspaceServiceInstance.getWorkspaceFolders.mockReturnValue([mockWorkspaceFolder]);

      vscodeWorkspaceFsReadDirectoryMock.mockImplementation(async (uri: vscode.Uri) => { 
        if (uri.toString() === mockWorkspaceFolder.uri.toString()) {
          return [
            ['file1.txt', vscodeMock.FileType.File],
            ['folderA', vscodeMock.FileType.Directory],
          ];
        }
        return [];
      });

      const results = await searchService.search('nonExistentQuery');
      expect(results).toHaveLength(0);
      expect(mockActualOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining("Found 0 results for query 'nonExistentQuery'"));
    });

    test('should find items recursively in subdirectories', async () => {
      const mockWorkspaceUriString = 'file:///C:/test/project';
      const mockWorkspaceFolder = {
        uri: vscodeMock.Uri.parse(mockWorkspaceUriString), 
        name: 'project',
        index: 0
      };
      mockWorkspaceServiceInstance.getWorkspaceFolders.mockReturnValue([mockWorkspaceFolder]);

      const query = 'target';
      const subDirUri = vscodeMock.Uri.joinPath(mockWorkspaceFolder.uri, 'subDir'); 
      const targetFileUri = vscodeMock.Uri.joinPath(subDirUri, 'targetFile.txt'); 
      const targetFolderUri = vscodeMock.Uri.joinPath(subDirUri, 'targetFolder'); 

      vscodeWorkspaceFsReadDirectoryMock.mockImplementation(async (uri: vscode.Uri) => { 
        const uriStr = uri.toString();
        if (uriStr === mockWorkspaceFolder.uri.toString()) {
          return [
            ['file1.txt', vscodeMock.FileType.File],
            ['subDir', vscodeMock.FileType.Directory],
          ];
        }
        if (uriStr === subDirUri.toString()) {
          return [
            ['targetFile.txt', vscodeMock.FileType.File],
            ['targetFolder', vscodeMock.FileType.Directory],
            ['another.md', vscodeMock.FileType.File],
          ];
        }
        if (uriStr === targetFolderUri.toString()) {
            return [['nestedTarget.js', vscodeMock.FileType.File]];
        }
        return [];
      });

      const results = await searchService.search(query);

      expect(results).toHaveLength(3);
      expect(results).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'targetFile.txt', type: 'file', path: targetFileUri.fsPath }),
        expect.objectContaining({ name: 'targetFolder', type: 'folder', path: targetFolderUri.fsPath }),
        expect.objectContaining({ name: 'nestedTarget.js', type: 'file', path: vscodeMock.Uri.joinPath(targetFolderUri, 'nestedTarget.js').fsPath }), 
      ]));
    });

    test('should perform case-insensitive search', async () => {
      const mockWorkspaceUriString = 'file:///C:/test/project';
      const mockWorkspaceFolder = {
        uri: vscodeMock.Uri.parse(mockWorkspaceUriString), 
        name: 'project',
        index: 0
      };
      mockWorkspaceServiceInstance.getWorkspaceFolders.mockReturnValue([mockWorkspaceFolder]);

      const query = 'FiLe1'; 
      const fileEntryUri = vscodeMock.Uri.joinPath(mockWorkspaceFolder.uri, 'file1.txt'); 

      vscodeWorkspaceFsReadDirectoryMock.mockImplementation(async (uri: vscode.Uri) => { 
        if (uri.toString() === mockWorkspaceFolder.uri.toString()) {
          return [
            ['file1.txt', vscodeMock.FileType.File], 
            ['anotherFile.txt', vscodeMock.FileType.File],
          ];
        }
        return [];
      });

      const results = await searchService.search(query);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(expect.objectContaining({
        name: 'file1.txt',
        type: 'file',
        path: fileEntryUri.fsPath,
      }));
    });

    test('should apply default ignore patterns', async () => {
      const mockWorkspaceUriString = 'file:///C:/test/project';
      const mockWorkspaceFolder = {
        uri: vscodeMock.Uri.parse(mockWorkspaceUriString), 
        name: 'project',
        index: 0
      };
      mockWorkspaceServiceInstance.getWorkspaceFolders.mockReturnValue([mockWorkspaceFolder]);
      mockParseGitignore.mockResolvedValue(null); 

      const query = 'file'; 
      const nodeModulesUri = vscodeMock.Uri.joinPath(mockWorkspaceFolder.uri, 'node_modules'); 
      const distUri = vscodeMock.Uri.joinPath(mockWorkspaceFolder.uri, 'dist'); 
      const srcDirUri = vscodeMock.Uri.joinPath(mockWorkspaceFolder.uri, 'src'); 
      const gitDirUri = vscodeMock.Uri.joinPath(mockWorkspaceFolder.uri, '.git'); 


      vscodeWorkspaceFsReadDirectoryMock.mockImplementation(async (uri: vscode.Uri) => { 
        const uriStr = uri.toString();
        if (uriStr === mockWorkspaceFolder.uri.toString()) {
          return [
            ['fileA.txt', vscodeMock.FileType.File],
            ['node_modules', vscodeMock.FileType.Directory],
            ['dist', vscodeMock.FileType.Directory],
            ['.git', vscodeMock.FileType.Directory],
            ['src', vscodeMock.FileType.Directory],
          ];
        }
        if (uriStr === nodeModulesUri.toString()) {
          return [['ignoredFile.js', vscodeMock.FileType.File]];
        }
        if (uriStr === distUri.toString()) {
          return [['anotherIgnoredFile.js', vscodeMock.FileType.File]];
        }
        if (uriStr === srcDirUri.toString()) {
          return [['sourceFile.ts', vscodeMock.FileType.File]];
        }
        if (uriStr === gitDirUri.toString()) {
          return [['gitFile.txt', vscodeMock.FileType.File]];
        }
        return [];
      });

      const results = await searchService.search(query);
      
      expect(results).toHaveLength(2); 
      expect(results).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'fileA.txt', filterTypeApplied: 'default' }),
        expect.objectContaining({ name: 'sourceFile.ts', filterTypeApplied: 'default' }),
      ]));

      const foundIgnored = results.some(r => 
        r.path.includes('node_modules') || 
        r.path.includes('dist') ||
        r.path.includes('.git')
      );
      expect(foundIgnored).toBe(false);
    });

    test('should apply .gitignore rules if gitignore is parsed', async () => {
      const mockWorkspaceUriString = 'file:///C:/test/project';
      const mockWorkspaceFolder = {
        uri: vscodeMock.Uri.parse(mockWorkspaceUriString), 
        name: 'project',
        index: 0
      };
      mockWorkspaceServiceInstance.getWorkspaceFolders.mockReturnValue([mockWorkspaceFolder]);

      const mockGitignoreInstanceForTest = { 
        add: jest.fn().mockReturnThis(),
        ignores: jest.fn((p: string) => {
          // Simulate ignore library behavior for directories: 'dist/' pattern should ignore 'dist' path
          // Accessing 'patterns' property via 'any' to bypass TypeScript error for this mock-specific property
          if (p === 'dist' && ((mockGitignoreInstanceForTest as any).patterns as string[]).includes('dist/')) return true;
          return p === 'ignoredByGit.txt' || p === 'dist/' || p.startsWith('dist/') || p === 'anotherDir/toIgnore.md';
        }),
        patterns: ['ignoredByGit.txt', 'dist/', 'anotherDir/toIgnore.md'], // Store patterns for the mock to check
      } as unknown as Ignore; // Still cast to Ignore for the parts that match the interface
      mockParseGitignore.mockResolvedValue(mockGitignoreInstanceForTest);
      (require('ignore') as any).default.mockImplementation(() => mockGitignoreInstanceForTest);


      const query = 'file'; 
      const distUri = vscodeMock.Uri.joinPath(mockWorkspaceFolder.uri, 'dist'); 
      const anotherDirUri = vscodeMock.Uri.joinPath(mockWorkspaceFolder.uri, 'anotherDir'); 
      const srcDirUri = vscodeMock.Uri.joinPath(mockWorkspaceFolder.uri, 'src'); 

      vscodeWorkspaceFsReadDirectoryMock.mockImplementation(async (uri: vscode.Uri) => { 
        const uriStr = uri.toString();
        if (uriStr === mockWorkspaceFolder.uri.toString()) {
          return [
            ['fileKept.txt', vscodeMock.FileType.File],
            ['ignoredByGit.txt', vscodeMock.FileType.File],
            ['dist', vscodeMock.FileType.Directory], 
            ['anotherDir', vscodeMock.FileType.Directory],
            ['src', vscodeMock.FileType.Directory],
          ];
        }
        if (uriStr === distUri.toString()) { 
          return [['somefile.js', vscodeMock.FileType.File]];
        }
        if (uriStr === anotherDirUri.toString()) {
            return [['toIgnore.md', vscodeMock.FileType.File], ['keptInAnother.txt', vscodeMock.FileType.File]];
        }
        if (uriStr === srcDirUri.toString()) {
          return [['sourceFile.ts', vscodeMock.FileType.File]];
        }
        return [];
      });

      const results = await searchService.search(query);
      
      expect(results).toHaveLength(2); // fileKept.txt, sourceFile.ts. keptInAnother.txt does not match 'file'
      expect(results).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'fileKept.txt', filterTypeApplied: 'gitignore' }),
        expect.objectContaining({ name: 'sourceFile.ts', filterTypeApplied: 'gitignore' }),
        // expect.objectContaining({ name: 'keptInAnother.txt', filterTypeApplied: 'gitignore' }), // This was incorrect for query 'file'
      ]));

      const foundIgnored = results.some(r => 
        r.name === 'ignoredByGit.txt' || 
        r.path.includes('/dist/') || // Check for path inclusion for 'dist'
        r.name === 'toIgnore.md'
      );
      expect(foundIgnored).toBe(false);
      expect(mockParseGitignore).toHaveBeenCalledWith(mockWorkspaceFolder);
    });

    test('should search across multiple workspace folders', async () => {
      const mockWorkspace1UriString = 'file:///C:/test/project1';
      const mockWorkspaceFolder1 = {
        uri: vscodeMock.Uri.parse(mockWorkspace1UriString), 
        name: 'project1',
        index: 0
      };
      const mockWorkspace2UriString = 'file:///C:/test/project2';
      const mockWorkspaceFolder2 = {
        uri: vscodeMock.Uri.parse(mockWorkspace2UriString), 
        name: 'project2',
        index: 1
      };
      mockWorkspaceServiceInstance.getWorkspaceFolders.mockReturnValue([mockWorkspaceFolder1, mockWorkspaceFolder2]);

      const query = 'common';
      
      vscodeWorkspaceFsReadDirectoryMock.mockImplementation(async (uri: vscode.Uri) => { 
        const uriStr = uri.toString();
        if (uriStr === mockWorkspaceFolder1.uri.toString()) {
          return [['commonFile.txt', vscodeMock.FileType.File]];
        }
        if (uriStr === mockWorkspaceFolder2.uri.toString()) {
          return [['commonItem.md', vscodeMock.FileType.File]];
        }
        return [];
      });

      mockParseGitignore.mockResolvedValue(null);

      const results = await searchService.search(query);

      expect(results).toHaveLength(2);
      expect(results).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'commonFile.txt', workspaceFolderUri: mockWorkspaceFolder1.uri.toString() }),
        expect.objectContaining({ name: 'commonItem.md', workspaceFolderUri: mockWorkspaceFolder2.uri.toString() }),
      ]));
      expect(mockParseGitignore).toHaveBeenCalledWith(mockWorkspaceFolder1);
      expect(mockParseGitignore).toHaveBeenCalledWith(mockWorkspaceFolder2);
      expect(mockActualOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`Searching for '${query}' in 2 target folder(s).`));
    });

    test('should handle errors when reading a directory and continue searching others', async () => {
      const mockWorkspaceUriString = 'file:///C:/test/project';
      const mockWorkspaceFolder = {
        uri: vscodeMock.Uri.parse(mockWorkspaceUriString), 
        name: 'project',
        index: 0
      };
      const failingSubDirUri = vscodeMock.Uri.joinPath(mockWorkspaceFolder.uri, 'failingSubDir'); 
      const workingSubDirUri = vscodeMock.Uri.joinPath(mockWorkspaceFolder.uri, 'workingSubDir'); 
      const targetFileUri = vscodeMock.Uri.joinPath(workingSubDirUri, 'target.txt'); 

      mockWorkspaceServiceInstance.getWorkspaceFolders.mockReturnValue([mockWorkspaceFolder]);
      mockParseGitignore.mockResolvedValue(null);

      vscodeWorkspaceFsReadDirectoryMock.mockImplementation(async (uri: vscode.Uri) => { 
        const uriStr = uri.toString();
        if (uriStr === mockWorkspaceFolder.uri.toString()) {
          return [
            ['failingSubDir', vscodeMock.FileType.Directory],
            ['workingSubDir', vscodeMock.FileType.Directory],
          ];
        }
        if (uriStr === failingSubDirUri.toString()) {
          throw new Error('Mock permission denied');
        }
        if (uriStr === workingSubDirUri.toString()) {
          return [['target.txt', vscodeMock.FileType.File]];
        }
        return [];
      });

      const query = 'target';
      const results = await searchService.search(query);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(expect.objectContaining({ name: 'target.txt', path: targetFileUri.fsPath }));
      expect(mockActualOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`Failed to read directory ${failingSubDirUri.fsPath}: Mock permission denied`));
      expect(mockActualOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`Found 1 results for query '${query}'`));
    });

    test('should search only in specific workspace folder if URI is provided', async () => {
      const mockWorkspace1UriString = 'file:///C:/test/project1';
      const mockWorkspaceFolder1 = {
        uri: vscodeMock.Uri.parse(mockWorkspace1UriString), 
        name: 'project1',
        index: 0
      };
      const mockWorkspace2UriString = 'file:///C:/test/project2';
      const mockWorkspaceFolder2 = {
        uri: vscodeMock.Uri.parse(mockWorkspace2UriString), 
        name: 'project2',
        index: 1
      };
      mockWorkspaceServiceInstance.getWorkspaceFolders.mockReturnValue([mockWorkspaceFolder1, mockWorkspaceFolder2]);
      mockWorkspaceServiceInstance.getWorkspaceFolder.mockImplementation((uri) => {
        if (uri.toString() === mockWorkspaceFolder1.uri.toString()) return mockWorkspaceFolder1;
        if (uri.toString() === mockWorkspaceFolder2.uri.toString()) return mockWorkspaceFolder2;
        return undefined;
      });

      const query = 'specific';
      
      vscodeWorkspaceFsReadDirectoryMock.mockImplementation(async (uri: vscode.Uri) => { 
        const uriStr = uri.toString();
        if (uriStr === mockWorkspaceFolder1.uri.toString()) {
          return [['specificFile.txt', vscodeMock.FileType.File]];
        }
        if (uriStr === mockWorkspaceFolder2.uri.toString()) {
          return [['anotherFile.txt', vscodeMock.FileType.File]]; 
        }
        return [];
      });

      mockParseGitignore.mockResolvedValue(null);

      const results = await searchService.search(query, mockWorkspaceFolder1.uri);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(expect.objectContaining({ name: 'specificFile.txt', workspaceFolderUri: mockWorkspaceFolder1.uri.toString() }));
      expect(mockParseGitignore).toHaveBeenCalledWith(mockWorkspaceFolder1);
      expect(mockParseGitignore).not.toHaveBeenCalledWith(mockWorkspaceFolder2); 
      expect(mockActualOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`Searching for '${query}' in 1 target folder(s).`));
      expect(vscodeWorkspaceFsReadDirectoryMock).toHaveBeenCalledWith(mockWorkspaceFolder1.uri); 
      expect(vscodeWorkspaceFsReadDirectoryMock).not.toHaveBeenCalledWith(mockWorkspaceFolder2.uri); 
    });
  });
});