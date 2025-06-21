/**
 * @file GetOpenFilesHandler.test.ts
 * @description Unit tests for GetOpenFilesHandler
 * @module ContextWeaver/CE/Tests
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { GetOpenFilesHandler } from '../../../src/serviceWorker/handlers/GetOpenFilesHandler';
import { IPCClient } from '../../../src/serviceWorker/ipcClient';
import { OpenFilesResponsePayload } from '@contextweaver/shared';

// Mock dependencies
jest.mock('../../../src/serviceWorker/ipcClient');
jest.mock('@contextweaver/shared', () => {
    const actual = jest.requireActual('@contextweaver/shared') as any;
    return {
        ...actual,
        Logger: jest.fn().mockImplementation(() => ({
            debug: jest.fn(),
            trace: jest.fn(),
            error: jest.fn()
        }))
    };
});

describe('GetOpenFilesHandler', () => {
    let handler: GetOpenFilesHandler;
    let mockIpcClient: jest.Mocked<IPCClient>;

    beforeEach(() => {
        jest.clearAllMocks();
        handler = new GetOpenFilesHandler();
        mockIpcClient = new IPCClient() as jest.Mocked<IPCClient>;
    });

    test('should successfully get open files', async () => {
        const mockResponse: OpenFilesResponsePayload = {
            success: true,
            data: {
                openFiles: [
                    {
                        path: '/project/src/index.ts',
                        name: 'index.ts',
                        windowId: 'window-123',
                        workspaceFolderUri: 'file:///project',
                        workspaceFolderName: 'project'
                    },
                    {
                        path: '/project/src/utils.ts',
                        name: 'utils.ts',
                        windowId: 'window-123',
                        workspaceFolderUri: 'file:///project',
                        workspaceFolderName: 'project'
                    }
                ]
            },
            error: null
        };

        mockIpcClient.getOpenFiles.mockResolvedValue(mockResponse);

        const result = await handler.handle({}, mockIpcClient);

        expect(mockIpcClient.getOpenFiles).toHaveBeenCalled();
        expect(result).toEqual({
            success: true,
            data: mockResponse.data
        });
    });

    test('should handle no open files', async () => {
        const mockResponse: OpenFilesResponsePayload = {
            success: true,
            data: {
                openFiles: []
            },
            error: null
        };

        mockIpcClient.getOpenFiles.mockResolvedValue(mockResponse);

        const result = await handler.handle({}, mockIpcClient);

        expect(result).toEqual({
            success: true,
            data: mockResponse.data
        });
    });

    test('should handle error response', async () => {
        const mockResponse: OpenFilesResponsePayload = {
            success: false,
            data: null,
            error: 'Failed to get open files'
        };

        mockIpcClient.getOpenFiles.mockResolvedValue(mockResponse);

        const result = await handler.handle({}, mockIpcClient);

        expect(result).toEqual({
            success: false,
            error: 'Failed to get open files'
        });
    });

    test('should handle IPC client error', async () => {
        const error = new Error('IPC connection lost');
        mockIpcClient.getOpenFiles.mockRejectedValue(error);

        const result = await handler.handle({}, mockIpcClient);

        expect(result).toEqual({
            success: false,
            error: 'IPC connection lost'
        });
    });

    test('should use default error message when error has no message', async () => {
        mockIpcClient.getOpenFiles.mockRejectedValue({});

        const result = await handler.handle({}, mockIpcClient);

        expect(result).toEqual({
            success: false,
            error: 'An unknown error occurred'
        });
    });

    test('should use default error message when response has no error message', async () => {
        const mockResponse: OpenFilesResponsePayload = {
            success: false,
            data: null,
            error: null
        };

        mockIpcClient.getOpenFiles.mockResolvedValue(mockResponse);

        const result = await handler.handle({}, mockIpcClient);

        expect(result).toEqual({
            success: false,
            error: 'Failed to get open files list from VSCE.'
        });
    });
});