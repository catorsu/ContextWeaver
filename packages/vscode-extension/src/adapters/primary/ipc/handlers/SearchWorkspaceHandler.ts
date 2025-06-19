/**
 * @file SearchWorkspaceHandler.ts
 * @description Handler for search_workspace IPC command requests.
 * @module ContextWeaver/VSCE
 */

import * as vscode from 'vscode';
import { Logger } from '@contextweaver/shared';

import { ICommandHandler } from '../ICommandHandler';
import { ClientContext } from '../types';
import { SearchService } from '../../../../searchService';
import { WorkspaceServiceError } from '../../../../workspaceService';
import {
    SearchWorkspaceRequestPayload,
    SearchWorkspaceResponsePayload as CWSearchWorkspaceResponsePayload
} from '@contextweaver/shared';

/**
 * Handler for processing search_workspace command requests.
 * Searches the workspace for the specified query and returns matching results.
 */
export class SearchWorkspaceHandler implements ICommandHandler<SearchWorkspaceRequestPayload, CWSearchWorkspaceResponsePayload> {
    private readonly logger = new Logger('SearchWorkspaceHandler');

    constructor(
        private readonly searchService: SearchService,
        private readonly windowId: string
    ) {}

    /**
     * Handles a search_workspace request by performing the search operation.
     */
    async handle(request: { payload: SearchWorkspaceRequestPayload; client: ClientContext }): Promise<CWSearchWorkspaceResponsePayload> {
        const { payload, client } = request;
        const { query, workspaceFolderUri } = payload;

        if (!query || typeof query !== 'string') {
            throw new Error('Missing or invalid query in payload.');
        }

        this.logger.debug(`Processing search_workspace in workspace: ${workspaceFolderUri || 'all'}`);

        try {
            const results = await this.searchService.search(
                query, 
                workspaceFolderUri ? vscode.Uri.parse(workspaceFolderUri) : undefined
            );

            // Add windowId to each result
            const resultsWithWindowId = results.map((result) => ({
                ...result,
                windowId: this.windowId
            }));

            const responsePayload: CWSearchWorkspaceResponsePayload = {
                success: true,
                data: {
                    results: resultsWithWindowId,
                    windowId: this.windowId
                },
                error: null,
                errorCode: undefined,
                query: query
            };

            this.logger.debug(`Generated search results (${results.length} items) for ${client.ip}`);
            return responsePayload;

        } catch (error) {
            this.logger.error(`Error searching workspace: ${error instanceof Error ? error.message : String(error)}`);
            const _errorCode = error instanceof WorkspaceServiceError ? error.code : 'SEARCH_ERROR';
            throw new Error(`Error searching workspace: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}