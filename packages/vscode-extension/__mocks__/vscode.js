// Mock vscode module for testing
module.exports = {
    workspace: {
        isTrusted: false,
        workspaceFolders: undefined,
        getWorkspaceFolder: jest.fn()
    },
    Uri: {
        file: (path) => ({
            fsPath: path,
            toString: () => `file://${path}`,
            scheme: 'file',
            authority: '',
            path: path,
            query: '',
            fragment: ''
        }),
        parse: (uri) => ({
            toString: () => uri,
            fsPath: uri.replace('file://', ''),
            scheme: 'file',
            authority: '',
            path: uri.replace('file://', ''),
            query: '',
            fragment: ''
        }),
        joinPath: (uri, ...pathSegments) => {
            const joinedPath = require('path').join(uri.fsPath, ...pathSegments);
            return {
                ...uri,
                fsPath: joinedPath,
                path: joinedPath,
                toString: () => `file://${joinedPath}`.replace(/\\/g, '/')
            };
        }
    },
    FileType: {
        File: 1,
        Directory: 2,
        SymbolicLink: 64,
        Unknown: 0
    },
    languages: {
        match: jest.fn(),
        getLanguages: jest.fn().mockResolvedValue([])
    },
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        activeTextEditor: undefined,
        visibleTextEditors: []
    },
    commands: {
        registerCommand: jest.fn(),
        executeCommand: jest.fn()
    },
    extensions: {
        getExtension: jest.fn()
    },
    EventEmitter: class EventEmitter {
        constructor() {
            this.event = jest.fn();
        }
        fire(data) {
            if (this.event.mock) {
                this.event.mock.calls.forEach(([handler]) => {
                    handler(data);
                });
            }
        }
        dispose() {}
    },
    Disposable: class Disposable {
        constructor(fn) {
            this.dispose = fn || jest.fn();
        }
    },
    ExtensionContext: class ExtensionContext {
        constructor() {
            this.subscriptions = [];
            this.workspaceState = {
                get: jest.fn(),
                update: jest.fn()
            };
            this.globalState = {
                get: jest.fn(),
                update: jest.fn()
            };
            this.extensionPath = '/mock/extension/path';
            this.extensionUri = {
                fsPath: '/mock/extension/path',
                toString: () => 'file:///mock/extension/path'
            };
        }
    },
    Position: class Position {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    Range: class Range {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    Location: class Location {
        constructor(uri, rangeOrPosition) {
            this.uri = uri;
            this.range = rangeOrPosition;
        }
    }
};