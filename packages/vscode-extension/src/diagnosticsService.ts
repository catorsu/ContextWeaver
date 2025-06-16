/**
 * @file diagnosticsService.ts
 * @description Provides services for accessing and formatting workspace diagnostics.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';

const LOG_PREFIX_DIAGNOSTICS_SERVICE = '[ContextWeaver DiagnosticsService] ';

/**
 * Provides services for fetching and formatting workspace diagnostics (problems).
 */
export class DiagnosticsService {
    private outputChannel: vscode.OutputChannel;

    /**
     * Creates an instance of DiagnosticsService.
     * @param outputChannel The VS Code output channel for logging.
     */
    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.outputChannel.appendLine(LOG_PREFIX_DIAGNOSTICS_SERVICE + 'Initialized.');
    }

    /**
     * Retrieves all diagnostics for a specific workspace folder and formats them into a string.
     * @param workspaceFolder - The workspace folder to get diagnostics for.
     * @returns An object containing the formatted problems string and the total count of problems.
     */
    public getProblemsForWorkspace(workspaceFolder: vscode.WorkspaceFolder): { problemsString: string, problemCount: number } {
        const allDiagnostics = vscode.languages.getDiagnostics();
        const problems: string[] = [];

        const severityMap = {
            [vscode.DiagnosticSeverity.Error]: 'Error',
            [vscode.DiagnosticSeverity.Warning]: 'Warning',
            [vscode.DiagnosticSeverity.Information]: 'Info',
            [vscode.DiagnosticSeverity.Hint]: 'Hint',
        };

        for (const [uri, diagnostics] of allDiagnostics) {
            if (uri.fsPath.startsWith(workspaceFolder.uri.fsPath)) {
                diagnostics.forEach(diagnostic => {
                    const severity = severityMap[diagnostic.severity];
                    const path = vscode.workspace.asRelativePath(uri, false);
                    const line = diagnostic.range.start.line + 1;
                    const char = diagnostic.range.start.character + 1;
                    const source = diagnostic.source ? `${diagnostic.source}:` : '';
                    const code = (typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code) || '';

                    problems.push(
                        `[${severity}] ${path}:${line}:${char} - ${diagnostic.message} (${source}${code})`
                    );
                });
            }
        }

        if (problems.length === 0) {
            return { problemsString: 'No problems found in this workspace.', problemCount: 0 };
        }

        return { problemsString: problems.join('\n'), problemCount: problems.length };
    }
}