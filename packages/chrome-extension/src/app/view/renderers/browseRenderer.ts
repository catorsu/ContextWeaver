/**
 * @file browseRenderer.ts
 * @description Implements rendering logic for the folder browse view in the ContextWeaver Chrome Extension.
 * @module ContextWeaver/CE/BrowseRenderer
 */

import { UIManager } from '../../../uiManager';
import { ListFolderContentsResponsePayload } from '@contextweaver/shared';

/**
 * @interface BrowseActions
 * @description Defines the callbacks for user interactions within the folder browse view.
 */
export interface BrowseActions {
    /**
     * @param selectedItems An array of selected items to insert.
     * @returns {Promise<void>}
     */
    onInsertSelectedItems: (selectedItems: { type: string; name: string; uri: string; contentSourceId: string; workspaceFolderUri: string }[]) => Promise<void>;
    /**
     * @returns {void}
     */
    onBack: () => void;
}

const LOCAL_CSS_PREFIX = 'cw-';

/**
 * Renders the folder browse view into the UI.
 * @param uiManager The UIManager instance for updating the UI.
 * @param response The folder content response payload.
 * @param actions Callbacks for handling user interactions.
 * @param workspaceFolderUri The URI of the workspace folder this browse view belongs to.
 */
export function renderBrowseView(
    uiManager: UIManager,
    response: ListFolderContentsResponsePayload,
    actions: BrowseActions,
    workspaceFolderUri: string
): void {
    const parentFolderUri = response.data?.parentFolderUri;
    const folderName = parentFolderUri ? parentFolderUri.split('/').pop() || 'Folder' : 'Folder';
    uiManager.updateTitle(`Browsing: ${folderName}`);

    const browseSection = uiManager.createDiv({ classNames: [`${LOCAL_CSS_PREFIX}browse-view`] });
    const allItems = response.data?.entries || [];
    const nodeMap = new Map();

    // Build the tree structure from the flat list
    const rootNodes: any[] = [];
    for (const item of allItems) {
        const node = { item, children: [] };
        nodeMap.set(item.uri, node);
        const parentUri = item.uri.substring(0, item.uri.lastIndexOf('/'));
        const parentNode = nodeMap.get(parentUri);
        if (parentNode) {
            parentNode.children.push(node);
        } else {
            rootNodes.push(node);
        }
    }

    // Recursive function to render the tree
    const renderNode = (node: any) => {
        const itemDiv = uiManager.createDiv({ classNames: [`${LOCAL_CSS_PREFIX}tree-node`] });
        const label = uiManager.createLabel('', undefined, { style: { display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '3px 0' } });
        const checkbox = uiManager.createCheckbox({ checked: true, dataset: { uri: node.item.uri, type: node.item.type, name: node.item.name } });
        const icon = uiManager.createIcon(node.item.type === 'file' ? 'description' : 'folder');
        const name = uiManager.createSpan({ textContent: node.item.name });

        label.appendChild(checkbox);
        label.appendChild(icon);
        label.appendChild(name);
        itemDiv.appendChild(label);

        // Handle cascading selection for folders
        if (node.item.type === 'folder') {
            checkbox.addEventListener('change', () => {
                const childCheckboxes = itemDiv.querySelectorAll('input[type="checkbox"]');
                childCheckboxes.forEach(cb => (cb as HTMLInputElement).checked = checkbox.checked);
            });
        }

        if (node.children.length > 0) {
            const childrenContainer = uiManager.createDiv({ classNames: [`${LOCAL_CSS_PREFIX}tree-children`], style: { marginLeft: '20px' } });
            node.children
                .sort((a: any, b: any) => {
                    if (a.item.type === 'folder' && b.item.type !== 'folder') return -1;
                    if (a.item.type !== 'folder' && b.item.type === 'folder') return 1;
                    return a.item.name.localeCompare(b.item.name);
                })
                .forEach((childNode: any) => childrenContainer.appendChild(renderNode(childNode)));
            itemDiv.appendChild(childrenContainer);
        }
        return itemDiv;
    };

    const treeContainer = uiManager.createDiv({ style: { maxHeight: '250px', overflowY: 'auto', marginBottom: '10px' } });
    rootNodes
        .sort((a, b) => {
            if (a.item.type === 'folder' && b.item.type !== 'folder') return -1;
            if (a.item.type !== 'folder' && b.item.type === 'folder') return 1;
            return a.item.name.localeCompare(b.item.name);
        })
        .forEach(node => treeContainer.appendChild(renderNode(node)));

    // Buttons
    const buttonContainer = uiManager.createDiv({ classNames: [`${LOCAL_CSS_PREFIX}button-row`], style: { marginTop: '10px' } });

    const collectSelectedItems = (container: HTMLElement): { type: string; name: string; uri: string; contentSourceId: string; workspaceFolderUri: string }[] => {
        const items: { type: string; name: string; uri: string; contentSourceId: string; workspaceFolderUri: string }[] = [];
        const childNodes = Array.from(container.children).filter(el => el.classList.contains(`${LOCAL_CSS_PREFIX}tree-node`));

        for (const nodeDiv of childNodes) {
            const checkbox = nodeDiv.querySelector('input[type="checkbox"]') as HTMLInputElement;
            if (checkbox.checked) {
                // If the item is checked, add it and don't descend further.
                items.push({
                    type: checkbox.dataset.type!,
                    name: checkbox.dataset.name!,
                    uri: checkbox.dataset.uri!,
                    contentSourceId: checkbox.dataset.uri!,
                    workspaceFolderUri: workspaceFolderUri
                });
            } else {
                // If it's an unchecked folder, check its children.
                if (checkbox.dataset.type === 'folder') {
                    const childrenContainer = nodeDiv.querySelector(`.${LOCAL_CSS_PREFIX}tree-children`);
                    if (childrenContainer) {
                        items.push(...collectSelectedItems(childrenContainer as HTMLElement));
                    }
                }
            }
        }
        return items;
    };

    const insertButton = uiManager.createButton('Insert Selected', {
        onClick: async () => {
            const allCheckboxes = Array.from(treeContainer.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
            const areAllChecked = allCheckboxes.every(cb => cb.checked);

            if (areAllChecked && allCheckboxes.length > 0) {
                // All items are selected, treat as a single folder insertion.
                const parentFolderItem = {
                    type: 'folder',
                    name: folderName,
                    uri: parentFolderUri!,
                    contentSourceId: parentFolderUri!,
                    workspaceFolderUri: workspaceFolderUri
                };
                await actions.onInsertSelectedItems([parentFolderItem]);
            } else {
                // Not all items are selected, use existing logic to collect checked items.
                const selectedItems = collectSelectedItems(treeContainer);

                if (selectedItems.length > 0) {
                    await actions.onInsertSelectedItems(selectedItems);
                } else {
                    uiManager.showToast('No items selected.', 'info');
                }
            }
        }
    });
    buttonContainer.appendChild(insertButton);

    const backButton = uiManager.createButton('Back', { onClick: actions.onBack });
    buttonContainer.appendChild(backButton);

    if (allItems.length === 0) {
        browseSection.appendChild(uiManager.createButton('Back', { onClick: actions.onBack }));
        browseSection.appendChild(uiManager.createParagraph({ textContent: 'This folder is empty.', style: { marginTop: '10px' } }));
    } else {
        browseSection.appendChild(treeContainer);
        browseSection.appendChild(buttonContainer);
    }

    uiManager.updateContent(browseSection);
}
