/**
 * @file GetFileContentHandler.test.ts
 * @description Unit tests for GetFileContentHandler
 * @module ContextWeaver/CE/Tests
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { GetFileContentHandler } from '../../../src/serviceWorker/handlers/GetFileContentHandler';
import { IPCClient } from '../../../src/serviceWorker/ipcClient';
import { GetFileContentRequestPayload, FileContentResponsePayload } from '@contextweaver/shared';

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

describe('GetFileContentHandler', () => {
    let handler: GetFileContentHandler;
    let mockIpcClient: jest.Mocked<IPCClient>;

    beforeEach(() => {
        jest.clearAllMocks();
        handler = new GetFileContentHandler();
        mockIpcClient = new IPCClient() as jest.Mocked<IPCClient>;
    });

    test('should successfully get file content', async () => {
        const payload: GetFileContentRequestPayload = {
            filePath: '/test/file.ts'
        };

        const mockResponse: FileContentResponsePayload = {
            success: true,
            data: {
                fileData: {
                    fullPath: '/test/file.ts',
                    content: 'console.log("test");',
                    languageId: 'typescript'
                },
                metadata: {
                    unique_block_id: 'test-id',
                    content_source_id: 'file:///test/file.ts',
                    type: 'file_content',
                    label: 'file.ts',
                    workspaceFolderUri: 'file:///test',
                    workspaceFolderName: 'test',
                    windowId: 'window-123'
                },
                windowId: 'window-123'
            },
            error: null,
            filePath: '/test/file.ts',
            filterType: 'not_applicable' as any
        };

        mockIpcClient.getFileContent.mockResolvedValue(mockResponse);

        const result = await handler.handle(payload, mockIpcClient);

        expect(mockIpcClient.getFileContent).toHaveBeenCalledWith('/test/file.ts');
        expect(result).toEqual({
            success: true,
            data: mockResponse.data
        });
    });

    test('should handle file not found error', async () => {
        const payload: GetFileContentRequestPayload = {
            filePath: '/test/nonexistent.ts'
        };

        const mockResponse: FileContentResponsePayload = {
            success: false,
            data: null,
            error: 'File not found',
            filePath: '/test/nonexistent.ts',
            filterType: 'not_applicable' as any
        };

        mockIpcClient.getFileContent.mockResolvedValue(mockResponse);

        const result = await handler.handle(payload, mockIpcClient);

        expect(mockIpcClient.getFileContent).toHaveBeenCalledWith('/test/nonexistent.ts');
        expect(result).toEqual({
            success: false,
            error: 'File not found'
        });
    });

    test('should handle IPC client error', async () => {
        const payload: GetFileContentRequestPayload = {
            filePath: '/test/file.ts'
        };

        const error = new Error('IPC connection failed');
        mockIpcClient.getFileContent.mockRejectedValue(error);

        const result = await handler.handle(payload, mockIpcClient);

        expect(mockIpcClient.getFileContent).toHaveBeenCalledWith('/test/file.ts');
        expect(result).toEqual({
            success: false,
            error: 'IPC connection failed'
        });
    });

    test('should handle error without message', async () => {
        const payload: GetFileContentRequestPayload = {
            filePath: '/test/file.ts'
        };

        mockIpcClient.getFileContent.mockRejectedValue({});

        const result = await handler.handle(payload, mockIpcClient);

        expect(result).toEqual({
            success: false,
            error: 'An unknown error occurred'
        });
    });

    test('should handle response without error message', async () => {
        const payload: GetFileContentRequestPayload = {
            filePath: '/test/file.ts'
        };

        const mockResponse: FileContentResponsePayload = {
            success: false,
            data: null,
            error: null,
            filePath: '/test/file.ts',
            filterType: 'not_applicable' as any
        };

        mockIpcClient.getFileContent.mockResolvedValue(mockResponse);

        const result = await handler.handle(payload, mockIpcClient);

        expect(result).toEqual({
            success: false,
            error: 'Failed to get file content from VSCE.'
        });
    });
});