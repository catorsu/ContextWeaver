/**
 * @file getContentsForFilesAggregationStrategy.test.ts
 * @description Unit tests for GetContentsForFilesAggregationStrategy implementation.
 * @module ContextWeaver/VSCE/Tests
 */

import { GetContentsForFilesAggregationStrategy } from '../../src/adapters/primary/ipc/aggregation/GetContentsForFilesAggregationStrategy';
import { AggregationResponse } from '../../src/core/entities/Aggregation';

describe('GetContentsForFilesAggregationStrategy', () => {
    let strategy: GetContentsForFilesAggregationStrategy;

    beforeEach(() => {
        strategy = new GetContentsForFilesAggregationStrategy();
    });

    describe('aggregate', () => {
        it('should combine data and errors from multiple responses', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: true,
                        data: [
                            {
                                fileData: { 
                                    fullPath: '/workspace1/file1.ts', 
                                    content: 'console.log("file1");', 
                                    languageId: 'typescript' 
                                },
                                metadata: { 
                                    unique_block_id: 'test-id-1', 
                                    content_source_id: 'file:///workspace1/file1.ts', 
                                    type: 'file_content', 
                                    label: 'file1.ts',
                                    workspaceFolderUri: 'file:///workspace1',
                                    workspaceFolderName: 'Workspace1',
                                    windowId: 'primary-window'
                                },
                                windowId: 'primary-window'
                            }
                        ],
                        errors: [
                            { uri: 'file:///workspace1/missing.txt', error: 'File not found', errorCode: 'FILE_NOT_FOUND' }
                        ]
                    }
                },
                {
                    windowId: 'secondary-window',
                    payload: {
                        success: true,
                        data: [
                            {
                                fileData: { 
                                    fullPath: '/workspace2/file2.js', 
                                    content: 'console.log("file2");', 
                                    languageId: 'javascript' 
                                },
                                metadata: { 
                                    unique_block_id: 'test-id-2', 
                                    content_source_id: 'file:///workspace2/file2.js', 
                                    type: 'file_content', 
                                    label: 'file2.js',
                                    workspaceFolderUri: 'file:///workspace2',
                                    workspaceFolderName: 'Workspace2',
                                    windowId: 'secondary-window'
                                },
                                windowId: 'secondary-window'
                            }
                        ],
                        errors: [
                            { uri: 'file:///workspace2/error.txt', error: 'Access denied', errorCode: 'ACCESS_DENIED' }
                        ]
                    }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true,
                data: [
                    {
                        fileData: { 
                            fullPath: '/workspace1/file1.ts', 
                            content: 'console.log("file1");', 
                            languageId: 'typescript' 
                        },
                        metadata: { 
                            unique_block_id: 'test-id-1', 
                            content_source_id: 'file:///workspace1/file1.ts', 
                            type: 'file_content', 
                            label: 'file1.ts',
                            workspaceFolderUri: 'file:///workspace1',
                            workspaceFolderName: 'Workspace1',
                            windowId: 'primary-window'
                        },
                        windowId: 'primary-window'
                    },
                    {
                        fileData: { 
                            fullPath: '/workspace2/file2.js', 
                            content: 'console.log("file2");', 
                            languageId: 'javascript' 
                        },
                        metadata: { 
                            unique_block_id: 'test-id-2', 
                            content_source_id: 'file:///workspace2/file2.js', 
                            type: 'file_content', 
                            label: 'file2.js',
                            workspaceFolderUri: 'file:///workspace2',
                            workspaceFolderName: 'Workspace2',
                            windowId: 'secondary-window'
                        },
                        windowId: 'secondary-window'
                    }
                ],
                errors: [
                    { uri: 'file:///workspace1/missing.txt', error: 'File not found', errorCode: 'FILE_NOT_FOUND' },
                    { uri: 'file:///workspace2/error.txt', error: 'Access denied', errorCode: 'ACCESS_DENIED' }
                ],
                error: null
            });
        });

        it('should handle empty data and errors', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: true,
                        data: [],
                        errors: []
                    }
                },
                {
                    windowId: 'secondary-window',
                    payload: {
                        success: true,
                        data: [],
                        errors: []
                    }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true,
                data: [],
                errors: [],
                error: null
            });
        });

        it('should handle single response', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: true,
                        data: [
                            {
                                fileData: { 
                                    fullPath: '/workspace/file.ts', 
                                    content: 'export default {};', 
                                    languageId: 'typescript' 
                                },
                                metadata: { 
                                    unique_block_id: 'test-id', 
                                    content_source_id: 'file:///workspace/file.ts', 
                                    type: 'file_content', 
                                    label: 'file.ts',
                                    workspaceFolderUri: 'file:///workspace',
                                    workspaceFolderName: 'Workspace',
                                    windowId: 'primary-window'
                                },
                                windowId: 'primary-window'
                            }
                        ],
                        errors: []
                    }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true,
                data: [
                    {
                        fileData: { 
                            fullPath: '/workspace/file.ts', 
                            content: 'export default {};', 
                            languageId: 'typescript' 
                        },
                        metadata: { 
                            unique_block_id: 'test-id', 
                            content_source_id: 'file:///workspace/file.ts', 
                            type: 'file_content', 
                            label: 'file.ts',
                            workspaceFolderUri: 'file:///workspace',
                            workspaceFolderName: 'Workspace',
                            windowId: 'primary-window'
                        },
                        windowId: 'primary-window'
                    }
                ],
                errors: [],
                error: null
            });
        });

        it('should handle responses with only errors', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: false,
                        data: [],
                        errors: [
                            { uri: 'file:///workspace1/error1.txt', error: 'Read error', errorCode: 'READ_ERROR' },
                            { uri: 'file:///workspace1/error2.txt', error: 'Not found', errorCode: 'FILE_NOT_FOUND' }
                        ]
                    }
                },
                {
                    windowId: 'secondary-window',
                    payload: {
                        success: false,
                        data: [],
                        errors: [
                            { uri: 'file:///workspace2/error3.txt', error: 'Permission denied', errorCode: 'ACCESS_DENIED' }
                        ]
                    }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true, // Aggregation itself succeeds even if individual responses failed
                data: [],
                errors: [
                    { uri: 'file:///workspace1/error1.txt', error: 'Read error', errorCode: 'READ_ERROR' },
                    { uri: 'file:///workspace1/error2.txt', error: 'Not found', errorCode: 'FILE_NOT_FOUND' },
                    { uri: 'file:///workspace2/error3.txt', error: 'Permission denied', errorCode: 'ACCESS_DENIED' }
                ],
                error: null
            });
        });
    });
});