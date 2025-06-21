/**
 * @file diagnosticsService.test.ts
 * @description Unit tests for the DiagnosticsService class.
 * @module ContextWeaver/VSCE/Tests
 */

import { DiagnosticsService } from '../../src/core/services/DiagnosticsService';
import * as vscode from 'vscode';

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
    const mockDiagnosticSeverity = {
        Error: 0,
        Warning: 1,
        Information: 2,
        Hint: 3
    };

    return {
        DiagnosticSeverity: mockDiagnosticSeverity,
        languages: {
            getDiagnostics: jest.fn()
        },
        workspace: {
            asRelativePath: jest.fn()
        },
        Uri: {
            file: (path: string) => ({
                fsPath: path,
                toString: () => `file://${path}`
            })
        }
    };
});

describe('DiagnosticsService', () => {
    let diagnosticsService: DiagnosticsService;
    let mockGetDiagnostics: jest.MockedFunction<typeof vscode.languages.getDiagnostics>;
    let mockAsRelativePath: jest.MockedFunction<typeof vscode.workspace.asRelativePath>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetDiagnostics = vscode.languages.getDiagnostics as jest.MockedFunction<typeof vscode.languages.getDiagnostics>;
        mockAsRelativePath = vscode.workspace.asRelativePath as jest.MockedFunction<typeof vscode.workspace.asRelativePath>;
        diagnosticsService = new DiagnosticsService();
    });

    describe('getProblemsForWorkspace', () => {
        const mockWorkspaceFolder: vscode.WorkspaceFolder = {
            uri: {
                fsPath: '/workspace/project',
                toString: () => 'file:///workspace/project'
            } as vscode.Uri,
            name: 'test-project',
            index: 0
        };

        it('should return no problems when diagnostics array is empty', () => {
            mockGetDiagnostics.mockReturnValue([]);

            const result = diagnosticsService.getProblemsForWorkspace(mockWorkspaceFolder);

            expect(result.problemsString).toBe('No problems found in this workspace.');
            expect(result.problemCount).toBe(0);
        });

        it('should format error diagnostics correctly', () => {
            const mockUri = {
                fsPath: '/workspace/project/src/file.ts',
                toString: () => 'file:///workspace/project/src/file.ts'
            } as vscode.Uri;

            const mockDiagnostic: vscode.Diagnostic = {
                severity: vscode.DiagnosticSeverity.Error,
                message: 'Cannot find module "nonexistent"',
                range: {
                    start: { line: 5, character: 10 },
                    end: { line: 5, character: 22 }
                } as vscode.Range,
                source: 'typescript',
                code: 'TS2307'
            };

            mockGetDiagnostics.mockReturnValue([
                [mockUri, [mockDiagnostic]]
            ] as any);

            mockAsRelativePath.mockReturnValue('src/file.ts');

            const result = diagnosticsService.getProblemsForWorkspace(mockWorkspaceFolder);

            expect(result.problemsString).toBe(
                '[Error] src/file.ts:6:11 - Cannot find module "nonexistent" (typescript:TS2307)'
            );
            expect(result.problemCount).toBe(1);
        });

        it('should format warning diagnostics correctly', () => {
            const mockUri = {
                fsPath: '/workspace/project/src/utils.js',
                toString: () => 'file:///workspace/project/src/utils.js'
            } as vscode.Uri;

            const mockDiagnostic: vscode.Diagnostic = {
                severity: vscode.DiagnosticSeverity.Warning,
                message: 'Unused variable "temp"',
                range: {
                    start: { line: 10, character: 5 },
                    end: { line: 10, character: 9 }
                } as vscode.Range,
                source: 'eslint',
                code: 'no-unused-vars'
            };

            mockGetDiagnostics.mockReturnValue([
                [mockUri, [mockDiagnostic]]
            ] as any);

            mockAsRelativePath.mockReturnValue('src/utils.js');

            const result = diagnosticsService.getProblemsForWorkspace(mockWorkspaceFolder);

            expect(result.problemsString).toBe(
                '[Warning] src/utils.js:11:6 - Unused variable "temp" (eslint:no-unused-vars)'
            );
            expect(result.problemCount).toBe(1);
        });

        it('should handle multiple diagnostics from multiple files', () => {
            const mockUri1 = {
                fsPath: '/workspace/project/src/index.ts',
                toString: () => 'file:///workspace/project/src/index.ts'
            } as vscode.Uri;

            const mockUri2 = {
                fsPath: '/workspace/project/src/helpers.ts',
                toString: () => 'file:///workspace/project/src/helpers.ts'
            } as vscode.Uri;

            const mockDiagnostic1: vscode.Diagnostic = {
                severity: vscode.DiagnosticSeverity.Error,
                message: 'Type error',
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 5 }
                } as vscode.Range,
                source: 'typescript',
                code: 'TS1234'
            };

            const mockDiagnostic2: vscode.Diagnostic = {
                severity: vscode.DiagnosticSeverity.Information,
                message: 'Consider using const',
                range: {
                    start: { line: 5, character: 2 },
                    end: { line: 5, character: 5 }
                } as vscode.Range,
                source: 'eslint',
                code: 'prefer-const'
            };

            const mockDiagnostic3: vscode.Diagnostic = {
                severity: vscode.DiagnosticSeverity.Hint,
                message: 'Simplify expression',
                range: {
                    start: { line: 10, character: 15 },
                    end: { line: 10, character: 25 }
                } as vscode.Range,
                source: undefined,
                code: undefined
            };

            mockGetDiagnostics.mockReturnValue([
                [mockUri1, [mockDiagnostic1, mockDiagnostic2]],
                [mockUri2, [mockDiagnostic3]]
            ] as any);

            mockAsRelativePath
                .mockReturnValueOnce('src/index.ts')
                .mockReturnValueOnce('src/index.ts')
                .mockReturnValueOnce('src/helpers.ts');

            const result = diagnosticsService.getProblemsForWorkspace(mockWorkspaceFolder);

            const expectedProblems = [
                '[Error] src/index.ts:1:1 - Type error (typescript:TS1234)',
                '[Info] src/index.ts:6:3 - Consider using const (eslint:prefer-const)',
                '[Hint] src/helpers.ts:11:16 - Simplify expression ()'
            ];

            expect(result.problemsString).toBe(expectedProblems.join('\n'));
            expect(result.problemCount).toBe(3);
        });

        it('should handle diagnostic code as object', () => {
            const mockUri = {
                fsPath: '/workspace/project/src/file.ts',
                toString: () => 'file:///workspace/project/src/file.ts'
            } as vscode.Uri;

            const mockDiagnostic: vscode.Diagnostic = {
                severity: vscode.DiagnosticSeverity.Error,
                message: 'Complex error',
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 5 }
                } as vscode.Range,
                source: 'complex-linter',
                code: { value: 'CL123', target: { toString: () => 'https://example.com' } as any }
            };

            mockGetDiagnostics.mockReturnValue([
                [mockUri, [mockDiagnostic]]
            ] as any);

            mockAsRelativePath.mockReturnValue('src/file.ts');

            const result = diagnosticsService.getProblemsForWorkspace(mockWorkspaceFolder);

            expect(result.problemsString).toBe(
                '[Error] src/file.ts:1:1 - Complex error (complex-linter:CL123)'
            );
            expect(result.problemCount).toBe(1);
        });

        it('should filter out diagnostics from files outside workspace', () => {
            const mockUri1 = {
                fsPath: '/workspace/project/src/file.ts',
                toString: () => 'file:///workspace/project/src/file.ts'
            } as vscode.Uri;

            const mockUri2 = {
                fsPath: '/other/location/file.ts',
                toString: () => 'file:///other/location/file.ts'
            } as vscode.Uri;

            const mockDiagnostic: vscode.Diagnostic = {
                severity: vscode.DiagnosticSeverity.Error,
                message: 'Error message',
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 5 }
                } as vscode.Range
            };

            mockGetDiagnostics.mockReturnValue([
                [mockUri1, [mockDiagnostic]],
                [mockUri2, [mockDiagnostic]]
            ] as any);

            mockAsRelativePath.mockReturnValue('src/file.ts');

            const result = diagnosticsService.getProblemsForWorkspace(mockWorkspaceFolder);

            // Should only include the diagnostic from the workspace folder
            expect(result.problemCount).toBe(1);
            expect(result.problemsString).toContain('src/file.ts');
            expect(result.problemsString).not.toContain('/other/location');
        });

        it('should handle diagnostics without source or code', () => {
            const mockUri = {
                fsPath: '/workspace/project/src/file.ts',
                toString: () => 'file:///workspace/project/src/file.ts'
            } as vscode.Uri;

            const mockDiagnostic: vscode.Diagnostic = {
                severity: vscode.DiagnosticSeverity.Error,
                message: 'Generic error',
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 5 }
                } as vscode.Range,
                source: undefined,
                code: undefined
            };

            mockGetDiagnostics.mockReturnValue([
                [mockUri, [mockDiagnostic]]
            ] as any);

            mockAsRelativePath.mockReturnValue('src/file.ts');

            const result = diagnosticsService.getProblemsForWorkspace(mockWorkspaceFolder);

            expect(result.problemsString).toBe(
                '[Error] src/file.ts:1:1 - Generic error ()'
            );
            expect(result.problemCount).toBe(1);
        });

        it('should convert 0-indexed line numbers to 1-indexed', () => {
            const mockUri = {
                fsPath: '/workspace/project/src/file.ts',
                toString: () => 'file:///workspace/project/src/file.ts'
            } as vscode.Uri;

            const mockDiagnostic: vscode.Diagnostic = {
                severity: vscode.DiagnosticSeverity.Error,
                message: 'Error at line 0',
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 5 }
                } as vscode.Range
            };

            mockGetDiagnostics.mockReturnValue([
                [mockUri, [mockDiagnostic]]
            ] as any);

            mockAsRelativePath.mockReturnValue('src/file.ts');

            const result = diagnosticsService.getProblemsForWorkspace(mockWorkspaceFolder);

            // Line should be 1-indexed (0 + 1 = 1)
            expect(result.problemsString).toContain(':1:1');
        });
    });
});