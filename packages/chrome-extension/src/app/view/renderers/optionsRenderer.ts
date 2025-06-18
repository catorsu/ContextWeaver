/**
 * @file optionsRenderer.ts
 * @description Implements rendering logic for general options view in the ContextWeaver Chrome Extension.
 * @module ContextWeaver/CE/OptionsRenderer
 */

import { UIManager } from '../../../uiManager';
import { WorkspaceDetailsResponsePayload } from '@contextweaver/shared';

/**
 * @interface OptionsActions
 * @description Defines the callbacks for user interactions within the general options view.
 */
export interface OptionsActions {
    /**
     * @param metadata Metadata of the active file.
     * @param element The HTML element associated with the active file option.
     * @returns {void}
     */
    onActiveFileSelect: (metadata: { name: string; type: string; uri: string; contentSourceId: string } | null, element: HTMLElement) => void;
    /**
     * @param element The HTML element associated with the open files option.
     * @returns {void}
     */
    onOpenFilesSelect: (element: HTMLElement) => void;
    /**
     * @param name Name of the file tree.
     * @param contentSourceId Content source ID for the file tree.
     * @param workspaceFolderUri URI of the workspace folder.
     * @param element The HTML element associated with the file tree option.
     * @returns {void}
     */
    onFileTreeSelect: (name: string, contentSourceId: string, workspaceFolderUri: string, element: HTMLElement) => void;
    /**
     * @param name Name of the codebase.
     * @param contentSourceId Content source ID for the codebase.
     * @param workspaceFolderUri URI of the workspace folder.
     * @param element The HTML element associated with the codebase option.
     * @returns {void}
     */
    onCodebaseSelect: (name: string, contentSourceId: string, workspaceFolderUri: string, element: HTMLElement) => void;
    /**
     * @param name Name of the problems.
     * @param contentSourceId Content source ID for the problems.
     * @param workspaceFolderUri URI of the workspace folder.
     * @param element The HTML element associated with the problems option.
     * @returns {void}
     */
    onProblemsSelect: (name: string, contentSourceId: string, workspaceFolderUri: string, element: HTMLElement) => void;
}

const LOCAL_CSS_PREFIX = 'cw-'; // For classes not managed by UIManager but needed locally

/**
 * Creates an HTMLDivElement representing a general option item, styled similarly to a search result.
 * @param uiManager The UIManager instance for creating UI elements.
 * @param label The text label for the option.
 * @param iconName The name of the Material Symbol icon to display.
 * @param options An object containing optional id and the onClick handler.
 * @returns {HTMLDivElement} The created div element for the option item.
 */
function createOptionItem(
    uiManager: UIManager,
    label: string,
    iconName: string,
    options: {
        id?: string;
        onClick: (event: MouseEvent) => void;
    }
): HTMLDivElement {
    const itemDiv = uiManager.createDiv({ classNames: ['search-result-item'] });
    itemDiv.setAttribute('tabindex', '0'); // Make focusable

    if (options.id) {
        itemDiv.id = options.id;
    }

    const iconElement = uiManager.createIcon(iconName, {
        classNames: ['cw-type-icon']
    });
    itemDiv.appendChild(iconElement);

    const nameSpan = uiManager.createSpan({ textContent: label });
    itemDiv.appendChild(nameSpan);

    itemDiv.onclick = options.onClick;

    itemDiv.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); itemDiv.click(); }
    });

    return itemDiv;
}

/**
 * Renders buttons for inserting file trees and full codebase content for each workspace folder.
 * @param uiManager The UIManager instance for creating UI elements.
 * @param workspaceFolders An array of workspace folder objects.
 * @param targetContentArea The DocumentFragment or HTMLElement where the buttons should be appended.
 * @param showFolderGrouping Boolean indicating whether to group buttons under folder titles.
 * @param actions Callbacks for handling user interactions.
 */
function renderWorkspaceFolders(
    uiManager: UIManager,
    workspaceFolders: { uri: string; name: string }[],
    targetContentArea: DocumentFragment,
    showFolderGrouping: boolean,
    actions: OptionsActions
): void {
    workspaceFolders.forEach(folder => {
        let sectionContainer: DocumentFragment | HTMLDivElement = targetContentArea;

        if (showFolderGrouping) {
            const folderSectionDiv = uiManager.createDiv({ classNames: ['cw-folder-section'] });
            const folderTitleDiv = uiManager.createDiv({ classNames: ['cw-folder-title'], textContent: folder.name || 'Workspace Folder' });
            folderSectionDiv.appendChild(folderTitleDiv);
            targetContentArea.appendChild(folderSectionDiv);
            sectionContainer = folderSectionDiv;
        }

        const fileTreeItem = createOptionItem(uiManager, 'File Tree', 'account_tree', {
            id: `${LOCAL_CSS_PREFIX}btn-file-tree-${folder.uri.replace(/[^a-zA-Z0-9]/g, '_')}`,
            onClick: (e) => {
                actions.onFileTreeSelect(`File Tree - ${folder.name}`, `${folder.uri}::FileTree`, folder.uri, e.currentTarget as HTMLElement);
            }
        });
        sectionContainer.appendChild(fileTreeItem);

        const fullCodebaseItem = createOptionItem(uiManager, 'Codebase', 'menu_book', {
            id: `${LOCAL_CSS_PREFIX}btn-full-codebase-${folder.uri.replace(/[^a-zA-Z0-9]/g, '_')}`,
            onClick: (e) => {
                actions.onCodebaseSelect(`Codebase - ${folder.name}`, `${folder.uri}::entire_codebase`, folder.uri, e.currentTarget as HTMLElement);
            }
        });
        sectionContainer.appendChild(fullCodebaseItem);

        const problemsItem = createOptionItem(uiManager, 'Problems', 'error', {
            id: `${LOCAL_CSS_PREFIX}btn-problems-${folder.uri.replace(/[^a-zA-Z0-9]/g, '_')}`,
            onClick: (e) => {
                actions.onProblemsSelect(`Problems - ${folder.name}`, `${folder.uri}::Problems`, folder.uri, e.currentTarget as HTMLElement);
            }
        });
        sectionContainer.appendChild(problemsItem);
    });
}

/**
 * Renders the general options view into the UI.
 * @param uiManager The UIManager instance for updating the UI.
 * @param response The workspace details response payload.
 * @param actions Callbacks for handling user interactions.
 * @returns {void}
 */
export function renderGeneralOptions(
    uiManager: UIManager,
    response: WorkspaceDetailsResponsePayload,
    actions: OptionsActions
): void {
    uiManager.updateTitle('ContextWeaver');
    const contentFragment = document.createDocumentFragment();

    const activeFileItem = createOptionItem(uiManager, 'Active File', 'description', {
        id: `${LOCAL_CSS_PREFIX}btn-active-file`,
        onClick: (e) => {
            // The AppCoordinator will handle fetching active file info
            actions.onActiveFileSelect(null, e.currentTarget as HTMLElement); // Metadata will be fetched by coordinator
        }
    });
    contentFragment.appendChild(activeFileItem);

    const openFilesItem = createOptionItem(uiManager, 'Open Files', 'folder_open', {
        id: `${LOCAL_CSS_PREFIX}btn-open-files`,
        onClick: (e) => {
            actions.onOpenFilesSelect(e.currentTarget as HTMLElement);
        }
    });
    contentFragment.appendChild(openFilesItem);

    if (response.data?.workspaceFolders && response.data.workspaceFolders.length > 0) {
        const separator = document.createElement('hr');
        separator.style.margin = '10px 0';
        separator.style.borderColor = '#4a4a4a';
        contentFragment.appendChild(separator);

        const showFolderGrouping = response.data.workspaceFolders.length > 1;
        renderWorkspaceFolders(uiManager, response.data.workspaceFolders, contentFragment, showFolderGrouping, actions);
    } else {
        if (contentFragment.childNodes.length === 0) {
            uiManager.showToast('No Workspace Open: No workspace folder open in VS Code. Some options may be limited.', 'info');
        }
    }
    uiManager.updateContent(contentFragment);
}
