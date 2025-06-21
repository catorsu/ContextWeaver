/**
 * @file snippetService.test.ts
 * @description Unit tests for the SnippetService class.
 * @module ContextWeaver/VSCE/Tests
 */

import { SnippetService } from '../../src/core/services/SnippetService';
import * as vscode from 'vscode';

// Mock uuid
jest.mock('uuid', () => ({
    v4: jest.fn(() => 'mock-uuid-1234')
}));

// Mock the Logger
jest.mock('@contextweaver/shared', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }))
}));

// Mock vscode module
jest.mock('vscode', () => {
    const Position = jest.fn().mockImplementation((line: number, character: number) => ({
        line,
        character
    }));

    const Range = jest.fn().mockImplementation((start: any, end: any) => ({
        start,
        end,
        isEmpty: start.line === end.line && start.character === end.character
    }));

    const Selection = jest.fn().mockImplementation((anchor: any, active: any) => ({
        anchor,
        active,
        start: anchor,
        end: active,
        isEmpty: anchor.line === active.line && anchor.character === active.character
    }));

    return {
        Position,
        Range,
        Selection,
        window: {
            activeTextEditor: undefined,
            showWarningMessage: jest.fn()
        },
        workspace: {
            getWorkspaceFolder: jest.fn(),
            asRelativePath: jest.fn()
        },
        Uri: {
            file: (path: string) => ({
                fsPath: path,
                toString: () => `file://${path}`,
                scheme: 'file'
            })
        }
    };
});

describe('SnippetService', () => {
    let snippetService: SnippetService;
    let mockEditor: any;
    let mockDocument: any;
    let mockSelection: any;
    let mockWorkspaceFolder: vscode.WorkspaceFolder;

    beforeEach(() => {
        jest.clearAllMocks();
        
        snippetService = new SnippetService();

        // Create mock workspace folder
        mockWorkspaceFolder = {
            uri: {
                fsPath: '/workspace/project',
                toString: () => 'file:///workspace/project'
            } as vscode.Uri,
            name: 'test-project',
            index: 0
        };

        // Create mock document
        mockDocument = {
            uri: {
                fsPath: '/workspace/project/src/index.ts',
                toString: () => 'file:///workspace/project/src/index.ts',
                scheme: 'file'
            },
            isUntitled: false,
            languageId: 'typescript',
            getText: jest.fn()
        };

        // Create mock selection
        mockSelection = new (vscode as any).Selection(
            new (vscode as any).Position(5, 0),
            new (vscode as any).Position(10, 15)
        );

        // Create mock editor
        mockEditor = {
            document: mockDocument,
            selection: mockSelection
        };

        // Set up workspace mocks
        (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(mockWorkspaceFolder);
        (vscode.workspace.asRelativePath as jest.Mock).mockReturnValue('src/index.ts');
    });

    describe('prepareSnippetData', () => {
        it('should return null when no active editor', () => {
            vscode.window.activeTextEditor = undefined;

            const result = snippetService.prepareSnippetData();

            expect(result).toBeNull();
        });

        it('should return null and show warning for untitled document', () => {
            mockDocument.isUntitled = true;
            vscode.window.activeTextEditor = mockEditor;

            const result = snippetService.prepareSnippetData();

            expect(result).toBeNull();
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                'ContextWeaver: Please save the file before sending a snippet.'
            );
        });

        it('should return null when no text is selected', () => {
            mockSelection.isEmpty = true;
            vscode.window.activeTextEditor = mockEditor;

            const result = snippetService.prepareSnippetData();

            expect(result).toBeNull();
        });

        it('should prepare snippet data correctly for valid selection', () => {
            const selectedText = 'function hello() {\n  console.log("Hello World");\n}';
            mockDocument.getText.mockReturnValue(selectedText);
            vscode.window.activeTextEditor = mockEditor;

            const result = snippetService.prepareSnippetData();

            expect(result).toEqual({
                snippet: selectedText,
                language: 'typescript',
                filePath: '/workspace/project/src/index.ts',
                relativeFilePath: 'src/index.ts',
                startLine: 6, // 0-indexed 5 + 1
                endLine: 11,   // 0-indexed 10 + 1
                metadata: {
                    unique_block_id: 'mock-uuid-1234',
                    content_source_id: 'file:///workspace/project/src/index.ts::snippet::6-11',
                    type: 'CodeSnippet',
                    label: 'index.ts (lines 6-11)',
                    workspaceFolderUri: 'file:///workspace/project',
                    workspaceFolderName: 'test-project'
                }
            });
        });

        it('should handle file not in workspace folder', () => {
            const externalFilePath = '/external/file.js';
            mockDocument.uri.fsPath = externalFilePath;
            mockDocument.uri.toString = () => `file://${externalFilePath}`;
            mockDocument.languageId = 'javascript';
            
            (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(undefined);
            (vscode.workspace.asRelativePath as jest.Mock).mockReturnValue('file.js');
            
            const selectedText = 'const x = 42;';
            mockDocument.getText.mockReturnValue(selectedText);
            vscode.window.activeTextEditor = mockEditor;

            const result = snippetService.prepareSnippetData();

            expect(result).toEqual({
                snippet: selectedText,
                language: 'javascript',
                filePath: externalFilePath,
                relativeFilePath: 'file.js',
                startLine: 6,
                endLine: 11,
                metadata: {
                    unique_block_id: 'mock-uuid-1234',
                    content_source_id: `file://${externalFilePath}::snippet::6-11`,
                    type: 'CodeSnippet',
                    label: 'file.js (lines 6-11)',
                    workspaceFolderUri: null,
                    workspaceFolderName: null
                }
            });
        });

        it('should handle single line selection', () => {
            mockSelection = new (vscode as any).Selection(
                new (vscode as any).Position(3, 5),
                new (vscode as any).Position(3, 25)
            );
            mockEditor.selection = mockSelection;
            
            const selectedText = 'const greeting = "Hi";';
            mockDocument.getText.mockReturnValue(selectedText);
            vscode.window.activeTextEditor = mockEditor;

            const result = snippetService.prepareSnippetData();

            expect(result).toMatchObject({
                snippet: selectedText,
                startLine: 4, // 0-indexed 3 + 1
                endLine: 4,   // Same line
                metadata: expect.objectContaining({
                    label: 'index.ts (lines 4-4)'
                })
            });
        });

        it('should handle different programming languages', () => {
            const testCases = [
                { languageId: 'python', extension: 'py' },
                { languageId: 'javascript', extension: 'js' },
                { languageId: 'rust', extension: 'rs' },
                { languageId: 'go', extension: 'go' }
            ];

            testCases.forEach(({ languageId, extension }) => {
                mockDocument.languageId = languageId;
                mockDocument.uri.fsPath = `/workspace/project/src/file.${extension}`;
                mockDocument.uri.toString = () => `file:///workspace/project/src/file.${extension}`;
                (vscode.workspace.asRelativePath as jest.Mock).mockReturnValue(`src/file.${extension}`);
                
                const selectedText = 'some code';
                mockDocument.getText.mockReturnValue(selectedText);
                vscode.window.activeTextEditor = mockEditor;

                const result = snippetService.prepareSnippetData();

                expect(result?.language).toBe(languageId);
                expect(result?.metadata.label).toBe(`file.${extension} (lines 6-11)`);
            });
        });

        it('should generate unique IDs for each snippet', () => {
            const mockUuid = require('uuid');
            let callCount = 0;
            mockUuid.v4.mockImplementation(() => `mock-uuid-${++callCount}`);

            const selectedText = 'test';
            mockDocument.getText.mockReturnValue(selectedText);
            vscode.window.activeTextEditor = mockEditor;

            const result1 = snippetService.prepareSnippetData();
            const result2 = snippetService.prepareSnippetData();

            expect(result1?.metadata.unique_block_id).toBe('mock-uuid-1');
            expect(result2?.metadata.unique_block_id).toBe('mock-uuid-2');
        });

        it('should create correct content_source_id format', () => {
            const selectedText = 'test';
            mockDocument.getText.mockReturnValue(selectedText);
            vscode.window.activeTextEditor = mockEditor;

            // Test with various line ranges
            const testCases = [
                { start: 0, end: 0, expected: '1-1' },
                { start: 5, end: 10, expected: '6-11' },
                { start: 99, end: 105, expected: '100-106' }
            ];

            testCases.forEach(({ start, end, expected }) => {
                const startPos = new (vscode as any).Position(start, 0);
                const endPos = new (vscode as any).Position(end, start === end ? 10 : 0);
                mockSelection = new (vscode as any).Selection(startPos, endPos);
                mockSelection.isEmpty = false;
                mockEditor.selection = mockSelection;

                const result = snippetService.prepareSnippetData();

                expect(result?.metadata.content_source_id).toBe(
                    `file:///workspace/project/src/index.ts::snippet::${expected}`
                );
            });
        });

        it('should handle windows file paths correctly', () => {
            const windowsPath = 'C:\\workspace\\project\\src\\file.ts';
            mockDocument.uri.fsPath = windowsPath;
            mockDocument.uri.toString = () => 'file:///C:/workspace/project/src/file.ts';
            
            const selectedText = 'test';
            mockDocument.getText.mockReturnValue(selectedText);
            vscode.window.activeTextEditor = mockEditor;

            const result = snippetService.prepareSnippetData();

            expect(result?.filePath).toBe(windowsPath);
            expect(result?.metadata.content_source_id).toBe(
                'file:///C:/workspace/project/src/file.ts::snippet::6-11'
            );
        });
    });
});