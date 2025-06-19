/**
 * @file filterService.test.ts
 * @description Unit tests for the FilterService implementation.
 * @module ContextWeaver/VSCE/Tests
 */

// Mock vscode module before importing
const mockReadFile = jest.fn();

// Custom FileSystemError for testing
class MockFileSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileSystemError';
  }
  readonly code = 'FileNotFound';
}

// Mock the 'vscode' module to isolate FilterService for testing.
jest.mock('vscode', () => ({
  Uri: {
    joinPath: (uri: any, ...pathSegments: string[]) => ({
      ...uri,
      fsPath: require('path').join(uri.fsPath, ...pathSegments),
      toString: () => `file://${require('path').join(uri.fsPath, ...pathSegments)}`.replace(/\\/g, '/'),
    }),
  },
  workspace: {
    fs: {
      readFile: async (...args: any[]) => mockReadFile(...args),
    },
  },
  FileSystemError: MockFileSystemError
}), { virtual: true });

// Now import modules that use vscode
import * as vscode from 'vscode';
import { FilterService } from '../../src/core/services/FilterService';
import { FilterType } from '@contextweaver/shared';

describe('FilterService', () => {
  let filterService: FilterService;
  
  const mockWorkspaceFolder: vscode.WorkspaceFolder = {
    uri: {
      fsPath: '/workspace/root',
      toString: () => 'file:///workspace/root',
    } as vscode.Uri,
    name: 'test-workspace',
    index: 0,
  };

  beforeEach(() => {
    filterService = new FilterService();
    jest.clearAllMocks();
  });

  describe('createFilterForWorkspace', () => {
    it('should create a filter with default patterns when .gitignore is not found', async () => {
      // Mock readFile to throw FileNotFound error
      mockReadFile.mockRejectedValueOnce(new MockFileSystemError('File not found'));

      const result = await filterService.createFilterForWorkspace(mockWorkspaceFolder);

      expect(result.type).toBe('default');
      expect(result.filter).toBeDefined();
      
      // Test that default patterns are ignored
      expect(result.filter.ignores('node_modules/')).toBe(true);
      expect(result.filter.ignores('node_modules/package.json')).toBe(true);
      expect(result.filter.ignores('.git/')).toBe(true);
      expect(result.filter.ignores('dist/')).toBe(true);
      expect(result.filter.ignores('build/')).toBe(true);
      expect(result.filter.ignores('test.log')).toBe(true);
      
      // Test that non-default patterns are not ignored
      expect(result.filter.ignores('src/main.ts')).toBe(false);
      expect(result.filter.ignores('package.json')).toBe(false);
      expect(result.filter.ignores('README.md')).toBe(false);
    });

    it('should create a filter with combined patterns when .gitignore is found', async () => {
      // Mock readFile to return custom ignore rules
      const customIgnoreContent = 'custom_dir/\n*.tmp\n# Comment line\ndebug.log';
      mockReadFile
        .mockResolvedValueOnce(Buffer.from(customIgnoreContent)) // First call from parseGitignore
        .mockResolvedValueOnce(Buffer.from(customIgnoreContent)); // Second call from createFilterForWorkspace

      const result = await filterService.createFilterForWorkspace(mockWorkspaceFolder);

      expect(result.type).toBe('gitignore');
      expect(result.filter).toBeDefined();
      
      // Test that default patterns are still ignored
      expect(result.filter.ignores('node_modules/')).toBe(true);
      expect(result.filter.ignores('node_modules/package.json')).toBe(true);
      expect(result.filter.ignores('.git/')).toBe(true);
      expect(result.filter.ignores('dist/')).toBe(true);
      
      // Test that custom .gitignore patterns are ignored
      expect(result.filter.ignores('custom_dir/')).toBe(true);
      expect(result.filter.ignores('custom_dir/file.js')).toBe(true);
      expect(result.filter.ignores('file.tmp')).toBe(true);
      expect(result.filter.ignores('debug.log')).toBe(true);
      
      // Test that non-ignored patterns are not ignored
      expect(result.filter.ignores('src/main.ts')).toBe(false);
      expect(result.filter.ignores('package.json')).toBe(false);
      expect(result.filter.ignores('file.js')).toBe(false);
    });

    it('should handle empty .gitignore file', async () => {
      // Mock readFile to return empty .gitignore
      mockReadFile
        .mockResolvedValueOnce(Buffer.from('')) // First call from parseGitignore
        .mockResolvedValueOnce(Buffer.from('')); // Second call from createFilterForWorkspace

      const result = await filterService.createFilterForWorkspace(mockWorkspaceFolder);

      expect(result.type).toBe('gitignore');
      expect(result.filter).toBeDefined();
      
      // Test that default patterns are still ignored (combined with empty .gitignore)
      expect(result.filter.ignores('node_modules/')).toBe(true);
      expect(result.filter.ignores('.git/')).toBe(true);
      
      // Test that non-default patterns are not ignored
      expect(result.filter.ignores('src/main.ts')).toBe(false);
      expect(result.filter.ignores('package.json')).toBe(false);
    });

    it('should handle .gitignore with only comments and whitespace', async () => {
      // Mock readFile to return .gitignore with only comments and whitespace
      const commentOnlyContent = '# This is a comment\n\n   \n# Another comment\n\t\n';
      mockReadFile
        .mockResolvedValueOnce(Buffer.from(commentOnlyContent)) // First call from parseGitignore
        .mockResolvedValueOnce(Buffer.from(commentOnlyContent)); // Second call from createFilterForWorkspace

      const result = await filterService.createFilterForWorkspace(mockWorkspaceFolder);

      expect(result.type).toBe('gitignore');
      expect(result.filter).toBeDefined();
      
      // Test that default patterns are still ignored
      expect(result.filter.ignores('node_modules/')).toBe(true);
      expect(result.filter.ignores('.git/')).toBe(true);
      
      // Test that non-default patterns are not ignored
      expect(result.filter.ignores('src/main.ts')).toBe(false);
      expect(result.filter.ignores('package.json')).toBe(false);
    });

    it('should fallback to default patterns when .gitignore read fails with other errors', async () => {
      // Mock readFile to throw a different error (not FileNotFound)
      mockReadFile.mockRejectedValueOnce(new Error('Permission denied'));

      const result = await filterService.createFilterForWorkspace(mockWorkspaceFolder);

      expect(result.type).toBe('default');
      expect(result.filter).toBeDefined();
      
      // Test that default patterns are ignored
      expect(result.filter.ignores('node_modules/')).toBe(true);
      expect(result.filter.ignores('.git/')).toBe(true);
      expect(result.filter.ignores('dist/')).toBe(true);
      
      // Test that non-default patterns are not ignored
      expect(result.filter.ignores('src/main.ts')).toBe(false);
      expect(result.filter.ignores('package.json')).toBe(false);
    });
  });
});