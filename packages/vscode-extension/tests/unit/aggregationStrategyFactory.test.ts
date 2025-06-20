/**
 * @file aggregationStrategyFactory.test.ts
 * @description Unit tests for AggregationStrategyFactory implementation.
 * @module ContextWeaver/VSCE/Tests
 */

import { AggregationStrategyFactory } from '../../src/adapters/primary/ipc/aggregation/AggregationStrategyFactory';
import { SearchAggregationStrategy } from '../../src/adapters/primary/ipc/aggregation/SearchAggregationStrategy';
import { GetContentsForFilesAggregationStrategy } from '../../src/adapters/primary/ipc/aggregation/GetContentsForFilesAggregationStrategy';
import { GetWorkspaceDetailsAggregationStrategy } from '../../src/adapters/primary/ipc/aggregation/GetWorkspaceDetailsAggregationStrategy';
import { GetOpenFilesAggregationStrategy } from '../../src/adapters/primary/ipc/aggregation/GetOpenFilesAggregationStrategy';
import { DefaultAggregationStrategy } from '../../src/adapters/primary/ipc/aggregation/DefaultAggregationStrategy';

describe('AggregationStrategyFactory', () => {
    let factory: AggregationStrategyFactory;
    const windowId = 'test-window-id';

    beforeEach(() => {
        factory = new AggregationStrategyFactory(windowId);
    });

    describe('createStrategy', () => {
        it('should return SearchAggregationStrategy for search_workspace command', () => {
            const strategy = factory.createStrategy('search_workspace');
            expect(strategy).toBeInstanceOf(SearchAggregationStrategy);
        });

        it('should return GetContentsForFilesAggregationStrategy for get_contents_for_files command', () => {
            const strategy = factory.createStrategy('get_contents_for_files');
            expect(strategy).toBeInstanceOf(GetContentsForFilesAggregationStrategy);
        });

        it('should return GetWorkspaceDetailsAggregationStrategy for get_workspace_details command', () => {
            const strategy = factory.createStrategy('get_workspace_details');
            expect(strategy).toBeInstanceOf(GetWorkspaceDetailsAggregationStrategy);
        });

        it('should return DefaultAggregationStrategy for get_file_tree command', () => {
            const strategy = factory.createStrategy('get_file_tree');
            expect(strategy).toBeInstanceOf(DefaultAggregationStrategy);
        });

        it('should return DefaultAggregationStrategy for get_active_file_info command', () => {
            const strategy = factory.createStrategy('get_active_file_info');
            expect(strategy).toBeInstanceOf(DefaultAggregationStrategy);
        });

        it('should return DefaultAggregationStrategy for get_file_content command', () => {
            const strategy = factory.createStrategy('get_file_content');
            expect(strategy).toBeInstanceOf(DefaultAggregationStrategy);
        });

        it('should return DefaultAggregationStrategy for get_folder_content command', () => {
            const strategy = factory.createStrategy('get_folder_content');
            expect(strategy).toBeInstanceOf(DefaultAggregationStrategy);
        });

        it('should return GetOpenFilesAggregationStrategy for get_open_files command', () => {
            const strategy = factory.createStrategy('get_open_files');
            expect(strategy).toBeInstanceOf(GetOpenFilesAggregationStrategy);
        });

        it('should return DefaultAggregationStrategy for get_workspace_problems command', () => {
            const strategy = factory.createStrategy('get_workspace_problems');
            expect(strategy).toBeInstanceOf(DefaultAggregationStrategy);
        });

        it('should return DefaultAggregationStrategy for list_folder_contents command', () => {
            const strategy = factory.createStrategy('list_folder_contents');
            expect(strategy).toBeInstanceOf(DefaultAggregationStrategy);
        });

        it('should return DefaultAggregationStrategy for get_filter_info command', () => {
            const strategy = factory.createStrategy('get_filter_info');
            expect(strategy).toBeInstanceOf(DefaultAggregationStrategy);
        });

        it('should return DefaultAggregationStrategy for get_entire_codebase command', () => {
            const strategy = factory.createStrategy('get_entire_codebase');
            expect(strategy).toBeInstanceOf(DefaultAggregationStrategy);
        });

        it('should return DefaultAggregationStrategy for unknown commands', () => {
            const strategy = factory.createStrategy('unknown_command');
            expect(strategy).toBeInstanceOf(DefaultAggregationStrategy);
        });

        it('should return DefaultAggregationStrategy for empty command', () => {
            const strategy = factory.createStrategy('');
            expect(strategy).toBeInstanceOf(DefaultAggregationStrategy);
        });

        it('should create multiple instances of the same strategy type', () => {
            const strategy1 = factory.createStrategy('search_workspace');
            const strategy2 = factory.createStrategy('search_workspace');
            
            expect(strategy1).toBeInstanceOf(SearchAggregationStrategy);
            expect(strategy2).toBeInstanceOf(SearchAggregationStrategy);
            expect(strategy1).not.toBe(strategy2); // Different instances
        });

        it('should pass windowId to DefaultAggregationStrategy', () => {
            const strategy = factory.createStrategy('unknown_command') as DefaultAggregationStrategy;
            expect(strategy).toBeInstanceOf(DefaultAggregationStrategy);
            // Test that the strategy uses the correct windowId by checking its behavior
            const responses = [
                { windowId: 'other-window', payload: { success: true, data: 'other' } },
                { windowId: windowId, payload: { success: true, data: 'primary' } }
            ];
            const result = strategy.aggregate(responses);
            expect(result).toEqual({ success: true, data: 'primary' });
        });
    });
});