/**
 * @file ipcServer.test.ts
 * @description Unit tests for the IPCServer class, focusing on Primary/Secondary architecture
 * @module ContextWeaver/VSCE/Tests
 */

import { EventEmitter } from 'events';

// Create mock WebSocket and WebSocketServer classes
class MockWebSocket extends EventEmitter {
    static OPEN = 1;
    static CLOSED = 3;
    readyState: number = MockWebSocket.OPEN;
    send = jest.fn();
    close = jest.fn();

    constructor(public url: string) {
        super();
    }
}

class MockWebSocketServer extends EventEmitter {
    clients = new Set<MockWebSocket>();
    close = jest.fn();

    constructor(_options: any) {
        super();
        // Simulate server starting
        process.nextTick(() => {
            this.emit('listening');
        });
    }
}

// Store WebSocket instances created during tests
let createdWebSockets: MockWebSocket[] = [];

// Mock the 'ws' module to simulate WebSocket clients and servers without actual network connections.
jest.mock('ws', () => {
    // Add static properties to MockWebSocket class
    (MockWebSocket as any).OPEN = 1;
    (MockWebSocket as any).CLOSED = 3;

    const MockWebSocketConstructor: any = jest.fn().mockImplementation((url: string) => {
        const ws = new MockWebSocket(url);
        createdWebSockets.push(ws);
        return ws;
    });
    // Add static properties to the constructor function
    MockWebSocketConstructor.OPEN = 1;
    MockWebSocketConstructor.CLOSED = 3;

    return {
        __esModule: true,
        default: MockWebSocketConstructor,
        WebSocket: MockWebSocketConstructor,  // Export constructor with static properties
        WebSocketServer: MockWebSocketServer
    };
});

// Mock vscode module
jest.mock('vscode', () => ({
    Uri: {
        parse: (uri: string) => ({ toString: () => uri, fsPath: uri.replace('file://', '') }),
        joinPath: (base: any, ...segments: string[]) => ({
            toString: () => `${base.toString()}/${segments.join('/')}`,
            fsPath: `${base.fsPath}/${segments.join('/')}`
        })
    },
    ExtensionMode: { Test: 2 },
    window: {
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        activeTextEditor: undefined,
        tabGroups: { all: [] }
    },
    workspace: {
        getConfiguration: () => ({ get: (_key: string, def: any) => def }),
        textDocuments: [],
        getWorkspaceFolder: jest.fn(),
        workspaceFolders: [],
        fs: {
            stat: jest.fn(),
            readFile: jest.fn(),
            readDirectory: jest.fn()
        }
    },
    FileSystemError: class FileSystemError extends Error {
        code: string = 'FileNotFound';
        constructor(message?: string) { super(message); }
    }
}), { virtual: true });

// Now import the modules that need the mocks
import * as vscode from 'vscode';
import { IPCServer } from '../../src/ipcServer';
import { SearchService } from '../../src/searchService';
import { WorkspaceService } from '../../src/workspaceService';
import {
    IPCMessageRequest
} from '@contextweaver/shared';
import { v4 as uuidv4 } from 'uuid';

let mockDiagnosticsService: any; // Declare at the top level

// Mock VS Code extension context
const mockContext: vscode.ExtensionContext = {
    subscriptions: [],
    workspaceState: {} as any,
    globalState: {} as any,
    secrets: {} as any,
    extensionUri: vscode.Uri.parse('file:///mock'),
    extensionPath: '/mock',
    asAbsolutePath: (path: string) => path,
    storagePath: '/mock/storage',
    globalStoragePath: '/mock/global',
    logPath: '/mock/log',
    extensionMode: vscode.ExtensionMode.Test,
    extension: {} as any,
    storageUri: vscode.Uri.parse('file:///mock/storage'),
    globalStorageUri: vscode.Uri.parse('file:///mock/global'),
    logUri: vscode.Uri.parse('file:///mock/log'),
    environmentVariableCollection: {} as any,
    languageModelAccessInformation: {} as any
};

// Mock output channel
class MockOutputChannel implements vscode.OutputChannel {
    name = 'mock';
    content: string[] = [];
    append(value: string): void { this.content.push(value); }
    appendLine(value: string): void { this.content.push(value + '\n'); }
    replace(_: string): void { }
    clear(): void { this.content = []; }
    show(): void { }
    hide(): void { }
    dispose(): void { }
}

describe('IPCServer - Leader Election', () => {
    let mockOutputChannel: MockOutputChannel;
    let mockSearchService: SearchService;
    let mockWorkspaceService: WorkspaceService;

    beforeEach(() => {
        jest.clearAllMocks();
        createdWebSockets = [];
        mockOutputChannel = new MockOutputChannel();
        mockSearchService = {
            search: jest.fn().mockResolvedValue([])
        } as any;
        mockWorkspaceService = {
            getWorkspaceFolders: jest.fn().mockReturnValue([]),
            isWorkspaceTrusted: jest.fn().mockReturnValue(true),
            getWorkspaceFolder: jest.fn()
        } as any;
        mockDiagnosticsService = { // Initialize in beforeEach
            getProblemsForWorkspace: jest.fn().mockReturnValue({ problemsString: '', problemCount: 0 })
        };
    });

    afterEach(() => {
        createdWebSockets = [];
    });

    test('should become primary when connection to primary port fails', async () => {
        const server = new IPCServer(
            30001,
            'test-window-id',
            mockContext,
            mockOutputChannel as any,
            mockSearchService as any,
            mockWorkspaceService as any,
            mockDiagnosticsService as any
        );

        server.start();

        await new Promise(resolve => setTimeout(resolve, 10));

        const testClient = createdWebSockets[0];
        expect(testClient).toBeDefined();

        const error = new Error('connect ECONNREFUSED 127.0.0.1:30001');
        (error as any).code = 'ECONNREFUSED';
        testClient.emit('error', error);

        await new Promise(resolve => setTimeout(resolve, 50));

        expect((server as any).isPrimary).toBe(true);
    });

    test('should become secondary when connection to primary port succeeds', async () => {
        const server = new IPCServer(
            30001,
            'test-window-id',
            mockContext,
            mockOutputChannel as any,
            mockSearchService as any,
            mockWorkspaceService as any,
            mockDiagnosticsService as any
        );

        server.start();

        await new Promise(resolve => setTimeout(resolve, 10));

        const testClient = createdWebSockets[0];
        expect(testClient).toBeDefined();
        testClient.emit('open');

        await new Promise(resolve => setTimeout(resolve, 50));

        expect((server as any).isPrimary).toBe(false);
        expect(testClient.close).toHaveBeenCalled();
    });
});

describe('IPCServer - Primary Role', () => {
    let mockOutputChannel: MockOutputChannel;
    let mockSearchService: SearchService;
    let mockWorkspaceService: WorkspaceService;
    let server: IPCServer;
    let mockSecondaryWs: MockWebSocket;
    let mockCEWs: MockWebSocket;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOutputChannel = new MockOutputChannel();
        mockSearchService = {
            search: jest.fn().mockResolvedValue([])
        } as any;
        mockWorkspaceService = {
            getWorkspaceFolders: jest.fn().mockReturnValue([{
                uri: vscode.Uri.parse('file:///workspace'),
                name: 'TestWorkspace',
                index: 0
            }]),
            isWorkspaceTrusted: jest.fn().mockReturnValue(true),
            getWorkspaceFolder: jest.fn(),
            ensureWorkspaceTrustedAndOpen: jest.fn().mockResolvedValue(undefined)  // Add this mock!
        } as any;
        mockDiagnosticsService = { // Initialize in beforeEach
            getProblemsForWorkspace: jest.fn().mockReturnValue({ problemsString: '', problemCount: 0 })
        };

        // Create server instance
        server = new IPCServer(
            30001,
            'primary-window-id',
            mockContext,
            mockOutputChannel as any,
            mockSearchService as any,
            mockWorkspaceService as any,
            mockDiagnosticsService as any
        );

        // Manually set as primary
        (server as any).isPrimary = true;

        // Create mock WebSocket instances
        mockSecondaryWs = new MockWebSocket('ws://test');
        mockCEWs = new MockWebSocket('ws://test');
    });

    test('should register a new secondary', async () => {
        const message: IPCMessageRequest = {
            protocol_version: "1.0",
            message_id: uuidv4(),
            type: "request",
            command: "register_secondary",
            payload: { windowId: "secondary-window-id", port: 0 }
        };

        const client = {
            ws: mockSecondaryWs,
            isAuthenticated: true,
            ip: '127.0.0.1'
        };

        (server as any).clients.set(mockSecondaryWs, client);

        await (server as any).handleMessage(client, Buffer.from(JSON.stringify(message)));

        expect((server as any).secondaryClients.has('secondary-window-id')).toBe(true);
        expect((server as any).secondaryClients.get('secondary-window-id')).toBe(mockSecondaryWs);

        expect(mockSecondaryWs.send).toHaveBeenCalled();
        const response = JSON.parse(mockSecondaryWs.send.mock.calls[0][0]);
        expect(response.type).toBe('response');
        expect(response.command).toBe('response_generic_ack');
        expect(response.payload.success).toBe(true);
    });

    test('should forward requests from CE to all secondaries', async () => {
        // Setup: Register a secondary properly
        const secondaryWindowId = 'secondary-window-id';
        (server as any).secondaryClients.set(secondaryWindowId, mockSecondaryWs);

        // Ensure the mock WebSocket is in OPEN state
        mockSecondaryWs.readyState = MockWebSocket.OPEN;

        // Setup: Add CE client WITHOUT windowId to trigger broadcast
        const ceClient = {
            ws: mockCEWs,
            isAuthenticated: true,
            ip: '192.168.1.100'
            // No windowId property - this is important for broadcast logic
        };
        (server as any).clients.set(mockCEWs, ceClient);

        // Create search request from CE
        const searchRequest: IPCMessageRequest = {
            protocol_version: "1.0",
            message_id: uuidv4(),
            type: "request",
            command: "search_workspace",
            payload: { query: "test", workspaceFolderUri: null }
        };

        // Mock search results for primary
        (mockSearchService.search as jest.Mock).mockResolvedValueOnce([{
            path: '/workspace/test.js',
            name: 'test.js',
            type: 'file',
            uri: 'file:///workspace/test.js',
            content_source_id: 'file:///workspace/test.js',
            workspaceFolderUri: 'file:///workspace',
            workspaceFolderName: 'TestWorkspace',
            relativePath: 'test.js'
        }]);

        await (server as any).handleMessage(ceClient, Buffer.from(JSON.stringify(searchRequest)));

        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify forward_request_to_secondaries was sent
        expect(mockSecondaryWs.send).toHaveBeenCalled();
        const forwardedMessage = JSON.parse(mockSecondaryWs.send.mock.calls[0][0]);
        expect(forwardedMessage.command).toBe('forward_request_to_secondaries');
        expect(forwardedMessage.payload.originalRequest.command).toBe('search_workspace');
    });

    test('should aggregate responses correctly', async () => {
        // Setup CE client
        const ceClient = {
            ws: mockCEWs,
            isAuthenticated: true,
            ip: '192.168.1.100'
        };
        (server as any).clients.set(mockCEWs, ceClient);

        // Manually create an aggregation entry
        const originalMessageId = uuidv4();
        const aggregationId = uuidv4();

        (server as any).pendingAggregatedResponses.set(aggregationId, {
            originalRequester: mockCEWs,
            responses: [],
            expectedResponses: 2,
            timeout: setTimeout(() => { }, 5000),
            originalMessageId: originalMessageId,
            originalCommand: 'search_workspace'
        });

        // Call completeAggregation directly with proper responses
        const aggregation = (server as any).pendingAggregatedResponses.get(aggregationId);
        aggregation.responses = [
            {
                windowId: 'primary-window-id',
                payload: {
                    success: true,
                    data: {
                        results: [{
                            path: '/workspace1/file1.js',
                            name: 'file1.js',
                            type: 'file',
                            uri: 'file:///workspace1/file1.js',
                            content_source_id: 'file:///workspace1/file1.js',
                            workspaceFolderUri: 'file:///workspace1',
                            workspaceFolderName: 'Workspace1',
                            relativePath: 'file1.js',
                            windowId: 'primary-window-id'
                        }]
                    }
                }
            },
            {
                windowId: 'secondary-window-id',
                payload: {
                    success: true,
                    data: {
                        results: [{
                            path: '/workspace2/file2.js',
                            name: 'file2.js',
                            type: 'file',
                            uri: 'file:///workspace2/file2.js',
                            content_source_id: 'file:///workspace2/file2.js',
                            workspaceFolderUri: 'file:///workspace2',
                            workspaceFolderName: 'Workspace2',
                            relativePath: 'file2.js',
                            windowId: 'secondary-window-id'
                        }]
                    }
                }
            }
        ];

        // Complete aggregation
        (server as any).completeAggregation(aggregationId);

        // Verify aggregated response was sent to CE
        expect(mockCEWs.send).toHaveBeenCalled();
        const aggregatedResponse = JSON.parse(mockCEWs.send.mock.calls[0][0]);
        expect(aggregatedResponse.type).toBe('response');
        expect(aggregatedResponse.command).toBe('response_search_workspace');
        expect(aggregatedResponse.payload.data.results.length).toBe(2);
    });
});

describe('IPCServer - Secondary Role', () => {
    let mockOutputChannel: MockOutputChannel;
    let mockSearchService: SearchService;
    let mockWorkspaceService: WorkspaceService;
    let server: IPCServer;
    let mockPrimaryWs: MockWebSocket;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOutputChannel = new MockOutputChannel();
        mockSearchService = {
            search: jest.fn().mockResolvedValue([])
        } as any;
        mockWorkspaceService = {
            getWorkspaceFolders: jest.fn().mockReturnValue([{
                uri: vscode.Uri.parse('file:///workspace2'),
                name: 'Workspace2',
                index: 0
            }]),
            isWorkspaceTrusted: jest.fn().mockReturnValue(true),
            getWorkspaceFolder: jest.fn(),
            ensureWorkspaceTrustedAndOpen: jest.fn().mockResolvedValue(undefined)  // Add this mock!
        } as any;
        mockDiagnosticsService = { // Initialize in beforeEach
            getProblemsForWorkspace: jest.fn().mockReturnValue({ problemsString: '', problemCount: 0 })
        };

        // Create server instance
        server = new IPCServer(
            30001,
            'secondary-window-id',
            mockContext,
            mockOutputChannel as any,
            mockSearchService as any,
            mockWorkspaceService as any,
            mockDiagnosticsService as any
        );

        // Manually set as secondary
        (server as any).isPrimary = false;

        // Create mock primary WebSocket
        mockPrimaryWs = new MockWebSocket('ws://127.0.0.1:30001');
        (server as any).primaryWebSocket = mockPrimaryWs;
    });

    test('should forward snippet send requests to primary', () => {
        const snippetData = {
            snippet: 'console.log("test");',
            language: 'javascript',
            filePath: '/workspace2/test.js',
            relativeFilePath: 'test.js',
            fileLabel: 'test.js',
            startLine: 1,
            endLine: 1,
            metadata: {
                unique_block_id: uuidv4(),
                content_source_id: 'file:///workspace2/test.js',
                type: 'CodeSnippet' as const,
                label: 'test.js:1-1',
                workspaceFolderUri: 'file:///workspace2',
                workspaceFolderName: 'Workspace2',
                windowId: 'secondary-window-id'
            }
        };

        // Call handleSnippetSendRequest
        server.handleSnippetSendRequest(snippetData);

        // Verify forward_push_to_primary was sent
        expect(mockPrimaryWs.send).toHaveBeenCalledTimes(1);
        const forwardedPush = JSON.parse(mockPrimaryWs.send.mock.calls[0][0]);
        expect(forwardedPush.type).toBe('push');
        expect(forwardedPush.command).toBe('forward_push_to_primary');
        expect(forwardedPush.payload.originalPushPayload.snippet).toBe(snippetData.snippet);
        expect(forwardedPush.payload.originalPushPayload.windowId).toBe('secondary-window-id');
        expect(forwardedPush.payload.originalPushPayload.metadata.windowId).toBe('secondary-window-id');
    });

    test('should handle forwarded request and send back response', async () => {
        // Mock search results
        (mockSearchService.search as jest.Mock).mockResolvedValueOnce([{
            path: '/workspace2/secondary-file.js',
            name: 'secondary-file.js',
            type: 'file',
            uri: 'file:///workspace2/secondary-file.js',
            content_source_id: 'file:///workspace2/secondary-file.js',
            workspaceFolderUri: 'file:///workspace2',
            workspaceFolderName: 'Workspace2',
            relativePath: 'secondary-file.js'
        }]);

        // Create forwarded request
        const originalRequest: IPCMessageRequest = {
            protocol_version: "1.0",
            message_id: uuidv4(),
            type: "request",
            command: "search_workspace",
            payload: { query: "test", workspaceFolderUri: null }
        };

        const forwardedMessage = {
            command: 'forward_request_to_secondaries',
            payload: { originalRequest }
        };

        // Ensure the mock primary WebSocket is in OPEN state
        mockPrimaryWs.readyState = MockWebSocket.OPEN;

        await (server as any).handleSecondaryMessage(Buffer.from(JSON.stringify(forwardedMessage)));

        await new Promise(resolve => setTimeout(resolve, 50));

        expect(mockPrimaryWs.send).toHaveBeenCalled();
        const response = JSON.parse(mockPrimaryWs.send.mock.calls[0][0]);
        expect(response.type).toBe('push');
        expect(response.command).toBe('forward_response_to_primary');
        expect(response.payload.originalMessageId).toBe(originalRequest.message_id);

        expect(response.payload.originalMessageId).toBe(originalRequest.message_id);
        expect(response.payload.responsePayload).toBeTruthy();
        expect(response.payload.responsePayload.data.results.length).toBe(1);
        expect(response.payload.responsePayload.data.results[0].windowId).toBe('secondary-window-id');
        expect(response.payload.responsePayload.data.windowId).toBe('secondary-window-id');
    });
});