/**
 * @file searchService.test.ts
 * @description Unit tests for the SearchService class focusing on dependency injection and instantiation.
 * @module ContextWeaver/VSCE/Tests
 */

// Mock vscode module before importing
const mockReadDirectory = jest.fn();

// Mock the 'vscode' module to isolate SearchService for testing.
jest.mock('vscode', () => ({
  Uri: {
    joinPath: (uri: any, ...pathSegments: string[]) => ({
      ...uri,
      fsPath: require('path').join(uri.fsPath, ...pathSegments),
      toString: () => `file://${require('path').join(uri.fsPath, ...pathSegments)}`.replace(/\\/g, '/'),
    }),
    parse: (uri: string) => ({ 
      toString: () => uri, 
      fsPath: uri.replace('file://', '') 
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
}), { virtual: true });

// Now import modules that use vscode
import * as vscode from 'vscode';
import { SearchService } from '../../src/searchService';
import { WorkspaceService } from '../../src/workspaceService';
import { IFilterService } from '../../src/core/ports/IFilterService';
import { FilterType } from '@contextweaver/shared';
import ignore, { Ignore } from 'ignore';

// Mock FilterService implementation
const mockFilterService = {
  createFilterForWorkspace: jest.fn()
} as jest.Mocked<IFilterService>;

// Mock WorkspaceService
class MockWorkspaceService {
  getWorkspaceFolders(): readonly vscode.WorkspaceFolder[] | undefined {
    return [
      {
        uri: {
          fsPath: '/test/workspace',
          toString: () => 'file:///test/workspace',
        } as vscode.Uri,
        name: 'test-workspace',
        index: 0,
      },
    ];
  }

  getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
    return {
      uri: {
        fsPath: '/test/workspace',
        toString: () => 'file:///test/workspace',
      } as vscode.Uri,
      name: 'test-workspace',
      index: 0,
    };
  }
}

describe('SearchService', () => {
  let mockWorkspaceService: MockWorkspaceService;
  let searchService: SearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkspaceService = new MockWorkspaceService();
    
    // Setup default mock behavior for FilterService
    mockFilterService.createFilterForWorkspace.mockResolvedValue({
      filter: ignore().add(['node_modules/', '.git/', '*.log']),
      type: 'default'
    });
  });

  describe('Constructor and Dependency Injection', () => {
    it('should instantiate SearchService with IFilterService dependency injection', () => {
      // Test that SearchService can be instantiated with the injected FilterService
      expect(() => {
        searchService = new SearchService(
          mockWorkspaceService as any,
          mockFilterService
        );
      }).not.toThrow();

      expect(searchService).toBeInstanceOf(SearchService);
    });

    it('should accept IFilterService interface implementation', () => {
      // Verify that the constructor accepts the IFilterService interface
      const customFilterService = {
        createFilterForWorkspace: jest.fn().mockResolvedValue({
          filter: ignore().add(['*.tmp', 'build/']),
          type: 'gitignore' as FilterType
        })
      } as jest.Mocked<IFilterService>;

      expect(() => {
        searchService = new SearchService(
          mockWorkspaceService as any,
          customFilterService
        );
      }).not.toThrow();

      expect(searchService).toBeInstanceOf(SearchService);
    });
  });

  describe('Search Method', () => {
    beforeEach(() => {
      searchService = new SearchService(
        mockWorkspaceService as any,
        mockFilterService
      );
    });

    it('should be callable and return empty results for empty query', async () => {
      const results = await searchService.search('');
      expect(results).toEqual([]);
    });

    it('should be callable and return empty results for whitespace query', async () => {
      const results = await searchService.search('   ');
      expect(results).toEqual([]);
    });

    it('should be callable with valid query and return results when files match', async () => {
      // Mock file system response
      mockReadDirectory.mockResolvedValueOnce([
        ['test-file.ts', vscode.FileType.File],
        ['other-file.js', vscode.FileType.File],
      ]);

      const results = await searchService.search('test');
      
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('test-file.ts');
      expect(results[0].type).toBe('file');
      expect(results[0].workspaceFolderName).toBe('test-workspace');
    });

    it('should handle search with specific workspace folder URI', async () => {
      const workspaceUri = vscode.Uri.parse('file:///test/workspace');
      
      // Mock file system response
      mockReadDirectory.mockResolvedValueOnce([
        ['matching-file.ts', vscode.FileType.File],
      ]);

      const results = await searchService.search('matching', workspaceUri);
      
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('matching-file.ts');
    });

    it('should return empty array when no workspace folders exist', async () => {
      // Create SearchService with empty workspace service
      const emptyWorkspaceService = {
        getWorkspaceFolders: jest.fn().mockReturnValue(undefined),
        getWorkspaceFolder: jest.fn().mockReturnValue(undefined)
      };

      const emptySearchService = new SearchService(
        emptyWorkspaceService as any,
        mockFilterService
      );

      const results = await emptySearchService.search('test');
      expect(results).toEqual([]);
    });

    it('should use the injected FilterService to create workspace filters', async () => {
      const createFilterSpy = jest.spyOn(mockFilterService, 'createFilterForWorkspace');
      
      // Mock file system response
      mockReadDirectory.mockResolvedValueOnce([
        ['test-file.ts', vscode.FileType.File],
      ]);

      await searchService.search('test');
      
      expect(createFilterSpy).toHaveBeenCalledTimes(1);
      expect(createFilterSpy).toHaveBeenCalledWith(expect.objectContaining({
        name: 'test-workspace',
        uri: expect.objectContaining({
          fsPath: '/test/workspace'
        })
      }));
    });
  });
});