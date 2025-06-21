/**
 * @file connectionService.test.ts
 * @description Unit tests for the ConnectionService class.
 * @module ContextWeaver/VSCE/Tests
 */

// Mock Logger
jest.mock('@contextweaver/shared', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        trace: jest.fn()
    }))
}));

// Mock uuid
jest.mock('uuid', () => ({
    v4: jest.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9))
}));

import { EventEmitter } from 'events';

// Create mock WebSocket class
class MockWebSocket extends EventEmitter {
    static OPEN = 1;
    static CLOSED = 3;
    static CONNECTING = 0;
    static CLOSING = 2;
    
    readyState: number = MockWebSocket.OPEN;
    send = jest.fn();
    close = jest.fn();
    removeAllListeners = jest.fn(() => {
        super.removeAllListeners();
        return this;
    });
}

// Create mock WebSocketServer class
class MockWebSocketServer extends EventEmitter {
    clients = new Set<MockWebSocket>();
    close = jest.fn((callback?: (err?: Error) => void) => {
        if (callback) callback();
    });
    removeAllListeners = jest.fn(() => {
        super.removeAllListeners();
        return this;
    });
}

// Mock the 'ws' module
jest.mock('ws', () => {
    const EventEmitter = require('events').EventEmitter;
    
    // Re-create the mock classes inside the factory
    class MockWebSocket extends EventEmitter {
        static OPEN = 1;
        static CLOSED = 3;
        static CONNECTING = 0;
        static CLOSING = 2;
        
        readyState: number = MockWebSocket.OPEN;
        send = jest.fn();
        close = jest.fn();
        removeAllListeners = jest.fn(() => {
            super.removeAllListeners();
            return this;
        });
    }
    
    class MockWebSocketServer extends EventEmitter {
        clients = new Set<MockWebSocket>();
        close = jest.fn((callback?: (err?: Error) => void) => {
            if (callback) callback();
        });
        removeAllListeners = jest.fn(() => {
            super.removeAllListeners();
            return this;
        });
    }
    
    const MockWebSocketServerConstructor = jest.fn().mockImplementation((options: any) => {
        const server = new MockWebSocketServer();
        // Default behavior: simulate successful server start for valid ports
        if (options && options.port >= 30001 && options.port <= 30005) {
            process.nextTick(() => server.emit('listening'));
        } else {
            const error = new Error(`Port ${options.port} is out of range`);
            (error as any).code = 'EADDRINUSE';
            process.nextTick(() => server.emit('error', error));
        }
        return server;
    });

    return {
        WebSocketServer: MockWebSocketServerConstructor,
        WebSocket: MockWebSocket
    };
});

import { ConnectionService, Client } from '../../src/adapters/primary/ipc/ConnectionService';
import * as WebSocket from 'ws';

describe('ConnectionService', () => {
    let connectionService: ConnectionService;
    let mockLogger: any;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Reset WebSocketServer mock to default behavior
        const mockWss = require('ws').WebSocketServer;
        mockWss.mockImplementation((options: any) => {
            const server = new MockWebSocketServer();
            // Default behavior: simulate successful server start for valid ports
            if (options && options.port >= 30001 && options.port <= 30005) {
                process.nextTick(() => server.emit('listening'));
            } else {
                const error = new Error(`Port ${options.port} is out of range`);
                (error as any).code = 'EADDRINUSE';
                process.nextTick(() => server.emit('error', error));
            }
            return server;
        });
        
        connectionService = new ConnectionService();
        mockLogger = (connectionService as any).logger;
    });

    afterEach(async () => {
        if (connectionService.isRunning()) {
            await connectionService.stop();
        }
        jest.clearAllMocks();
    });

    describe('Port Management', () => {
        it('should not be running initially', () => {
            expect(connectionService.isRunning()).toBe(false);
            expect(connectionService.getActivePort()).toBe(null);
        });

        it('should successfully start server on valid port', async () => {
            await expect(connectionService.tryStartServerOnPort(30001)).resolves.toBeUndefined();
            expect(connectionService.isRunning()).toBe(true);
            expect(connectionService.getActivePort()).toBe(30001);
        });

        it('should reject when port is out of valid range', async () => {
            await expect(connectionService.tryStartServerOnPort(1)).rejects.toThrow();
            expect(connectionService.isRunning()).toBe(false);
            expect(connectionService.getActivePort()).toBe(null);
        });

        it('should handle EADDRINUSE error', async () => {
            // Mock WebSocketServer to simulate EADDRINUSE error
            const mockWss = require('ws').WebSocketServer;
            mockWss.mockImplementationOnce((options: any) => {
                const server = new MockWebSocketServer();
                const error = new Error('Port already in use');
                (error as any).code = 'EADDRINUSE';
                process.nextTick(() => server.emit('error', error));
                return server;
            });

            await expect(connectionService.tryStartServerOnPort(30001)).rejects.toThrow('Port already in use');
        });

        it('should try multiple ports when starting server', async () => {
            const mockWss = require('ws').WebSocketServer;
            let callCount = 0;
            
            // Mock to fail on first two ports, succeed on third
            mockWss.mockImplementation((options: any) => {
                const server = new MockWebSocketServer();
                callCount++;
                if (callCount <= 2) {
                    const error = new Error('Port already in use');
                    (error as any).code = 'EADDRINUSE';
                    process.nextTick(() => server.emit('error', error));
                } else {
                    process.nextTick(() => server.emit('listening'));
                }
                return server;
            });

            const onConnection = jest.fn();
            const port = await connectionService.startServer(onConnection);
            
            expect(port).toBe(30003);
            expect(callCount).toBe(3);
            expect(mockLogger.info).toHaveBeenCalledWith('Port 30001 is in use, trying next...');
            expect(mockLogger.info).toHaveBeenCalledWith('Port 30002 is in use, trying next...');
        });

        it('should throw error when all ports are in use', async () => {
            const mockWss = require('ws').WebSocketServer;
            
            // Mock to always fail with EADDRINUSE
            mockWss.mockImplementation((options: any) => {
                const server = new MockWebSocketServer();
                const error = new Error('Port already in use');
                (error as any).code = 'EADDRINUSE';
                process.nextTick(() => server.emit('error', error));
                return server;
            });

            const onConnection = jest.fn();
            await expect(connectionService.startServer(onConnection)).rejects.toThrow(
                'All ports in range 30001-30005 are in use.'
            );
        });
    });

    describe('Client Management', () => {
        it('should start with empty client list', () => {
            const clients = connectionService.getClients();
            expect(clients.size).toBe(0);
        });

        it('should be able to get client by WebSocket', () => {
            const mockWs = {} as WebSocket.WebSocket;
            const client = connectionService.getClient(mockWs);
            expect(client).toBeUndefined();
        });

        it('should handle client updates', () => {
            const mockWs = {} as WebSocket.WebSocket;
            const mockClient: Client = {
                ws: mockWs,
                isAuthenticated: true,
                ip: '127.0.0.1'
            };
            
            // Manually add client to test updates
            connectionService.getClients().set(mockWs, mockClient);
            
            connectionService.updateClient(mockWs, { activeLLMTabId: 123, activeLLMHost: 'example.com' });
            
            const updatedClient = connectionService.getClient(mockWs);
            expect(updatedClient?.activeLLMTabId).toBe(123);
            expect(updatedClient?.activeLLMHost).toBe('example.com');
        });

        it('should handle client updates for non-existent client', () => {
            const mockWs = {} as WebSocket.WebSocket;
            
            // Should not throw
            expect(() => {
                connectionService.updateClient(mockWs, { activeLLMTabId: 123 });
            }).not.toThrow();
        });

        it('should remove client', () => {
            const mockWs = new MockWebSocket();
            const mockClient: Client = {
                ws: mockWs as any,
                isAuthenticated: true,
                ip: '127.0.0.1'
            };
            
            connectionService.getClients().set(mockWs as any, mockClient);
            expect(connectionService.getClients().size).toBe(1);
            
            connectionService.removeClient(mockWs as any);
            expect(connectionService.getClients().size).toBe(0);
        });

        it('should handle removing non-existent client', () => {
            const mockWs = {} as WebSocket.WebSocket;
            
            expect(() => {
                connectionService.removeClient(mockWs);
            }).not.toThrow();
        });
    });

    describe('Connection Lifecycle', () => {
        it('should handle new client connection', async () => {
            const onConnection = jest.fn();
            const mockReq = {
                socket: {
                    remoteAddress: '192.168.1.100'
                }
            };

            await connectionService.startServer(onConnection);
            
            // Get the WebSocketServer instance
            const wss = (connectionService as any).wss;
            expect(wss).toBeDefined();

            // Simulate a new connection
            const mockWs = new MockWebSocket();
            wss.emit('connection', mockWs, mockReq);

            // Verify client was registered
            const clients = connectionService.getClients();
            expect(clients.size).toBe(1);
            const client = clients.get(mockWs as any);
            expect(client).toBeDefined();
            expect(client?.ip).toBe('192.168.1.100');
            expect(client?.isAuthenticated).toBe(true);

            // Verify callback was called
            expect(onConnection).toHaveBeenCalledWith(client);
        });

        it('should handle client disconnect', async () => {
            const onConnection = jest.fn();
            await connectionService.startServer(onConnection);
            
            const wss = (connectionService as any).wss;
            const mockWs = new MockWebSocket();
            const mockReq = { socket: { remoteAddress: '127.0.0.1' } };
            
            wss.emit('connection', mockWs, mockReq);
            expect(connectionService.getClients().size).toBe(1);

            // Simulate disconnect
            mockWs.emit('close');
            
            expect(connectionService.getClients().size).toBe(0);
            expect(mockWs.removeAllListeners).toHaveBeenCalled();
        });

        it('should handle client error', async () => {
            const onConnection = jest.fn();
            await connectionService.startServer(onConnection);
            
            const wss = (connectionService as any).wss;
            const mockWs = new MockWebSocket();
            const mockReq = { socket: { remoteAddress: '127.0.0.1' } };
            
            wss.emit('connection', mockWs, mockReq);
            expect(connectionService.getClients().size).toBe(1);

            // Simulate error
            const error = new Error('WebSocket error');
            mockWs.emit('error', error);
            
            expect(connectionService.getClients().size).toBe(0);
            expect(mockWs.removeAllListeners).toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Error on WebSocket connection from 127.0.0.1: WebSocket error'
            );
        });

        it('should handle connection with unknown IP', async () => {
            const onConnection = jest.fn();
            await connectionService.startServer(onConnection);
            
            const wss = (connectionService as any).wss;
            const mockWs = new MockWebSocket();
            const mockReq = { socket: {} }; // No remoteAddress
            
            wss.emit('connection', mockWs, mockReq);
            
            const client = connectionService.getClient(mockWs as any);
            expect(client?.ip).toBe('unknown');
        });
    });

    describe('Message Sending', () => {
        it('should handle null WebSocket in sendError', () => {
            // This should not throw an error
            expect(() => {
                connectionService.sendError(null as any, 'test-id', 'TEST_ERROR', 'Test error message');
            }).not.toThrow();
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Attempted to send error but WebSocket was null.',
                { errorCode: 'TEST_ERROR', errorMessage: 'Test error message' }
            );
        });

        it('should send error message correctly', () => {
            const mockWs = {
                readyState: MockWebSocket.OPEN,
                send: jest.fn()
            } as any;

            connectionService.sendError(mockWs, 'original-id', 'FILE_NOT_FOUND', 'File not found');

            expect(mockWs.send).toHaveBeenCalled();
            const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
            expect(sentMessage).toMatchObject({
                protocol_version: '1.0',
                message_id: 'original-id',
                type: 'error_response',
                command: 'error_response',
                payload: {
                    success: false,
                    error: 'File not found',
                    errorCode: 'FILE_NOT_FOUND'
                }
            });
        });

        it('should send message when WebSocket is open', () => {
            const mockWs = {
                readyState: MockWebSocket.OPEN,
                send: jest.fn()
            } as any;

            const payload = { success: true, message: 'test' };
            connectionService.sendMessage(mockWs, 'response', 'response_generic_ack', payload, 'test-id');

            expect(mockWs.send).toHaveBeenCalled();
            const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
            expect(sentMessage).toMatchObject({
                protocol_version: '1.0',
                message_id: 'test-id',
                type: 'response',
                command: 'response_generic_ack',
                payload
            });
        });

        it('should not send message if WebSocket is not open', () => {
            const mockWs = {
                readyState: MockWebSocket.CLOSED,
                send: jest.fn()
            } as any;

            connectionService.sendMessage(mockWs, 'response', 'response_generic_ack', { success: true, message: 'test' }, 'test-id');

            expect(mockWs.send).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('WebSocket not OPEN (state: 3)')
            );
        });

        it('should handle send errors gracefully', () => {
            const mockWs = {
                readyState: MockWebSocket.OPEN,
                send: jest.fn().mockImplementation(() => {
                    throw new Error('Send failed');
                })
            } as any;

            expect(() => {
                connectionService.sendMessage(mockWs, 'response', 'response_generic_ack', { success: true, message: 'test' });
            }).not.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error during ws.send()'),
                expect.any(Object)
            );
        });

        it('should generate message_id if not provided', () => {
            const mockWs = {
                readyState: MockWebSocket.OPEN,
                send: jest.fn()
            } as any;

            connectionService.sendMessage(mockWs, 'response', 'response_generic_ack', { success: true, message: 'test' });

            const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
            expect(sentMessage.message_id).toMatch(/^mock-uuid-/);
        });
    });

    describe('Server Lifecycle', () => {
        it('should stop server correctly', async () => {
            const onConnection = jest.fn();
            await connectionService.startServer(onConnection);
            
            // Add a mock client
            const mockWs = new MockWebSocket();
            const mockClient: Client = {
                ws: mockWs as any,
                isAuthenticated: true,
                ip: '127.0.0.1'
            };
            connectionService.getClients().set(mockWs as any, mockClient);

            connectionService.stop();

            expect(mockWs.removeAllListeners).toHaveBeenCalled();
            expect(mockWs.close).toHaveBeenCalled();
            expect(connectionService.getClients().size).toBe(0);
            expect(connectionService.isRunning()).toBe(false);
            expect(connectionService.getActivePort()).toBe(null);
        });

        it('should handle errors during client cleanup', async () => {
            const onConnection = jest.fn();
            await connectionService.startServer(onConnection);
            
            // Add a mock client that throws on cleanup
            const mockWs = new MockWebSocket();
            mockWs.removeAllListeners = jest.fn().mockImplementation(() => {
                throw new Error('Cleanup failed');
            });
            
            const mockClient: Client = {
                ws: mockWs as any,
                isAuthenticated: true,
                ip: '127.0.0.1'
            };
            connectionService.getClients().set(mockWs as any, mockClient);

            connectionService.stop();

            expect(mockLogger.error).toHaveBeenCalledWith('Error cleaning up client:', expect.any(Error));
        });

        it('should handle stop when not running', () => {
            expect(() => {
                connectionService.stop();
            }).not.toThrow();
        });

        it('should handle WebSocket server close error', async () => {
            const onConnection = jest.fn();
            await connectionService.startServer(onConnection);
            
            const wss = (connectionService as any).wss as MockWebSocketServer;
            wss.close = jest.fn((callback?: (err?: Error) => void) => {
                if (callback) callback(new Error('Close failed'));
            });

            connectionService.stop();

            expect(mockLogger.error).toHaveBeenCalledWith('Error closing WebSocket server: Close failed');
        });
    });
});