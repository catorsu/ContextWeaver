/**
 * @file defaultAggregationStrategy.test.ts
 * @description Unit tests for DefaultAggregationStrategy implementation.
 * @module ContextWeaver/VSCE/Tests
 */

import { DefaultAggregationStrategy } from '../../src/adapters/primary/ipc/aggregation/DefaultAggregationStrategy';
import { AggregationResponse } from '../../src/core/entities/Aggregation';

describe('DefaultAggregationStrategy', () => {
    let strategy: DefaultAggregationStrategy;
    const primaryWindowId = 'primary-window-id';

    beforeEach(() => {
        strategy = new DefaultAggregationStrategy(primaryWindowId);
    });

    describe('aggregate', () => {
        it('should return primary window response when present', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'secondary-window',
                    payload: { success: true, data: { fileTreeString: 'secondary tree' } }
                },
                {
                    windowId: primaryWindowId,
                    payload: { success: true, data: { fileTreeString: 'primary tree' } }
                },
                {
                    windowId: 'another-secondary',
                    payload: { success: true, data: { fileTreeString: 'another secondary tree' } }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true,
                data: { fileTreeString: 'primary tree' }
            });
        });

        it('should return first response when primary is not found', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'secondary-window-1',
                    payload: { success: true, data: { result: 'first response' } }
                },
                {
                    windowId: 'secondary-window-2',
                    payload: { success: true, data: { result: 'second response' } }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: true,
                data: { result: 'first response' }
            });
        });

        it('should handle single response that is primary', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: primaryWindowId,
                    payload: { 
                        success: true, 
                        data: { 
                            workspaceFolders: [
                                { name: 'Workspace1', uri: 'file:///workspace1' }
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
                        { name: 'Workspace1', uri: 'file:///workspace1' }
                    ],
                    isTrusted: true 
                }
            });
        });

        it('should handle single response that is not primary', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'secondary-window',
                    payload: { success: false, error: 'Operation failed', errorCode: 'OPERATION_FAILED' }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: false,
                error: 'Operation failed',
                errorCode: 'OPERATION_FAILED'
            });
        });

        it('should handle empty responses array', () => {
            const responses: AggregationResponse[] = [];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: false,
                error: 'No responses received',
                errorCode: 'NO_RESPONSES'
            });
        });

        it('should preserve error responses from primary', () => {
            const responses: AggregationResponse[] = [
                {
                    windowId: 'secondary-window',
                    payload: { success: true, data: { result: 'secondary success' } }
                },
                {
                    windowId: primaryWindowId,
                    payload: { success: false, error: 'Primary failed', errorCode: 'PRIMARY_ERROR' }
                }
            ];

            const result = strategy.aggregate(responses);

            expect(result).toEqual({
                success: false,
                error: 'Primary failed',
                errorCode: 'PRIMARY_ERROR'
            });
        });
    });
});