/**
 * @file aggregationService.test.ts
 * @description Unit tests for the AggregationService class.
 * @module ContextWeaver/VSCE/Tests
 */

import { AggregationService } from '../../src/core/services/AggregationService';
import { AggregationStrategyFactory } from '../../src/adapters/primary/ipc/aggregation/AggregationStrategyFactory';
import { IAggregationStrategy } from '../../src/core/ports/IAggregationStrategy';
import WebSocket from 'ws';

// Mock WebSocket
jest.mock('ws');

// Mock uuid
jest.mock('uuid', () => ({
    v4: jest.fn(() => 'mock-uuid-1234')
}));

// Mock the Logger
jest.mock('@contextweaver/shared', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn()
    })),
    extractErrorInfo: jest.fn((error) => ({ message: error.message || 'Unknown error' }))
}));

describe('AggregationService', () => {
    let aggregationService: AggregationService;
    let mockStrategyFactory: jest.Mocked<AggregationStrategyFactory>;
    let mockWebSocket: jest.Mocked<WebSocket>;
    let mockStrategy: jest.Mocked<IAggregationStrategy>;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Create mock strategy
        mockStrategy = {
            aggregate: jest.fn().mockReturnValue({ aggregatedData: 'test' })
        };

        // Create mock strategy factory
        mockStrategyFactory = {
            createStrategy: jest.fn().mockReturnValue(mockStrategy)
        } as any;

        // Create mock WebSocket
        mockWebSocket = {
            readyState: WebSocket.OPEN,
            send: jest.fn()
        } as any;

        aggregationService = new AggregationService('test-window-123', mockStrategyFactory);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('startAggregation', () => {
        it('should start a new aggregation session', () => {
            const aggregationId = 'agg-123';
            const messageId = 'msg-123';
            const command = 'test_command';

            aggregationService.startAggregation(
                aggregationId,
                mockWebSocket,
                3,
                messageId,
                command
            );

            // Check that the session was created
            expect(aggregationService.isMessagePartOfAggregation(messageId)).toBe(true);
        });

        it('should set a timeout for aggregation completion', () => {
            const aggregationId = 'agg-123';
            const messageId = 'msg-123';
            const command = 'test_command';

            aggregationService.startAggregation(
                aggregationId,
                mockWebSocket,
                3,
                messageId,
                command
            );

            // Fast-forward time to trigger timeout
            jest.advanceTimersByTime(5000);

            // Verify that strategy was called and message was sent
            expect(mockStrategyFactory.createStrategy).toHaveBeenCalledWith(command);
            expect(mockStrategy.aggregate).toHaveBeenCalled();
            expect(mockWebSocket.send).toHaveBeenCalled();
        });
    });

    describe('addResponse', () => {
        it('should add a response to an existing aggregation', () => {
            const aggregationId = 'agg-123';
            const messageId = 'msg-123';
            const command = 'test_command';

            aggregationService.startAggregation(
                aggregationId,
                mockWebSocket,
                2,
                messageId,
                command
            );

            aggregationService.addResponse(aggregationId, 'window-456', { data: 'response1' });

            // Should not complete yet (expecting 2 responses)
            expect(mockWebSocket.send).not.toHaveBeenCalled();
        });

        it('should complete aggregation when all responses are received', () => {
            const aggregationId = 'agg-123';
            const messageId = 'msg-123';
            const command = 'test_command';

            aggregationService.startAggregation(
                aggregationId,
                mockWebSocket,
                2,
                messageId,
                command
            );

            aggregationService.addResponse(aggregationId, 'window-456', { data: 'response1' });
            aggregationService.addResponse(aggregationId, 'window-789', { data: 'response2' });

            // Should complete now
            expect(mockStrategyFactory.createStrategy).toHaveBeenCalledWith(command);
            expect(mockStrategy.aggregate).toHaveBeenCalledWith([
                { windowId: 'window-456', payload: { data: 'response1' } },
                { windowId: 'window-789', payload: { data: 'response2' } }
            ]);
            expect(mockWebSocket.send).toHaveBeenCalled();
        });

        it('should handle response for non-existent aggregation', () => {
            aggregationService.addResponse('non-existent', 'window-456', { data: 'response' });

            // Should not throw, just log warning
            expect(mockWebSocket.send).not.toHaveBeenCalled();
        });
    });

    describe('addPrimaryResponse', () => {
        it('should add primary response to aggregation', () => {
            const aggregationId = 'agg-123';
            const messageId = 'msg-123';
            const command = 'test_command';

            aggregationService.startAggregation(
                aggregationId,
                mockWebSocket,
                2,
                messageId,
                command
            );

            const handled = aggregationService.addPrimaryResponse(
                messageId,
                'primary-window',
                { data: 'primary-response' }
            );

            expect(handled).toBe(true);
            // Should not complete yet (expecting 2 responses)
            expect(mockWebSocket.send).not.toHaveBeenCalled();
        });

        it('should complete aggregation when primary response is the last', () => {
            const aggregationId = 'agg-123';
            const messageId = 'msg-123';
            const command = 'test_command';

            aggregationService.startAggregation(
                aggregationId,
                mockWebSocket,
                2,
                messageId,
                command
            );

            aggregationService.addResponse(aggregationId, 'window-456', { data: 'response1' });
            aggregationService.addPrimaryResponse(messageId, 'primary-window', { data: 'primary-response' });

            // Should complete now
            expect(mockStrategy.aggregate).toHaveBeenCalled();
            expect(mockWebSocket.send).toHaveBeenCalled();
        });

        it('should return false for non-aggregated message', () => {
            const handled = aggregationService.addPrimaryResponse(
                'non-existent-msg',
                'primary-window',
                { data: 'response' }
            );

            expect(handled).toBe(false);
        });

        it('should handle already completed aggregation', () => {
            const aggregationId = 'agg-123';
            const messageId = 'msg-123';
            const command = 'test_command';

            aggregationService.startAggregation(
                aggregationId,
                mockWebSocket,
                1,
                messageId,
                command
            );

            // Complete the aggregation
            aggregationService.addResponse(aggregationId, 'window-456', { data: 'response1' });

            // Try to add primary response after completion
            const handled = aggregationService.addPrimaryResponse(
                messageId,
                'primary-window',
                { data: 'late-response' }
            );

            expect(handled).toBe(true);
            // Should only send once
            expect(mockWebSocket.send).toHaveBeenCalledTimes(1);
        });
    });

    describe('isMessagePartOfAggregation', () => {
        it('should return true for aggregated message', () => {
            const aggregationId = 'agg-123';
            const messageId = 'msg-123';
            const command = 'test_command';

            aggregationService.startAggregation(
                aggregationId,
                mockWebSocket,
                2,
                messageId,
                command
            );

            expect(aggregationService.isMessagePartOfAggregation(messageId)).toBe(true);
        });

        it('should return false for non-aggregated message', () => {
            expect(aggregationService.isMessagePartOfAggregation('unknown-msg')).toBe(false);
        });
    });

    describe('WebSocket error handling', () => {
        it('should handle closed WebSocket', () => {
            const aggregationId = 'agg-123';
            const messageId = 'msg-123';
            const command = 'test_command';

            (mockWebSocket as any).readyState = WebSocket.CLOSED;

            aggregationService.startAggregation(
                aggregationId,
                mockWebSocket,
                1,
                messageId,
                command
            );

            aggregationService.addResponse(aggregationId, 'window-456', { data: 'response' });

            // Should attempt to send but not throw
            expect(mockWebSocket.send).not.toHaveBeenCalled();
        });

        it('should handle WebSocket send errors', () => {
            const aggregationId = 'agg-123';
            const messageId = 'msg-123';
            const command = 'test_command';

            mockWebSocket.send.mockImplementation(() => {
                throw new Error('WebSocket error');
            });

            aggregationService.startAggregation(
                aggregationId,
                mockWebSocket,
                1,
                messageId,
                command
            );

            // Should not throw when completing aggregation
            expect(() => {
                aggregationService.addResponse(aggregationId, 'window-456', { data: 'response' });
            }).not.toThrow();
        });
    });

    describe('cleanup after completion', () => {
        it('should clean up aggregation data after delay', () => {
            const aggregationId = 'agg-123';
            const messageId = 'msg-123';
            const command = 'test_command';

            aggregationService.startAggregation(
                aggregationId,
                mockWebSocket,
                1,
                messageId,
                command
            );

            aggregationService.addResponse(aggregationId, 'window-456', { data: 'response' });

            // Should still be tracked immediately after completion
            expect(aggregationService.isMessagePartOfAggregation(messageId)).toBe(true);

            // Fast-forward past cleanup timeout
            jest.advanceTimersByTime(2001);

            // Should be cleaned up
            expect(aggregationService.isMessagePartOfAggregation(messageId)).toBe(false);
        });
    });

    describe('message formatting', () => {
        it('should format response message correctly', () => {
            const aggregationId = 'agg-123';
            const messageId = 'msg-123';
            const command = 'test_command';

            mockStrategy.aggregate.mockReturnValue({ combined: 'result' });

            aggregationService.startAggregation(
                aggregationId,
                mockWebSocket,
                1,
                messageId,
                command
            );

            aggregationService.addResponse(aggregationId, 'window-456', { data: 'response' });

            const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[0][0] as string);

            expect(sentMessage).toMatchObject({
                protocol_version: '1.0',
                message_id: messageId,
                type: 'response',
                command: 'response_test_command',
                payload: { combined: 'result' }
            });
        });
    });
});