// packages/chrome-extension/src/stateManager.ts
import {
    ContextBlockMetadata,
    SearchWorkspaceResponsePayload
} from '@contextweaver/shared';

const LOG_PREFIX_SM = '[ContextWeaver StateManager]';

export class StateManager {
    private _activeContextBlocks: ContextBlockMetadata[] = [];
    private _searchResponse: SearchWorkspaceResponsePayload | null = null;
    private _searchQuery: string | null = null;
    private _currentTargetElementForPanel: HTMLElement | null = null;
    private _originalQueryTextFromUI: string | undefined = undefined;

    constructor() {
        console.log(LOG_PREFIX_SM, 'StateManager initialized.');
    }

    // --- Active Context Blocks ---
    public getActiveContextBlocks(): Readonly<ContextBlockMetadata[]> {
        return this._activeContextBlocks;
    }

    public addActiveContextBlock(block: ContextBlockMetadata): void {
        // Optional: Could add a check here to prevent adding if unique_block_id already exists,
        // though content_source_id is used for user-facing duplicate prevention.
        this._activeContextBlocks.push(block);
        console.log(LOG_PREFIX_SM, `Added block: ${block.label}. Total: ${this._activeContextBlocks.length}`);
    }

    public removeActiveContextBlock(uniqueBlockId: string): void {
        const initialLength = this._activeContextBlocks.length;
        this._activeContextBlocks = this._activeContextBlocks.filter(
            (b) => b.unique_block_id !== uniqueBlockId
        );
        if (this._activeContextBlocks.length < initialLength) {
            console.log(LOG_PREFIX_SM, `Removed block ID: ${uniqueBlockId}. Total: ${this._activeContextBlocks.length}`);
        }
    }

    public isDuplicateContentSource(contentSourceId: string): boolean {
        return this._activeContextBlocks.some(block => block.content_source_id === contentSourceId);
    }

    public clearActiveContextBlocks(): void {
        this._activeContextBlocks = [];
        console.log(LOG_PREFIX_SM, 'Active context blocks cleared.');
    }

    // --- Search State ---
    public getSearchResponse(): Readonly<SearchWorkspaceResponsePayload | null> {
        return this._searchResponse;
    }

    public setSearchResponse(response: SearchWorkspaceResponsePayload | null): void {
        this._searchResponse = response;
    }

    public getSearchQuery(): string | null {
        return this._searchQuery;
    }

    public setSearchQuery(query: string | null): void {
        this._searchQuery = query;
    }

    // --- UI Target State ---
    public getCurrentTargetElementForPanel(): HTMLElement | null {
        return this._currentTargetElementForPanel;
    }

    public setCurrentTargetElementForPanel(element: HTMLElement | null): void {
        this._currentTargetElementForPanel = element;
    }

    // --- Original Query Text ---
    public getOriginalQueryTextFromUI(): string | undefined {
        return this._originalQueryTextFromUI;
    }

    public setOriginalQueryTextFromUI(queryText: string | undefined): void {
        this._originalQueryTextFromUI = queryText;
    }

    // --- Reset relevant state on UI hide ---
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
