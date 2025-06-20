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

import { ConnectionService, Client } from '../../src/adapters/primary/ipc/ConnectionService';
import * as WebSocket from 'ws';

describe('ConnectionService', () => {
    let connectionService: ConnectionService;

    beforeEach(() => {
        connectionService = new ConnectionService();
    });

    afterEach(() => {
        if (connectionService.isRunning()) {
            connectionService.stop();
        }
    });

    describe('Port Management', () => {
        it('should not be running initially', () => {
            expect(connectionService.isRunning()).toBe(false);
            expect(connectionService.getActivePort()).toBe(null);
        });

        it('should handle tryStartServerOnPort rejection', async () => {
            // Test that tryStartServerOnPort can reject properly (this will fail with real WebSocket but demonstrates the API)
            // In a real test environment, we would mock the WebSocket constructor more thoroughly
            await expect(connectionService.tryStartServerOnPort(1)).rejects.toThrow();
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
            
            connectionService.updateClient(mockWs, { activeLLMTabId: 123 });
            
            const updatedClient = connectionService.getClient(mockWs);
            expect(updatedClient?.activeLLMTabId).toBe(123);
        });
    });

    describe('Message Sending', () => {
        it('should handle null WebSocket in sendError', () => {
            // This should not throw an error
            expect(() => {
                connectionService.sendError(null as any, 'test-id', 'TEST_ERROR', 'Test error message');
            }).not.toThrow();
        });

        it('should not send message if WebSocket is not open', () => {
            const mockWs = {
                readyState: WebSocket.WebSocket.CLOSED,
                send: jest.fn()
            } as any;

            connectionService.sendMessage(mockWs, 'response', 'response_generic_ack', { success: true, message: 'test' }, 'test-id');

            expect(mockWs.send).not.toHaveBeenCalled();
        });
    });
});