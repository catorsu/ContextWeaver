/**
 * @file getOpenFilesAggregationStrategy.test.ts
 * @description Unit tests for GetOpenFilesAggregationStrategy implementation.
 * @module ContextWeaver/VSCE/Tests
 */

import { GetOpenFilesAggregationStrategy } from '../../src/adapters/primary/ipc/aggregation/GetOpenFilesAggregationStrategy';
import { AggregationResponse } from '../../src/core/entities/Aggregation';

describe('GetOpenFilesAggregationStrategy', () => {
    let strategy: GetOpenFilesAggregationStrategy;

    beforeEach(() => {
        strategy = new GetOpenFilesAggregationStrategy();
    });

    describe('aggregate', () => {
        it('should combine open files from multiple responses', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: true,
                        data: {
                            openFiles: [
                                {
                                    path: '/workspace1/file1.ts',
                                    name: 'file1.ts',
                                    workspaceFolderUri: 'file:///workspace1',
                                    workspaceFolderName: 'Workspace1',
                                    windowId: 'primary-window'
                                },
                                {
                                    path: '/workspace1/file2.js',
                                    name: 'file2.js',
                                    workspaceFolderUri: 'file:///workspace1',
                                    workspaceFolderName: 'Workspace1',
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
                            openFiles: [
                                {
                                    path: '/workspace2/file3.py',
                                    name: 'file3.py',
                                    workspaceFolderUri: 'file:///workspace2',
                                    workspaceFolderName: 'Workspace2',
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
                    openFiles: [
                        {
                            path: '/workspace1/file1.ts',
                            name: 'file1.ts',
                            workspaceFolderUri: 'file:///workspace1',
                            workspaceFolderName: 'Workspace1',
                            windowId: 'primary-window'
                        },
                        {
                            path: '/workspace1/file2.js',
                            name: 'file2.js',
                            workspaceFolderUri: 'file:///workspace1',
                            workspaceFolderName: 'Workspace1',
                            windowId: 'primary-window'
                        },
                        {
                            path: '/workspace2/file3.py',
                            name: 'file3.py',
                            workspaceFolderUri: 'file:///workspace2',
                            workspaceFolderName: 'Workspace2',
                            windowId: 'secondary-window'
                        }
                    ]
                },
                error: null
            });
        });

        it('should handle empty open files arrays', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: true,
                        data: {
                            openFiles: []
                        }
                    }
                },
                {
                    windowId: 'secondary-window',
                    payload: {
                        success: true,
                        data: {
                            openFiles: []
                        }
                    }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true,
                data: {
                    openFiles: []
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
                            openFiles: [
                                {
                                    path: '/workspace/app.ts',
                                    name: 'app.ts',
                                    workspaceFolderUri: 'file:///workspace',
                                    workspaceFolderName: 'MyWorkspace',
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
                    openFiles: [
                        {
                            path: '/workspace/app.ts',
                            name: 'app.ts',
                            workspaceFolderUri: 'file:///workspace',
                            workspaceFolderName: 'MyWorkspace',
                            windowId: 'primary-window'
                        }
                    ]
                },
                error: null
            });
        });

        it('should handle responses without openFiles data', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: true,
                        data: {}
                    }
                },
                {
                    windowId: 'secondary-window',
                    payload: {
                        success: false,
                        error: 'Could not get open files',
                        errorCode: 'GET_OPEN_FILES_ERROR'
                    }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true,
                data: {
                    openFiles: []
                },
                error: null
            });
        });

        it('should handle files from workspaces without folder context', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: true,
                        data: {
                            openFiles: [
                                {
                                    path: '/home/user/standalone.js',
                                    name: 'standalone.js',
                                    workspaceFolderUri: null,
                                    workspaceFolderName: null,
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
                    openFiles: [
                        {
                            path: '/home/user/standalone.js',
                            name: 'standalone.js',
                            workspaceFolderUri: null,
                            workspaceFolderName: null,
                            windowId: 'primary-window'
                        }
                    ]
                },
                error: null
            });
        });
    });
});