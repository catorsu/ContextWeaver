/**
 * @file getWorkspaceDetailsAggregationStrategy.test.ts
 * @description Unit tests for GetWorkspaceDetailsAggregationStrategy implementation.
 * @module ContextWeaver/VSCE/Tests
 */

import { GetWorkspaceDetailsAggregationStrategy } from '../../src/adapters/primary/ipc/aggregation/GetWorkspaceDetailsAggregationStrategy';
import { AggregationResponse } from '../../src/core/entities/Aggregation';

describe('GetWorkspaceDetailsAggregationStrategy', () => {
    let strategy: GetWorkspaceDetailsAggregationStrategy;
    const windowId = 'primary-window';

    beforeEach(() => {
        strategy = new GetWorkspaceDetailsAggregationStrategy(windowId);
    });

    describe('aggregate', () => {
        it('should combine workspace folders from multiple responses', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: true,
                        data: {
                            workspaceFolders: [
                                { name: 'Workspace1', uri: 'file:///workspace1' }
                            ],
                            isTrusted: true
                        }
                    }
                },
                {
                    windowId: 'secondary-window',
                    payload: {
                        success: true,
                        data: {
                            workspaceFolders: [
                                { name: 'Workspace2', uri: 'file:///workspace2' },
                                { name: 'Workspace3', uri: 'file:///workspace3' }
                            ],
                            isTrusted: true
                        }
                    }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true,
                data: {
                    workspaceFolders: [
                        { name: 'Workspace1', uri: 'file:///workspace1' },
                        { name: 'Workspace2', uri: 'file:///workspace2' },
                        { name: 'Workspace3', uri: 'file:///workspace3' }
                    ],
                    isTrusted: true,
                    workspaceName: undefined
                },
                error: null
            });
        });

        it('should handle mixed trust levels - all must be trusted for overall trust', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: true,
                        data: {
                            workspaceFolders: [
                                { name: 'TrustedWorkspace', uri: 'file:///trusted' }
                            ],
                            isTrusted: true
                        }
                    }
                },
                {
                    windowId: 'secondary-window',
                    payload: {
                        success: true,
                        data: {
                            workspaceFolders: [
                                { name: 'UntrustedWorkspace', uri: 'file:///untrusted' }
                            ],
                            isTrusted: false
                        }
                    }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true,
                data: {
                    workspaceFolders: [
                        { name: 'TrustedWorkspace', uri: 'file:///trusted' },
                        { name: 'UntrustedWorkspace', uri: 'file:///untrusted' }
                    ],
                    isTrusted: false,
                    workspaceName: undefined
                },
                error: null
            });
        });

        it('should maintain trust when all workspaces are trusted', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: true,
                        data: {
                            workspaceFolders: [
                                { name: 'Workspace1', uri: 'file:///workspace1' }
                            ],
                            isTrusted: true
                        }
                    }
                },
                {
                    windowId: 'secondary-window',
                    payload: {
                        success: true,
                        data: {
                            workspaceFolders: [
                                { name: 'Workspace2', uri: 'file:///workspace2' }
                            ],
                            isTrusted: true
                        }
                    }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true,
                data: {
                    workspaceFolders: [
                        { name: 'Workspace1', uri: 'file:///workspace1' },
                        { name: 'Workspace2', uri: 'file:///workspace2' }
                    ],
                    isTrusted: true,
                    workspaceName: undefined
                },
                error: null
            });
        });

        it('should handle empty workspace folders', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: true,
                        data: {
                            workspaceFolders: [],
                            isTrusted: true
                        }
                    }
                },
                {
                    windowId: 'secondary-window',
                    payload: {
                        success: true,
                        data: {
                            workspaceFolders: [],
                            isTrusted: true
                        }
                    }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true,
                data: {
                    workspaceFolders: [],
                    isTrusted: true,
                    workspaceName: undefined
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
                            workspaceFolders: [
                                { name: 'SingleWorkspace', uri: 'file:///single' }
                            ],
                            isTrusted: false
                        }
                    }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true,
                data: {
                    workspaceFolders: [
                        { name: 'SingleWorkspace', uri: 'file:///single' }
                    ],
                    isTrusted: false,
                    workspaceName: undefined
                },
                error: null
            });
        });

        it('should handle failed responses gracefully', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: true,
                        data: {
                            workspaceFolders: [
                                { name: 'Workspace1', uri: 'file:///workspace1' }
                            ],
                            isTrusted: true
                        }
                    }
                },
                {
                    windowId: 'secondary-window',
                    payload: {
                        success: false,
                        error: 'Failed to get workspace details',
                        errorCode: 'WORKSPACE_ERROR'
                    }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true,
                data: {
                    workspaceFolders: [
                        { name: 'Workspace1', uri: 'file:///workspace1' }
                    ],
                    isTrusted: true,
                    workspaceName: undefined
                },
                error: null
            });
        });

        it('should handle duplicate workspace folders by unique URI', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'primary-window',
                    payload: {
                        success: true,
                        data: {
                            workspaceFolders: [
                                { name: 'Workspace1', uri: 'file:///workspace1' },
                                { name: 'Workspace2', uri: 'file:///workspace2' }
                            ],
                            isTrusted: true
                        }
                    }
                },
                {
                    windowId: 'secondary-window',
                    payload: {
                        success: true,
                        data: {
                            workspaceFolders: [
                                { name: 'Workspace1-Duplicate', uri: 'file:///workspace1' }, // Same URI, different name
                                { name: 'Workspace3', uri: 'file:///workspace3' }
                            ],
                            isTrusted: true
                        }
                    }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true,
                data: {
                    workspaceFolders: [
                        { name: 'Workspace1', uri: 'file:///workspace1' }, // First occurrence kept
                        { name: 'Workspace2', uri: 'file:///workspace2' },
                        { name: 'Workspace3', uri: 'file:///workspace3' }
                    ],
                    isTrusted: true,
                    workspaceName: undefined
                },
                error: null
            });
        });
    });
});