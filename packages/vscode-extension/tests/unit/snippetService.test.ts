/**
 * @file snippetService.test.ts
 * @description Unit tests for the SnippetService.
 * @module ContextWeaver/VSCE/Tests/Unit
 */

import * as vscode from 'vscode';
import { SnippetService, SnippetPayload } from '../../src/snippetService';
import { v4 as uuidv4 } from 'uuid';

// Mock vscode module
jest.mock('vscode', () => ({
  window: {
    activeTextEditor: undefined,
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      show: jest.fn(),
      dispose: jest.fn(),
      clear: jest.fn(),
      hide: jest.fn(),
      name: 'mockOutputChannel',
      append: jest.fn(),
      replace: jest.fn(),
    })),
  },
  workspace: {
    getWorkspaceFolder: jest.fn(),
    asRelativePath: jest.fn(),
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
    })),
  },
  Uri: {
    file: jest.fn((path: string) => ({
      fsPath: path,
      path: path,
      scheme: 'file',
      toString: () => `file://${path}`,
    })),
    parse: jest.fn((str: string) => ({
      toString: () => str,
      fsPath: str.startsWith('file://') ? str.substring(7) : str,
      path: str.startsWith('file://') ? str.substring(7) : (str.includes(':') ? str.substring(str.indexOf(':') + 1) : str),
      scheme: str.includes(':') ? str.substring(0, str.indexOf(':')) : undefined,
    })),
  },
  Position: jest.fn((line, character) => ({ line, character })),
  Range: jest.fn((start, end) => ({ start, end, isEmpty: start.line === end.line && start.character === end.character })),
  Selection: jest.fn((anchor, active) => ({ anchor, active, isEmpty: anchor.line === active.line && anchor.character === active.character, start: anchor, end: active })),
}), { virtual: true });

// Mock uuid module
jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

describe('SnippetService', () => {
  let snippetService: SnippetService;
  let mockOutputChannel: vscode.OutputChannel;
  let mockUuidV4: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    mockOutputChannel = vscode.window.createOutputChannel('ContextWeaver VSCE');
    snippetService = new SnippetService(mockOutputChannel);

    mockUuidV4 = uuidv4 as jest.Mock;
    mockUuidV4.mockReturnValue('mock-uuid-1234'); // Default mock UUID

    // Default state for vscode.window.activeTextEditor for most tests
    // Individual tests can override this.
    (vscode.window.activeTextEditor as any) = undefined;
  });

  describe('constructor', () => {
    it('should initialize and log to output channel', () => {
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[ContextWeaver SnippetService] Initialized.');
    });
  });

  describe('prepareSnippetData', () => {
    it('should return null if no active text editor', () => {
      (vscode.window.activeTextEditor as any) = undefined;
      const result = snippetService.prepareSnippetData();
      expect(result).toBeNull();
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[ContextWeaver SnippetService] No active text editor.');
    });

    it('should return null if document is untitled', () => {
      const mockDocument = {
        isUntitled: true,
        uri: vscode.Uri.file('/test/file.ts'), // Needs some URI
        languageId: 'typescript',
        getText: jest.fn(),
      };
      (vscode.window.activeTextEditor as any) = {
        document: mockDocument,
        selection: new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0)), // Dummy selection
      };

      const result = snippetService.prepareSnippetData();
      expect(result).toBeNull();
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[ContextWeaver SnippetService] Cannot get snippet from an untitled document.');
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('ContextWeaver: Please save the file before sending a snippet.');
    });

    it('should return null if selection is empty', () => {
      const mockDocument = {
        isUntitled: false,
        uri: vscode.Uri.file('/test/project/file.ts'),
        languageId: 'typescript',
        getText: jest.fn(),
      };
      const mockSelection = {
        isEmpty: true,
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      };
      (vscode.window.activeTextEditor as any) = {
        document: mockDocument,
        selection: mockSelection,
      };

      const result = snippetService.prepareSnippetData();
      expect(result).toBeNull();
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[ContextWeaver SnippetService] No text selected.');
    });

    it('should prepare snippet data correctly for a valid selection in a workspace', () => {
      const mockSelectedText = 'const hello = \"world\";';
      const mockFilePath = '/test/project/src/file.ts';
      const mockRelativePath = 'src/file.ts';
      const mockLanguageId = 'typescript';
      const startLine = 5; // 0-indexed in mock, will be 6 (1-indexed) in payload
      const endLine = 5;   // 0-indexed in mock, will be 6 (1-indexed) in payload

      const mockDocument = {
        isUntitled: false,
        uri: vscode.Uri.file(mockFilePath),
        languageId: mockLanguageId,
        getText: jest.fn().mockReturnValue(mockSelectedText),
      };
      const mockSelection = new vscode.Selection(
        new vscode.Position(startLine, 0),
        new vscode.Position(endLine, mockSelectedText.length)
      );
      (mockSelection as any).isEmpty = false; // Explicitly set for clarity, though Range/Selection mock handles it

      const mockWorkspaceFolder = {
        uri: vscode.Uri.file('/test/project'),
        name: 'project',
        index: 0,
      };

      (vscode.window.activeTextEditor as any) = {
        document: mockDocument,
        selection: mockSelection,
      };
      (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(mockWorkspaceFolder);
      (vscode.workspace.asRelativePath as jest.Mock).mockReturnValue(mockRelativePath);

      const result = snippetService.prepareSnippetData();

      expect(result).not.toBeNull();
      const payload = result as SnippetPayload;

      expect(payload.snippet).toBe(mockSelectedText);
      expect(payload.language).toBe(mockLanguageId);
      expect(payload.filePath).toBe(mockFilePath);
      expect(payload.relativeFilePath).toBe(mockRelativePath);
      expect(payload.startLine).toBe(startLine + 1);
      expect(payload.endLine).toBe(endLine + 1);

      expect(payload.metadata.unique_block_id).toBe('mock-uuid-1234');
      expect(payload.metadata.content_source_id).toBe(`file://${mockFilePath}::snippet::${startLine + 1}-${endLine + 1}`);
      expect(payload.metadata.type).toBe('code_snippet');
      expect(payload.metadata.label).toBe(`file.ts (lines ${startLine + 1}-${endLine + 1})`);
      expect(payload.metadata.workspaceFolderUri).toBe(mockWorkspaceFolder.uri.toString());
      expect(payload.metadata.workspaceFolderName).toBe(mockWorkspaceFolder.name);

      expect(mockDocument.getText).toHaveBeenCalledWith(mockSelection);
      expect(vscode.workspace.getWorkspaceFolder).toHaveBeenCalledWith(mockDocument.uri);
      expect(vscode.workspace.asRelativePath).toHaveBeenCalledWith(mockDocument.uri, false);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`Prepared snippet from ${mockFilePath}`));
    });

    // TODO: Add test for file not in workspace (relativeFilePath should be basename)
    // TODO: Add test for selection spanning multiple lines
  });
});