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
        // For leader election failure test, immediately emit an error
        process.nextTick(() => {
            const error = new Error(`connect ECONNREFUSED 127.0.0.1:${url.split(':')[2]}`);
            (error as any).code = 'ECONNREFUSED';
            ws.emit('error', error);
        });
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
import { IPCServer } from '../../src/adapters/primary/ipc/ipcServer';
import { SearchService } from '../../src/core/services/SearchService';
import { WorkspaceService } from '../../src/core/services/WorkspaceService';
import { FilterService } from '../../src/core/services/FilterService';
import {
    IPCMessageRequest
} from '@contextweaver/shared';
import { v4 as uuidv4 } from 'uuid';

let mockDiagnosticsService: any; // Declare at the top level
let mockFilterService: any; // Declare at the top level
let mockCommandRegistry: any; // Declare at the top level
let mockAggregationService: any; // Declare at the top level

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
    let mockWorkspaceService: any;
    let mockConnectionService: any;
    let mockMultiWindowService: any;
    let mockCommandRegistry: any;

    beforeEach(() => {
        jest.clearAllMocks();
        createdWebSockets = [];
        mockOutputChannel = new MockOutputChannel();
        
        mockWorkspaceService = {
            getWorkspaceFolders: jest.fn().mockReturnValue([]),
            isWorkspaceTrusted: jest.fn().mockReturnValue(true),
            getWorkspaceFolder: jest.fn(),
            ensureWorkspaceTrustedAndOpen: jest.fn().mockResolvedValue(undefined)
        };
        
        mockConnectionService = {
            startServer: jest.fn().mockResolvedValue(30001),
            sendMessage: jest.fn(),
            sendError: jest.fn(),
            getClients: jest.fn().mockReturnValue(new Map()),
            updateClient: jest.fn(),
            stop: jest.fn()
        };
        
        mockMultiWindowService = {
            start: jest.fn().mockResolvedValue(undefined),
            getIsPrimary: jest.fn().mockReturnValue(true),
            getSecondaryClients: jest.fn().mockReturnValue(new Map()),
            handleRegisterSecondary: jest.fn(),
            handleUnregisterSecondary: jest.fn(),
            broadcastToSecondaries: jest.fn(),
            handleForwardedResponse: jest.fn(),
            handleForwardedPush: jest.fn(),
            handleSnippetSendRequest: jest.fn(),
            removeSecondaryClient: jest.fn(),
            sendResponseToPrimary: jest.fn(),
            stop: jest.fn(),
            onForwardRequestReceived: undefined
        };
        
        mockCommandRegistry = {
            register: jest.fn(),
            getHandler: jest.fn().mockImplementation((command: string) => {
                // Return a mock handler for known commands
                if (command === 'get_contents_for_files') {
                    return {
                        handle: jest.fn().mockResolvedValue({
                            success: true,
                            data: [
                                {
                                    fileData: { fullPath: '/workspace/file1.ts', content: 'console.log("file1");', languageId: 'typescript' },
                                    metadata: { unique_block_id: 'test-id-1', content_source_id: 'file:///workspace/file1.ts', type: 'file_content', label: 'file1.ts', workspaceFolderUri: 'file:///workspace', workspaceFolderName: 'TestWorkspace', windowId: 'primary-window-id' },
                                    windowId: 'primary-window-id'
                                },
                                {
                                    fileData: { fullPath: '/workspace/file2.js', content: 'console.log("file2");', languageId: 'javascript' },
                                    metadata: { unique_block_id: 'test-id-2', content_source_id: 'file:///workspace/file2.js', type: 'file_content', label: 'file2.js', workspaceFolderUri: 'file:///workspace', workspaceFolderName: 'TestWorkspace', windowId: 'primary-window-id' },
                                    windowId: 'primary-window-id'
                                }
                            ],
                            errors: [
                                { uri: 'file:///workspace/nonexistent.txt', error: 'File not found', errorCode: 'FILE_NOT_FOUND' }
                            ],
                            error: null
                        })
                    };
                } else if (command === 'search_workspace') {
                    return {
                        handle: jest.fn().mockResolvedValue({
                            success: true,
                            data: {
                                results: [{
                                    path: '/workspace/test-file.js',
                                    name: 'test-file.js',
                                    type: 'file',
                                    uri: 'file:///workspace/test-file.js',
                                    content_source_id: 'file:///workspace/test-file.js',
                                    workspaceFolderUri: 'file:///workspace',
                                    workspaceFolderName: 'TestWorkspace',
                                    relativePath: 'test-file.js',
                                    windowId: 'secondary-window-id'
                                }],
                                windowId: 'secondary-window-id'
                            },
                            error: null
                        })
                    };
                }
                return undefined;
            })
        };
    });

    afterEach(() => {
        createdWebSockets = [];
    });

    test('should become primary when connection to primary port fails', async () => {
        // Mock MultiWindowService to return primary state
        mockMultiWindowService.getIsPrimary.mockReturnValue(true);
        
        const server = new IPCServer(
            'test-window-id',
            mockContext,
            mockOutputChannel as any,
            mockWorkspaceService,
            mockConnectionService,
            mockMultiWindowService,
            mockCommandRegistry
        );

        await server.start();

        // Verify that multiWindowService.start() was called and setup primary server was called
        expect(mockMultiWindowService.start).toHaveBeenCalled();
        expect(mockConnectionService.startServer).toHaveBeenCalled(); // Should be called when primary
    });

    test('should become secondary when connection to primary port succeeds', async () => {
        // Mock MultiWindowService to return secondary state
        mockMultiWindowService.getIsPrimary.mockReturnValue(false);
        
        const server = new IPCServer(
            'test-window-id',
            mockContext,
            mockOutputChannel as any,
            mockWorkspaceService,
            mockConnectionService,
            mockMultiWindowService,
            mockCommandRegistry
        );

        await server.start();

        // Verify that multiWindowService.start() was called and no primary server setup
        expect(mockMultiWindowService.start).toHaveBeenCalled();
        expect(mockConnectionService.startServer).not.toHaveBeenCalled(); // Should NOT be called when secondary
    });
});

describe('IPCServer - Primary Role', () => {
    let mockOutputChannel: MockOutputChannel;
    let mockWorkspaceService: any;
    let mockConnectionService: any;
    let mockMultiWindowService: any;
    let mockCommandRegistry: any;
    let server: IPCServer;
    let mockSecondaryWs: MockWebSocket;
    let mockCEWs: MockWebSocket;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOutputChannel = new MockOutputChannel();
        
        mockWorkspaceService = {
            getWorkspaceFolders: jest.fn().mockReturnValue([{
                uri: vscode.Uri.parse('file:///workspace'),
                name: 'TestWorkspace',
                index: 0
            }]),
            isWorkspaceTrusted: jest.fn().mockReturnValue(true),
            getWorkspaceFolder: jest.fn(),
            ensureWorkspaceTrustedAndOpen: jest.fn().mockResolvedValue(undefined)
        };
        
        mockConnectionService = {
            startServer: jest.fn().mockResolvedValue(30001),
            sendMessage: jest.fn(),
            sendError: jest.fn(),
            getClients: jest.fn().mockReturnValue(new Map()),
            updateClient: jest.fn(),
            stop: jest.fn()
        };
        
        mockMultiWindowService = {
            start: jest.fn().mockResolvedValue(undefined),
            getIsPrimary: jest.fn().mockReturnValue(true),
            getSecondaryClients: jest.fn().mockReturnValue(new Map()),
            handleRegisterSecondary: jest.fn(),
            handleUnregisterSecondary: jest.fn(),
            broadcastToSecondaries: jest.fn(),
            handleForwardedResponse: jest.fn(),
            handleForwardedPush: jest.fn(),
            handleSnippetSendRequest: jest.fn(),
            removeSecondaryClient: jest.fn(),
            sendResponseToPrimary: jest.fn(),
            stop: jest.fn(),
            onForwardRequestReceived: undefined
        };
        
        mockCommandRegistry = {
            register: jest.fn(),
            getHandler: jest.fn().mockImplementation((command: string) => {
                // Return a mock handler for known commands
                if (command === 'get_contents_for_files') {
                    return {
                        handle: jest.fn().mockResolvedValue({
                            success: true,
                            data: [
                                {
                                    fileData: { fullPath: '/workspace/file1.ts', content: 'console.log("file1");', languageId: 'typescript' },
                                    metadata: { unique_block_id: 'test-id-1', content_source_id: 'file:///workspace/file1.ts', type: 'file_content', label: 'file1.ts', workspaceFolderUri: 'file:///workspace', workspaceFolderName: 'TestWorkspace', windowId: 'primary-window-id' },
                                    windowId: 'primary-window-id'
                                },
                                {
                                    fileData: { fullPath: '/workspace/file2.js', content: 'console.log("file2");', languageId: 'javascript' },
                                    metadata: { unique_block_id: 'test-id-2', content_source_id: 'file:///workspace/file2.js', type: 'file_content', label: 'file2.js', workspaceFolderUri: 'file:///workspace', workspaceFolderName: 'TestWorkspace', windowId: 'primary-window-id' },
                                    windowId: 'primary-window-id'
                                }
                            ],
                            errors: [
                                { uri: 'file:///workspace/nonexistent.txt', error: 'File not found', errorCode: 'FILE_NOT_FOUND' }
                            ],
                            error: null
                        })
                    };
                } else if (command === 'search_workspace') {
                    return {
                        handle: jest.fn().mockResolvedValue({
                            success: true,
                            data: {
                                results: [{
                                    path: '/workspace/test-file.js',
                                    name: 'test-file.js',
                                    type: 'file',
                                    uri: 'file:///workspace/test-file.js',
                                    content_source_id: 'file:///workspace/test-file.js',
                                    workspaceFolderUri: 'file:///workspace',
                                    workspaceFolderName: 'TestWorkspace',
                                    relativePath: 'test-file.js',
                                    windowId: 'secondary-window-id'
                                }],
                                windowId: 'secondary-window-id'
                            },
                            error: null
                        })
                    };
                }
                return undefined;
            })
        };

        // Create server instance
        server = new IPCServer(
            'primary-window-id',
            mockContext,
            mockOutputChannel as any,
            mockWorkspaceService,
            mockConnectionService,
            mockMultiWindowService,
            mockCommandRegistry
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

        // Mock the ConnectionService to return this client
        mockConnectionService.getClients.mockReturnValue(new Map([[mockSecondaryWs, client]]));

        await (server as any).handleMessage(client, Buffer.from(JSON.stringify(message)));

        // Verify the services were called correctly
        expect(mockConnectionService.updateClient).toHaveBeenCalledWith(mockSecondaryWs, { windowId: "secondary-window-id" });
        expect(mockMultiWindowService.handleRegisterSecondary).toHaveBeenCalledWith(client, { windowId: "secondary-window-id", port: 0 });
        expect(mockConnectionService.sendMessage).toHaveBeenCalled();
    });

    test('should forward requests from CE to all secondaries', async () => {
        // Setup: Mock MultiWindowService to return a secondary client
        const secondaryWindowId = 'secondary-window-id';
        mockMultiWindowService.getSecondaryClients.mockReturnValue(new Map([[secondaryWindowId, mockSecondaryWs]]));

        // Ensure the mock WebSocket is in OPEN state
        mockSecondaryWs.readyState = MockWebSocket.OPEN;

        // Setup: Add CE client WITHOUT windowId to trigger broadcast
        const ceClient = {
            ws: mockCEWs,
            isAuthenticated: true,
            ip: '192.168.1.100'
            // No windowId property - this is important for broadcast logic
        };

        // Create search request from CE
        const searchRequest: IPCMessageRequest = {
            protocol_version: "1.0",
            message_id: uuidv4(),
            type: "request",
            command: "search_workspace",
            payload: { query: "test", workspaceFolderUri: null }
        };

        // Mock command handlers are already set up in beforeEach

        await (server as any).handleMessage(ceClient, Buffer.from(JSON.stringify(searchRequest)));

        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify broadcastToSecondaries was called
        expect(mockMultiWindowService.broadcastToSecondaries).toHaveBeenCalledWith(searchRequest, mockCEWs);
    });

    test.skip('should aggregate responses correctly', async () => {
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
        expect(aggregatedResponse.payload.data.windowId).toBe('primary-window-id');
        expect(aggregatedResponse.payload.data.errors).toBeUndefined();
    });

    test('should handle get_contents_for_files request and return file contents and errors', async () => {
        const fileUris = [
            'file:///workspace/file1.ts',
            'file:///workspace/file2.js',
            'file:///workspace/nonexistent.txt'
        ];
        const request: IPCMessageRequest = {
            protocol_version: "1.0",
            message_id: uuidv4(),
            type: "request",
            command: "get_contents_for_files",
            payload: { fileUris }
        };

        const client = {
            ws: mockCEWs,
            isAuthenticated: true,
            ip: '127.0.0.1'
        };

        // Make sure there are no secondary clients so it doesn't try to broadcast
        mockMultiWindowService.getSecondaryClients.mockReturnValue(new Map());

        await (server as any).handleMessage(client, Buffer.from(JSON.stringify(request)));

        // Verify the command handler was called
        expect(mockCommandRegistry.getHandler).toHaveBeenCalledWith('get_contents_for_files');
        
        // Verify the connection service was used to send the response
        expect(mockConnectionService.sendMessage).toHaveBeenCalled();
    });

    test.skip('should use primary response for default aggregation case', async () => {
        // Clear previous mock calls
        jest.clearAllMocks();
        
        // Setup CE client
        const ceClient = {
            ws: mockCEWs,
            isAuthenticated: true,
            ip: '192.168.1.100'
        };
        (server as any).clients.set(mockCEWs, ceClient);

        // Manually create an aggregation entry for 'get_FileTree' which uses the default logic
        const originalMessageId = uuidv4();
        const aggregationId = uuidv4();

        (server as any).pendingAggregatedResponses.set(aggregationId, {
            originalRequester: mockCEWs,
            responses: [],
            expectedResponses: 2,
            timeout: setTimeout(() => { }, 5000),
            originalMessageId: originalMessageId,
            originalCommand: 'get_FileTree'
        });

        // Call completeAggregation directly with responses, with primary's being different
        const aggregation = (server as any).pendingAggregatedResponses.get(aggregationId);
        aggregation.responses = [
            {
                windowId: 'secondary-window-id',
                payload: { success: true, data: { fileTreeString: 'secondary tree' } }
            },
            {
                windowId: 'primary-window-id',
                payload: { success: true, data: { fileTreeString: 'primary tree' } }
            }
        ];

        // Complete aggregation
        (server as any).completeAggregation(aggregationId);

        // Verify aggregated response was sent to CE and it used the primary's data
        expect(mockCEWs.send).toHaveBeenCalled();
        const aggregatedResponse = JSON.parse(mockCEWs.send.mock.calls[0][0]);
        expect(aggregatedResponse.type).toBe('response');
        expect(aggregatedResponse.command).toBe('response_get_FileTree');
        expect(aggregatedResponse.payload.data.fileTreeString).toBe('primary tree');
    });
});

describe('IPCServer - Secondary Role', () => {
    let mockOutputChannel: MockOutputChannel;
    let mockWorkspaceService: any;
    let mockConnectionService: any;
    let mockMultiWindowService: any;
    let mockCommandRegistry: any;
    let server: IPCServer;
    let mockPrimaryWs: MockWebSocket;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOutputChannel = new MockOutputChannel();
        
        mockWorkspaceService = {
            getWorkspaceFolders: jest.fn().mockReturnValue([{
                uri: vscode.Uri.parse('file:///workspace2'),
                name: 'Workspace2',
                index: 0
            }]),
            isWorkspaceTrusted: jest.fn().mockReturnValue(true),
            getWorkspaceFolder: jest.fn(),
            ensureWorkspaceTrustedAndOpen: jest.fn().mockResolvedValue(undefined)
        };
        
        mockConnectionService = {
            startServer: jest.fn().mockResolvedValue(30001),
            sendMessage: jest.fn(),
            sendError: jest.fn(),
            getClients: jest.fn().mockReturnValue(new Map()),
            updateClient: jest.fn(),
            stop: jest.fn()
        };
        
        mockMultiWindowService = {
            start: jest.fn().mockResolvedValue(undefined),
            getIsPrimary: jest.fn().mockReturnValue(false), // Secondary
            getSecondaryClients: jest.fn().mockReturnValue(new Map()),
            handleRegisterSecondary: jest.fn(),
            handleUnregisterSecondary: jest.fn(),
            broadcastToSecondaries: jest.fn(),
            handleForwardedResponse: jest.fn(),
            handleForwardedPush: jest.fn(),
            handleSnippetSendRequest: jest.fn(),
            removeSecondaryClient: jest.fn(),
            sendResponseToPrimary: jest.fn(),
            stop: jest.fn(),
            onForwardRequestReceived: undefined
        };
        
        mockCommandRegistry = {
            register: jest.fn(),
            getHandler: jest.fn().mockImplementation((command: string) => {
                // Return a mock handler for known commands
                if (command === 'get_contents_for_files') {
                    return {
                        handle: jest.fn().mockResolvedValue({
                            success: true,
                            data: [
                                {
                                    fileData: { fullPath: '/workspace/file1.ts', content: 'console.log("file1");', languageId: 'typescript' },
                                    metadata: { unique_block_id: 'test-id-1', content_source_id: 'file:///workspace/file1.ts', type: 'file_content', label: 'file1.ts', workspaceFolderUri: 'file:///workspace', workspaceFolderName: 'TestWorkspace', windowId: 'primary-window-id' },
                                    windowId: 'primary-window-id'
                                },
                                {
                                    fileData: { fullPath: '/workspace/file2.js', content: 'console.log("file2");', languageId: 'javascript' },
                                    metadata: { unique_block_id: 'test-id-2', content_source_id: 'file:///workspace/file2.js', type: 'file_content', label: 'file2.js', workspaceFolderUri: 'file:///workspace', workspaceFolderName: 'TestWorkspace', windowId: 'primary-window-id' },
                                    windowId: 'primary-window-id'
                                }
                            ],
                            errors: [
                                { uri: 'file:///workspace/nonexistent.txt', error: 'File not found', errorCode: 'FILE_NOT_FOUND' }
                            ],
                            error: null
                        })
                    };
                } else if (command === 'search_workspace') {
                    return {
                        handle: jest.fn().mockResolvedValue({
                            success: true,
                            data: {
                                results: [{
                                    path: '/workspace/test-file.js',
                                    name: 'test-file.js',
                                    type: 'file',
                                    uri: 'file:///workspace/test-file.js',
                                    content_source_id: 'file:///workspace/test-file.js',
                                    workspaceFolderUri: 'file:///workspace',
                                    workspaceFolderName: 'TestWorkspace',
                                    relativePath: 'test-file.js',
                                    windowId: 'secondary-window-id'
                                }],
                                windowId: 'secondary-window-id'
                            },
                            error: null
                        })
                    };
                }
                return undefined;
            })
        };

        // Create server instance
        server = new IPCServer(
            'secondary-window-id',
            mockContext,
            mockOutputChannel as any,
            mockWorkspaceService,
            mockConnectionService,
            mockMultiWindowService,
            mockCommandRegistry
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

        // Verify MultiWindowService.handleSnippetSendRequest was called
        expect(mockMultiWindowService.handleSnippetSendRequest).toHaveBeenCalledWith(
            snippetData,
            mockConnectionService
        );
    });

    test('should handle forwarded request and send back response', async () => {
        // Create forwarded request
        const originalRequest: IPCMessageRequest = {
            protocol_version: "1.0",
            message_id: uuidv4(),
            type: "request",
            command: "search_workspace",
            payload: { query: "test", workspaceFolderUri: null }
        };

        const aggregationId = uuidv4();

        // Clear previous mock calls
        jest.clearAllMocks();

        // Mock ConnectionService.sendMessage to actually capture the sent payload
        let capturedPayload: any = null;
        mockConnectionService.sendMessage.mockImplementation((ws: any, type: any, command: any, payload: any, message_id?: string) => {
            capturedPayload = payload;
            // Simulate calling the mock WebSocket send method
            if (ws && ws.send) {
                const message = {
                    protocol_version: '1.0',
                    message_id: message_id || 'test-id',
                    type,
                    command,
                    payload
                };
                ws.send(JSON.stringify(message));
            }
        });

        // Call the handleForwardedRequest method directly
        await server['handleForwardedRequest'](originalRequest, aggregationId);

        // Verify that ConnectionService.sendMessage was called (which means the command was handled)
        expect(mockConnectionService.sendMessage).toHaveBeenCalled();
        
        // Verify that the MultiWindowService.sendResponseToPrimary was eventually called
        expect(mockMultiWindowService.sendResponseToPrimary).toHaveBeenCalledWith(
            aggregationId,
            capturedPayload
        );
    });
});
