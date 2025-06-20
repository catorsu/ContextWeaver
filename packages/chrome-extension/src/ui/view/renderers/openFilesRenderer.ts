/**
 * @file openFilesRenderer.ts
 * @description Implements rendering logic for the open files view in the ContextWeaver Chrome Extension.
 * @module ContextWeaver/CE/OpenFilesRenderer
 */

import { UIManager } from '../../../uiManager';
import { groupItemsByWindow, groupItemsByWorkspace, GroupedWindowItems } from '../../utils/domUtils';
import { StateManager } from '../../stateManager'; // Need StateManager to check for duplicate content sources

/**
 * @interface OpenFilesActions
 * @description Defines the callbacks for user interactions within the open files view.
 */
export interface OpenFilesActions {
    /**
     * @param selectedFilePaths An array of paths for the selected files.
     * @returns {Promise<void>}
     */
    onInsertSelectedFiles: (selectedFiles: { type: string; name: string; uri: string; contentSourceId: string; workspaceFolderUri: string | null }[]) => Promise<void>;
    /**
     * @returns {void}
     */
    onBack: () => void;
}

const LOCAL_CSS_PREFIX = 'cw-'; // For classes not managed by UIManager but needed locally

/**
 * Creates an HTMLDivElement representing a single open file in the selection list.
 * @param uiManager The UIManager instance for creating UI elements.
 * @param stateManager The StateManager instance to check for duplicate content sources.
 * @param file The file object containing path, name, and workspace details.
 * @param groupedOpenFilesMapSize The size of the map used for grouping open files, to determine if workspace name should be shown.
 * @returns {HTMLDivElement} The created div element for the open file list item.
 */
function createOpenFilesListItem(
    uiManager: UIManager,
    stateManager: StateManager,
    file: { path: string; name: string; workspaceFolderUri: string | null; workspaceFolderName: string | null; windowId?: string },
    groupedOpenFilesMapSize: number
): HTMLDivElement {
    const listItem = uiManager.getDOMFactory().createDiv({ style: { display: 'flex', alignItems: 'center', marginBottom: '5px', padding: '3px', borderBottom: '1px solid #3a3a3a' } });
    listItem.setAttribute('tabindex', '0'); // Make focusable for keyboard navigation

    const checkboxId = `${LOCAL_CSS_PREFIX}openfile-${file.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const checkbox = uiManager.getDOMFactory().createCheckbox({ id: checkboxId, checked: true, dataset: { value: file.path } });

    // Create and add the file icon
    const iconElement = uiManager.getDOMFactory().createIcon('description', {
        classNames: [`${LOCAL_CSS_PREFIX}type-icon`]
    });

    let labelText = file.name;
    // Check if there's only one workspace or if it's an 'unknown_workspace' group
    if (file.workspaceFolderName && (groupedOpenFilesMapSize === 0 || (groupedOpenFilesMapSize === 1 && groupItemsByWorkspace([file]).keys().next().value === 'unknown_workspace'))) {
        labelText += ` (${file.workspaceFolderName})`;
    }
    const label = uiManager.getDOMFactory().createLabel(labelText, checkboxId, { style: { fontSize: '13px' } });

    if (stateManager.isDuplicateContentSource(file.path)) {
        checkbox.disabled = true;
        label.style.textDecoration = 'line-through';
        label.title = 'This file has already been added to the context.';
        const alreadyAddedSpan = uiManager.getDOMFactory().createSpan({ textContent: ' (already added)', style: { fontStyle: 'italic', color: '#888' } });
        label.appendChild(alreadyAddedSpan);
    }
    listItem.appendChild(checkbox);
    listItem.appendChild(iconElement);
    listItem.appendChild(label);

    listItem.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            checkbox.checked = !checkbox.checked;
        }
    });

    return listItem;
}

/**
 * Creates the form elements for the open files selector UI, including the list of files and action buttons.
 * @param uiManager The UIManager instance for creating UI elements.
 * @param stateManager The StateManager instance to check for duplicate content sources.
 * @param openFilesList An array of open file objects.
 * @param groupedByWindow A Map of open files grouped by window.
 * @param actions Callbacks for handling user interactions.
 * @returns {HTMLFormElement} The created form element.
 */
function createOpenFilesFormElements(
    uiManager: UIManager,
    stateManager: StateManager,
    openFilesList: { path: string; name: string; workspaceFolderUri: string | null; workspaceFolderName: string | null; windowId?: string }[],
    groupedByWindow: Map<string, GroupedWindowItems<{ path: string; name: string; workspaceFolderUri: string | null; workspaceFolderName: string | null; windowId?: string }>>,
    actions: OpenFilesActions
): HTMLFormElement {
    const form = document.createElement('form');
    const listContainer = uiManager.getDOMFactory().createDiv({ style: { maxHeight: '250px', overflowY: 'auto', marginBottom: '10px' } });

    // If we have files from multiple windows, show window grouping
    if (groupedByWindow.size > 1) {
        for (const [, windowGroupData] of groupedByWindow.entries()) {
            const windowHeader = uiManager.getDOMFactory().createDiv({
                classNames: [`${LOCAL_CSS_PREFIX}window-header`],
                textContent: windowGroupData.name,
                style: { fontWeight: 'bold', marginTop: '10px', marginBottom: '5px' }
            });
            listContainer.appendChild(windowHeader);

            // Then group by workspace within each window
            const groupedByWorkspace = groupItemsByWorkspace(windowGroupData.items);

            if (groupedByWorkspace.size > 1) {
                for (const [, workspaceGroupData] of groupedByWorkspace.entries()) {
                    const workspaceHeader = uiManager.getDOMFactory().createDiv({
                        classNames: [`${LOCAL_CSS_PREFIX}group-header`],
                        textContent: `  ${workspaceGroupData.name}`,
                        style: { marginLeft: '15px' }
                    });
                    listContainer.appendChild(workspaceHeader);
                    workspaceGroupData.items.forEach(file => {
                        const listItem = createOpenFilesListItem(uiManager, stateManager, file, groupedByWorkspace.size);
                        listItem.style.marginLeft = '30px';
                        listContainer.appendChild(listItem);
                    });
                }
            } else {
                windowGroupData.items.forEach(file => {
                    const listItem = createOpenFilesListItem(uiManager, stateManager, file, 1);
                    listItem.style.marginLeft = '15px';
                    listContainer.appendChild(listItem);
                });
            }
        }
    } else {
        // Single window - use original workspace grouping logic
        const groupedByWorkspace = groupItemsByWorkspace(openFilesList);

        if (groupedByWorkspace.size > 1) {
            for (const [, groupData] of groupedByWorkspace.entries()) {
                const groupHeader = uiManager.getDOMFactory().createDiv({ classNames: [`${LOCAL_CSS_PREFIX}group-header`], textContent: groupData.name });
                listContainer.appendChild(groupHeader);
                groupData.items.forEach(file => {
                    const listItem = createOpenFilesListItem(uiManager, stateManager, file, groupedByWorkspace.size);
                    listContainer.appendChild(listItem);
                });
            }
        } else {
            openFilesList.forEach(file => {
                const listItem = createOpenFilesListItem(uiManager, stateManager, file, groupedByWorkspace.size);
                listContainer.appendChild(listItem);
            });
        }
    }
    form.appendChild(listContainer);

    const buttonContainer = uiManager.getDOMFactory().createDiv({ style: { marginTop: '10px', display: 'flex', gap: '10px' } });

    const insertButton = uiManager.getDOMFactory().createButton('', {
        style: {
            fontSize: '16px',
            padding: '6px 12px'
        },
        onClick: async () => {
            const selectedFilePaths = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked:not(:disabled)'))
                .map(cb => cb.dataset.value!);

            if (selectedFilePaths.length === 0) {
                const tempMsg = uiManager.getDOMFactory().createParagraph({ textContent: 'No new files selected.', style: { color: 'orange' } });
                form.appendChild(tempMsg);
                setTimeout(() => { if (tempMsg.parentNode) tempMsg.parentNode.removeChild(tempMsg); }, 2000);
                return;
            }

            insertButton.disabled = true;
            insertButton.innerHTML = '';
            insertButton.appendChild(uiManager.getDOMFactory().createIcon('progress_activity', { classNames: [`${LOCAL_CSS_PREFIX}spinning`] }));

            try {
            const selectedFilesData = openFilesList
                .filter(file => selectedFilePaths.includes(file.path))
                .map(file => ({
                    type: 'file',
                    name: file.name,
                    uri: file.path,
                    contentSourceId: file.path,
                    workspaceFolderUri: file.workspaceFolderUri
                }));

                await actions.onInsertSelectedFiles(selectedFilesData);
            } finally {
                if (document.getElementById(uiManager.getConstant('UI_PANEL_ID'))?.classList.contains(uiManager.getConstant('CSS_PREFIX') + 'visible')) {
                    insertButton.disabled = false;
                    insertButton.innerHTML = '';
                    insertButton.appendChild(uiManager.getDOMFactory().createIcon('check_circle'));
                }
            }
        }
    });
    insertButton.appendChild(uiManager.getDOMFactory().createIcon('check_circle'));
    insertButton.title = 'Insert Selected Files';
    buttonContainer.appendChild(insertButton);

    const backButton = uiManager.getDOMFactory().createButton('', {
        style: { fontSize: '16px', padding: '6px 12px' },
        onClick: actions.onBack
    });
    backButton.appendChild(uiManager.getDOMFactory().createIcon('arrow_back'));
    backButton.title = 'Back';
    buttonContainer.appendChild(backButton);

    form.appendChild(buttonContainer);

    return form;
}

/**
 * Renders the open files selection view into the UI.
 * @param uiManager The UIManager instance for updating the UI.
 * @param stateManager The StateManager instance to check for duplicate content sources.
 * @param openFilesList An array of open file objects to display.
 * @param actions Callbacks for handling user interactions.
 * @returns {void}
 */
export function renderOpenFilesView(
    uiManager: UIManager,
    stateManager: StateManager,
    openFilesList: { path: string; name: string; workspaceFolderUri: string | null; workspaceFolderName: string | null; windowId?: string }[],
    actions: OpenFilesActions
): void {
    uiManager.updateTitle('Select Open Files');
    const selectorWrapper = uiManager.getDOMFactory().createDiv({ classNames: [`${LOCAL_CSS_PREFIX}open-files-selector`] });

    if (openFilesList.length === 0) {
        uiManager.showToast('No Open Files: No open (saved) files found in trusted workspace(s).', 'info');
        const backButton = uiManager.getDOMFactory().createButton('Back', { onClick: actions.onBack });
        selectorWrapper.appendChild(uiManager.getDOMFactory().createParagraph({ textContent: 'No open (saved) files found in trusted workspace(s).' }));
        selectorWrapper.appendChild(backButton);
        uiManager.updateContent(selectorWrapper);
        return;
    }

    // Check if we need virtual scrolling for large file lists
    if (openFilesList.length > 50) {
        const ITEM_HEIGHT = 32; // Approximate height of each file item
        const VISIBLE_ITEMS = 12; // Number of items visible at once
        const containerHeight = ITEM_HEIGHT * VISIBLE_ITEMS;

        const scrollContainer = uiManager.getDOMFactory().createDiv({
            style: {
                height: `${containerHeight}px`,
                overflowY: 'auto',
                position: 'relative',
                border: '1px solid #444',
                borderRadius: '4px',
                marginBottom: '10px'
            }
        });

        const virtualHeight = uiManager.getDOMFactory().createDiv({
            style: {
                height: `${openFilesList.length * ITEM_HEIGHT}px`,
                position: 'relative'
            }
        });

        const itemContainer = uiManager.getDOMFactory().createDiv({
            style: {
                position: 'absolute',
                top: '0',
                left: '0',
                right: '0'
            }
        });

        virtualHeight.appendChild(itemContainer);
        scrollContainer.appendChild(virtualHeight);

        const renderVisibleItems = () => {
            const scrollTop = scrollContainer.scrollTop;
            const startIndex = Math.floor(scrollTop / ITEM_HEIGHT);
            const endIndex = Math.min(startIndex + VISIBLE_ITEMS + 2, openFilesList.length);

            // Clear and re-render visible items
            itemContainer.innerHTML = '';
            itemContainer.style.transform = `translateY(${startIndex * ITEM_HEIGHT}px)`;

            for (let i = startIndex; i < endIndex; i++) {
                const file = openFilesList[i];
                const listItem = createOpenFilesListItem(uiManager, stateManager, file, 1);

                // Update checkbox state from selection map
                const checkbox = listItem.querySelector('input[type="checkbox"]') as HTMLInputElement;
                if (checkbox && !checkbox.disabled) {
                    checkbox.checked = fileSelectionState.get(file.path) || false;

                    // Add change listener to update selection state
                    checkbox.addEventListener('change', () => {
                        fileSelectionState.set(file.path, checkbox.checked);
                    });
                }

                itemContainer.appendChild(listItem);
            }
        };

        scrollContainer.addEventListener('scroll', () => {
            window.requestAnimationFrame(renderVisibleItems);
        });

        // Initial render
        renderVisibleItems();

        // Create form with virtual scroll container
        const form = document.createElement('form');
        form.appendChild(scrollContainer);

        // Track selection state for virtual scrolling
        const fileSelectionState = new Map<string, boolean>();
        openFilesList.forEach(file => {
            fileSelectionState.set(file.path, !stateManager.isDuplicateContentSource(file.path));
        });

        const insertButton = uiManager.getDOMFactory().createButton('Insert Selected Files', {
            onClick: async () => {
                // Collect all selected files from the selection state map
                const selectedFiles: string[] = [];
                fileSelectionState.forEach((isSelected, filePath) => {
                    if (isSelected) {
                        selectedFiles.push(filePath);
                    }
                });

                if (selectedFiles.length === 0) {
                    uiManager.showToast('No files selected.', 'info');
                    return;
                }

                insertButton.textContent = 'Loading Content...';
                insertButton.disabled = true;

                try {
                const selectedFilesData = openFilesList
                    .filter(file => selectedFiles.includes(file.path))
                    .map(file => ({
                        type: 'file',
                        name: file.name,
                        uri: file.path,
                        contentSourceId: file.path,
                        workspaceFolderUri: file.workspaceFolderUri
                    }));
                    await actions.onInsertSelectedFiles(selectedFilesData);
                } finally {
                    uiManager.hideLoading();
                }
            }
        });
        form.appendChild(insertButton);

        const backButton = uiManager.getDOMFactory().createButton('Back', {
            style: { marginLeft: '10px' },
            onClick: actions.onBack
        });
        form.appendChild(backButton);

        selectorWrapper.appendChild(form);
        uiManager.updateContent(selectorWrapper);
        return;
    }

    // First group by window, then by workspace
    const groupedByWindow = groupItemsByWindow(openFilesList);
    const form = createOpenFilesFormElements(uiManager, stateManager, openFilesList, groupedByWindow, actions);

    selectorWrapper.appendChild(form);
    uiManager.updateContent(selectorWrapper);

    // Add arrow key navigation after content is rendered
    setTimeout(() => {
        const panel = document.getElementById(uiManager.getConstant('UI_PANEL_ID'));
        if (panel) {
            const focusableItems = panel.querySelectorAll('[tabindex="0"]');
            if (focusableItems.length > 0) {
                panel.addEventListener('keydown', (e) => {
                    const currentFocus = document.activeElement;
                    const itemsArray = Array.from(focusableItems);
                    const currentIndex = itemsArray.indexOf(currentFocus as Element);

                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const nextIndex = currentIndex + 1 < itemsArray.length ? currentIndex + 1 : 0;
                        (itemsArray[nextIndex] as HTMLElement).focus();
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const prevIndex = currentIndex - 1 >= 0 ? currentIndex - 1 : itemsArray.length - 1;
                        (itemsArray[prevIndex] as HTMLElement).focus();
                    }
                });
            }
        }
    }, 0);
}
