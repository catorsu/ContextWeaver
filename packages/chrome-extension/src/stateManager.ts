/**
 * @file stateManager.ts
 * @description Manages the state for the ContextWeaver Chrome Extension,
 * including active context blocks, search responses, and UI target elements.
 * @module ContextWeaver/CE
 */

import {
    ContextBlockMetadata,
    SearchWorkspaceResponsePayload
} from '@contextweaver/shared';

const LOG_PREFIX_SM = '[ContextWeaver StateManager]';

/**
 * Manages the state for the ContextWeaver Chrome Extension,
 * including active context blocks, search responses, and UI target elements.
 */
export class StateManager {
    private _activeContextBlocks: ContextBlockMetadata[] = [];
    private _searchResponse: SearchWorkspaceResponsePayload | null = null;
    private _searchQuery: string | null = null;
    private _currentTargetElementForPanel: HTMLElement | null = null;
    private _originalQueryTextFromUI: string | undefined = undefined;

    /**
     * Initializes the StateManager.
     */
    constructor() {
        console.log(LOG_PREFIX_SM, 'StateManager initialized.');
    }

        /**
     * Retrieves a read-only array of currently active context blocks.
     * @returns A read-only array of ContextBlockMetadata objects.
     */
    public getActiveContextBlocks(): Readonly<ContextBlockMetadata[]> {
        return this._activeContextBlocks;
    }

    /**
     * Adds a new context block to the list of active context blocks.
     * @param block The ContextBlockMetadata object to add.
     */
    public addActiveContextBlock(block: ContextBlockMetadata): void {
        // Optional: Could add a check here to prevent adding if unique_block_id already exists,
        // though content_source_id is used for user-facing duplicate prevention.
        this._activeContextBlocks.push(block);
        console.log(LOG_PREFIX_SM, `Added block: ${block.label}. Total: ${this._activeContextBlocks.length}`);
    }

    /**
     * Removes a context block from the list of active context blocks by its unique ID.
     * @param uniqueBlockId The unique identifier of the block to remove.
     */
    public removeActiveContextBlock(uniqueBlockId: string): void {
        const initialLength = this._activeContextBlocks.length;
        this._activeContextBlocks = this._activeContextBlocks.filter(
            (b) => b.unique_block_id !== uniqueBlockId
        );
        if (this._activeContextBlocks.length < initialLength) {
            console.log(LOG_PREFIX_SM, `Removed block ID: ${uniqueBlockId}. Total: ${this._activeContextBlocks.length}`);
        }
    }

    /**
     * Checks if a content source ID already exists in the active context blocks.
     * @param contentSourceId The content source ID to check.
     * @returns True if a block with the given content source ID exists, false otherwise.
     */
    public isDuplicateContentSource(contentSourceId: string): boolean {
        return this._activeContextBlocks.some(block => block.content_source_id === contentSourceId);
    }

    /**
     * Clears all active context blocks.
     */
    public clearActiveContextBlocks(): void {
        this._activeContextBlocks = [];
        console.log(LOG_PREFIX_SM, 'Active context blocks cleared.');
    }

        /**
     * Retrieves the last search response.
     * @returns The last SearchWorkspaceResponsePayload or null if none.
     */
    public getSearchResponse(): Readonly<SearchWorkspaceResponsePayload | null> {
        return this._searchResponse;
    }

    /**
     * Sets the last search response.
     * @param response The SearchWorkspaceResponsePayload to set.
     */
    public setSearchResponse(response: SearchWorkspaceResponsePayload | null): void {
        this._searchResponse = response;
    }

    /**
     * Retrieves the last search query.
     * @returns The last search query string or null if none.
     */
    public getSearchQuery(): string | null {
        return this._searchQuery;
    }

    /**
     * Sets the last search query.
     * @param query The search query string to set.
     */
    public setSearchQuery(query: string | null): void {
        this._searchQuery = query;
    }

        /**
     * Retrieves the currently targeted HTML element for the UI panel.
     * @returns The HTMLElement currently targeted by the UI panel, or null.
     */
    public getCurrentTargetElementForPanel(): HTMLElement | null {
        return this._currentTargetElementForPanel;
    }

    /**
     * Sets the currently targeted HTML element for the UI panel.
     * @param element The HTMLElement to set as the target.
     */
    public setCurrentTargetElementForPanel(element: HTMLElement | null): void {
        this._currentTargetElementForPanel = element;
    }

        /**
     * Retrieves the original query text from the UI that triggered the current state.
     * @returns The original query text string or undefined.
     */
    public getOriginalQueryTextFromUI(): string | undefined {
        return this._originalQueryTextFromUI;
    }

    /**
     * Sets the original query text from the UI that triggered the current state.
     * @param queryText The original query text string to set.
     */
    public setOriginalQueryTextFromUI(queryText: string | undefined): void {
        this._originalQueryTextFromUI = queryText;
    }

        /**
     * Callback function invoked when the UI is hidden.
     * Currently logs a message, but can be extended to reset state if needed.
     */
    public onUiHidden(): void {
        // this.setCurrentTargetElementForPanel(null); // Removed: This target is for the LLM input, which remains active
        // Potentially reset search query/response if UI is hidden and it was a search context
        // This depends on desired behavior. For now, only resetting target element.
        // this.setSearchQuery(null);
        // this.setSearchResponse(null);
        // this.setOriginalQueryTextFromUI(undefined);
        console.log(LOG_PREFIX_SM, 'UI hidden. Target element reference retained for subsequent operations.');
    }
}
