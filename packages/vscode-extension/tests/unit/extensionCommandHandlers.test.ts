/**
 * @file extensionCommandHandlers.test.ts
 * @description Unit tests for command handler logic extracted from extension.ts.
 * @module ContextWeaver/VSCE/Tests/Unit
 */

import * as vscode from 'vscode';
import { _handleSendSnippetCommandLogic } from '../../src/extension'; // Assuming it's exported from extension.ts
import { IPCServer } from '../../src/ipcServer';
import { SnippetService, SnippetPayload } from '../../src/snippetService';

// Mock vscode module parts used by the handler (specifically window messages)
// The main vscode mock is in ipcServer.test.ts and other files, 
// but here we might need a more focused one or ensure it's compatible.
jest.mock('vscode', () => ({
  window: {
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
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
    getConfiguration: jest.fn(() => ({
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'ipc.port') return 30001;
        return defaultValue;
      }),
    })),
    // Add other workspace properties if needed by extension.ts evaluation
    isTrusted: true, // Example default
    workspaceFolders: undefined, // Example default
    getWorkspaceFolder: jest.fn(),
    asRelativePath: jest.fn(),
  },
  commands: {
    registerCommand: jest.fn(),
  },
  Disposable: jest.fn(callback => ({ dispose: callback })),
  // Uri needed for type annotations if not for direct use in extension.ts global scope
  Uri: {
    file: jest.fn((path: string) => ({ fsPath: path, path: path, scheme: 'file', toString: () => `file://${path}`})),
    parse: jest.fn((str: string) => ({ toString: () => str, fsPath: str, path: str, scheme: 'file' }))
  }
}), { virtual: true });


describe('_handleSendSnippetCommandLogic', () => {
  let mockIpcServer: Partial<IPCServer>;
  let mockSnippetService: Partial<SnippetService>;
  let mockVsCodeWindow: any; // Using 'any' for simplicity with Pick in SUT
  let mockOutputChannel: Partial<vscode.OutputChannel>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockIpcServer = {
      getPrimaryTargetTabId: jest.fn(),
      pushSnippetToTarget: jest.fn(),
    };
    mockSnippetService = {
      prepareSnippetData: jest.fn(),
    };
    mockVsCodeWindow = {
      showErrorMessage: jest.fn(),
      showWarningMessage: jest.fn(),
      showInformationMessage: jest.fn(),
    };
    mockOutputChannel = {
      appendLine: jest.fn(),
    };
  });

  it('should show error and log if ipcServer is null', async () => {
    await _handleSendSnippetCommandLogic(
      { ipcServer: null, snippetService: mockSnippetService as SnippetService },
      mockVsCodeWindow,
      mockOutputChannel as vscode.OutputChannel
    );
    expect(mockVsCodeWindow.showErrorMessage).toHaveBeenCalledWith('ContextWeaver: Services not initialized.');
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Error: sendSnippet called but services not initialized.'));
  });

  it('should show error and log if snippetService is null', async () => {
    await _handleSendSnippetCommandLogic(
      { ipcServer: mockIpcServer as IPCServer, snippetService: null },
      mockVsCodeWindow,
      mockOutputChannel as vscode.OutputChannel
    );
    expect(mockVsCodeWindow.showErrorMessage).toHaveBeenCalledWith('ContextWeaver: Services not initialized.');
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Error: sendSnippet called but services not initialized.'));
  });

  it('should log if snippetService.prepareSnippetData returns null', async () => {
    (mockSnippetService.prepareSnippetData as jest.Mock).mockReturnValue(null);
    await _handleSendSnippetCommandLogic(
      { ipcServer: mockIpcServer as IPCServer, snippetService: mockSnippetService as SnippetService },
      mockVsCodeWindow,
      mockOutputChannel as vscode.OutputChannel
    );
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Snippet preparation failed or not applicable'));
    expect(mockIpcServer.getPrimaryTargetTabId).not.toHaveBeenCalled();
  });

  it('should show warning and log if no targetTabId is found', async () => {
    const mockSnippet: SnippetPayload = { snippet: 'test', language: 'ts', filePath: '/f.ts', relativeFilePath: 'f.ts', startLine: 1, endLine: 1, metadata: {} as any };
    (mockSnippetService.prepareSnippetData as jest.Mock).mockReturnValue(mockSnippet);
    (mockIpcServer.getPrimaryTargetTabId as jest.Mock).mockReturnValue(undefined);

    await _handleSendSnippetCommandLogic(
      { ipcServer: mockIpcServer as IPCServer, snippetService: mockSnippetService as SnippetService },
      mockVsCodeWindow,
      mockOutputChannel as vscode.OutputChannel
    );
    expect(mockVsCodeWindow.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('No active Chrome tab registered'));
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('No active target tab ID found for snippet.'));
    expect(mockIpcServer.pushSnippetToTarget).not.toHaveBeenCalled();
  });

  it('should push snippet and show info message on success', async () => {
    const mockSnippet: SnippetPayload = { 
      snippet: 'const greet = () => "hello";', 
      language: 'typescript', 
      filePath: '/test/project/greet.ts', 
      relativeFilePath: 'greet.ts', 
      startLine: 1, 
      endLine: 1, 
      metadata: { 
        unique_block_id: 'uuid-snippet-1', 
        content_source_id: 'file:///test/project/greet.ts::snippet::1-1',
        type: 'code_snippet',
        label: 'greet.ts (lines 1-1)',
        workspaceFolderName: 'project',
        workspaceFolderUri: 'file:///test/project'
      } 
    };
    const targetTabId = 123;
    (mockSnippetService.prepareSnippetData as jest.Mock).mockReturnValue(mockSnippet);
    (mockIpcServer.getPrimaryTargetTabId as jest.Mock).mockReturnValue(targetTabId);

    await _handleSendSnippetCommandLogic(
      { ipcServer: mockIpcServer as IPCServer, snippetService: mockSnippetService as SnippetService },
      mockVsCodeWindow,
      mockOutputChannel as vscode.OutputChannel
    );

    expect(mockIpcServer.pushSnippetToTarget).toHaveBeenCalledWith(targetTabId, {
      ...mockSnippet,
      targetTabId: targetTabId,
    });
    expect(mockVsCodeWindow.showInformationMessage).toHaveBeenCalledWith('ContextWeaver: Snippet sent.');
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`Snippet sent to tab ID: ${targetTabId}`));
  });
});