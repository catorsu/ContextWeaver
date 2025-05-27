/**
 * @file extension.ts
 * @description Main entry point for the ContextWeaver VS Code Extension.
 * Handles activation, deactivation, and initializes the IPC server.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import { IPCServer } from './ipcServer';

const EXTENSION_ID = 'contextweaver'; // For settings and prefixing
const LOG_PREFIX = '[ContextWeaver] ';
let outputChannel: vscode.OutputChannel;
let ipcServer: IPCServer | null = null;

/**
 * @description This method is called when your extension is activated.
 * Your extension is activated the very first time the command is executed
 * or when the `onStartupFinished` activation event occurs.
 * @param {vscode.ExtensionContext} context - The context for the extension.
 */
export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel("ContextWeaver VSCE");
    outputChannel.appendLine(LOG_PREFIX + 'Activating extension...');
    console.log(LOG_PREFIX + 'VSCE is now active.'); // Keep console log for debug console visibility too

    // Retrieve configuration for IPC
    const configuration = vscode.workspace.getConfiguration(EXTENSION_ID); // Use constant
    const port = configuration.get('ipc.port', 30001); // Default to 30001
    const token = configuration.get('ipc.token', '');

    if (!token) {
        const msg = LOG_PREFIX + 'IPC token is not set. Please configure it in settings (contextweaver.ipc.token) for secure communication.';
        vscode.window.showWarningMessage(msg);
        outputChannel.appendLine('WARNING: ' + msg);
        // Optionally, prevent server from starting or operate in a degraded mode.
        // For now, we'll let it start but it won't authenticate clients properly.
    }

    ipcServer = new IPCServer(port, token, context, outputChannel); // Pass outputChannel
    ipcServer.start();

    context.subscriptions.push(
        new vscode.Disposable(() => {
            if (ipcServer) {
                ipcServer.stop();
            }
            outputChannel.dispose();
        })
    );

    // Example: Register a command (useful for testing later)
    let disposable = vscode.commands.registerCommand('contextweaver.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from ContextWeaver VSCE!');
        outputChannel.appendLine(LOG_PREFIX + "Command 'contextweaver.helloWorld' executed.");
    });
    context.subscriptions.push(disposable);
    outputChannel.appendLine(LOG_PREFIX + 'Extension activated successfully.');
}

/**
 * @description This method is called when your extension is deactivated.
 */
export function deactivate() {
    if (ipcServer) {
        ipcServer.stop();
        ipcServer = null;
    }
    outputChannel.appendLine(LOG_PREFIX + 'Extension deactivated.');
    console.log(LOG_PREFIX + 'VSCE has been deactivated.');
}