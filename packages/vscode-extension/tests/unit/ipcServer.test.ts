/**
 * @file ipcServer.test.ts
 * @description Unit tests for the IPCServer class.
 * @module ContextWeaver/VSCE/Tests
 */

// Mock 'vscode' first and very carefully, as it's a complex dependency.
// Variables used in the mock factory must be defined BEFORE the jest.doMock call.
const mockShowInformationMessage = jest.fn();
const mockShowErrorMessage = jest.fn();
const mockShowWarningMessage = jest.fn(); // Added for showWarningMessage
const mockOutputChannelAppendInstance = jest.fn();
const mockOutputChannelAppendLineInstance = jest.fn();
const mockOutputChannelClearInstance = jest.fn();
const mockOutputChannelDisposeInstance = jest.fn();
const mockOutputChannelHideInstance = jest.fn();
const mockOutputChannelShowInstance = jest.fn();
const mockVSCodeWindow = {
  showInformationMessage: mockShowInformationMessage,
  showErrorMessage: mockShowErrorMessage,
  showWarningMessage: mockShowWarningMessage, // Added for showWarningMessage
  createOutputChannel: jest.fn().mockImplementation(() => ({
    append: mockOutputChannelAppendInstance,
    appendLine: mockOutputChannelAppendLineInstance,
    clear: mockOutputChannelClearInstance,
    dispose: mockOutputChannelDisposeInstance,
    hide: mockOutputChannelHideInstance,
    show: mockOutputChannelShowInstance,
    name: 'mockOutputChannel',
    replace: jest.fn(),
  })),
  activeTextEditor: undefined, // Default to no active editor
};

const mockVSCodeWorkspace = {
  workspaceFolders: undefined, // Default to no workspace folders
  isTrusted: true, // Default to trusted
  getWorkspaceFolder: jest.fn(),
  getConfiguration: jest.fn(() => ({
    get: jest.fn((key: string) => {
      if (key === 'contextweaver.ipc.port') return 30001; // Default port
      return undefined;
    }),
    update: jest.fn(),
  })),
  textDocuments: [], // Default to no open documents
  onDidOpenTextDocument: jest.fn(),
  onDidCloseTextDocument: jest.fn(),
  onDidChangeWorkspaceFolders: jest.fn(),
  onDidSaveTextDocument: jest.fn(),
  fs: {
    readFile: jest.fn(),
    readDirectory: jest.fn(),
    stat: jest.fn(),
    writeFile: jest.fn(),
    delete: jest.fn(),
    createDirectory: jest.fn(),
    rename: jest.fn(),
    copy: jest.fn(),
  }
};

const mockVSCodeUri = {
  file: jest.fn((path: string) => ({
    fsPath: path,
    path: path,
    scheme: 'file',
    toString: () => `file://${path}`,
    with: jest.fn(),
    toJSON: () => ({ fsPath: path, path: path, scheme: 'file' }),
  })),
  parse: jest.fn((uriString: string, strict?: boolean) => {
    let fsPath = uriString;
    let path = uriString;
    let scheme = 'unknown';
    let authority = '';
    let query = '';
    let fragment = '';
    
    if (uriString.startsWith('file:///')) {
      fsPath = uriString.substring('file:///'.length);
      if (!fsPath.startsWith('/')) fsPath = '/' + fsPath;
      path = fsPath;
      scheme = 'file';
    } else if (uriString.startsWith('file:')) {
      fsPath = uriString.substring('file:'.length);
      if (!fsPath.startsWith('/')) fsPath = '/' + fsPath;
      path = fsPath;
      scheme = 'file';
    }
    
    return {
      fsPath: fsPath,
      path: path,
      scheme: scheme,
      authority,
      query,
      fragment,
      toString: () => uriString,
      with: jest.fn().mockReturnThis(),
      toJSON: () => ({ fsPath: fsPath, path: path, scheme: scheme }),
    } as vscode.Uri;
  }),
  joinPath: jest.fn((base: any, ...pathSegments: string[]) => {
    const joinedPath = [base.fsPath, ...pathSegments].join('/');
    return {
      fsPath: joinedPath,
      path: joinedPath,
      scheme: base.scheme,
      toString: () => `${base.scheme}://${joinedPath}`,
      with: jest.fn(),
      toJSON: () => ({ fsPath: joinedPath, path: joinedPath, scheme: base.scheme }),
    };
  }),
};

const mockVSCodeExtensionContext = {
  subscriptions: [],
  workspaceState: { get: jest.fn(), update: jest.fn() },
  globalState: { get: jest.fn(), update: jest.fn(), setKeysForSync: jest.fn() },
  extensionPath: '/mock/extension/path',
  storagePath: '/mock/storage/path',
  globalStoragePath: '/mock/globalStorage/path',
  logPath: '/mock/log/path',
  extensionUri: mockVSCodeUri.file('/mock/extension/path'),
  storageUri: mockVSCodeUri.file('/mock/storage/path'),
  globalStorageUri: mockVSCodeUri.file('/mock/globalStorage/path'),
  logUri: mockVSCodeUri.file('/mock/log/path'),
  secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn(), onDidChange: jest.fn() },
  extensionMode: 1,
  environmentVariableCollection: {
    persistent: false, replace: jest.fn(), append: jest.fn(), prepend: jest.fn(),
    get: jest.fn(), forEach: jest.fn(), delete: jest.fn(), clear: jest.fn(), [Symbol.iterator]: jest.fn(),
  }
};

jest.doMock('vscode', () => ({
  window: mockVSCodeWindow,
  workspace: mockVSCodeWorkspace,
  Uri: mockVSCodeUri,
  ExtensionContext: jest.fn().mockImplementation(() => mockVSCodeExtensionContext),
  OutputChannel: jest.fn().mockImplementation(() => ({
    append: mockOutputChannelAppendInstance, appendLine: mockOutputChannelAppendLineInstance,
    clear: mockOutputChannelClearInstance, dispose: mockOutputChannelDisposeInstance,
    hide: mockOutputChannelHideInstance, show: mockOutputChannelShowInstance,
    name: 'mockOutputChannelName', replace: jest.fn(),
  })),
  FileType: { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 },
}), { virtual: true });

// Mock 'ws'
interface MinimalWebSocket {
  on: jest.Mock; send: jest.Mock; close: jest.Mock; removeAllListeners: jest.Mock; terminate: jest.Mock;
}
interface MinimalWebSocketServer {
  on: jest.Mock; close: jest.Mock<void, [((err?: Error) => void)?]>; removeAllListeners: jest.Mock;
}

const capturedWssEventListeners: { [key: string]: ((...args: any[]) => void)[] } = {};

const mockWebSocketInstance: MinimalWebSocket = {
  on: jest.fn(), send: jest.fn(), close: jest.fn(), removeAllListeners: jest.fn(), terminate: jest.fn(),
};
const mockWebSocketServerInstance: MinimalWebSocketServer = {
  on: jest.fn((event: string, callback: (...args: any[]) => void) => {
    if (!capturedWssEventListeners[event]) {
      capturedWssEventListeners[event] = [];
    }
    capturedWssEventListeners[event].push(callback);
    return mockWebSocketServerInstance;
  }),
  close: jest.fn((callback?: (err?: Error) => void) => { if (callback) callback(); }),
  removeAllListeners: jest.fn(() => {
    for (const key in capturedWssEventListeners) { delete capturedWssEventListeners[key]; }
  }),
};
jest.doMock('ws', () => ({
  WebSocketServer: jest.fn().mockImplementation(() => mockWebSocketServerInstance),
  WebSocket: jest.fn().mockImplementation(() => mockWebSocketInstance),
}));

const mockUuidV4 = jest.fn();
jest.doMock('uuid', () => ({ v4: mockUuidV4 }));

const mockParseGitignore = jest.fn();
const mockGetFileTree = jest.fn();
const mockGetFileContent = jest.fn();
const mockGetFolderContents = jest.fn();
const mockGetWorkspaceCodebaseContents = jest.fn();
jest.doMock('../../src/fileSystemService', () => ({
  parseGitignore: mockParseGitignore, getFileTree: mockGetFileTree, getFileContent: mockGetFileContent,
  getFolderContents: mockGetFolderContents, getWorkspaceCodebaseContents: mockGetWorkspaceCodebaseContents,
}));

const mockSearchServiceSearch = jest.fn();
jest.doMock('../../src/searchService', () => ({
  SearchService: jest.fn().mockImplementation(() => ({ search: mockSearchServiceSearch })),
}));

const mockWorkspaceServiceEnsureTrusted = jest.fn();
const mockWorkspaceServiceGetDetails = jest.fn();
const mockWorkspaceServiceIsTrusted = jest.fn().mockReturnValue(true);
const mockWorkspaceServiceGetFolders = jest.fn().mockReturnValue([]);
const mockWorkspaceServiceGetFolder = jest.fn();
jest.doMock('../../src/workspaceService', () => ({
  WorkspaceService: jest.fn().mockImplementation(() => ({
    ensureWorkspaceTrustedAndOpen: mockWorkspaceServiceEnsureTrusted,
    getWorkspaceDetailsForIPC: mockWorkspaceServiceGetDetails,
    isWorkspaceTrusted: mockWorkspaceServiceIsTrusted,
    getWorkspaceFolders: mockWorkspaceServiceGetFolders,
    getWorkspaceFolder: mockWorkspaceServiceGetFolder,
  })),
  WorkspaceServiceError: class MockWorkspaceServiceError extends Error {
    public code: string;
    constructor(code: string, message: string) { super(message); this.code = code; this.name = 'WorkspaceServiceError'; }
  },
}));

import { IPCServer } from '../../src/ipcServer';
import * as vscode from 'vscode';
import { Server as ActualWebSocketServer_Type, WebSocket as ActualWebSocket_Type } from 'ws';
import { SearchService } from '../../src/searchService';
import { WorkspaceService, WorkspaceServiceError } from '../../src/workspaceService';

let ipcServer: IPCServer;
let mockExtensionContext: vscode.ExtensionContext;
let mockOutputChannel: jest.Mocked<vscode.OutputChannel>;
let mockSearchServiceInstance: SearchService;
let mockWorkspaceServiceInstance: WorkspaceService;
let mockConsoleError: jest.SpyInstance;

const TEST_PORT = 30001;

beforeEach(() => {
  jest.clearAllMocks();
  for (const key in capturedWssEventListeners) { delete capturedWssEventListeners[key]; }

  mockWebSocketServerInstance.on.mockClear();
  mockWebSocketServerInstance.close.mockClear();
  mockWebSocketServerInstance.removeAllListeners.mockClear();

  (vscode.window.showInformationMessage as jest.Mock).mockClear();
  (vscode.window.showErrorMessage as jest.Mock).mockClear();
  (vscode.window.showWarningMessage as jest.Mock).mockClear(); // Added for showWarningMessage
  (vscode.window.createOutputChannel as jest.Mock).mockClear();
  mockExtensionContext = new ((vscode as any).ExtensionContext)();
  mockOutputChannelAppendInstance.mockClear();
  mockOutputChannelAppendLineInstance.mockClear();
  mockOutputChannelClearInstance.mockClear();
  mockOutputChannelDisposeInstance.mockClear();
  mockOutputChannelHideInstance.mockClear();
  mockOutputChannelShowInstance.mockClear();
  mockOutputChannel = vscode.window.createOutputChannel('ContextWeaver') as jest.Mocked<vscode.OutputChannel>;
  (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockOutputChannel);
  mockSearchServiceInstance = new SearchService(mockOutputChannel, mockWorkspaceServiceInstance);
  mockWorkspaceServiceInstance = new WorkspaceService(mockOutputChannel);
  mockWorkspaceServiceEnsureTrusted.mockResolvedValue(undefined);
  mockWorkspaceServiceGetDetails.mockReturnValue({ workspaceFolders: [], isTrusted: true });
  mockWorkspaceServiceIsTrusted.mockReturnValue(true);
  mockWorkspaceServiceGetFolders.mockReturnValue([]);
  mockUuidV4.mockReturnValue('mock-uuid-1234');
  mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console.error output during tests
});

describe('IPCServer', () => {
  afterEach(() => {
    if (mockConsoleError) {
      mockConsoleError.mockRestore();
    }
  });
  describe('Constructor and Start', () => {
    it('should initialize with given port and services', () => {
      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`Initialized with port ${TEST_PORT}.`));
    });

    it('should start WebSocket server and listen on the configured port', () => {
      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      ipcServer.start();
      const MockedWSConstructor = jest.requireMock('ws').WebSocketServer;
      expect(MockedWSConstructor).toHaveBeenCalledWith({ port: TEST_PORT });

      const listeningHandler = capturedWssEventListeners['listening']?.[0];
      expect(listeningHandler).toBeDefined();
      if (listeningHandler) listeningHandler();

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`WebSocket server listening on localhost:${TEST_PORT}`));
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(`ContextWeaver: IPC Server started on port ${TEST_PORT}.`);
    });

    it('should attempt port fallback if initial port is in use (EADDRINUSE)', () => {
      const initialPort = TEST_PORT;
      const nextPort = initialPort + 1;
      const MockedWSConstructor = jest.requireMock('ws').WebSocketServer;

      ipcServer = new IPCServer(initialPort, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      ipcServer.start();

      expect(MockedWSConstructor).toHaveBeenCalledWith({ port: initialPort });

      const firstErrorHandler = capturedWssEventListeners['error']?.[0];
      expect(firstErrorHandler).toBeDefined();
      if (firstErrorHandler) {
        const eaddrinuseError = new Error(`listen EADDRINUSE: address already in use :::${initialPort}`) as any;
        eaddrinuseError.code = 'EADDRINUSE';
        firstErrorHandler(eaddrinuseError);
      }

      expect(MockedWSConstructor).toHaveBeenCalledWith({ port: nextPort });
      const listeningHandlers = capturedWssEventListeners['listening'];
      const latestListeningHandler = listeningHandlers?.[listeningHandlers.length - 1];

      expect(latestListeningHandler).toBeDefined();
      if (latestListeningHandler) {
        latestListeningHandler();
      }

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`Port ${initialPort} is in use. Attempting next port.`));
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`WebSocket server listening on localhost:${nextPort}`));
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(`ContextWeaver: IPC Server started on port ${nextPort} (configured port ${initialPort} was busy).`);
    });

    it('should show error and fail if all port retries fail', () => {
      const initialPort = TEST_PORT;
      const MAX_PORT_RETRIES = 3;
      const MockedWSConstructor = jest.requireMock('ws').WebSocketServer;

      ipcServer = new IPCServer(initialPort, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      ipcServer.start();

      for (let i = 0; i <= MAX_PORT_RETRIES; i++) {
        expect(MockedWSConstructor).toHaveBeenCalledWith({ port: initialPort + i });
        const errorHandlers = capturedWssEventListeners['error'];
        const currentErrorHandler = errorHandlers?.[errorHandlers.length - 1];

        expect(currentErrorHandler).toBeDefined();
        if (currentErrorHandler) {
          const eaddrinuseError = new Error(`listen EADDRINUSE: address already in use :::${initialPort + i}`) as any;
          eaddrinuseError.code = 'EADDRINUSE';
          currentErrorHandler(eaddrinuseError);
        }
        // The IPCServer's internal logic should call removeAllListeners on the wss instance
        // when an EADDRINUSE error occurs and it's going to retry.
        // Our mock for removeAllListeners clears capturedWssEventListeners.
      }

      expect(MockedWSConstructor).toHaveBeenCalledTimes(MAX_PORT_RETRIES + 1);
      const failMsg = `ContextWeaver: IPC Server failed to start. Port ${initialPort} and ${MAX_PORT_RETRIES} alternatives are in use.`;
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(failMsg));
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(failMsg);
    });
  });

  describe('Client Connection and Basic Events', () => {
    let capturedConnectionCallback: (ws: ActualWebSocket_Type, req: any) => void;
    let mockClientWsInstance: MinimalWebSocket;
    const mockRequest = { socket: { remoteAddress: '127.0.0.1' } };

    beforeEach(() => {
      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      ipcServer.start();

      const listeningHandler = capturedWssEventListeners['listening']?.[0];
      if (listeningHandler) listeningHandler();
      else {
        const listeningCall = (mockWebSocketServerInstance.on as jest.Mock).mock.calls.find((call: any[]) => call[0] === 'listening');
        if (listeningCall && typeof listeningCall[1] === 'function') listeningCall[1]();
      }

      const connCallback = capturedWssEventListeners['connection']?.[0];
      if (connCallback) {
        capturedConnectionCallback = connCallback;
      } else {
        throw new Error("Could not capture 'connection' callback from WebSocketServer mock via capturedWssEventListeners.");
      }

      mockClientWsInstance = {
        on: jest.fn(), send: jest.fn(), close: jest.fn(), removeAllListeners: jest.fn(), terminate: jest.fn(),
      };
    });

    it('should handle new client connection, register client, and log', () => {
      expect(capturedConnectionCallback).toBeDefined();
      capturedConnectionCallback(mockClientWsInstance as any, mockRequest);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Client connected from 127.0.0.1'));
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Client from 127.0.0.1 authenticated'));
      expect(mockClientWsInstance.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockClientWsInstance.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockClientWsInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should handle client disconnection, remove listeners, and log', () => {
      capturedConnectionCallback(mockClientWsInstance as any, mockRequest);
      const clientOnMock = mockClientWsInstance.on as jest.Mock;
      const closeCall = clientOnMock.mock.calls.find((call: any[]) => call[0] === 'close');
      const closeCallback = closeCall?.[1];
      expect(closeCallback).toBeDefined();
      if (closeCallback) closeCallback();
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Client from 127.0.0.1 disconnected.'));
      expect(mockClientWsInstance.removeAllListeners).toHaveBeenCalled();
    });

    it('should handle client WebSocket error, remove listeners, and log', () => {
      capturedConnectionCallback(mockClientWsInstance as any, mockRequest);
      const clientOnMock = mockClientWsInstance.on as jest.Mock;
      const errorCall = clientOnMock.mock.calls.find((call: any[]) => call[0] === 'error');
      const errorCallback = errorCall?.[1];
      expect(errorCallback).toBeDefined();
      const testError = new Error('Test WebSocket error');
      if (errorCallback) errorCallback(testError);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`Error on WebSocket connection from 127.0.0.1: ${testError.message}`));
      expect(mockClientWsInstance.removeAllListeners).toHaveBeenCalled();
    });
  });

  describe('Message Handling (General and Invalid Messages)', () => {
    let server: IPCServer;
    let capturedConnectionCallback: (ws: ActualWebSocket_Type, req: any) => void;
    let mockClientWsInstance: MinimalWebSocket;
    let capturedClientMessageCallback: (message: string | Buffer) => void;
    const mockRequest = { socket: { remoteAddress: '127.0.0.1' } };

    beforeEach(() => {
      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      ipcServer.start();

      const listeningHandler = capturedWssEventListeners['listening']?.[0];
      if (listeningHandler) listeningHandler();
      else {
        const listeningCall = (mockWebSocketServerInstance.on as jest.Mock).mock.calls.find((call: any[]) => call[0] === 'listening');
        if (listeningCall && typeof listeningCall[1] === 'function') listeningCall[1]();
      }

      const connCallback = capturedWssEventListeners['connection']?.[0];
      if (!connCallback) throw new Error("Could not capture 'connection' callback.");
      capturedConnectionCallback = connCallback;

      mockClientWsInstance = {
        on: jest.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'message') capturedClientMessageCallback = callback;
        }),
        send: jest.fn(), close: jest.fn(), removeAllListeners: jest.fn(), terminate: jest.fn(),
      };
      // Simulate client connection to allow message handler to be set up
      capturedConnectionCallback(mockClientWsInstance as any, mockRequest);
      // Ensure message callback is captured
      if (!capturedClientMessageCallback) {
        const messageCall = (mockClientWsInstance.on as jest.Mock).mock.calls.find((call: any[]) => call[0] === 'message');
        if (messageCall && typeof messageCall[1] === 'function') {
          capturedClientMessageCallback = messageCall[1];
        } else {
          throw new Error("Could not capture 'message' callback from client WebSocket mock");
        }
      }
    });

    it('should send INVALID_MESSAGE_FORMAT for non-JSON message', async () => {
      const nonJsonMessage = "this is not json";
      await capturedClientMessageCallback(nonJsonMessage);

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.type).toBe('error_response');
      expect(sentMessage.payload.errorCode).toBe('INVALID_MESSAGE_FORMAT');
      expect(sentMessage.payload.error).toContain('Error parsing message');
    });

    it('should send INVALID_MESSAGE_FORMAT for JSON array (not object)', async () => {
      const jsonArrayMessage = JSON.stringify([1, 2, 3]);
      await capturedClientMessageCallback(jsonArrayMessage);

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.type).toBe('error_response');
      expect(sentMessage.payload.errorCode).toBe('INVALID_MESSAGE_FORMAT');
      expect(sentMessage.payload.error).toContain('Message is not a valid JSON object');
    });

    it('should send UNSUPPORTED_PROTOCOL_VERSION for wrong protocol version', async () => {
      const wrongVersionMessage = JSON.stringify({
        protocol_version: '0.9',
        message_id: 'test-id-proto',
        type: 'request',
        command: 'get_file_tree',
        payload: {}
      });
      await capturedClientMessageCallback(wrongVersionMessage);

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.type).toBe('error_response');
      expect(sentMessage.payload.errorCode).toBe('UNSUPPORTED_PROTOCOL_VERSION');
      expect(sentMessage.message_id).toBe('test-id-proto');
    });

    it('should send UNKNOWN_COMMAND for an unrecognized command', async () => {
      const unknownCommandMessage = JSON.stringify({
        protocol_version: '1.0',
        message_id: 'test-id-unknown',
        type: 'request',
        command: 'DO_MAGIC_TRICKS',
        payload: {}
      });
      // Mock workspace service to pass pre-checks if this command were to require them (it doesn't, but good practice)
      mockWorkspaceServiceEnsureTrusted.mockResolvedValue(undefined);
      await capturedClientMessageCallback(unknownCommandMessage);

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.type).toBe('error_response');
      expect(sentMessage.payload.errorCode).toBe('UNKNOWN_COMMAND');
      expect(sentMessage.payload.error).toContain('Unknown command: DO_MAGIC_TRICKS');
      expect(sentMessage.message_id).toBe('test-id-unknown');
    });
  });

  describe('Message Handling (Workspace Pre-checks)', () => {
    let server: IPCServer;
    let capturedConnectionCallback: (ws: ActualWebSocket_Type, req: any) => void;
    let mockClientWsInstance: MinimalWebSocket;
    let capturedClientMessageCallback: (message: string | Buffer) => void;
    const mockRequest = { socket: { remoteAddress: '127.0.0.1' } };
    const representativeCommand = 'get_file_tree'; // A command that requires workspace checks

    beforeEach(() => {
      // Reset all mocks
      jest.clearAllMocks();
      mockWorkspaceServiceEnsureTrusted.mockReset();
      mockWorkspaceServiceGetFolder.mockReset();
      mockWorkspaceServiceGetFolders.mockReset();
      mockGetFileTree.mockReset();

      // Initialize server
      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      ipcServer.start();

      // Handle server startup
      const listeningHandler = capturedWssEventListeners['listening']?.[0];
      if (listeningHandler) listeningHandler();
      else {
        const listeningCall = (mockWebSocketServerInstance.on as jest.Mock).mock.calls.find((call: any[]) => call[0] === 'listening');
        if (listeningCall && typeof listeningCall[1] === 'function') listeningCall[1]();
      }

      // Setup connection handling
      const connCallback = capturedWssEventListeners['connection']?.[0];
      if (!connCallback) throw new Error("Could not capture 'connection' callback.");
      capturedConnectionCallback = connCallback;

      // Setup client message handling
      mockClientWsInstance = {
        on: jest.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'message') capturedClientMessageCallback = callback;
        }),
        send: jest.fn(),
        close: jest.fn(),
        removeAllListeners: jest.fn(),
        terminate: jest.fn(),
      };

      // Initialize client connection
      capturedConnectionCallback(mockClientWsInstance as any, mockRequest);
      if (!capturedClientMessageCallback) {
        const messageCall = (mockClientWsInstance.on as jest.Mock).mock.calls.find((call: any[]) => call[0] === 'message');
        if (messageCall && typeof messageCall[1] === 'function') {
          capturedClientMessageCallback = messageCall[1];
        } else {
          throw new Error("Could not capture 'message' callback from client WebSocket mock");
        }
      }
    });

    it('should proceed to command handler if workspace checks pass', async () => {
      // Create mock objects
      const mockUriString = 'file:///test/project';
      const mockUri = {
        fsPath: '/test/project',
        path: '/test/project',
        scheme: 'file',
        toString: () => mockUriString
      };
      const mockWsFolder = {
        uri: mockUri,
        name: 'test-project',
        index: 0
      };

      // Setup workspace service mocks
      mockWorkspaceServiceEnsureTrusted.mockResolvedValue(undefined);
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWsFolder);
      mockWorkspaceServiceGetFolders.mockReturnValue([mockWsFolder]);
      (vscode.Uri.parse as jest.Mock).mockReturnValue(mockUri);

      // Setup file tree mock
      mockGetFileTree.mockReturnValue(Promise.resolve({
        tree: 'mock tree',
        filterTypeApplied: 'default'
      }));

      // Send test message
      const message = JSON.stringify({
        protocol_version: '1.0',
        message_id: 'test-id',
        type: 'request',
        command: 'get_file_tree',
        payload: { workspaceFolderUri: mockUriString }
      });

      // Get message handler
      const messageHandler = (mockClientWsInstance.on as jest.Mock).mock.calls
        .find((call: any[]) => call[0] === 'message')?.[1];
      if (!messageHandler) throw new Error('Message handler not found');

      // Process message
      await messageHandler(message);

      // Clear mock to see only the calls made during message processing
      mockGetFileTree.mockClear();

      // Trigger getFileTree
      await ipcServer['handleGetFileTree'](
        { ip: '127.0.0.1', isAuthenticated: true, ws: mockClientWsInstance } as any,
        { workspaceFolderUri: mockUriString },
        'test-id'
      );

      // Verify workflow
      expect(mockWorkspaceServiceEnsureTrusted).toHaveBeenCalledTimes(1);
      expect(mockWorkspaceServiceGetFolder).toHaveBeenCalledWith(mockUri);
      expect(mockGetFileTree).toHaveBeenCalledWith(mockWsFolder);
    });

    it('should send WORKSPACE_NOT_TRUSTED error if ensureWorkspaceTrustedAndOpen throws it', async () => {
      const errorCode = 'WORKSPACE_NOT_TRUSTED';
      const errorMessage = 'Workspace is not trusted by the user.';
      mockWorkspaceServiceEnsureTrusted.mockRejectedValue(new WorkspaceServiceError(errorCode, errorMessage));

      const message = JSON.stringify({
        protocol_version: '1.0',
        message_id: 'test-ws-check-untrusted',
        type: 'request',
        command: representativeCommand,
        payload: {}
      });
      await capturedClientMessageCallback(message);

      expect(mockWorkspaceServiceEnsureTrusted).toHaveBeenCalledTimes(1);
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.type).toBe('error_response');
      expect(sentMessage.payload.errorCode).toBe(errorCode);
      expect(sentMessage.payload.error).toBe(errorMessage);
      expect(sentMessage.message_id).toBe('test-ws-check-untrusted');
    });

    it('should send NO_WORKSPACE_OPEN error if ensureWorkspaceTrustedAndOpen throws it', async () => {
      const errorCode = 'NO_WORKSPACE_OPEN';
      const errorMessage = 'No workspace is open.';
      mockWorkspaceServiceEnsureTrusted.mockRejectedValue(new WorkspaceServiceError(errorCode, errorMessage));

      const message = JSON.stringify({
        protocol_version: '1.0',
        message_id: 'test-ws-check-no-workspace',
        type: 'request',
        command: representativeCommand,
        payload: {}
      });
      await capturedClientMessageCallback(message);

      expect(mockWorkspaceServiceEnsureTrusted).toHaveBeenCalledTimes(1);
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.type).toBe('error_response');
      expect(sentMessage.payload.errorCode).toBe(errorCode);
      expect(sentMessage.payload.error).toBe(errorMessage);
    });

    it('should send INTERNAL_SERVER_ERROR for unexpected errors from ensureWorkspaceTrustedAndOpen', async () => {
      const errorMessage = 'Unexpected cosmic ray interference.';
      mockWorkspaceServiceEnsureTrusted.mockRejectedValue(new Error(errorMessage)); // Generic error

      const message = JSON.stringify({
        protocol_version: '1.0',
        message_id: 'test-ws-check-unexpected-err',
        type: 'request',
        command: representativeCommand,
        payload: {}
      });
      await capturedClientMessageCallback(message);

      expect(mockWorkspaceServiceEnsureTrusted).toHaveBeenCalledTimes(1);
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.type).toBe('error_response');
      expect(sentMessage.payload.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(sentMessage.payload.error).toContain(errorMessage);
    });
  });

  describe('Message Handling (register_active_target)', () => {
    let server: IPCServer;
    let capturedConnectionCallback: (ws: ActualWebSocket_Type, req: any) => void;
    let mockClientWsInstance: MinimalWebSocket;
    let capturedClientMessageCallback: (message: string | Buffer) => void;
    const mockRequest = { socket: { remoteAddress: '127.0.0.1' } };
    let clientRepresentation: any; // To inspect client state on the server

    beforeEach(() => {
      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      // Access the internal clients map for assertion (use with caution, for testing only)
      clientRepresentation = (ipcServer as any).clients; 
      ipcServer.start();
      
      const listeningHandler = capturedWssEventListeners['listening']?.[0];
      if (listeningHandler) listeningHandler();
      else {
        const listeningCall = (mockWebSocketServerInstance.on as jest.Mock).mock.calls.find((call: any[]) => call[0] === 'listening');
        if (listeningCall && typeof listeningCall[1] === 'function') listeningCall[1]();
      }

      const connCallback = capturedWssEventListeners['connection']?.[0];
      if (!connCallback) throw new Error("Could not capture 'connection' callback.");
      capturedConnectionCallback = connCallback;

      mockClientWsInstance = { 
        on: jest.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'message') capturedClientMessageCallback = callback;
        }), 
        send: jest.fn(), close: jest.fn(), removeAllListeners: jest.fn(), terminate: jest.fn(),
      };
      // Simulate client connection
      capturedConnectionCallback(mockClientWsInstance as any, mockRequest);
      if (!capturedClientMessageCallback) {
         const messageCall = (mockClientWsInstance.on as jest.Mock).mock.calls.find((call: any[]) => call[0] === 'message');
         if (messageCall && typeof messageCall[1] === 'function') {
            capturedClientMessageCallback = messageCall[1];
         } else {
            throw new Error("Could not capture 'message' callback from client WebSocket mock");
         }
      }
    });

    it('should register active target and send generic ack', async () => {
      const tabId = 123;
      const llmHost = 'example.com';
      const messageId = 'reg-target-1';

      const message = JSON.stringify({
        protocol_version: '1.0',
        message_id: messageId,
        type: 'request',
        command: 'register_active_target',
        payload: { tabId, llmHost }
      });

      await capturedClientMessageCallback(message);

      // Verify client state on server
      const serverSideClient = Array.from(clientRepresentation.values())[0] as any;
      expect(serverSideClient).toBeDefined();
      expect(serverSideClient.activeLLMTabId).toBe(tabId);
      expect(serverSideClient.activeLLMHost).toBe(llmHost);

      // Verify acknowledgment message
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.type).toBe('response');
      expect(sentMessage.command).toBe('response_generic_ack');
      expect(sentMessage.message_id).toBe(messageId);
      expect(sentMessage.payload.success).toBe(true);
      expect(sentMessage.payload.message).toBe('Target registered successfully.');
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`Registered active target for client 127.0.0.1: TabID ${tabId}, Host ${llmHost}`));
    });
  });

  describe('Message Handling (get_workspace_details)', () => {
    let server: IPCServer;
    let capturedConnectionCallback: (ws: ActualWebSocket_Type, req: any) => void;
    let mockClientWsInstance: MinimalWebSocket;
    let capturedClientMessageCallback: (message: string | Buffer) => void;
    const mockRequest = { socket: { remoteAddress: '127.0.0.1' } };

    beforeEach(() => {
      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      ipcServer.start();
      
      const listeningHandler = capturedWssEventListeners['listening']?.[0];
      if (listeningHandler) listeningHandler();
      else {
        const listeningCall = (mockWebSocketServerInstance.on as jest.Mock).mock.calls.find((call: any[]) => call[0] === 'listening');
        if (listeningCall && typeof listeningCall[1] === 'function') listeningCall[1]();
      }

      const connCallback = capturedWssEventListeners['connection']?.[0];
      if (!connCallback) throw new Error("Could not capture 'connection' callback.");
      capturedConnectionCallback = connCallback;

      mockClientWsInstance = { 
        on: jest.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'message') capturedClientMessageCallback = callback;
        }), 
        send: jest.fn(), close: jest.fn(), removeAllListeners: jest.fn(), terminate: jest.fn(),
      };
      capturedConnectionCallback(mockClientWsInstance as any, mockRequest);
      if (!capturedClientMessageCallback) {
         const messageCall = (mockClientWsInstance.on as jest.Mock).mock.calls.find((call: any[]) => call[0] === 'message');
         if (messageCall && typeof messageCall[1] === 'function') {
            capturedClientMessageCallback = messageCall[1];
         } else {
            throw new Error("Could not capture 'message' callback from client WebSocket mock");
         }
      }
      // Reset relevant mocks for this suite
      mockWorkspaceServiceGetDetails.mockReset();
      mockWorkspaceServiceIsTrusted.mockReset();
      // ensureWorkspaceTrustedAndOpen is called before get_workspace_details handler by the central pre-check
      mockWorkspaceServiceEnsureTrusted.mockReset().mockResolvedValue(undefined); 
    });

    it('should return empty workspace details if no workspace is open/trusted', async () => {
      mockWorkspaceServiceGetDetails.mockReturnValue(null); // Simulate no folders from service
      mockWorkspaceServiceIsTrusted.mockReturnValue(true); // Workspace itself might be trusted, but no folders
      const messageId = 'ws-details-empty';
      const message = JSON.stringify({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: 'get_workspace_details', payload: {}
      });
      await capturedClientMessageCallback(message);

      expect(mockWorkspaceServiceGetDetails).toHaveBeenCalledTimes(1);
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.command).toBe('response_workspace_details');
      expect(sentMessage.message_id).toBe(messageId);
      expect(sentMessage.payload.success).toBe(true);
      expect(sentMessage.payload.data.workspaceFolders).toEqual([]);
      expect(sentMessage.payload.data.isTrusted).toBe(true);
    });

    it('should return details for a single trusted workspace folder', async () => {
      const singleFolder = [{ uri: 'file:///project1', name: 'Project Alpha', isTrusted: true }];
      mockWorkspaceServiceGetDetails.mockReturnValue(singleFolder);
      mockWorkspaceServiceIsTrusted.mockReturnValue(true);
      const messageId = 'ws-details-single';
      const message = JSON.stringify({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: 'get_workspace_details', payload: {}
      });
      await capturedClientMessageCallback(message);

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.payload.success).toBe(true);
      expect(sentMessage.payload.data.workspaceFolders).toEqual(singleFolder);
      expect(sentMessage.payload.data.isTrusted).toBe(true);
    });

    it('should return details for multiple trusted workspace folders', async () => {
      const multiFolders = [
        { uri: 'file:///project1', name: 'Project Alpha', isTrusted: true },
        { uri: 'file:///project2', name: 'Project Beta', isTrusted: true }
      ];
      mockWorkspaceServiceGetDetails.mockReturnValue(multiFolders);
      mockWorkspaceServiceIsTrusted.mockReturnValue(true);
      const messageId = 'ws-details-multi';
      const message = JSON.stringify({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: 'get_workspace_details', payload: {}
      });
      await capturedClientMessageCallback(message);
      
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.payload.success).toBe(true);
      expect(sentMessage.payload.data.workspaceFolders).toEqual(multiFolders);
      expect(sentMessage.payload.data.isTrusted).toBe(true);
    });

    it('should handle overall workspace being untrusted', async () => {
      // Even if getWorkspaceDetailsForIPC returns folders, isWorkspaceTrusted is the overall status
      const folders = [{ uri: 'file:///project1', name: 'Project Alpha', isTrusted: false }]; 
      mockWorkspaceServiceGetDetails.mockReturnValue(folders);
      mockWorkspaceServiceIsTrusted.mockReturnValue(false); // Overall workspace is untrusted
      const messageId = 'ws-details-untrusted';
      const message = JSON.stringify({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: 'get_workspace_details', payload: {}
      });
      await capturedClientMessageCallback(message);

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.payload.success).toBe(true); // Command itself succeeds in fetching details
      expect(sentMessage.payload.data.workspaceFolders).toEqual(folders);
      expect(sentMessage.payload.data.isTrusted).toBe(false);
    });

    it('should send error if workspaceService.getWorkspaceDetailsForIPC throws WorkspaceServiceError', async () => {
      const errorCode = 'SOME_SERVICE_ERROR';
      const errorMessage = 'Service failed to get details.';
      mockWorkspaceServiceGetDetails.mockImplementation(() => {
        throw new WorkspaceServiceError(errorCode, errorMessage);
      });
      const messageId = 'ws-details-service-error';
      const message = JSON.stringify({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: 'get_workspace_details', payload: {}
      });
      await capturedClientMessageCallback(message);

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.type).toBe('error_response');
      expect(sentMessage.payload.errorCode).toBe(errorCode);
      expect(sentMessage.payload.error).toContain(errorMessage);
    });

    it('should send INTERNAL_SERVER_ERROR if workspaceService.getWorkspaceDetailsForIPC throws generic Error', async () => {
      const errorMessage = 'Generic service failure.';
      mockWorkspaceServiceGetDetails.mockImplementation(() => {
        throw new Error(errorMessage);
      });
      const messageId = 'ws-details-generic-error';
      const message = JSON.stringify({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: 'get_workspace_details', payload: {}
      });
      await capturedClientMessageCallback(message);

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMessage = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.type).toBe('error_response');
      expect(sentMessage.payload.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(sentMessage.payload.error).toContain(errorMessage);
    });

  });

  describe('Message Handling (get_file_tree)', () => {
    let server: IPCServer;
    let capturedConnectionCallback: (ws: ActualWebSocket_Type, req: any) => void;
    let mockClientWsInstance: MinimalWebSocket;
    let capturedClientMessageCallback: (message: string | Buffer) => void;
    const mockRequest = { socket: { remoteAddress: '127.0.0.1' } };
    const commandToTest = 'get_file_tree';

    // Create mock workspace folders with consistent references
    const mockWorkspaceFolder1Uri = 'file:///project/alpha';
    const mockWorkspaceFolder1Name = 'alpha';
    const mockUri1 = {
      fsPath: '/project/alpha',
      path: '/project/alpha',
      scheme: 'file',
      authority: '',
      query: '',
      fragment: '',
      toString: () => mockWorkspaceFolder1Uri,
      with: jest.fn().mockReturnThis(),
      toJSON: () => ({ fsPath: '/project/alpha', path: '/project/alpha', scheme: 'file' }),
    } as vscode.Uri;
    const mockWorkspaceFolder1 = { uri: mockUri1, name: mockWorkspaceFolder1Name, index: 0 } as vscode.WorkspaceFolder;
    
    const mockWorkspaceFolder2Uri = 'file:///project/beta';
    const mockWorkspaceFolder2Name = 'beta';
    const mockUri2 = {
      fsPath: '/project/beta',
      path: '/project/beta',
      scheme: 'file',
      authority: '',
      query: '',
      fragment: '',
      toString: () => mockWorkspaceFolder2Uri,
      with: jest.fn().mockReturnThis(),
      toJSON: () => ({ fsPath: '/project/beta', path: '/project/beta', scheme: 'file' }),
    } as vscode.Uri;
    const mockWorkspaceFolder2 = { uri: mockUri2, name: mockWorkspaceFolder2Name, index: 1 } as vscode.WorkspaceFolder;
    
    // Log the objects to see what's happening
    console.log('Mock folder 1:', JSON.stringify(mockWorkspaceFolder1));
    console.log('Mock folder 1 URI:', JSON.stringify(mockUri1));
    console.log('Mock folder 2:', JSON.stringify(mockWorkspaceFolder2));
    console.log('Mock folder 2 URI:', JSON.stringify(mockUri2));

    beforeEach(async () => {
      // Reset all mocks
      jest.clearAllMocks();

      // Set up vscode.Uri.parse mock
      (vscode.Uri.parse as jest.Mock).mockImplementation((uriString: string) => {
        if (uriString === mockWorkspaceFolder1Uri) {
          return mockUri1;
        }
        if (uriString === mockWorkspaceFolder2Uri) {
          return mockUri2;
        }
        return {
          fsPath: uriString.startsWith('file:///') ? uriString.substring('file:///'.length) : uriString,
          path: uriString.startsWith('file:///') ? uriString.substring('file:///'.length) : uriString,
          scheme: 'file',
          toString: () => uriString,
        } as vscode.Uri;
      });

      // Set up default mock behavior
      mockWorkspaceServiceEnsureTrusted.mockResolvedValue(undefined);
      mockWorkspaceServiceGetFolder.mockImplementation((uri: vscode.Uri) => {
        if (uri.toString() === mockWorkspaceFolder1Uri) {
          return mockWorkspaceFolder1;
        }
        if (uri.toString() === mockWorkspaceFolder2Uri) {
          return mockWorkspaceFolder2;
        }
        return undefined;
      });
      mockWorkspaceServiceGetFolders.mockReturnValue([mockWorkspaceFolder1]);
      mockUuidV4.mockReturnValue('mock-uuid-filetree');

      // Initialize IPC server
      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      ipcServer.start();

      // Handle server startup
      const listeningHandler = capturedWssEventListeners['listening']?.[0];
      if (listeningHandler) listeningHandler();

      // Set up client
      mockClientWsInstance = {
        on: jest.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'message') capturedClientMessageCallback = callback;
        }),
        send: jest.fn(),
        close: jest.fn(),
        removeAllListeners: jest.fn(),
        terminate: jest.fn(),
      };

      // Initialize client connection
      const connCallback = capturedWssEventListeners['connection']?.[0];
      if (!connCallback) throw new Error('Could not capture connection callback');
      capturedConnectionCallback = connCallback;
      capturedConnectionCallback(mockClientWsInstance as any, mockRequest);

      // Ensure we have message handler
      if (!capturedClientMessageCallback) {
        throw new Error('No message callback captured');
      }

      await mockWorkspaceServiceEnsureTrusted();
    });

    // Helper to wrap message callback in a promise
    const sendTestMessage = async (message: any): Promise<void> => {
      const messageString = typeof message === 'string' ? message : JSON.stringify(message);
      await new Promise<void>((resolve) => {
        mockClientWsInstance.send.mockImplementation(() => {
          resolve();
        });
        capturedClientMessageCallback(messageString);
      });
    };

    it('should return file tree for a specified valid workspace folder', async () => {
      const mockUri = mockUri1;
      const mockWsFolder = mockWorkspaceFolder1;
      const mockUriString = mockWorkspaceFolder1Uri;

      // Setup mocks with known reference objects
      (vscode.Uri.parse as jest.Mock).mockReturnValue(mockUri);
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWsFolder);
      mockGetFileTree.mockResolvedValue({ tree: 'alpha-tree', filterTypeApplied: 'gitignore' });

      // Send test message 
      const messageId = 'ft-valid-spec';
      const message = {
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { workspaceFolderUri: mockUriString }
      };
      await sendTestMessage(message);

      // Verify workflow
      expect(mockWorkspaceServiceGetFolder).toHaveBeenCalledWith(expect.objectContaining({
        fsPath: mockUri.fsPath,
        scheme: mockUri.scheme
      }));
      expect(mockGetFileTree).toHaveBeenCalledWith(mockWsFolder); // Direct object match since we're using shared reference
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.command).toBe('response_file_tree');
      expect(sentMsg.message_id).toBe(messageId);
      expect(sentMsg.payload.success).toBe(true);
      expect(sentMsg.payload.data.tree).toBe('alpha-tree');
      expect(sentMsg.payload.data.filterTypeApplied).toBe('gitignore');
      expect(sentMsg.payload.data.metadata.unique_block_id).toBe('mock-uuid-filetree');
      expect(sentMsg.payload.data.metadata.content_source_id).toBe(`${mockUriString}::file_tree`);
      expect(sentMsg.payload.data.metadata.workspaceFolderUri).toBe(mockUriString);
      expect(sentMsg.payload.data.metadata.workspaceFolderName).toBe('alpha');
    });

    it('should return file tree for single open workspace if URI is null', async () => {
      const mockUri = mockUri1;
      const mockWsFolder = mockWorkspaceFolder1;
      const mockUriString = mockWorkspaceFolder1Uri;

      // Setup mocks with known reference objects  
      (vscode.Uri.parse as jest.Mock).mockReturnValue(mockUri);
      mockWorkspaceServiceGetFolders.mockReturnValue([mockWsFolder]); // Only one folder open
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWsFolder);
      mockGetFileTree.mockResolvedValue({ tree: 'single-ws-tree', filterTypeApplied: 'default' });

      const messageId = 'ft-single-null';
      const message = {
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { workspaceFolderUri: null }
      };
      await sendTestMessage(message);

      // Verify workflow
      expect(mockWorkspaceServiceGetFolders).toHaveBeenCalled();
      expect(mockGetFileTree).toHaveBeenCalledWith(mockWsFolder); // Direct object match since we're using shared reference
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.command).toBe('response_file_tree');
      expect(sentMsg.message_id).toBe(messageId);
      expect(sentMsg.payload.success).toBe(true);
      expect(sentMsg.payload.data.tree).toBe('single-ws-tree');
      expect(sentMsg.payload.data.filterTypeApplied).toBe('default');
      expect(sentMsg.payload.data.metadata.unique_block_id).toBe('mock-uuid-filetree');
      expect(sentMsg.payload.data.metadata.content_source_id).toBe(`${mockUriString}::file_tree`);
      expect(sentMsg.payload.data.metadata.workspaceFolderUri).toBe(mockUriString);
      expect(sentMsg.payload.data.metadata.workspaceFolderName).toBe('alpha');
    });

    it('should send AMBIGUOUS_WORKSPACE error if URI is null and multiple workspaces are open', async () => {
      mockWorkspaceServiceGetFolders.mockReturnValue([mockWorkspaceFolder1, mockWorkspaceFolder2]); // Multiple folders
      const messageId = 'ft-ambiguous';
      const message = JSON.stringify({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { workspaceFolderUri: null }
      });
      await capturedClientMessageCallback(message);

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.success).toBe(false);
      expect(sentMsg.payload.errorCode).toBe('AMBIGUOUS_WORKSPACE');
      expect(mockGetFileTree).not.toHaveBeenCalled();
    });

    it('should send WORKSPACE_FOLDER_NOT_FOUND for an invalid workspaceFolderUri', async () => {
      mockWorkspaceServiceGetFolder.mockReturnValue(undefined); // Simulate folder not found
      const messageId = 'ft-not-found';
      const message = JSON.stringify({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { workspaceFolderUri: 'file:///does/not/exist' }
      });
      await capturedClientMessageCallback(message);

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.success).toBe(false);
      expect(sentMsg.payload.errorCode).toBe('WORKSPACE_FOLDER_NOT_FOUND');
      expect(mockGetFileTree).not.toHaveBeenCalled();
    });

    it('should send FILE_TREE_GENERATION_FAILED if getFileTree returns error string', async () => {
      const mockUri = mockUri1;
      const mockWsFolder = mockWorkspaceFolder1;
      const mockUriString = mockWorkspaceFolder1Uri;

      // Setup mocks with known reference objects
      (vscode.Uri.parse as jest.Mock).mockReturnValue(mockUri);
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWsFolder);
      mockGetFileTree.mockResolvedValue('Error: Test generation failed');

      const messageId = 'ft-gen-fail';
      const message = {
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { workspaceFolderUri: mockUriString }
      };
      await sendTestMessage(message);

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.type).toBe('error_response');
      expect(sentMsg.message_id).toBe(messageId);
      expect(sentMsg.payload).toEqual({
        success: false,
        error: 'Error: Test generation failed',
        errorCode: 'FILE_TREE_GENERATION_FAILED',
        originalCommand: null
      });
    });

    it('should send FILE_TREE_ERROR if getFileTree throws an unexpected error', async () => {
      const mockUri = mockUri1;
      const mockWsFolder = mockWorkspaceFolder1;
      const mockUriString = mockWorkspaceFolder1Uri;

      // Setup mocks
      (vscode.Uri.parse as jest.Mock).mockReturnValue(mockUri);
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWsFolder);
      mockGetFileTree.mockRejectedValue(new Error('Unexpected explosion'));

      const messageId = 'ft-unexpected-err';
      const message = {
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { workspaceFolderUri: mockUriString }
      };
      await sendTestMessage(message);

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.type).toBe('error_response');
      expect(sentMsg.message_id).toBe(messageId);
      expect(sentMsg.payload).toEqual({
        success: false,
        error: 'Error generating file tree: Unexpected explosion',
        errorCode: 'FILE_TREE_ERROR',
        originalCommand: null
      });
      expect(sentMsg.payload.errorCode).toBe('FILE_TREE_ERROR');
      expect(sentMsg.payload.error).toBe('Error generating file tree: Unexpected explosion');
    });
  });

  describe('Message Handling (get_file_content)', () => {
    let server: IPCServer;
    let capturedConnectionCallback: (ws: ActualWebSocket_Type, req: any) => void;
    let mockClientWsInstance: MinimalWebSocket;
    let capturedClientMessageCallback: (message: string | Buffer) => void;
    const mockRequest = { socket: { remoteAddress: '127.0.0.1' } };
    const commandToTest = 'get_file_content';

    const mockFilePath = '/project/alpha/file1.ts';
    const mockFileUriString = `file://${mockFilePath}`;
    const mockFileUri = { 
        fsPath: mockFilePath, path: mockFilePath, scheme: 'file', 
        authority: '', query: '', fragment: '', // Added missing properties
        toString: () => mockFileUriString, with: jest.fn().mockReturnThis(), 
        toJSON: () => ({ fsPath: mockFilePath, path: mockFilePath, scheme: 'file', authority: '', query: '', fragment: '' })
    } as vscode.Uri;

    const mockWorkspaceFolder = {
        uri: { fsPath: '/project/alpha', path: '/project/alpha', scheme: 'file', authority: '', query: '', fragment: '', toString: () => 'file:///project/alpha', toJSON: () => ({fsPath: '/project/alpha', path: '/project/alpha', scheme: 'file', authority: '', query: '', fragment: ''}), with: jest.fn().mockReturnThis() } as vscode.Uri,
        name: 'alpha',
        index: 0
    } as vscode.WorkspaceFolder;

    // Helper to send messages, similar to the one you added
    const sendTestMessage = async (messagePayload: any) => {
      const messageString = JSON.stringify(messagePayload);
      // Ensure capturedClientMessageCallback is defined before calling it
      if (!capturedClientMessageCallback) throw new Error('capturedClientMessageCallback is not defined');
      await capturedClientMessageCallback(messageString);
    };

    beforeEach(() => {
      jest.clearAllMocks(); // Ensure all mocks are cleared

      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      ipcServer.start();
      
      const listeningHandler = capturedWssEventListeners['listening']?.[0];
      if (listeningHandler) listeningHandler();
      else { const call = (mockWebSocketServerInstance.on as jest.Mock).mock.calls.find((c: any[]) => c[0] === 'listening'); if (call?.[1]) call[1](); }

      const connCallback = capturedWssEventListeners['connection']?.[0];
      if (!connCallback) throw new Error("Could not capture 'connection' callback.");
      capturedConnectionCallback = connCallback;

      mockClientWsInstance = { 
        on: jest.fn((event: string, callback: (...args: any[]) => void) => { if (event === 'message') capturedClientMessageCallback = callback; }), 
        send: jest.fn(), close: jest.fn(), removeAllListeners: jest.fn(), terminate: jest.fn(),
      };
      capturedConnectionCallback(mockClientWsInstance as any, mockRequest);
      if (!capturedClientMessageCallback) { const call = (mockClientWsInstance.on as jest.Mock).mock.calls.find((c: any[]) => c[0] === 'message'); if (call?.[1]) capturedClientMessageCallback = call[1]; else throw new Error("No message cb for get_file_content"); }
      
      mockWorkspaceServiceEnsureTrusted.mockReset().mockResolvedValue(undefined);
      mockWorkspaceServiceGetFolder.mockReset(); // Reset this specifically
      mockGetFileContent.mockReset();
      (vscode.Uri.file as jest.Mock).mockReturnValue(mockFileUri); // Ensure Uri.file returns our consistent mock URI
      mockUuidV4.mockClear().mockReturnValue('mock-uuid-filecontent');
    });

    it('should return file content for a valid filePath', async () => {
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWorkspaceFolder); // File is part of this workspace
      mockGetFileContent.mockResolvedValue('console.log("hello");');
      const messageId = 'fc-valid';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { filePath: mockFilePath }
      });

      expect(vscode.Uri.file).toHaveBeenCalledWith(mockFilePath);
      expect(mockGetFileContent).toHaveBeenCalledWith(mockFileUri);
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.command).toBe('response_file_content');
      expect(sentMsg.message_id).toBe(messageId);
      expect(sentMsg.payload.success).toBe(true);
      expect(sentMsg.payload.data.content).toBe('console.log("hello");');
      expect(sentMsg.payload.data.isBinary).toBe(false);
      expect(sentMsg.payload.data.metadata.unique_block_id).toBe('mock-uuid-filecontent');
      expect(sentMsg.payload.data.metadata.content_source_id).toBe(mockFileUriString);
      expect(sentMsg.payload.data.metadata.label).toBe('file1.ts'); // path.basename(mockFilePath)
      expect(sentMsg.payload.data.metadata.workspaceFolderName).toBe(mockWorkspaceFolder.name);
    });

    it('should handle binary file content (null from getFileContent)', async () => {
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWorkspaceFolder);
      mockGetFileContent.mockResolvedValue(null); // Simulate binary file
      const messageId = 'fc-binary';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { filePath: mockFilePath }
      });

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.success).toBe(true);
      expect(sentMsg.payload.data.content).toBeNull();
      expect(sentMsg.payload.data.isBinary).toBe(true);
    });

    it('should send INVALID_PAYLOAD if filePath is missing or invalid', async () => {
      const messageId = 'fc-invalid-payload';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { filePath: null } // Invalid filePath
      });
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.errorCode).toBe('INVALID_PAYLOAD');
      expect(sentMsg.payload.error).toContain('Missing or invalid filePath');
      expect(mockGetFileContent).not.toHaveBeenCalled();
    });

    it('should send error if getFileContent returns an error string', async () => {
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWorkspaceFolder);
      const errorStr = 'Error: Cannot read this file.';
      mockGetFileContent.mockResolvedValue(errorStr);
      const messageId = 'fc-service-error-str';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { filePath: mockFilePath }
      });

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      // Note: ipcServer's handleGetFileContent wraps this into a success:false response, not a top-level error_response
      expect(sentMsg.command).toBe('response_file_content');
      expect(sentMsg.payload.success).toBe(false);
      expect(sentMsg.payload.error).toBe(errorStr);
    });

    it('should send FILE_CONTENT_ERROR if getFileContent throws an unexpected error', async () => {
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWorkspaceFolder);
      const errorMessage = 'Disk read failure';
      mockGetFileContent.mockRejectedValue(new Error(errorMessage));
      const messageId = 'fc-unexpected-err';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { filePath: mockFilePath }
      });

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.type).toBe('error_response');
      expect(sentMsg.payload.errorCode).toBe('FILE_CONTENT_ERROR');
      expect(sentMsg.payload.error).toContain(errorMessage);
    });

    // Optional: Test for file not in any workspace folder, though current ipcServer logic might allow it if getFileContent succeeds.
    // This depends on stricter requirements for file containment if desired.
    it('should still process file if not in a known workspace folder but getFileContent succeeds (current behavior)', async () => {
      mockWorkspaceServiceGetFolder.mockReturnValue(undefined); // File not in any specific workspace
      mockWorkspaceServiceGetFolders.mockReturnValue([]); // No workspace folders open that contain this file
      mockGetFileContent.mockResolvedValue('content of loose file');
      const messageId = 'fc-loose-file';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { filePath: mockFilePath }
      });

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.success).toBe(true);
      expect(sentMsg.payload.data.content).toBe('content of loose file');
      expect(sentMsg.payload.data.metadata.workspaceFolderName).toBe('Unknown Workspace');
    });

  });

  describe('Message Handling (get_folder_content)', () => {
    let server: IPCServer;
    let capturedConnectionCallback: (ws: ActualWebSocket_Type, req: any) => void;
    let mockClientWsInstance: MinimalWebSocket;
    let capturedClientMessageCallback: (message: string | Buffer) => void;
    const mockRequest = { socket: { remoteAddress: '127.0.0.1' } };
    const commandToTest = 'get_folder_content';

    const mockFolderPath = '/project/alpha/src';
    const mockFolderUriString = `file://${mockFolderPath}`;
    const mockFolderUri = { 
        fsPath: mockFolderPath, path: mockFolderPath, scheme: 'file', 
        authority: '', query: '', fragment: '',
        toString: () => mockFolderUriString, with: jest.fn().mockReturnThis(), 
        toJSON: () => ({ fsPath: mockFolderPath, path: mockFolderPath, scheme: 'file', authority: '', query: '', fragment: '' })
    } as vscode.Uri;

    const mockWorkspaceFolder1UriString = 'file:///project/alpha';
    const mockWorkspaceFolder1 = {
        uri: { fsPath: '/project/alpha', path: '/project/alpha', scheme: 'file', authority: '', query: '', fragment: '', toString: () => mockWorkspaceFolder1UriString, toJSON: () => ({fsPath: '/project/alpha', path: '/project/alpha', scheme: 'file', authority: '', query: '', fragment: ''}), with: jest.fn().mockReturnThis() } as vscode.Uri,
        name: 'alpha',
        index: 0
    } as vscode.WorkspaceFolder;

    const sendTestMessage = async (messagePayload: any) => {
      const messageString = JSON.stringify(messagePayload);
      if (!capturedClientMessageCallback) throw new Error('capturedClientMessageCallback is not defined');
      await capturedClientMessageCallback(messageString);
    };

    beforeEach(() => {
      jest.clearAllMocks();
      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      ipcServer.start();
      
      const listeningHandler = capturedWssEventListeners['listening']?.[0];
      if (listeningHandler) listeningHandler();
      else { const call = (mockWebSocketServerInstance.on as jest.Mock).mock.calls.find((c: any[]) => c[0] === 'listening'); if (call?.[1]) call[1](); }

      const connCallback = capturedWssEventListeners['connection']?.[0];
      if (!connCallback) throw new Error("Could not capture 'connection' callback.");
      capturedConnectionCallback = connCallback;

      mockClientWsInstance = { 
        on: jest.fn((event: string, callback: (...args: any[]) => void) => { if (event === 'message') capturedClientMessageCallback = callback; }), 
        send: jest.fn(), close: jest.fn(), removeAllListeners: jest.fn(), terminate: jest.fn(),
      };
      capturedConnectionCallback(mockClientWsInstance as any, mockRequest);
      if (!capturedClientMessageCallback) { const call = (mockClientWsInstance.on as jest.Mock).mock.calls.find((c: any[]) => c[0] === 'message'); if (call?.[1]) capturedClientMessageCallback = call[1]; else throw new Error("No message cb for get_folder_content"); }
      
      mockWorkspaceServiceEnsureTrusted.mockReset().mockResolvedValue(undefined);
      mockWorkspaceServiceGetFolder.mockReset();
      mockWorkspaceServiceGetFolders.mockReset();
      mockGetFolderContents.mockReset();
      (vscode.Uri.file as jest.Mock).mockImplementation(p => ({ 
        fsPath: p, path: p, scheme: 'file', authority: '', query: '', fragment: '', 
        toString: () => `file://${p}`, with: jest.fn().mockReturnThis(), 
        toJSON: () => ({ fsPath: p, path: p, scheme: 'file', authority: '', query: '', fragment: '' })
      } as vscode.Uri));
      mockUuidV4.mockClear().mockReturnValue('mock-uuid-foldercontent');
    });

    it('should return folder content for a valid path and workspace', async () => {
      // Reset mocks to ensure clean state
      mockWorkspaceServiceGetFolder.mockReset();
      mockGetFolderContents.mockReset();
      (vscode.Uri.file as jest.Mock).mockReset();
      (vscode.Uri.parse as jest.Mock).mockReset();

      // Clear all mocks to ensure clean state
      jest.clearAllMocks();

      // Mock workspace folder lookup
      mockWorkspaceServiceGetFolder.mockImplementation((uri) => {
        if (uri.toString() === mockWorkspaceFolder1UriString || uri.fsPath.startsWith(mockWorkspaceFolder1.uri.fsPath)) {
          return mockWorkspaceFolder1;
        }
        return undefined;
      });

      // Mock URI parse/file functions
      (vscode.Uri.parse as jest.Mock).mockReturnValue(mockWorkspaceFolder1.uri);
      (vscode.Uri.file as jest.Mock).mockImplementation((path) => ({
        fsPath: path,
        path: path,
        scheme: 'file',
        toString: () => `file://${path}`,
        with: jest.fn().mockReturnThis()
      }));

      // Mock folder contents
      mockGetFolderContents.mockResolvedValue({
        tree: "src-content-tree",
        filterTypeApplied: 'default'
      });

      // Send test message
      const messageId = 'fdc-valid';
      const message = {
        protocol_version: '1.0',
        message_id: messageId,
        type: 'request',
        command: commandToTest,
        payload: { folderPath: mockFolderPath, workspaceFolderUri: mockWorkspaceFolder1UriString }
      };

      // Send message and wait for response
      await new Promise<void>((resolve) => {
        mockClientWsInstance.send.mockImplementation(() => {
          resolve();
        });
        capturedClientMessageCallback(JSON.stringify(message));
      });

      // Verify workspace folder lookup
      expect(mockWorkspaceServiceGetFolder).toHaveBeenCalledWith(expect.objectContaining({
        toString: expect.any(Function)
      }));

      // Verify folder URI creation
      expect(vscode.Uri.file).toHaveBeenCalledWith(mockFolderPath);

      // Verify folder contents request
      expect(mockGetFolderContents).toHaveBeenCalledWith(
        expect.objectContaining({ fsPath: mockFolderPath }),
        expect.objectContaining({ uri: mockWorkspaceFolder1.uri })
      );

      // Verify response message
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.command).toBe('response_folder_content');
      expect(sentMsg.payload.success).toBe(true);
      expect(sentMsg.payload.data.tree).toBe('src-content-tree');
      expect(sentMsg.payload.data.filterTypeApplied).toBe('default');
      expect(sentMsg.payload.data.metadata).toEqual({
        unique_block_id: 'mock-uuid-foldercontent',
        content_source_id: mockFolderUriString,
        type: 'folder_content',
        label: 'src',
        workspaceFolderUri: mockWorkspaceFolder1UriString,
        workspaceFolderName: mockWorkspaceFolder1.name
      });
    });

    it('should send INVALID_PAYLOAD if folderPath is missing', async () => {
      await sendTestMessage({ protocol_version: '1.0', command: commandToTest, payload: { workspaceFolderUri: mockWorkspaceFolder1UriString } });
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.errorCode).toBe('INVALID_PAYLOAD');
      expect(sentMsg.payload.error).toContain('Missing or invalid folderPath');
    });

    it('should send error if getTargetWorkspaceFolder returns null (e.g. ambiguous)', async () => {
      mockWorkspaceServiceGetFolders.mockReturnValue([mockWorkspaceFolder1, {} as vscode.WorkspaceFolder]); // Ambiguous
      await sendTestMessage({ protocol_version: '1.0', command: commandToTest, payload: { folderPath: mockFolderPath, workspaceFolderUri: null } });
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.errorCode).toBe('AMBIGUOUS_WORKSPACE');
      expect(mockGetFolderContents).not.toHaveBeenCalled();
    });

    it('should send INVALID_PATH if folderPath is not within specified workspaceFolderUri', async () => {
      const outsideFolderPath = '/another/project/folder';
      // Rely on the beforeEach mock for vscode.Uri.file which is more complete
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWorkspaceFolder1);
      await sendTestMessage({
        protocol_version: '1.0', command: commandToTest, 
        payload: { folderPath: outsideFolderPath, workspaceFolderUri: mockWorkspaceFolder1UriString }
      });
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.errorCode).toBe('INVALID_PATH');
      expect(sentMsg.payload.error).toContain('not within the specified workspace folder');
      expect(mockGetFolderContents).not.toHaveBeenCalled();
    });

    it('should send FOLDER_CONTENT_ERROR if getFolderContents returns error string', async () => {
      // Reset all mocks
      jest.clearAllMocks();
      mockWorkspaceServiceGetFolder.mockReset();
      mockGetFolderContents.mockReset();
      (vscode.Uri.file as jest.Mock).mockReset();
      (vscode.Uri.parse as jest.Mock).mockReset();

      // Mock workspace folder lookup
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWorkspaceFolder1);
      (vscode.Uri.parse as jest.Mock).mockReturnValue(mockWorkspaceFolder1.uri);
      (vscode.Uri.file as jest.Mock).mockReturnValue(mockFolderUri);

      // Mock folder contents to return error
      mockGetFolderContents.mockResolvedValue('Error: Cannot read this folder');

      // Send test message
      const messageId = 'error-test';
      const message = {
        protocol_version: '1.0',
        message_id: messageId,
        type: 'request',
        command: commandToTest,
        payload: { folderPath: mockFolderPath, workspaceFolderUri: mockWorkspaceFolder1UriString }
      };

      // Send message and wait for it to be processed
      await new Promise<void>((resolve) => {
        mockClientWsInstance.send.mockImplementation(() => {
          resolve();
        });
        capturedClientMessageCallback(JSON.stringify(message));
      });

      // Verify response
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.errorCode).toBe('FOLDER_CONTENT_ERROR');
      expect(sentMsg.payload.error).toBe('Error: Cannot read this folder');
    });

    it('should send FOLDER_CONTENT_UNEXPECTED_ERROR if getFolderContents throws an error', async () => {
      // Reset all mocks
      jest.clearAllMocks();
      mockWorkspaceServiceGetFolder.mockReset();
      mockGetFolderContents.mockReset();
      (vscode.Uri.file as jest.Mock).mockReset();
      (vscode.Uri.parse as jest.Mock).mockReset();

      // Mock workspace folder lookup
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWorkspaceFolder1);
      (vscode.Uri.parse as jest.Mock).mockReturnValue(mockWorkspaceFolder1.uri);
      (vscode.Uri.file as jest.Mock).mockReturnValue(mockFolderUri);

      // Mock folder contents to throw error
      mockGetFolderContents.mockRejectedValue(new Error('Unexpected folder issue'));

      // Send test message
      const messageId = 'unexpected-error-test';
      const message = {
        protocol_version: '1.0',
        message_id: messageId,
        type: 'request',
        command: commandToTest,
        payload: { folderPath: mockFolderPath, workspaceFolderUri: mockWorkspaceFolder1UriString }
      };

      // Send message and wait for it to be processed
      await new Promise<void>((resolve) => {
        mockClientWsInstance.send.mockImplementation(() => {
          resolve();
        });
        capturedClientMessageCallback(JSON.stringify(message));
      });

      // Verify response
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.errorCode).toBe('FOLDER_CONTENT_UNEXPECTED_ERROR');
      expect(sentMsg.payload.error).toContain('Unexpected folder issue');
    });

  });

  describe('Message Handling (get_entire_codebase)', () => {
    let server: IPCServer;
    let capturedConnectionCallback: (ws: ActualWebSocket_Type, req: any) => void;
    let mockClientWsInstance: MinimalWebSocket;
    let capturedClientMessageCallback: (message: string | Buffer) => void;
    const mockRequest = { socket: { remoteAddress: '127.0.0.1' } };
    const commandToTest = 'get_entire_codebase';

    const mockWorkspaceFolder1UriString = 'file:///project/alpha';
    const mockWorkspaceFolder1Name = 'alpha';
    const mockUri1 = {
      fsPath: '/project/alpha',
      path: '/project/alpha',
      scheme: 'file',
      authority: '', query: '', fragment: '',
      toString: () => mockWorkspaceFolder1UriString,
      with: jest.fn().mockReturnThis(),
      toJSON: () => ({ fsPath: '/project/alpha', path: '/project/alpha', scheme: 'file' }),
    } as vscode.Uri;
    const mockWorkspaceFolder1 = { uri: mockUri1, name: mockWorkspaceFolder1Name, index: 0 } as vscode.WorkspaceFolder;

    const sendTestMessage = async (messagePayload: any) => {
      const messageString = JSON.stringify(messagePayload);
      if (!capturedClientMessageCallback) throw new Error('capturedClientMessageCallback is not defined for get_entire_codebase');
      // Using the Promise-based send helper you introduced
      await new Promise<void>((resolve, reject) => {
        mockClientWsInstance.send.mockImplementationOnce(() => {
          resolve(); 
        });
        capturedClientMessageCallback(messageString);
        // Add a timeout to prevent tests from hanging indefinitely if send is not called
        setTimeout(() => reject(new Error('sendTestMessage timeout: mockClientWsInstance.send was not called')), 100);
      }).catch(e => { /* console.error(e.message) */ }); // Catch timeout locally if needed, test will fail on expect
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      (vscode.Uri.parse as jest.Mock).mockImplementation((uriString: string) => {
        if (uriString === mockWorkspaceFolder1UriString) return mockUri1;
        return { fsPath: uriString.substring('file:///'.length), path: uriString.substring('file:///'.length), scheme: 'file', toString: () => uriString, authority: '', query: '', fragment: '', with: jest.fn().mockReturnThis(), toJSON: () => ({}) } as vscode.Uri;
      });
      mockWorkspaceServiceEnsureTrusted.mockResolvedValue(undefined);
      mockWorkspaceServiceGetFolder.mockImplementation((uri: vscode.Uri) => {
        if (uri.toString() === mockWorkspaceFolder1UriString) return mockWorkspaceFolder1;
        return undefined;
      });
      mockWorkspaceServiceGetFolders.mockReturnValue([mockWorkspaceFolder1]);
      mockUuidV4.mockClear().mockReturnValue('mock-uuid-codebase');

      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      ipcServer.start();
      const listeningHandler = capturedWssEventListeners['listening']?.[0];
      if (listeningHandler) listeningHandler();

      mockClientWsInstance = { 
        on: jest.fn((event: string, callback: (...args: any[]) => void) => { if (event === 'message') capturedClientMessageCallback = callback; }), 
        send: jest.fn(), close: jest.fn(), removeAllListeners: jest.fn(), terminate: jest.fn(),
      };
      const connCallback = capturedWssEventListeners['connection']?.[0];
      if (!connCallback) throw new Error('Could not capture connection callback for get_entire_codebase');
      capturedConnectionCallback = connCallback;
      capturedConnectionCallback(mockClientWsInstance as any, mockRequest);
      if (!capturedClientMessageCallback) throw new Error('No message callback captured for get_entire_codebase');
      await mockWorkspaceServiceEnsureTrusted(); // Ensure this is awaited if it's async in practice
    });

    it('should return entire codebase content for a valid workspaceFolderUri', async () => {
      mockGetWorkspaceCodebaseContents.mockResolvedValue({ tree: "codebase-tree-content", workspaceName: mockWorkspaceFolder1Name, filterTypeApplied: 'gitignore' });
      const messageId = 'ecb-valid';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { workspaceFolderUri: mockWorkspaceFolder1UriString }
      });

      expect(mockWorkspaceServiceGetFolder).toHaveBeenCalledWith(mockUri1);
      expect(mockGetWorkspaceCodebaseContents).toHaveBeenCalledWith(mockWorkspaceFolder1);
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.command).toBe('response_entire_codebase');
      expect(sentMsg.payload.success).toBe(true);
      expect(sentMsg.payload.data.tree).toBe('codebase-tree-content');
      expect(sentMsg.payload.data.filterTypeApplied).toBe('gitignore');
      expect(sentMsg.payload.data.metadata.unique_block_id).toBe('mock-uuid-codebase');
      expect(sentMsg.payload.data.metadata.label).toBe(`Entire Codebase - ${mockWorkspaceFolder1Name}`);
    });

    it('should send WORKSPACE_FOLDER_NOT_FOUND if workspaceFolderUri is invalid', async () => {
      mockWorkspaceServiceGetFolder.mockReturnValue(undefined);
      const messageId = 'ecb-ws-not-found';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { workspaceFolderUri: 'file:///invalid/path' }
      });
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.errorCode).toBe('WORKSPACE_FOLDER_NOT_FOUND');
      expect(mockGetWorkspaceCodebaseContents).not.toHaveBeenCalled();
    });

    it('should send CODEBASE_CONTENT_ERROR if service returns error string', async () => {
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWorkspaceFolder1);
      mockGetWorkspaceCodebaseContents.mockResolvedValue('Error: Failed to get codebase');
      const messageId = 'ecb-service-err-str';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { workspaceFolderUri: mockWorkspaceFolder1UriString }
      });
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.errorCode).toBe('CODEBASE_CONTENT_ERROR');
      expect(sentMsg.payload.error).toBe('Error: Failed to get codebase');
    });

    it('should send CODEBASE_CONTENT_UNEXPECTED_ERROR if service throws unexpected error', async () => {
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWorkspaceFolder1);
      mockGetWorkspaceCodebaseContents.mockRejectedValue(new Error('Kaboom!'));
      const messageId = 'ecb-unexpected-err';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { workspaceFolderUri: mockWorkspaceFolder1UriString }
      });
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.errorCode).toBe('CODEBASE_CONTENT_UNEXPECTED_ERROR');
      expect(sentMsg.payload.error).toContain('Kaboom!');
    });

    // Note: get_entire_codebase requires workspaceFolderUri, so INVALID_PAYLOAD for missing it
    // is implicitly covered if getTargetWorkspaceFolder sends an error for missing URI when it's required.
    // However, getTargetWorkspaceFolder has logic for null URI. The command itself should enforce non-null.
    // Let's add a test for missing workspaceFolderUri in payload, which should be caught by getTargetWorkspaceFolder
    // when it tries to use it and finds it undefined, leading to AMBIGUOUS or NO_WORKSPACE if not specified.
    // For get_entire_codebase, it's simpler: if payload.workspaceFolderUri is undefined, getTargetWorkspaceFolder will try to use default logic.
    // The command handler itself doesn't have a direct check for missing workspaceFolderUri before calling getTargetWorkspaceFolder.
    // The check for required workspaceFolderUri is effectively handled by getTargetWorkspaceFolder's logic.
    // If `payload.workspaceFolderUri` is undefined, `getTargetWorkspaceFolder` will try to use the single open folder or return AMBIGUOUS.
    // This behavior is already tested in get_file_tree. For `get_entire_codebase`, the SRS implies `workspaceFolderUri` is mandatory.
    // The current `getTargetWorkspaceFolder` might not enforce this specific requirement for `get_entire_codebase` if `payload.workspaceFolderUri` is simply missing.
    // Let's assume for now that if `payload.workspaceFolderUri` is not a string, `getTargetWorkspaceFolder` will handle it (e.g. by trying to parse `undefined` which might error or lead to ambiguous).

  });

  describe('Message Handling (search_workspace)', () => {
    let server: IPCServer;
    let capturedConnectionCallback: (ws: ActualWebSocket_Type, req: any) => void;
    let mockClientWsInstance: MinimalWebSocket;
    let capturedClientMessageCallback: (message: string | Buffer) => void;
    const mockRequest = { socket: { remoteAddress: '127.0.0.1' } };
    const commandToTest = 'search_workspace';

    const mockWorkspaceFolder1UriString = 'file:///project/search_alpha';
    const mockWorkspaceFolder1Name = 'search_alpha';
    const mockUri1 = {
      fsPath: '/project/search_alpha',
      path: '/project/search_alpha',
      scheme: 'file',
      authority: '', query: '', fragment: '',
      toString: () => mockWorkspaceFolder1UriString,
      with: jest.fn().mockReturnThis(),
      toJSON: () => ({ fsPath: '/project/search_alpha', path: '/project/search_alpha', scheme: 'file' }),
    } as vscode.Uri;
    const mockWorkspaceFolder1 = { uri: mockUri1, name: mockWorkspaceFolder1Name, index: 0 } as vscode.WorkspaceFolder;

    const sendTestMessage = async (messagePayload: any) => {
      const messageString = JSON.stringify(messagePayload);
      if (!capturedClientMessageCallback) throw new Error('capturedClientMessageCallback is not defined for search_workspace');
      await new Promise<void>((resolve, reject) => {
        mockClientWsInstance.send.mockImplementationOnce(() => { resolve(); });
        capturedClientMessageCallback(messageString);
        setTimeout(() => reject(new Error('sendTestMessage timeout for search_workspace')), 100);
      }).catch(e => {}); 
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      (vscode.Uri.parse as jest.Mock).mockImplementation((uriString: string) => {
        if (uriString === mockWorkspaceFolder1UriString) return mockUri1;
        // Generic fallback for other URIs if needed by tests
        let fsPath = uriString;
        if (uriString.startsWith('file:///')) fsPath = uriString.substring('file:///'.length);
        if (!fsPath.startsWith('/')) fsPath = '/' + fsPath;
        return { fsPath, path: fsPath, scheme: 'file', toString: () => uriString, authority: '', query: '', fragment: '', with: jest.fn().mockReturnThis(), toJSON: () => ({}) } as vscode.Uri;
      });
      mockWorkspaceServiceEnsureTrusted.mockResolvedValue(undefined);
      mockWorkspaceServiceGetFolder.mockImplementation((uri: vscode.Uri) => {
        if (uri.toString() === mockWorkspaceFolder1UriString) return mockWorkspaceFolder1;
        return undefined;
      });
      mockSearchServiceSearch.mockClear(); // Clear search mock specifically
      mockUuidV4.mockClear(); // No specific UUID needed for search responses in this manner

      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      ipcServer.start();
      const listeningHandler = capturedWssEventListeners['listening']?.[0];
      if (listeningHandler) listeningHandler();

      mockClientWsInstance = { 
        on: jest.fn((event: string, callback: (...args: any[]) => void) => { if (event === 'message') capturedClientMessageCallback = callback; }), 
        send: jest.fn(), close: jest.fn(), removeAllListeners: jest.fn(), terminate: jest.fn(),
      };
      const connCallback = capturedWssEventListeners['connection']?.[0];
      if (!connCallback) throw new Error('Could not capture connection callback for search_workspace');
      capturedConnectionCallback = connCallback;
      capturedConnectionCallback(mockClientWsInstance as any, mockRequest);
      if (!capturedClientMessageCallback) throw new Error('No message callback captured for search_workspace');
      await mockWorkspaceServiceEnsureTrusted();
    });

    it('should perform search in all workspaces if workspaceFolderUri is null', async () => {
      const searchResults = [{ path: '/project/search_alpha/file.ts', name: 'file.ts', type: 'file', content_source_id: 'file:///project/search_alpha/file.ts', workspaceFolderUri: mockWorkspaceFolder1UriString, workspaceFolderName: mockWorkspaceFolder1Name }];
      mockSearchServiceSearch.mockResolvedValue(searchResults);
      const messageId = 'search-all';
      const query = 'testQuery';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { query, workspaceFolderUri: null }
      });

      expect(mockWorkspaceServiceEnsureTrusted).toHaveBeenCalled(); // Central pre-check
      expect(mockSearchServiceSearch).toHaveBeenCalledWith(query, undefined); // undefined for all workspaces
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.command).toBe('response_search_workspace');
      expect(sentMsg.payload.success).toBe(true);
      expect(sentMsg.payload.data.results).toEqual(searchResults);
      expect(sentMsg.payload.query).toBe(query);
    });

    it('should perform search in a specific workspace if workspaceFolderUri is provided', async () => {
      const searchResults = [{ path: '/project/search_alpha/specific.ts', name: 'specific.ts', type: 'file', content_source_id: 'file:///project/search_alpha/specific.ts', workspaceFolderUri: mockWorkspaceFolder1UriString, workspaceFolderName: mockWorkspaceFolder1Name }];
      mockSearchServiceSearch.mockResolvedValue(searchResults);
      const messageId = 'search-specific';
      const query = 'specificQuery';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { query, workspaceFolderUri: mockWorkspaceFolder1UriString }
      });

      expect(mockWorkspaceServiceGetFolder).toHaveBeenCalledWith(mockUri1);
      expect(mockSearchServiceSearch).toHaveBeenCalledWith(query, mockUri1); // mockUri1 for specific workspace
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.data.results).toEqual(searchResults);
    });

    it('should send INVALID_PAYLOAD if query is missing', async () => {
      const messageId = 'search-no-query';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { workspaceFolderUri: null } // Missing query
      });
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.errorCode).toBe('INVALID_PAYLOAD');
      expect(sentMsg.payload.error).toContain('Missing or invalid query');
      expect(mockSearchServiceSearch).not.toHaveBeenCalled();
    });

    it('should send WORKSPACE_FOLDER_NOT_FOUND if specified workspaceFolderUri is invalid for search', async () => {
      mockWorkspaceServiceGetFolder.mockReturnValue(undefined); // Simulate folder not found
      const messageId = 'search-ws-not-found';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { query: 'any', workspaceFolderUri: 'file:///invalid/path' }
      });
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.errorCode).toBe('WORKSPACE_FOLDER_NOT_FOUND');
      expect(mockSearchServiceSearch).not.toHaveBeenCalled();
    });

    it('should send SEARCH_ERROR if searchService.search throws an error', async () => {
      const errorMsg = 'Search exploded';
      mockSearchServiceSearch.mockRejectedValue(new Error(errorMsg));
      const messageId = 'search-err';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { query: 'fail_query', workspaceFolderUri: null }
      });
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.errorCode).toBe('SEARCH_ERROR');
      expect(sentMsg.payload.error).toContain(errorMsg);
    });
  });

  describe('Message Handling (get_active_file_info)', () => {
    let server: IPCServer;
    let capturedConnectionCallback: (ws: ActualWebSocket_Type, req: any) => void;
    let mockClientWsInstance: MinimalWebSocket;
    let capturedClientMessageCallback: (message: string | Buffer) => void;
    const mockRequest = { socket: { remoteAddress: '127.0.0.1' } };
    const commandToTest = 'get_active_file_info';

    const mockActiveFilePath = '/project/gamma/active.ts';
    const mockActiveFileUriString = `file://${mockActiveFilePath}`;
    const mockActiveFileUri = { 
        fsPath: mockActiveFilePath, path: mockActiveFilePath, scheme: 'file', 
        authority: '', query: '', fragment: '',
        toString: () => mockActiveFileUriString, with: jest.fn().mockReturnThis(), 
        toJSON: () => ({ fsPath: mockActiveFilePath, path: mockActiveFilePath, scheme: 'file' })
    } as vscode.Uri;

    const mockWorkspaceFolderGammaUriString = 'file:///project/gamma';
    const mockWorkspaceFolderGammaName = 'gamma';
    const mockWorkspaceFolderGamma = {
        uri: { fsPath: '/project/gamma', path: '/project/gamma', scheme: 'file', authority: '', query: '', fragment: '', toString: () => mockWorkspaceFolderGammaUriString, toJSON: () => ({fsPath: '/project/gamma', path: '/project/gamma', scheme: 'file'}), with: jest.fn().mockReturnThis() } as vscode.Uri,
        name: mockWorkspaceFolderGammaName,
        index: 0
    } as vscode.WorkspaceFolder;

    const sendTestMessage = async (messagePayload: any) => {
      const messageString = JSON.stringify(messagePayload);
      if (!capturedClientMessageCallback) throw new Error('capturedClientMessageCallback is not defined for get_active_file_info');
      await new Promise<void>((resolve, reject) => {
        mockClientWsInstance.send.mockImplementationOnce(() => { resolve(); });
        capturedClientMessageCallback(messageString);
        setTimeout(() => reject(new Error('sendTestMessage timeout for get_active_file_info')), 100);
      }).catch(e => {}); 
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      // Reset vscode.window.activeTextEditor for each test
      (vscode.window as any).activeTextEditor = undefined; 
      mockWorkspaceServiceEnsureTrusted.mockResolvedValue(undefined);
      mockWorkspaceServiceGetFolder.mockReset(); // Important for workspace association
      mockUuidV4.mockClear(); // Though not directly used in response for this command's metadata

      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      ipcServer.start();
      const listeningHandler = capturedWssEventListeners['listening']?.[0];
      if (listeningHandler) listeningHandler();

      mockClientWsInstance = { 
        on: jest.fn((event: string, callback: (...args: any[]) => void) => { if (event === 'message') capturedClientMessageCallback = callback; }), 
        send: jest.fn(), close: jest.fn(), removeAllListeners: jest.fn(), terminate: jest.fn(),
      };
      const connCallback = capturedWssEventListeners['connection']?.[0];
      if (!connCallback) throw new Error('Could not capture connection callback for get_active_file_info');
      capturedConnectionCallback = connCallback;
      capturedConnectionCallback(mockClientWsInstance as any, mockRequest);
      if (!capturedClientMessageCallback) throw new Error('No message callback captured for get_active_file_info');
      await mockWorkspaceServiceEnsureTrusted();
    });

    it('should return active file info if editor and file are valid', async () => {
      (vscode.window as any).activeTextEditor = {
        document: {
          uri: mockActiveFileUri,
          isUntitled: false,
        }
      };
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWorkspaceFolderGamma);
      const messageId = 'afi-valid';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: {}
      });

      expect(mockWorkspaceServiceGetFolder).toHaveBeenCalledWith(mockActiveFileUri);
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.command).toBe('response_active_file_info');
      expect(sentMsg.payload.success).toBe(true);
      expect(sentMsg.payload.data.activeFilePath).toBe(mockActiveFilePath);
      expect(sentMsg.payload.data.activeFileLabel).toBe('active.ts'); // basename of mockActiveFilePath
      expect(sentMsg.payload.data.workspaceFolderUri).toBe(mockWorkspaceFolderGammaUriString);
      expect(sentMsg.payload.data.workspaceFolderName).toBe(mockWorkspaceFolderGammaName);
    });

    it('should send NO_ACTIVE_EDITOR if no active editor', async () => {
      (vscode.window as any).activeTextEditor = undefined;
      const messageId = 'afi-no-editor';
      await sendTestMessage({ protocol_version: '1.0', message_id: messageId, type: 'request', command: commandToTest, payload: {} });
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.errorCode).toBe('NO_ACTIVE_EDITOR');
    });

    it('should send INVALID_ACTIVE_FILE if document is untitled', async () => {
      (vscode.window as any).activeTextEditor = {
        document: { uri: mockActiveFileUri, isUntitled: true }
      };
      const messageId = 'afi-untitled';
      await sendTestMessage({ protocol_version: '1.0', message_id: messageId, type: 'request', command: commandToTest, payload: {} });
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.errorCode).toBe('INVALID_ACTIVE_FILE');
    });

    it('should send INVALID_ACTIVE_FILE if document scheme is not file', async () => {
      (vscode.window as any).activeTextEditor = {
        document: { uri: { ...mockActiveFileUri, scheme: 'untitled' }, isUntitled: false }
      };
      const messageId = 'afi-wrong-scheme';
      await sendTestMessage({ protocol_version: '1.0', message_id: messageId, type: 'request', command: commandToTest, payload: {} });
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.errorCode).toBe('INVALID_ACTIVE_FILE');
    });

    it('should return active file info with null workspace if file not in a workspace folder', async () => {
      (vscode.window as any).activeTextEditor = {
        document: { uri: mockActiveFileUri, isUntitled: false }
      };
      mockWorkspaceServiceGetFolder.mockReturnValue(undefined); // Not found in any workspace
      const messageId = 'afi-no-workspace-assoc';
      await sendTestMessage({ protocol_version: '1.0', message_id: messageId, type: 'request', command: commandToTest, payload: {} });
      
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.success).toBe(true);
      expect(sentMsg.payload.data.activeFilePath).toBe(mockActiveFilePath);
      expect(sentMsg.payload.data.workspaceFolderUri).toBeNull();
      expect(sentMsg.payload.data.workspaceFolderName).toBeNull();
    });
  });

  describe('Message Handling (get_open_files)', () => {
    let server: IPCServer;
    let capturedConnectionCallback: (ws: ActualWebSocket_Type, req: any) => void;
    let mockClientWsInstance: MinimalWebSocket;
    let capturedClientMessageCallback: (message: string | Buffer) => void;
    const mockRequest = { socket: { remoteAddress: '127.0.0.1' } };
    const commandToTest = 'get_open_files';

    const mockWorkspaceFolderUriA = 'file:///project/wsA';
    const mockWorkspaceFolderA = { uri: vscode.Uri.parse(mockWorkspaceFolderUriA), name: 'wsA', index: 0 } as vscode.WorkspaceFolder;
    const mockFile1Path = '/project/wsA/file1.ts';
    const mockFile1Uri = vscode.Uri.parse(`file://${mockFile1Path}`);
    const mockDoc1 = { uri: mockFile1Uri, isUntitled: false, scheme: 'file', fileName: mockFile1Path, languageId: 'typescript', encoding: 'utf8', version: 1, lineCount: 10, getText: jest.fn(), getWordRangeAtPosition: jest.fn(), lineAt: jest.fn(), offsetAt: jest.fn(), positionAt: jest.fn(), save: jest.fn(), validatePosition: jest.fn(), validateRange: jest.fn(), eol: 1, isClosed: false, isDirty: false } as vscode.TextDocument;

    const mockWorkspaceFolderUriB = 'file:///project/wsB';
    const mockWorkspaceFolderB = { uri: vscode.Uri.parse(mockWorkspaceFolderUriB), name: 'wsB', index: 1 } as vscode.WorkspaceFolder;
    const mockFile2Path = '/project/wsB/file2.js';
    const mockFile2Uri = vscode.Uri.parse(`file://${mockFile2Path}`);
    const mockDoc2 = { uri: mockFile2Uri, isUntitled: false, scheme: 'file', fileName: mockFile2Path, languageId: 'javascript', encoding: 'utf8', version: 1, lineCount: 5, getText: jest.fn(), getWordRangeAtPosition: jest.fn(), lineAt: jest.fn(), offsetAt: jest.fn(), positionAt: jest.fn(), save: jest.fn(), validatePosition: jest.fn(), validateRange: jest.fn(), eol: 1, isClosed: false, isDirty: false } as vscode.TextDocument;

    const mockOutsideFilePath = '/other/outside.md';
    const mockOutsideFileUri = vscode.Uri.parse(`file://${mockOutsideFilePath}`);
    const mockDocOutside = { uri: mockOutsideFileUri, isUntitled: false, scheme: 'file', fileName: mockOutsideFilePath, languageId: 'markdown', encoding: 'utf8', version: 1, lineCount: 20, getText: jest.fn(), getWordRangeAtPosition: jest.fn(), lineAt: jest.fn(), offsetAt: jest.fn(), positionAt: jest.fn(), save: jest.fn(), validatePosition: jest.fn(), validateRange: jest.fn(), eol: 1, isClosed: false, isDirty: false } as vscode.TextDocument;
    const mockDocUntitled = { uri: vscode.Uri.parse('untitled:Untitled-1'), isUntitled: true, scheme: 'untitled', fileName: 'Untitled-1', languageId: 'plaintext', encoding: 'utf8', version: 1, lineCount: 1, getText: jest.fn(), getWordRangeAtPosition: jest.fn(), lineAt: jest.fn(), offsetAt: jest.fn(), positionAt: jest.fn(), save: jest.fn(), validatePosition: jest.fn(), validateRange: jest.fn(), eol: 1, isClosed: false, isDirty: false } as vscode.TextDocument;

    const sendTestMessage = async (messagePayload: any) => {
      const messageString = JSON.stringify(messagePayload);
      if (!capturedClientMessageCallback) throw new Error('capturedClientMessageCallback is not defined for get_open_files');
      await new Promise<void>((resolve, reject) => {
        mockClientWsInstance.send.mockImplementationOnce(() => { resolve(); });
        capturedClientMessageCallback(messageString);
        setTimeout(() => reject(new Error('sendTestMessage timeout for get_open_files')), 100);
      }).catch(e => {}); 
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      (vscode.workspace as any).textDocuments = []; // Default to no open documents
      mockWorkspaceServiceEnsureTrusted.mockResolvedValue(undefined);
      mockWorkspaceServiceGetFolder.mockReset();
      mockWorkspaceServiceGetFolders.mockReset();
      mockUuidV4.mockClear();

      // Configure Uri.parse mock for specific URIs used in this suite
      (vscode.Uri.parse as jest.Mock).mockImplementation((uriString: string) => {
        let fsPath = uriString.startsWith('file://') ? uriString.substring('file://'.length) : uriString;
        if (uriString.startsWith('file://') && !fsPath.startsWith('/')) fsPath = '/' + fsPath;
        const scheme = uriString.startsWith('untitled:') ? 'untitled' : 'file';
        return { fsPath, path: fsPath, scheme, authority: '', query: '', fragment: '', toString: () => uriString, with: jest.fn().mockReturnThis(), toJSON: () => ({fsPath, path:fsPath, scheme}) } as vscode.Uri;
      });

      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      ipcServer.start();
      const listeningHandler = capturedWssEventListeners['listening']?.[0];
      if (listeningHandler) listeningHandler();

      mockClientWsInstance = { 
        on: jest.fn((event: string, callback: (...args: any[]) => void) => { if (event === 'message') capturedClientMessageCallback = callback; }), 
        send: jest.fn(), close: jest.fn(), removeAllListeners: jest.fn(), terminate: jest.fn(),
      };
      const connCallback = capturedWssEventListeners['connection']?.[0];
      if (!connCallback) throw new Error('Could not capture connection callback for get_open_files');
      capturedConnectionCallback = connCallback;
      capturedConnectionCallback(mockClientWsInstance as any, mockRequest);
      if (!capturedClientMessageCallback) throw new Error('No message callback captured for get_open_files');
      await mockWorkspaceServiceEnsureTrusted();
    });

    it('should return a list of open, saved files within trusted workspace folders', async () => {
      (vscode.workspace as any).textDocuments = [mockDoc1, mockDoc2, mockDocUntitled, mockDocOutside];
      mockWorkspaceServiceGetFolders.mockReturnValue([mockWorkspaceFolderA, mockWorkspaceFolderB]);
      mockWorkspaceServiceGetFolder.mockImplementation((uri: vscode.Uri) => {
        if (uri.fsPath.startsWith(mockWorkspaceFolderA.uri.fsPath)) return mockWorkspaceFolderA;
        if (uri.fsPath.startsWith(mockWorkspaceFolderB.uri.fsPath)) return mockWorkspaceFolderB;
        return undefined;
      });
      const messageId = 'gof-valid';
      await sendTestMessage({ protocol_version: '1.0', message_id: messageId, type: 'request', command: commandToTest, payload: {} });

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.command).toBe('response_open_files');
      expect(sentMsg.payload.success).toBe(true);
      expect(sentMsg.payload.data.openFiles).toEqual([
        { path: mockFile1Path, name: 'file1.ts', workspaceFolderUri: mockWorkspaceFolderUriA, workspaceFolderName: 'wsA' },
        { path: mockFile2Path, name: 'file2.js', workspaceFolderUri: mockWorkspaceFolderUriB, workspaceFolderName: 'wsB' },
      ]);
    });

    it('should return an empty list if no files are open', async () => {
      (vscode.workspace as any).textDocuments = [];
      mockWorkspaceServiceGetFolders.mockReturnValue([mockWorkspaceFolderA]);
      const messageId = 'gof-no-files';
      await sendTestMessage({ protocol_version: '1.0', message_id: messageId, type: 'request', command: commandToTest, payload: {} });
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.data.openFiles).toEqual([]);
    });

    it('should return an empty list if no workspace folders are open or trusted', async () => {
      (vscode.workspace as any).textDocuments = [mockDoc1];
      mockWorkspaceServiceGetFolders.mockReturnValue([]); // No trusted/open folders
      const messageId = 'gof-no-workspaces';
      await sendTestMessage({ protocol_version: '1.0', message_id: messageId, type: 'request', command: commandToTest, payload: {} });
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.data.openFiles).toEqual([]);
    });

    it('should exclude untitled files and files not in trusted workspaces', async () => {
      (vscode.workspace as any).textDocuments = [mockDoc1, mockDocUntitled, mockDocOutside];
      mockWorkspaceServiceGetFolders.mockReturnValue([mockWorkspaceFolderA]); // Only wsA is trusted/open
      mockWorkspaceServiceGetFolder.mockImplementation((uri: vscode.Uri) => {
        if (uri.fsPath.startsWith(mockWorkspaceFolderA.uri.fsPath)) return mockWorkspaceFolderA;
        return undefined;
      });
      const messageId = 'gof-filtered';
      await sendTestMessage({ protocol_version: '1.0', message_id: messageId, type: 'request', command: commandToTest, payload: {} });
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.data.openFiles).toEqual([
        { path: mockFile1Path, name: 'file1.ts', workspaceFolderUri: mockWorkspaceFolderUriA, workspaceFolderName: 'wsA' },
      ]);
    });
  });

  describe('Message Handling (get_filter_info)', () => {
    let server: IPCServer;
    let capturedConnectionCallback: (ws: ActualWebSocket_Type, req: any) => void;
    let mockClientWsInstance: MinimalWebSocket;
    let capturedClientMessageCallback: (message: string | Buffer) => void;
    const mockRequest = { socket: { remoteAddress: '127.0.0.1' } };
    const commandToTest = 'get_filter_info';

    const mockWorkspaceFolderFilterUriString = 'file:///project/filter_ws';
    const mockWorkspaceFolderFilterName = 'filter_ws';
    const mockUriFilter = {
      fsPath: '/project/filter_ws',
      path: '/project/filter_ws',
      scheme: 'file',
      authority: '', query: '', fragment: '',
      toString: () => mockWorkspaceFolderFilterUriString,
      with: jest.fn().mockReturnThis(),
      toJSON: () => ({ fsPath: '/project/filter_ws', path: '/project/filter_ws', scheme: 'file' }),
    } as vscode.Uri;
    const mockWorkspaceFolderFilter = { uri: mockUriFilter, name: mockWorkspaceFolderFilterName, index: 0 } as vscode.WorkspaceFolder;

    const sendTestMessage = async (messagePayload: any) => {
      const messageString = JSON.stringify(messagePayload);
      if (!capturedClientMessageCallback) throw new Error('capturedClientMessageCallback is not defined for get_filter_info');
      await new Promise<void>((resolve, reject) => {
        mockClientWsInstance.send.mockImplementationOnce(() => { resolve(); });
        capturedClientMessageCallback(messageString);
        setTimeout(() => reject(new Error('sendTestMessage timeout for get_filter_info')), 100);
      }).catch(e => {}); 
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      (vscode.Uri.parse as jest.Mock).mockImplementation((uriString: string) => {
        if (uriString === mockWorkspaceFolderFilterUriString) return mockUriFilter;
        let fsPath = uriString.startsWith('file:///') ? uriString.substring('file:///'.length) : uriString;
        if (uriString.startsWith('file:///') && !fsPath.startsWith('/')) fsPath = '/' + fsPath;
        return { fsPath, path: fsPath, scheme: 'file', toString: () => uriString, authority: '', query: '', fragment: '', with: jest.fn().mockReturnThis(), toJSON: () => ({}) } as vscode.Uri;
      });
      mockWorkspaceServiceEnsureTrusted.mockResolvedValue(undefined);
      mockWorkspaceServiceGetFolder.mockReset();
      mockWorkspaceServiceGetFolders.mockReset();
      mockParseGitignore.mockReset();
      mockUuidV4.mockClear(); // Not used in this response, but good practice

      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      ipcServer.start();
      const listeningHandler = capturedWssEventListeners['listening']?.[0];
      if (listeningHandler) listeningHandler();

      mockClientWsInstance = { 
        on: jest.fn((event: string, callback: (...args: any[]) => void) => { if (event === 'message') capturedClientMessageCallback = callback; }), 
        send: jest.fn(), close: jest.fn(), removeAllListeners: jest.fn(), terminate: jest.fn(),
      };
      const connCallback = capturedWssEventListeners['connection']?.[0];
      if (!connCallback) throw new Error('Could not capture connection callback for get_filter_info');
      capturedConnectionCallback = connCallback;
      capturedConnectionCallback(mockClientWsInstance as any, mockRequest);
      if (!capturedClientMessageCallback) throw new Error('No message callback captured for get_filter_info');
      await mockWorkspaceServiceEnsureTrusted();
    });

    it('should return filterType \'gitignore\' if .gitignore is parsed', async () => {
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWorkspaceFolderFilter);
      mockParseGitignore.mockResolvedValue({} as any); // Simulate a parsed gitignore object (content doesn't matter, just its existence)
      const messageId = 'gfi-gitignore';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { workspaceFolderUri: mockWorkspaceFolderFilterUriString }
      });

      expect(mockParseGitignore).toHaveBeenCalledWith(mockWorkspaceFolderFilter);
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.command).toBe('response_filter_info');
      expect(sentMsg.payload.success).toBe(true);
      expect(sentMsg.payload.data.filterType).toBe('gitignore');
      expect(sentMsg.payload.data.workspaceFolderUri).toBe(mockWorkspaceFolderFilterUriString);
    });

    it('should return filterType \'default\' if no .gitignore is parsed', async () => {
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWorkspaceFolderFilter);
      mockParseGitignore.mockResolvedValue(null); // Simulate no gitignore found/parsed
      const messageId = 'gfi-default';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { workspaceFolderUri: mockWorkspaceFolderFilterUriString }
      });

      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.data.filterType).toBe('default');
    });

    it('should send error if getTargetWorkspaceFolder fails (e.g., folder not found)', async () => {
      mockWorkspaceServiceGetFolder.mockReturnValue(undefined); // Simulate folder not found
      const messageId = 'gfi-ws-not-found';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { workspaceFolderUri: 'file:///invalid/path' }
      });
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.success).toBe(false);
      expect(sentMsg.payload.errorCode).toBe('WORKSPACE_FOLDER_NOT_FOUND');
      expect(mockParseGitignore).not.toHaveBeenCalled();
    });

    it('should send INTERNAL_SERVER_ERROR if parseGitignore throws an unexpected error', async () => {
      mockWorkspaceServiceGetFolder.mockReturnValue(mockWorkspaceFolderFilter);
      const errorMsg = 'Gitignore parsing exploded';
      mockParseGitignore.mockRejectedValue(new Error(errorMsg));
      const messageId = 'gfi-parse-error';
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: { workspaceFolderUri: mockWorkspaceFolderFilterUriString }
      });
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      expect(sentMsg.payload.success).toBe(false);
      expect(sentMsg.payload.errorCode).toBe('INTERNAL_SERVER_ERROR'); // As per current catch block in handleGetFilterInfo
      expect(sentMsg.payload.error).toContain(errorMsg);
    });
  });

  describe('Message Handling (check_workspace_trust - Deprecated)', () => {
    let server: IPCServer;
    let capturedConnectionCallback: (ws: ActualWebSocket_Type, req: any) => void;
    let mockClientWsInstance: MinimalWebSocket;
    let capturedClientMessageCallback: (message: string | Buffer) => void;
    const mockRequest = { socket: { remoteAddress: '127.0.0.1' } };
    const commandToTest = 'check_workspace_trust';

    const sendTestMessage = async (messagePayload: any) => {
      const messageString = JSON.stringify(messagePayload);
      if (!capturedClientMessageCallback) throw new Error('capturedClientMessageCallback is not defined for check_workspace_trust');
      await new Promise<void>((resolve, reject) => {
        mockClientWsInstance.send.mockImplementationOnce(() => { resolve(); });
        capturedClientMessageCallback(messageString);
        setTimeout(() => reject(new Error('sendTestMessage timeout for check_workspace_trust')), 100);
      }).catch(e => {}); 
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      mockWorkspaceServiceEnsureTrusted.mockResolvedValue(undefined); // Pre-check passes
      mockWorkspaceServiceGetDetails.mockReset();
      mockWorkspaceServiceIsTrusted.mockReset();
      
      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      ipcServer.start();
      const listeningHandler = capturedWssEventListeners['listening']?.[0];
      if (listeningHandler) listeningHandler();

      mockClientWsInstance = { 
        on: jest.fn((event: string, callback: (...args: any[]) => void) => { if (event === 'message') capturedClientMessageCallback = callback; }), 
        send: jest.fn(), close: jest.fn(), removeAllListeners: jest.fn(), terminate: jest.fn(),
      };
      const connCallback = capturedWssEventListeners['connection']?.[0];
      if (!connCallback) throw new Error('Could not capture connection callback for check_workspace_trust');
      capturedConnectionCallback = connCallback;
      capturedConnectionCallback(mockClientWsInstance as any, mockRequest);
      if (!capturedClientMessageCallback) throw new Error('No message callback captured for check_workspace_trust');
      // Note: check_workspace_trust is NOT in commandsRequiringWorkspace, so ensureWorkspaceTrustedAndOpen is not called by the central pre-check for it.
      // However, the handleGetWorkspaceDetails it redirects to WILL perform its own checks if necessary, or rely on its own logic.
      // For this test, we primarily care that it redirects and sends the correct response type.
    });

    it('should redirect to handleGetWorkspaceDetails and return workspace details', async () => {
      const details = [{ uri: 'file:///projectX', name: 'Project X', isTrusted: true }];
      mockWorkspaceServiceGetDetails.mockReturnValue(details);
      mockWorkspaceServiceIsTrusted.mockReturnValue(true);
      const messageId = 'cwt-redirect';
      
      await sendTestMessage({
        protocol_version: '1.0', message_id: messageId, type: 'request',
        command: commandToTest, payload: {}
      });

      // Verify that the methods for get_workspace_details were called
      expect(mockWorkspaceServiceGetDetails).toHaveBeenCalledTimes(1);
      expect(mockWorkspaceServiceIsTrusted).toHaveBeenCalledTimes(1);
      
      expect(mockClientWsInstance.send).toHaveBeenCalledTimes(1);
      const sentMsg = JSON.parse((mockClientWsInstance.send as jest.Mock).mock.calls[0][0]);
      // IMPORTANT: The response command will be 'response_workspace_details' due to redirection
      expect(sentMsg.command).toBe('response_workspace_details'); 
      expect(sentMsg.message_id).toBe(messageId);
      expect(sentMsg.payload.success).toBe(true);
      expect(sentMsg.payload.data.workspaceFolders).toEqual(details);
      expect(sentMsg.payload.data.isTrusted).toBe(true);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining("Command 'check_workspace_trust' is deprecated. Use 'get_workspace_details'."));
    });
  });

  describe('IPCServer Public Methods (pushSnippetToTarget)', () => {
    let server: IPCServer;
    let mockClientWs1: MinimalWebSocket;
    let mockClientWs2: MinimalWebSocket;
    let serverClientsMap: Map<any, any>; // To access internal state for test setup

    const snippetData = {
      snippet: 'const hello = "world";',
      language: 'javascript',
      filePath: '/test/file.js',
      startLine: 1,
      endLine: 1,
      metadata: { unique_block_id: 'uuid-snippet-1', content_source_id: 'file:///test/file.js::snippet::1-1', type: 'code_snippet', label: 'file.js (1-1)' },
      // targetTabId is part of the method call, not snippetData itself for this method
    };
    const targetTabId1 = 101;
    const targetTabId2 = 102;

    beforeEach(() => {
      jest.clearAllMocks();
      mockUuidV4.mockClear(); // Though not directly used by pushSnippetToTarget's core logic, good practice
      
      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      // No need to call ipcServer.start() for this specific method test if we manually manage clients map
      serverClientsMap = (ipcServer as any).clients;
      serverClientsMap.clear();

      mockClientWs1 = { 
        on: jest.fn(), send: jest.fn(), close: jest.fn(), removeAllListeners: jest.fn(), terminate: jest.fn(),
      };
      mockClientWs2 = { 
        on: jest.fn(), send: jest.fn(), close: jest.fn(), removeAllListeners: jest.fn(), terminate: jest.fn(),
      };
    });

    it('should push snippet to the correct client with matching targetTabId', () => {
      // Simulate client 1 connected and registered
      serverClientsMap.set(mockClientWs1, { ws: mockClientWs1, isAuthenticated: true, ip: 'client1', activeLLMTabId: targetTabId1 });
      // Simulate client 2 connected but with different or no tabId
      serverClientsMap.set(mockClientWs2, { ws: mockClientWs2, isAuthenticated: true, ip: 'client2', activeLLMTabId: targetTabId2 });

      ipcServer.pushSnippetToTarget(targetTabId1, snippetData);

      expect(mockClientWs1.send).toHaveBeenCalledTimes(1);
      expect(mockClientWs2.send).not.toHaveBeenCalled();
      
      const sentMessage = JSON.parse((mockClientWs1.send as jest.Mock).mock.calls[0][0]);
      expect(sentMessage.type).toBe('push');
      expect(sentMessage.command).toBe('push_snippet');
      expect(sentMessage.payload).toEqual(snippetData); // pushSnippetToTarget passes snippetData as payload
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`Pushed snippet to tabId ${targetTabId1}`));
    });

    it('should not send snippet and show warning if no client matches targetTabId', () => {
      serverClientsMap.set(mockClientWs1, { ws: mockClientWs1, isAuthenticated: true, ip: 'client1', activeLLMTabId: targetTabId2 }); // Mismatched TabId

      const nonExistentTabId = 999;
      ipcServer.pushSnippetToTarget(nonExistentTabId, snippetData);

      expect(mockClientWs1.send).not.toHaveBeenCalled();
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith("ContextWeaver: Could not send snippet. No active, authenticated Chrome tab found.");
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`WARN: No authenticated client found for targetTabId ${nonExistentTabId} to push snippet.`));
    });

    it('should not send to unauthenticated clients even if tabId matches', () => {
      serverClientsMap.set(mockClientWs1, { ws: mockClientWs1, isAuthenticated: false, ip: 'client1', activeLLMTabId: targetTabId1 });

      ipcServer.pushSnippetToTarget(targetTabId1, snippetData);
      expect(mockClientWs1.send).not.toHaveBeenCalled();
      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    });
  });

  describe('IPCServer Public Methods (stop)', () => {
    let server: IPCServer;
    let mockClientWs1: MinimalWebSocket, mockClientWs2: MinimalWebSocket;
    let serverClientsMap: Map<any, any>; 

    beforeEach(() => {
      jest.clearAllMocks();
      // Reset the primary WSS mock instance's methods that would be called by stop()
      mockWebSocketServerInstance.removeAllListeners.mockClear();
      mockWebSocketServerInstance.close.mockClear();

      ipcServer = new IPCServer(TEST_PORT, mockExtensionContext, mockOutputChannel, mockSearchServiceInstance, mockWorkspaceServiceInstance);
      // To simulate a started server with clients for some tests:
      // We will manually set 'wss' and populate 'clients' map for controlled testing of 'stop()'
      // rather than fully starting and connecting clients for every 'stop' test.
      serverClientsMap = (ipcServer as any).clients;
      serverClientsMap.clear();

      mockClientWs1 = { 
        on: jest.fn(), send: jest.fn(), close: jest.fn(), removeAllListeners: jest.fn(), terminate: jest.fn(),
      };
      mockClientWs2 = { 
        on: jest.fn(), send: jest.fn(), close: jest.fn(), removeAllListeners: jest.fn(), terminate: jest.fn(),
      };
    });

    it('should close the server and all client connections if server is active', () => {
      // Simulate a started server with clients
      (ipcServer as any).wss = mockWebSocketServerInstance; // Manually assign the mocked server instance
      serverClientsMap.set(mockClientWs1, { ws: mockClientWs1, isAuthenticated: true, ip: 'client1' });
      serverClientsMap.set(mockClientWs2, { ws: mockClientWs2, isAuthenticated: true, ip: 'client2' });

      ipcServer.stop();

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Stopping WebSocket server...'));
      
      expect(mockClientWs1.removeAllListeners).toHaveBeenCalledTimes(1);
      expect(mockClientWs1.close).toHaveBeenCalledTimes(1);
      expect(mockClientWs2.removeAllListeners).toHaveBeenCalledTimes(1);
      expect(mockClientWs2.close).toHaveBeenCalledTimes(1);
      expect(serverClientsMap.size).toBe(0);

      expect(mockWebSocketServerInstance.removeAllListeners).toHaveBeenCalledTimes(1);
      expect(mockWebSocketServerInstance.close).toHaveBeenCalledTimes(1);
      // Check if the close callback logs success
      const closeCallback = (mockWebSocketServerInstance.close as jest.Mock).mock.calls[0][0];
      if (closeCallback) closeCallback(); // Simulate successful close
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('WebSocket server stopped.'));
      expect((ipcServer as any).wss).toBeNull();
    });

    it('should handle server close error during stop', () => {
      (ipcServer as any).wss = mockWebSocketServerInstance;
      const closeError = new Error('Failed to close server');
      (mockWebSocketServerInstance.close as jest.Mock).mockImplementationOnce((cb) => cb(closeError));

      ipcServer.stop();

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining(`Error closing WebSocket server: ${closeError.message}`));
      expect((ipcServer as any).wss).toBeNull(); // Should still be nulled out
    });

    it('should do nothing if server is not active (wss is null)', () => {
      (ipcServer as any).wss = null; // Ensure server is not considered active
      
      ipcServer.stop();

      expect(mockOutputChannel.appendLine).not.toHaveBeenCalledWith(expect.stringContaining('Stopping WebSocket server...'));
      expect(mockWebSocketServerInstance.close).not.toHaveBeenCalled();
    });

    it('should gracefully handle errors when closing individual client connections', () => {
      (ipcServer as any).wss = mockWebSocketServerInstance;
      const clientCloseError = new Error('Client close failed');
      (mockClientWs1.close as jest.Mock).mockImplementationOnce(() => { throw clientCloseError; });
      
      serverClientsMap.set(mockClientWs1, { ws: mockClientWs1, isAuthenticated: true, ip: 'client1' });
      serverClientsMap.set(mockClientWs2, { ws: mockClientWs2, isAuthenticated: true, ip: 'client2' });

      ipcServer.stop(); 
      // console.error is called by ipcServer in this case
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[ContextWeaver IPCServer] Error cleaning up client:'), clientCloseError);
      expect(mockClientWs1.removeAllListeners).toHaveBeenCalledTimes(1); // Should still attempt to remove listeners
      expect(mockClientWs2.close).toHaveBeenCalledTimes(1); // Other clients should be closed normally
      expect(mockWebSocketServerInstance.close).toHaveBeenCalledTimes(1); // Server should still close
    });
  });
});