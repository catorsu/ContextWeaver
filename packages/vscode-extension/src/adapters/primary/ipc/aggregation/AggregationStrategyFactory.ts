/**
 * @file AggregationStrategyFactory.ts
 * @description Factory for creating appropriate aggregation strategies based on command type.
 * @module ContextWeaver/VSCE
 */

import { Logger } from '@contextweaver/shared';
import { IAggregationStrategy } from '../../../../core/ports/IAggregationStrategy';
import { SearchAggregationStrategy } from './SearchAggregationStrategy';
import { GetContentsForFilesAggregationStrategy } from './GetContentsForFilesAggregationStrategy';
import { GetWorkspaceDetailsAggregationStrategy } from './GetWorkspaceDetailsAggregationStrategy';
import { GetOpenFilesAggregationStrategy } from './GetOpenFilesAggregationStrategy';
import { DefaultAggregationStrategy } from './DefaultAggregationStrategy';

/**
 * Factory for creating aggregation strategies based on command type.
 * Each command type may require different aggregation logic.
 */
export class AggregationStrategyFactory {
    private readonly logger = new Logger('AggregationStrategyFactory');
    private readonly windowId: string;

    constructor(windowId: string) {
        this.windowId = windowId;
    }

    /**
     * Creates the appropriate aggregation strategy for the given command.
     * @param command - The IPC command name
     * @returns The appropriate aggregation strategy instance
     */
    createStrategy(command: string): IAggregationStrategy {
        this.logger.debug(`Creating aggregation strategy for command: ${command}`);

        switch (command) {
            case 'search_workspace':
                return new SearchAggregationStrategy(this.windowId);

            case 'get_contents_for_files':
                return new GetContentsForFilesAggregationStrategy();

            case 'get_workspace_details':
                return new GetWorkspaceDetailsAggregationStrategy(this.windowId);

            case 'get_open_files':
                return new GetOpenFilesAggregationStrategy();

            default:
                this.logger.debug(`Using default aggregation strategy for command: ${command}`);
                return new DefaultAggregationStrategy(this.windowId);
        }
    }
}