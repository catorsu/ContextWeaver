/**
 * @file vsceLogger.ts
 * @description Implements the ILoggerOutput interface for the VS Code Extension,
 * directing logs to the VS Code OutputChannel and the Debug Console.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import { ILoggerOutput, LogLevel } from '@contextweaver/shared';

/**
 * An ILoggerOutput implementation that writes logs to a VS Code OutputChannel
 * and also to the debug console for more interactive development.
 */
export class VSCodeOutputChannelLogger implements ILoggerOutput {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    public log(level: LogLevel, message: string): void {
        // Always log to the debug console for real-time developer feedback
        switch (level) {
            case LogLevel.ERROR:
                console.error(message);
                break;
            case LogLevel.WARN:
                console.warn(message);
                break;
            case LogLevel.INFO:
                console.info(message);
                break;
            default: // DEBUG and TRACE
                console.log(message);
                break;
        }

        // Also append to the output channel for persistent, user-visible logs
        this.outputChannel.appendLine(message);
    }
}