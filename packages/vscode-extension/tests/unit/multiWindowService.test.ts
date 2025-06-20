/**
 * @file multiWindowService.test.ts
 * @description Unit tests for MultiWindowService
 */

// Mock vscode module before importing
jest.mock('vscode', () => ({
    window: {
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn()
    }
}), { virtual: true });

// Mock dependencies
jest.mock('../../src/core/services/AggregationService');
jest.mock('../../src/adapters/primary/ipc/aggregation/AggregationStrategyFactory');

import { MultiWindowService } from '../../src/core/services/MultiWindowService';
import { AggregationService } from '../../src/core/services/AggregationService';
import { AggregationStrategyFactory } from '../../src/adapters/primary/ipc/aggregation/AggregationStrategyFactory';

describe('MultiWindowService', () => {
    let multiWindowService: MultiWindowService;
    let mockAggregationService: jest.Mocked<AggregationService>;
    let mockStrategyFactory: jest.Mocked<AggregationStrategyFactory>;
    const mockWindowId = 'test-window-id';

    beforeEach(() => {
        mockStrategyFactory = new AggregationStrategyFactory('test-window-id') as jest.Mocked<AggregationStrategyFactory>;
        mockAggregationService = new AggregationService('test-window-id', mockStrategyFactory) as jest.Mocked<AggregationService>;
        multiWindowService = new MultiWindowService(mockAggregationService, mockWindowId);
    });

    describe('initialization', () => {
        it('should initialize with isPrimary false', () => {
            expect(multiWindowService.getIsPrimary()).toBe(false);
        });

        it('should initialize with empty secondary clients', () => {
            expect(multiWindowService.getSecondaryClients().size).toBe(0);
        });
    });

    describe('secondary client management', () => {
        it('should handle registering secondary clients', () => {
            const mockClient: { windowId?: string; ws: any } = { ws: {} as any };
            const payload = { windowId: 'secondary-1', port: 30002 };

            multiWindowService.handleRegisterSecondary(mockClient, payload);

            expect(mockClient.windowId).toBe('secondary-1');
            expect(multiWindowService.getSecondaryClients().has('secondary-1')).toBe(true);
        });

        it('should handle unregistering secondary clients', () => {
            const mockClient: { windowId?: string; ws: any } = { ws: {} as any };
            const payload = { windowId: 'secondary-1', port: 30002 };

            // First register
            multiWindowService.handleRegisterSecondary(mockClient, payload);
            expect(multiWindowService.getSecondaryClients().has('secondary-1')).toBe(true);

            // Then unregister
            multiWindowService.handleUnregisterSecondary({ windowId: 'secondary-1' });
            expect(multiWindowService.getSecondaryClients().has('secondary-1')).toBe(false);
        });

        it('should handle removing secondary clients', () => {
            const mockClient: { windowId?: string; ws: any } = { ws: {} as any };
            const payload = { windowId: 'secondary-1', port: 30002 };

            // First register
            multiWindowService.handleRegisterSecondary(mockClient, payload);
            expect(multiWindowService.getSecondaryClients().has('secondary-1')).toBe(true);

            // Then remove
            multiWindowService.removeSecondaryClient('secondary-1');
            expect(multiWindowService.getSecondaryClients().has('secondary-1')).toBe(false);
        });
    });

    describe('forwarded response handling', () => {
        it('should handle forwarded responses', () => {
            const payload = {
                originalMessageId: 'agg-123',
                responsePayload: { result: 'test' },
                secondaryWindowId: 'secondary-1'
            };

            multiWindowService.handleForwardedResponse(payload);

            expect(mockAggregationService.addResponse).toHaveBeenCalledWith(
                'agg-123',
                'secondary-1',
                { result: 'test' }
            );
        });
    });

    describe('stop', () => {
        it('should clear secondary clients on stop', () => {
            const mockClient: { windowId?: string; ws: any } = { ws: {} as any };
            multiWindowService.handleRegisterSecondary(mockClient, { windowId: 'secondary-1', port: 30002 });
            
            expect(multiWindowService.getSecondaryClients().size).toBe(1);
            
            multiWindowService.stop();
            
            expect(multiWindowService.getSecondaryClients().size).toBe(0);
        });
    });
});