/**
 * @file searchAggregationStrategy.test.ts
 * @description Unit tests for SearchAggregationStrategy implementation.
 * @module ContextWeaver/VSCE/Tests
 */

import { SearchAggregationStrategy } from '../../src/adapters/primary/ipc/aggregation/SearchAggregationStrategy';
import { AggregationResponse } from '../../src/core/entities/Aggregation';

describe('SearchAggregationStrategy', () => {
    let strategy: SearchAggregationStrategy;
    const windowId = 'primary-window';

    beforeEach(() => {
        strategy = new SearchAggregationStrategy(windowId);
    });

    describe('aggregate', () => {
        it('should combine results from multiple responses', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: true,
                        data: {
                            results: [
                                {
                                    path: '/workspace1/file1.js',
                                    name: 'file1.js',
                                    type: 'file',
                                    uri: 'file:///workspace1/file1.js',
                                    content_source_id: 'file:///workspace1/file1.js',
                                    workspaceFolderUri: 'file:///workspace1',
                                    workspaceFolderName: 'Workspace1',
                                    relativePath: 'file1.js',
                                    windowId: 'primary-window'
                                }
                            ]
                        }
                    }
                },
                {
                    windowId: 'secondary-window',
                    payload: {
                        success: true,
                        data: {
                            results: [
                                {
                                    path: '/workspace2/file2.js',
                                    name: 'file2.js',
                                    type: 'file',
                                    uri: 'file:///workspace2/file2.js',
                                    content_source_id: 'file:///workspace2/file2.js',
                                    workspaceFolderUri: 'file:///workspace2',
                                    workspaceFolderName: 'Workspace2',
                                    relativePath: 'file2.js',
                                    windowId: 'secondary-window'
                                }
                            ]
                        }
                    }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true,
                data: {
                    results: [
                        {
                            path: '/workspace1/file1.js',
                            name: 'file1.js',
                            type: 'file',
                            uri: 'file:///workspace1/file1.js',
                            content_source_id: 'file:///workspace1/file1.js',
                            workspaceFolderUri: 'file:///workspace1',
                            workspaceFolderName: 'Workspace1',
                            relativePath: 'file1.js',
                            windowId: 'primary-window'
                        },
                        {
                            path: '/workspace2/file2.js',
                            name: 'file2.js',
                            type: 'file',
                            uri: 'file:///workspace2/file2.js',
                            content_source_id: 'file:///workspace2/file2.js',
                            workspaceFolderUri: 'file:///workspace2',
                            workspaceFolderName: 'Workspace2',
                            relativePath: 'file2.js',
                            windowId: 'secondary-window'
                        }
                    ],
                    windowId: 'primary-window',
                    errors: undefined
                },
                error: null
            });
        });

        it('should handle empty results arrays', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: true,
                        data: {
                            results: []
                        }
                    }
                },
                {
                    windowId: 'secondary-window',
                    payload: {
                        success: true,
                        data: {
                            results: []
                        }
                    }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true,
                data: {
                    results: [],
                    windowId: 'primary-window',
                    errors: undefined
                },
                error: null
            });
        });

        it('should handle single response', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: true,
                        data: {
                            results: [
                                {
                                    path: '/workspace/file.js',
                                    name: 'file.js',
                                    type: 'file',
                                    uri: 'file:///workspace/file.js',
                                    content_source_id: 'file:///workspace/file.js',
                                    workspaceFolderUri: 'file:///workspace',
                                    workspaceFolderName: 'Workspace',
                                    relativePath: 'file.js',
                                    windowId: 'primary-window'
                                }
                            ]
                        }
                    }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true,
                data: {
                    results: [
                        {
                            path: '/workspace/file.js',
                            name: 'file.js',
                            type: 'file',
                            uri: 'file:///workspace/file.js',
                            content_source_id: 'file:///workspace/file.js',
                            workspaceFolderUri: 'file:///workspace',
                            workspaceFolderName: 'Workspace',
                            relativePath: 'file.js',
                            windowId: 'primary-window'
                        }
                    ],
                    windowId: 'primary-window',
                    errors: undefined
                },
                error: null
            });
        });

        it('should handle responses with errors', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: false,
                        error: 'Search failed in workspace1',
                        errorCode: 'SEARCH_ERROR'
                    }
                },
                {
                    windowId: 'secondary-window',
                    payload: {
                        success: false,
                        error: 'Search failed in workspace2',
                        errorCode: 'SEARCH_ERROR'
                    }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: false,
                data: {
                    results: [],
                    errors: [
                        { windowId: 'primary-window', error: 'Search failed in workspace1', errorCode: 'SEARCH_ERROR' },
                        { windowId: 'secondary-window', error: 'Search failed in workspace2', errorCode: 'SEARCH_ERROR' }
                    ],
                    windowId: 'primary-window'
                },
                error: null
            });
        });
    });
});