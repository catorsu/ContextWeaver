/**
 * @file ViewManager.ts
 * @description Orchestrates the rendering of different UI views in the ContextWeaver Chrome Extension.
 * @module ContextWeaver/CE/ViewManager
 */

import { UIManager } from '../../uiManager';
import { StateManager } from '../stateManager';
import { AppCoordinator } from '../AppCoordinator';
import * as searchRenderer from './renderers/searchRenderer';
import * as browseRenderer from './renderers/browseRenderer';
import * as optionsRenderer from './renderers/optionsRenderer';
import * as openFilesRenderer from './renderers/openFilesRenderer';
import {
    SearchWorkspaceResponsePayload,
    ListFolderContentsResponsePayload,
    WorkspaceDetailsResponsePayload
} from '@contextweaver/shared';

/**
 * @class ViewManager
 * @description Manages and orchestrates the display of various UI views by delegating to specific renderers.
 */
export class ViewManager {
    private uiManager: UIManager;
    private stateManager: StateManager;
    private coordinator: AppCoordinator;

    /**
     * @param uiManager The UIManager instance for creating and updating UI elements.
     * @param stateManager The StateManager instance for managing UI state.
     * @param coordinator The AppCoordinator instance to delegate actions back to.
     */
    constructor(uiManager: UIManager, stateManager: StateManager, coordinator: AppCoordinator) {
        this.uiManager = uiManager;
        this.stateManager = stateManager;
        this.coordinator = coordinator;
    }

    /**
     * Displays the search results view.
     * @param response The search workspace response payload.
     * @param query The search query.
     * @returns {void}
     */
    public showSearchResults(response: SearchWorkspaceResponsePayload, query: string): void {
        searchRenderer.renderSearchResults(this.uiManager, response, query, {
            onFileSelect: (metadata, element) => this.coordinator.handleContentInsertionRequest(metadata, element),
            onFolderBrowse: (item) => this.coordinator.handleBrowseFolder(item),
        });
    }

    /**
     * Displays the folder browse view.
   * @param response The list folder contents response payload.
   * @param workspaceFolderUri The URI of the workspace folder this browse view belongs to.
   * @returns {void}
   */
    public showBrowseView(response: ListFolderContentsResponsePayload, workspaceFolderUri: string): void {
        browseRenderer.renderBrowseView(this.uiManager, response, {
            onInsertSelectedItems: (items) => this.coordinator.handleInsertSelectedBrowseItems(items),
            onBack: () => this.coordinator.handleBackToSearchResults(),
        }, workspaceFolderUri);
    }

    /**
     * Displays the general options view.
     * @param response The workspace details response payload.
     * @returns {void}
     */
    public showGeneralOptions(response: WorkspaceDetailsResponsePayload): void {
        optionsRenderer.renderGeneralOptions(this.uiManager, response, {
            onActiveFileSelect: () => this.coordinator.handleActiveFileSelect(),
            onOpenFilesSelect: () => this.coordinator.handleOpenFilesSelect(),
            onFileTreeSelect: (name, contentSourceId, workspaceFolderUri) => this.coordinator.handleFileTreeSelect(name, contentSourceId, workspaceFolderUri),
            onCodebaseSelect: (name, contentSourceId, workspaceFolderUri) => this.coordinator.handleCodebaseSelect(name, contentSourceId, workspaceFolderUri),
            onProblemsSelect: (name, contentSourceId, workspaceFolderUri) => this.coordinator.handleProblemsSelect(name, contentSourceId, workspaceFolderUri),
        });
    }

    /**
     * Displays the open files selection view.
     * @param openFilesList An array of open file objects.
     * @returns {void}
     */
    public showOpenFiles(openFilesList: { path: string; name: string; workspaceFolderUri: string; workspaceFolderName: string | null; windowId?: string }[]): void {
        openFilesRenderer.renderOpenFilesView(this.uiManager, this.stateManager, openFilesList, {
            onInsertSelectedFiles: async (selectedFilePaths) => await this.coordinator.handleInsertSelectedFiles(selectedFilePaths),
            onBack: async () => await this.coordinator.populateFloatingUiContent({ mode: 'general' }),
        });
    }
}
