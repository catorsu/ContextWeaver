/**
 * @file SearchWorkspaceHandler.test.ts
 * @description Unit tests for SearchWorkspaceHandler
 * @module ContextWeaver/CE/Tests
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { SearchWorkspaceHandler } from '../../../src/serviceWorker/handlers/SearchWorkspaceHandler';
import { IPCClient } from '../../../src/serviceWorker/ipcClient';
import { SearchWorkspaceRequestPayload, SearchWorkspaceResponsePayload } from '@contextweaver/shared';

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

describe('SearchWorkspaceHandler', () => {
    let handler: SearchWorkspaceHandler;
    let mockIpcClient: jest.Mocked<IPCClient>;

    beforeEach(() => {
        jest.clearAllMocks();
        handler = new SearchWorkspaceHandler();
        mockIpcClient = new IPCClient() as jest.Mocked<IPCClient>;
    });

    test('should successfully search workspace', async () => {
        const payload: SearchWorkspaceRequestPayload = {
            query: 'test',
            workspaceFolderUri: null
        };

        const mockResponse: SearchWorkspaceResponsePayload = {
            success: true,
            data: {
                results: [
                    {
                        path: '/project/src/test.ts',
                        name: 'test.ts',
                        type: 'file',
                        uri: 'file:///project/src/test.ts',
                        content_source_id: 'file:///project/src/test.ts',
                        workspaceFolderUri: 'file:///project',
                        workspaceFolderName: 'project',
                        relativePath: 'src/test.ts',
                        windowId: 'window-123'
                    },
                    {
                        path: '/project/lib/test-utils.js',
                        name: 'test-utils.js',
                        type: 'file',
                        uri: 'file:///project/lib/test-utils.js',
                        content_source_id: 'file:///project/lib/test-utils.js',
                        workspaceFolderUri: 'file:///project',
                        workspaceFolderName: 'project',
                        relativePath: 'lib/test-utils.js',
                        windowId: 'window-123'
                    }
                ],
                windowId: 'window-123'
            },
            error: null,
            query: 'test'
        };

        mockIpcClient.searchWorkspace.mockResolvedValue(mockResponse);

        const result = await handler.handle(payload, mockIpcClient);

        expect(mockIpcClient.searchWorkspace).toHaveBeenCalledWith('test', null);
        expect(result).toEqual({
            success: true,
            data: mockResponse.data
        });
    });

    test('should handle search with no results', async () => {
        const payload: SearchWorkspaceRequestPayload = {
            query: 'nonexistent',
            workspaceFolderUri: null
        };

        const mockResponse: SearchWorkspaceResponsePayload = {
            success: true,
            data: {
                results: [],
                windowId: 'window-123'
            },
            error: null,
            query: 'nonexistent'
        };

        mockIpcClient.searchWorkspace.mockResolvedValue(mockResponse);

        const result = await handler.handle(payload, mockIpcClient);

        expect(mockIpcClient.searchWorkspace).toHaveBeenCalledWith('nonexistent', null);
        expect(result).toEqual({
            success: true,
            data: mockResponse.data
        });
    });

    test('should handle search error', async () => {
        const payload: SearchWorkspaceRequestPayload = {
            query: 'test',
            workspaceFolderUri: null
        };

        const mockResponse: SearchWorkspaceResponsePayload = {
            success: false,
            data: null,
            error: 'Search failed: invalid regex pattern',
            query: 'test'
        };

        mockIpcClient.searchWorkspace.mockResolvedValue(mockResponse);

        const result = await handler.handle(payload, mockIpcClient);

        expect(result).toEqual({
            success: false,
            error: 'Search failed: invalid regex pattern'
        });
    });

    test('should handle IPC client error', async () => {
        const payload: SearchWorkspaceRequestPayload = {
            query: 'test',
            workspaceFolderUri: null
        };

        const error = new Error('IPC timeout');
        mockIpcClient.searchWorkspace.mockRejectedValue(error);

        const result = await handler.handle(payload, mockIpcClient);

        expect(result).toEqual({
            success: false,
            error: 'IPC timeout'
        });
    });

    test('should use default error message when error has no message', async () => {
        const payload: SearchWorkspaceRequestPayload = {
            query: 'test',
            workspaceFolderUri: null
        };

        mockIpcClient.searchWorkspace.mockRejectedValue({});

        const result = await handler.handle(payload, mockIpcClient);

        expect(result).toEqual({
            success: false,
            error: 'An unknown error occurred'
        });
    });

    test('should use default error message when response has no error message', async () => {
        const payload: SearchWorkspaceRequestPayload = {
            query: 'test',
            workspaceFolderUri: null
        };

        const mockResponse: SearchWorkspaceResponsePayload = {
            success: false,
            data: null,
            error: null,
            query: 'test'
        };

        mockIpcClient.searchWorkspace.mockResolvedValue(mockResponse);

        const result = await handler.handle(payload, mockIpcClient);

        expect(result).toEqual({
            success: false,
            error: 'Failed to get search results from VSCE.'
        });
    });
});