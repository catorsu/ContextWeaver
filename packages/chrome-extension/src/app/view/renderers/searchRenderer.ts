/**
 * @file searchRenderer.ts
 * @description Implements rendering logic for search results in the ContextWeaver Chrome Extension.
 * @module ContextWeaver/CE/SearchRenderer
 */

import { UIManager } from '../../../uiManager';
import { SearchResult, SearchWorkspaceResponsePayload } from '@contextweaver/shared';
import { groupItemsByWindow, groupItemsByWorkspace } from '../../utils/domUtils';

/**
 * @interface SearchActions
 * @description Defines the callbacks for user interactions within the search results view.
 */
export interface SearchActions {
    /**
     * @param metadata Metadata of the selected file.
     * @param element The HTML element associated with the selected file.
     * @returns {void}
     */
    onFileSelect: (metadata: { name: string; contentSourceId: string; type: string; uri: string }, element: HTMLElement) => void;
    /**
     * @param item The search result item representing a folder to browse.
     * @returns {void}
     */
    onFolderBrowse: (item: SearchResult) => void;
}

/**
 * Creates an HTMLDivElement representing a single search result item.
 * @param uiManager The UIManager instance for creating UI elements.
 * @param result The search result object.
 * @param omitWorkspaceName If true, the workspace name will not be displayed.
 * @param actions Callbacks for handling user interactions.
 * @returns {HTMLDivElement} The created div element for the search result item.
 */
function createSearchResultItemElement(
    uiManager: UIManager,
    result: SearchResult,
    omitWorkspaceName: boolean,
    actions: SearchActions
): HTMLDivElement {
    const itemDiv = uiManager.createDiv({ classNames: ['search-result-item'] });
    itemDiv.setAttribute('tabindex', '0'); // Make focusable

    const iconElement = uiManager.createIcon(result.type === 'file' ? 'description' : 'folder', {
        classNames: ['cw-type-icon']
    });
    itemDiv.appendChild(iconElement);

    const nameSpan = uiManager.createSpan({ textContent: result.name });
    itemDiv.appendChild(nameSpan);

    let pathText = result.path;
    if (result.type === 'file' && result.workspaceFolderName && !omitWorkspaceName) {
        pathText += ` (${result.workspaceFolderName})`;
    }
    const pathSpan = uiManager.createSpan({ textContent: pathText, classNames: ['cw-search-result-path'] });
    itemDiv.appendChild(pathSpan);

    itemDiv.onclick = () => {
        if (result.type === 'file') {
            actions.onFileSelect({ name: result.name, contentSourceId: result.content_source_id, type: 'file', uri: result.uri }, itemDiv);
        } else if (result.type === 'folder') {
            actions.onFolderBrowse(result);
        }
    };

    itemDiv.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); itemDiv.click(); }
    });

    return itemDiv;
}

/**
 * Renders the search results into the UI.
 * @param uiManager The UIManager instance for updating the UI.
 * @param response The search workspace response payload.
 * @param query The search query.
 * @param actions Callbacks for handling user interactions.
 * @returns {void}
 */
export function renderSearchResults(
    uiManager: UIManager,
    response: SearchWorkspaceResponsePayload,
    query: string,
    actions: SearchActions
): void {
    uiManager.updateTitle(`"@${query}"`);
    const searchResults = response.data?.results || [];

    const searchResultsSection = uiManager.createDiv({ classNames: ['cw-search-results'] });
    if (searchResults.length === 0) {
        searchResultsSection.appendChild(uiManager.createParagraph({ textContent: 'No results found.' }));
    } else {
        const groupedByWindow = groupItemsByWindow(searchResults);

        if (groupedByWindow.size > 1) {
            for (const [, windowGroupData] of groupedByWindow.entries()) {
                const windowHeader = uiManager.createDiv({ classNames: ['cw-window-header'], textContent: windowGroupData.name, style: { fontWeight: 'bold', marginTop: '10px', marginBottom: '5px' } });
                searchResultsSection.appendChild(windowHeader);

                const groupedByWorkspace = groupItemsByWorkspace(windowGroupData.items);
                if (groupedByWorkspace.size > 1) {
                    for (const [, workspaceGroupData] of groupedByWorkspace.entries()) {
                        const workspaceHeader = uiManager.createDiv({ classNames: ['cw-group-header'], textContent: `  ${workspaceGroupData.name}`, style: { marginLeft: '15px' } });
                        searchResultsSection.appendChild(workspaceHeader);
                        workspaceGroupData.items.forEach(result => {
                            const resultItem = createSearchResultItemElement(uiManager, result, true, actions);
                            resultItem.style.marginLeft = '30px';
                            searchResultsSection.appendChild(resultItem);
                        });
                    }
                } else {
                    windowGroupData.items.forEach(result => {
                        const resultItem = createSearchResultItemElement(uiManager, result, false, actions);
                        resultItem.style.marginLeft = '15px';
                        searchResultsSection.appendChild(resultItem);
                    });
                }
            }
        } else {
            const groupedByWorkspace = groupItemsByWorkspace(searchResults);
            if (groupedByWorkspace.size > 1) {
                for (const [, groupData] of groupedByWorkspace.entries()) {
                    const groupHeader = uiManager.createDiv({ classNames: ['cw-group-header'], textContent: groupData.name });
                    searchResultsSection.appendChild(groupHeader);
                    groupData.items.forEach(result => searchResultsSection.appendChild(createSearchResultItemElement(uiManager, result, true, actions)));
                }
            } else {
                searchResults.forEach(result => {
                    searchResultsSection.appendChild(createSearchResultItemElement(uiManager, result, false, actions));
                });
            }
        }
    }
    uiManager.updateContent(searchResultsSection);
}
