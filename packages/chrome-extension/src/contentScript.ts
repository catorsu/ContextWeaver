/**
 * @file contentScript.ts
 * @description Content script for ContextWeaver Chrome Extension.
 * Handles detection of the '@' trigger in designated LLM chat input fields and
 * manages the floating UI.
 * @module ContextWeaver/CE
 */

// Import UIManager and shared types
import { UIManager } from './uiManager';
import {
  ContextBlockMetadata,
  SearchResult as SharedSearchResult,
  SearchWorkspaceResponsePayload,
  FileContentResponsePayload,
  FolderContentResponsePayload,
  FileTreeResponsePayload,
  EntireCodebaseResponsePayload,
  ListFolderContentsResponsePayload,
  WorkspaceDetailsResponsePayload,
  WorkspaceProblemsResponsePayload,
  DirectoryEntry as CWDirectoryEntry // Alias DirectoryEntry to avoid collision
} from '@contextweaver/shared';
import { StateManager } from './stateManager';
import * as swClient from './serviceWorkerClient'; // Import the client


const LOG_PREFIX_CS = '[ContextWeaver CS]';
const LOCAL_CSS_PREFIX = 'cw-'; // For classes not managed by UIManager but needed locally

console.log(`${LOG_PREFIX_CS} Content script loaded.`);

const uiManager = new UIManager();
const stateManager = new StateManager(); // Instantiate StateManager


/**
 * Debounces a function, delaying its execution until after a specified wait time has passed since the last invocation.
 * @param func The function to debounce.
 * @param waitFor The number of milliseconds to wait after the last call before invoking the function.
 * @returns A new debounced function that returns a Promise resolving with the result of the original function.
 */
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<F>): Promise<ReturnType<F>> =>
    new Promise(resolve => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => resolve(func(...args)), waitFor);
    });
}

/**
 * Defines a common structure for items that can be grouped by workspace.
 */
interface WorkspaceGroupable {
  workspaceFolderUri?: string | null;
  workspaceFolderName?: string | null;
  [key: string]: any;
}

/**
 * Represents a group of workspace items, typically used for displaying search results or files grouped by their workspace.
 */
interface GroupedWorkspaceItems<T extends WorkspaceGroupable> {
  name: string;
  items: T[];
}

/**
 * Groups a list of items by their associated workspace.
 * @param items An array of items that implement the WorkspaceGroupable interface.
 * @returns A Map where keys are workspace URIs (or 'unknown_workspace') and values are GroupedWorkspaceItems.
 */
function groupItemsByWorkspace<T extends WorkspaceGroupable>(
  items: T[]
): Map<string, GroupedWorkspaceItems<T>> {
  const grouped = new Map<string, GroupedWorkspaceItems<T>>();
  if (!items || items.length === 0) {
    return grouped;
  }

  for (const item of items) {
    const key = item.workspaceFolderUri || 'unknown_workspace';
    const name = item.workspaceFolderName || (item.workspaceFolderUri ? `Workspace (${item.workspaceFolderUri.substring(item.workspaceFolderUri.lastIndexOf('/') + 1)})` : 'Unknown Workspace');

    if (!grouped.has(key)) {
      grouped.set(key, { name, items: [] });
    }
    grouped.get(key)!.items.push(item);
  }
  return grouped;
}

(window as any).groupItemsByWorkspace = groupItemsByWorkspace;

/**
 * Defines a common structure for items that can be grouped by window.
 */
interface WindowGroupable {
  windowId?: string;
  [key: string]: any;
}

/**
 * Represents a group of window items, typically used for displaying search results or files grouped by their VS Code window.
 */
interface GroupedWindowItems<T extends WindowGroupable> {
  name: string;
  items: T[];
}

/**
 * Groups a list of items by their associated VS Code window.
 * @param items An array of items that implement the WindowGroupable interface.
 * @returns A Map where keys are window IDs (or 'unknown_window') and values are GroupedWindowItems.
 */
function groupItemsByWindow<T extends WindowGroupable>(
  items: T[]
): Map<string, GroupedWindowItems<T>> {
  const grouped = new Map<string, GroupedWindowItems<T>>();
  if (!items || items.length === 0) {
    return grouped;
  }

  for (const item of items) {
    const key = item.windowId || 'unknown_window';
    const name = item.windowId ? `Window: ${item.windowId.substring(0, 8)}` : 'Unknown Window';

    if (!grouped.has(key)) {
      grouped.set(key, { name, items: [] });
    }
    grouped.get(key)!.items.push(item);
  }
  return grouped;
}

(window as any).groupItemsByWindow = groupItemsByWindow;

interface LLMInputConfig {
  hostSuffix: string;
  selector: string;
  isContentEditable: boolean;
  isAttached?: boolean;
  attachedElement?: HTMLElement | null;
}

/**
 * Configuration for detecting and interacting with LLM input fields on various hostnames.
 * Each object defines a host suffix, a CSS selector for the input field, and whether it's content editable.
 * @constant
 * @type {LLMInputConfig[]}
 */
const llmInputsConfig: LLMInputConfig[] = [
  { hostSuffix: 'gemini.google.com', selector: 'div.ql-editor[contenteditable="true"][role="textbox"]', isContentEditable: true },
  { hostSuffix: 'chatgpt.com', selector: 'div#prompt-textarea[contenteditable="true"]', isContentEditable: true },
  { hostSuffix: 'claude.ai', selector: 'div.ProseMirror[contenteditable="true"]', isContentEditable: true },
  { hostSuffix: 'chat.deepseek.com', selector: 'textarea#chat-input', isContentEditable: false }
];

const eventHandlers = new Map<HTMLElement, (event: Event) => void>();


/**
 * Defines the context for the floating UI, indicating its current mode and any associated query.
 */
interface UIContext { // Kept for conceptual clarity in contentScript, though UIManager doesn't directly use it
  mode: 'general' | 'search';
  query?: string;
}

/**
 * Performs a search operation based on the provided query and updates the UI with the results.
 * @param query The search query string.
 * @returns {Promise<void>} A promise that resolves when the search and UI update are complete.
 */
async function performSearch(query: string): Promise<void> {
  if (!query || query.trim() === '') {
    uiManager.updateContent('<p>Type to search...</p>');
    return;
  }

  try {
    console.log(LOG_PREFIX_CS, `Sending SEARCH_WORKSPACE for query: "${query}"`);
    const response = await swClient.searchWorkspace(query, null);
    console.log(LOG_PREFIX_CS, 'Search response from service worker:', response);
    renderSearchResults(response, query);
  } catch (error: any) {
    console.error(LOG_PREFIX_CS, 'Error sending search request or processing response:', error);
    uiManager.showToast(`Search Error: ${error.message || 'Unknown error performing search.'}`, 'error');
  }
}

const debouncedPerformSearch = debounce(performSearch, 300);

// Helper to process a generic content insertion (file or entire folder)
/**
 * Processes the insertion of content (file, folder, file tree, or codebase) into the LLM input field.
 * Fetches the content from the service worker and inserts it, then updates context indicators.
 * @param itemMetadata Metadata about the item to be inserted, including its name, source ID, type, and URI.
 * @param itemDivForFeedback Optional. The HTML element associated with the item in the UI, used for visual feedback during processing.
 * @returns {Promise<void>} A promise that resolves when the content has been processed and inserted.
 */
async function processContentInsertion(
  itemMetadata: {
    name: string;
    contentSourceId: string;
    type: 'file' | 'folder' | 'FileTree' | 'codebase_content' | 'WorkspaceProblems'; // Expanded types for clarity
    uri?: string; // URI for fetching content (optional for FileTree/codebase_content if not directly URI-based)
    workspaceFolderUri?: string | null; // For folder content, file tree, codebase
  },
  itemDivForFeedback?: HTMLElement | null // Optional: for UI feedback like opacity
): Promise<void> {
  // CAPTURE TARGET ELEMENT EARLY
  const targetElementForThisOperation = stateManager.getCurrentTargetElementForPanel();

  if (!targetElementForThisOperation) {
    console.warn(LOG_PREFIX_CS, 'processContentInsertion: No target element at the start of operation. Aborting indicator rendering path.');
    // Decide if we should still try to insert text if target is lost, or show error.
    // For now, let's assume if target is lost, we might not want to proceed or show error.
    // This part depends on desired UX if target is lost mid-operation.
    // Let's focus on the successful path where targetElementForThisOperation is initially valid.
  }

  if (stateManager.isDuplicateContentSource(itemMetadata.contentSourceId)) {
    console.warn(LOG_PREFIX_CS, `Duplicate content source: ${itemMetadata.contentSourceId}. Label: "${itemMetadata.name}"`);
    uiManager.showError('Content Already Added', `Content from "${itemMetadata.name}" is already added.`);
    setTimeout(() => uiManager.hide(), 2000);
    return;
  }

  if (itemDivForFeedback) {
    itemDivForFeedback.style.opacity = '0.5';
    itemDivForFeedback.style.pointerEvents = 'none';
  }
  uiManager.showLoading(`Loading ${itemMetadata.name}...`, `Fetching content for ${itemMetadata.name}...`);

  try {
    let responsePayload: FileContentResponsePayload | FolderContentResponsePayload | FileTreeResponsePayload | EntireCodebaseResponsePayload | WorkspaceProblemsResponsePayload;
    let contentTag: 'FileContents' | 'FileTree' | 'WorkspaceProblems' = 'FileContents'; // Default for file/folder content

    if (itemMetadata.type === 'file') {
      responsePayload = await swClient.getFileContent(itemMetadata.uri!);
    } else if (itemMetadata.type === 'folder') {
      responsePayload = await swClient.getFolderContent(itemMetadata.uri!, itemMetadata.workspaceFolderUri || null);
    } else if (itemMetadata.type === 'FileTree') {
      contentTag = 'FileTree';
      responsePayload = await swClient.getFileTree(itemMetadata.workspaceFolderUri || null);
    } else if (itemMetadata.type === 'codebase_content') {
      responsePayload = await swClient.getEntireCodebase(itemMetadata.workspaceFolderUri || null);
    } else if (itemMetadata.type === 'WorkspaceProblems') {
      contentTag = 'WorkspaceProblems';
      responsePayload = await swClient.getWorkspaceProblems(itemMetadata.workspaceFolderUri!);
    } else {
      throw new Error(`Unsupported item type for processContentInsertion: ${itemMetadata.type}`);
    }

    if (responsePayload.success && responsePayload.data) {
      // Check if this is a WorkspaceProblems response with zero problems
      if (itemMetadata.type === 'WorkspaceProblems' && (responsePayload.data as any).problemCount === 0) {
        uiManager.showToast('No problems found in this workspace.', 'info');
        if (itemDivForFeedback) {
          itemDivForFeedback.style.opacity = '';
          itemDivForFeedback.style.pointerEvents = '';
        }
        // The loading overlay will be hidden by the 'finally' block
        return;
      }

      const actualData = responsePayload.data as any; // Cast to any to access specific data properties
      let contentToInsert: string;
      let metadataFromResponse: ContextBlockMetadata;

      if (itemMetadata.type === 'FileTree') {
        contentToInsert = actualData.fileTreeString;
        metadataFromResponse = actualData.metadata;
      } else if (itemMetadata.type === 'WorkspaceProblems') {
        contentToInsert = actualData.problemsString;
        metadataFromResponse = actualData.metadata;
      } else if (itemMetadata.type === 'file') {
        contentToInsert = formatFileContentsForLLM([actualData.fileData]);
        metadataFromResponse = actualData.metadata;
      } else { // 'folder' or 'codebase_content'
        contentToInsert = formatFileContentsForLLM(actualData.filesData);
        metadataFromResponse = actualData.metadata;
      }

      const uniqueBlockId = metadataFromResponse.unique_block_id || `cw-block-${Date.now()}`;
      // Correctly handle the new tag
      const finalContentToInsertInLLM = `<${contentTag} id="${uniqueBlockId}">\n${contentToInsert}\n</${contentTag}>`;

      insertTextIntoLLMInput(
        finalContentToInsertInLLM,
        targetElementForThisOperation, // Use the captured target
        stateManager.getOriginalQueryTextFromUI()
      );

      stateManager.addActiveContextBlock({ ...metadataFromResponse, unique_block_id: uniqueBlockId });

      // Ensure indicators are rendered using the target element valid at this point
      // BEFORE the UI is hidden and state is potentially cleared.
      if (targetElementForThisOperation) { // Check if we have a valid target from the start
        uiManager.renderContextIndicators(
          stateManager.getActiveContextBlocks(),
          targetElementForThisOperation // Pass the captured element
        );
      } else {
        // If targetElementForThisOperation was null from the start, indicators can't be rendered.
        // This case should be handled based on UX requirements (e.g., error, or silent fail of indicators).
        console.warn(LOG_PREFIX_CS, 'Cannot render indicators: target element was lost before/during operation.');
      }

      uiManager.hide();
    } else {
      uiManager.showToast(`Error Loading ${itemMetadata.name}: ${responsePayload.error || 'Failed to get content.'} (Code: ${responsePayload.errorCode || 'N/A'})`, 'error');
      if (itemDivForFeedback) {
        itemDivForFeedback.style.opacity = '';
        itemDivForFeedback.style.pointerEvents = '';
      }
    }
  } catch (error: any) {
    console.error(LOG_PREFIX_CS, `Error fetching content for ${itemMetadata.name}:`, error);
    uiManager.showToast(`Error Loading ${itemMetadata.name}: ${error.message || 'Failed to get content.'}`, 'error');
    if (itemDivForFeedback) {
      itemDivForFeedback.style.opacity = '';
      itemDivForFeedback.style.pointerEvents = '';
    }
  } finally {
    uiManager.hideLoading();
  }
}


/**
 * Creates an HTMLDivElement representing a single search result item.
 * @param result The search result data.
 * @param omitWorkspaceName If true, the workspace name will not be displayed in the item.
 * @returns {HTMLDivElement} The created div element for the search result item.
 */
function createSearchResultItemElement(result: SharedSearchResult, omitWorkspaceName: boolean): HTMLDivElement {
  const itemDiv = uiManager.createDiv({ classNames: ['search-result-item'] });

  const iconSpan = uiManager.createSpan({ classNames: [`${LOCAL_CSS_PREFIX}type-icon`], textContent: result.type === 'file' ? '📄' : '📁' });
  itemDiv.appendChild(iconSpan);

  const nameSpan = uiManager.createSpan({ textContent: result.name });
  itemDiv.appendChild(nameSpan);

  const detailsParts: string[] = [];
  // Only show relative path if it's different from the name, to reduce clutter like "src (src)"
  if (result.relativePath && result.relativePath !== result.name) {
    detailsParts.push(result.relativePath);
  }

  if (!omitWorkspaceName && result.workspaceFolderName) {
    detailsParts.push(result.workspaceFolderName);
  }

  if (detailsParts.length > 0) {
    const detailsText = ` (${detailsParts.join(' • ')})`; // Using a separator for clarity
    const detailsSpan = uiManager.createSpan({
      classNames: [`${LOCAL_CSS_PREFIX}relative-path`], // Re-use class for styling
      textContent: detailsText
    });
    itemDiv.appendChild(detailsSpan);
  }

  itemDiv.dataset.uri = result.uri;
  itemDiv.dataset.type = result.type;
  itemDiv.dataset.contentSourceId = result.content_source_id;
  if (result.workspaceFolderUri) {
    itemDiv.dataset.workspaceFolderUri = result.workspaceFolderUri;
  }

  itemDiv.onclick = async () => {
    const itemType = result.type; // 'file' or 'folder'
    const itemName = result.name;
    const itemUri = result.uri;
    const itemContentSourceId = result.content_source_id;
    const itemWorkspaceFolderUri = result.workspaceFolderUri;

    console.log(LOG_PREFIX_CS, `CLICKED ITEM: Name: "${itemName}", SourceID: "${itemContentSourceId}"`);
    console.log(LOG_PREFIX_CS, 'ACTIVE BLOCKS before check:', JSON.parse(JSON.stringify(stateManager.getActiveContextBlocks())));

    if (itemType === 'file') {
      await processContentInsertion({
        name: itemName,
        contentSourceId: itemContentSourceId,
        type: 'file',
        uri: itemUri
      }, itemDiv);
    } else if (itemType === 'folder') {
      console.log(LOG_PREFIX_CS, 'Folder clicked:', itemName);
      uiManager.updateTitle(`Folder: ${itemName}`);
      const folderUiContent = document.createDocumentFragment();

      const buttonRow = uiManager.createDiv({ classNames: [`${LOCAL_CSS_PREFIX}button-row`] });

      const insertAllButton = uiManager.createButton('➕ Insert All', {
        id: `${LOCAL_CSS_PREFIX}btn-insert-all-${itemContentSourceId.replace(/[^a-zA-Z0-9]/g, '_')}`,
        onClick: async () => {
          insertAllButton.disabled = true;
          insertAllButton.textContent = '➕ Loading...';
          browseButton.disabled = true;

          await processContentInsertion({
            name: itemName,
            contentSourceId: itemContentSourceId, // Use folder's content_source_id for duplicate check
            type: 'folder',
            uri: itemUri,
            workspaceFolderUri: itemWorkspaceFolderUri
          });

          // Re-enable buttons if UI is still visible (e.g., if processContentInsertion showed an error)
          if (document.getElementById(uiManager.getConstant('UI_PANEL_ID'))?.classList.contains(uiManager.getConstant('CSS_PREFIX') + 'visible')) {
            insertAllButton.disabled = false;
            insertAllButton.textContent = '➕ Insert All';
            browseButton.disabled = false;
          }
        }
      });
      buttonRow.appendChild(insertAllButton);

      const browseButton = uiManager.createButton('🔍 Browse', {
        id: `${LOCAL_CSS_PREFIX}btn-browse-folder-${itemContentSourceId.replace(/[^a-zA-Z0-9]/g, '_')}`.replace(/[^a-zA-Z0-9]/g, '_'),
        onClick: async () => {
          console.log(LOG_PREFIX_CS, 'Browse folder clicked:', itemName);
          uiManager.showLoading(`Browsing: ${itemName}`, 'Loading folder contents...');
          try {
            const browseResponse = await swClient.listFolderContents(itemUri, itemWorkspaceFolderUri || null);
            renderBrowseView(browseResponse, itemUri, itemName, itemWorkspaceFolderUri || null);
          } catch (error: any) {
            console.error(LOG_PREFIX_CS, 'Error getting folder contents:', error);
            uiManager.showToast(`Error Browsing ${itemName}: ${error.message || 'Failed to get folder contents.'}`, 'error');
          } finally {
            uiManager.hideLoading(); // Ensure loading indicator is hidden
          }
        }
      });
      buttonRow.appendChild(browseButton);
      folderUiContent.appendChild(buttonRow);

      const backButton = uiManager.createButton('Back to Search Results', {
        classNames: ['button-subtle'],
        onClick: () => {
          const currentSearchResponse = stateManager.getSearchResponse();
          const currentSearchQuery = stateManager.getSearchQuery();
          if (currentSearchResponse && currentSearchQuery) {
            renderSearchResults(currentSearchResponse, currentSearchQuery);
          } else {
            uiManager.showError('Navigation Error', 'Could not restore previous search results.');
          }
        }
      });
      folderUiContent.appendChild(backButton);
      uiManager.updateContent(folderUiContent);
    }
  };
  return itemDiv;
}


/**
 * Renders the search results in the floating UI.
 * @param response The search workspace response payload containing the results.
 * @param query The original search query.
 * @returns {void}
 */
function renderSearchResults(response: SearchWorkspaceResponsePayload, query: string): void {
  stateManager.setSearchResponse(response);
  stateManager.setSearchQuery(query);

  if (!response.success || response.error) {
    uiManager.showToast(`Search Error: ${response.error || 'Unknown error occurred'} (Code: ${response.errorCode || 'N/A'})`, 'error');
    return;
  }

  const titleText = `"@${query}"`;

  if (!response.data?.results || response.data.results.length === 0) {
    uiManager.updateTitle(titleText);
    uiManager.updateContent(uiManager.createParagraph({ textContent: `No results found for '@${query}'` }));
    return;
  }

  const contentFragment = document.createDocumentFragment();
  const results = response.data.results as SharedSearchResult[];

  // First group by window
  const groupedByWindow = groupItemsByWindow(results);

  // If we have results from multiple windows, show window grouping
  if (groupedByWindow.size > 1) {
    for (const [, windowGroupData] of groupedByWindow.entries()) {
      const windowHeader = uiManager.createDiv({
        classNames: [`${LOCAL_CSS_PREFIX}window-header`],
        textContent: windowGroupData.name,
        style: { fontWeight: 'bold', marginTop: '10px', marginBottom: '5px' }
      });
      contentFragment.appendChild(windowHeader);

      // Then group by workspace within each window
      const groupedByWorkspace = groupItemsByWorkspace(windowGroupData.items);

      if (groupedByWorkspace.size > 1) {
        for (const [, workspaceGroupData] of groupedByWorkspace.entries()) {
          const workspaceHeader = uiManager.createDiv({
            classNames: [`${LOCAL_CSS_PREFIX}group-header`],
            textContent: `  ${workspaceGroupData.name}`,
            style: { marginLeft: '15px' }
          });
          contentFragment.appendChild(workspaceHeader);
          workspaceGroupData.items.forEach(result => {
            const itemDiv = createSearchResultItemElement(result, true);
            itemDiv.style.marginLeft = '30px';
            contentFragment.appendChild(itemDiv);
          });
        }
      } else {
        windowGroupData.items.forEach(result => {
          const itemDiv = createSearchResultItemElement(result, false);
          itemDiv.style.marginLeft = '15px';
          contentFragment.appendChild(itemDiv);
        });
      }
    }
  } else {
    // Single window - always group by workspace for consistency
    const groupedResultsMap = groupItemsByWorkspace(results);

    // Always iterate and group, even for a single workspace.
    for (const [, groupData] of groupedResultsMap.entries()) {
      const groupHeader = uiManager.createDiv({ classNames: [`${LOCAL_CSS_PREFIX}group-header`], textContent: groupData.name });
      contentFragment.appendChild(groupHeader);

      // When grouping, we always want to omit the workspace name from the item line itself,
      // as the header provides the context.
      groupData.items.forEach(result => {
        const itemDiv = createSearchResultItemElement(result, true);
        contentFragment.appendChild(itemDiv);
      });
    }
  }

  uiManager.updateTitle(titleText);
  uiManager.updateContent(contentFragment);
}


/**
 * Formats an array of file data objects into a single string suitable for LLM input.
 * Each file's content is wrapped in a code block with its language ID, and the entire block is enclosed in `<FileContents>` tags.
 * @param filesData An array of objects, each containing `fullPath`, `content`, and `languageId` for a file.
 * @returns {string} The formatted string of file contents.
 */
function formatFileContentsForLLM(filesData: { fullPath: string; content: string; languageId: string }[]): string {
  if (!Array.isArray(filesData) || filesData.length === 0) {
    console.warn('[ContextWeaver CE] formatFileContentsForLLM: Invalid or empty filesData array.');
    return '';
  }
  const formattedBlocks = [];
  const tagsToNeutralize = ['FileContents', 'FileTree', 'CodeSnippet']; // Contains all wrapper tags we use

  for (const file of filesData) {
    if (file && typeof file.fullPath === 'string' && typeof file.content === 'string') {
      let processedContent = file.content;

      // Neutralize potential conflicting tags within the content to prevent premature matching by removal regex.
      // This involves inserting a zero-width space (U+200B) after '<' or '</' and before the tag name.
      // For example, "</FileContents>" becomes "</\u200BFileContents>" and "<FileContents>" becomes "<\u200BFileContents>".
      for (const tagName of tagsToNeutralize) {
        const closeTagPattern = new RegExp(`</${tagName}\\b`, 'g');
        processedContent = processedContent.replace(closeTagPattern, `</\u200B${tagName}`);

        const openTagPattern = new RegExp(`<${tagName}\\b`, 'g');
        processedContent = processedContent.replace(openTagPattern, `<\u200B${tagName}`);
      }

      const langId = (typeof file.languageId === 'string' && file.languageId) ? file.languageId : 'plaintext';
      let fileBlock = `File: ${file.fullPath}\n`;
      fileBlock += `\`\`\`${langId}\n`;
      // Use processed content
      fileBlock += processedContent.endsWith('\n') ? processedContent : `${processedContent}\n`;
      fileBlock += '```\n';
      formattedBlocks.push(fileBlock);
    } else {
      console.warn('[ContextWeaver CE] formatFileContentsForLLM: Skipping invalid file data object:', file);
    }
  }
  if (formattedBlocks.length === 0) return '';
  // Return only the concatenated blocks. The caller is responsible for the final wrapper tag with ID.
  return formattedBlocks.join('');
}

/**
 * Creates a DocumentFragment containing general options for content insertion, such as active file, open files, and workspace folders.
 * @param workspaceDetails Details about the current VS Code workspace.
 * @returns {DocumentFragment} A document fragment containing the general options UI elements.
 */
function createGeneralOptionsSection(workspaceDetails: WorkspaceDetailsResponsePayload['data']): DocumentFragment {
  const contentFragment = document.createDocumentFragment();

  const activeFileButton = uiManager.createButton('📄 Active File', {
    id: `${LOCAL_CSS_PREFIX}btn-active-file`,
    classNames: ['vertical-button'],
    onClick: async () => {
      console.log('ContextWeaver: "📄 Active File" clicked');
      activeFileButton.textContent = '📄 Loading...';
      activeFileButton.disabled = true;
      try {
        const activeFileInfoResponse = await swClient.getActiveFileInfo();
        console.log('ContextWeaver: Active file info response:', activeFileInfoResponse);

        if (activeFileInfoResponse.success && activeFileInfoResponse.data && activeFileInfoResponse.data.activeFilePath) {
          const activeFilePath = activeFileInfoResponse.data.activeFilePath;
          const activeFileContentSourceId = activeFilePath;

          await processContentInsertion({
            name: activeFileInfoResponse.data.activeFileLabel || 'the active file',
            contentSourceId: activeFileContentSourceId,
            type: 'file',
            uri: activeFilePath
          }, activeFileButton); // Pass button for feedback

        } else {
          const errorMsg = activeFileInfoResponse.error || 'Could not get active file information from VS Code. Is a file editor active?';
          console.error('ContextWeaver: Error getting active file info:', errorMsg);
          uiManager.showToast(`Active File Error: ${errorMsg} (Code: ${activeFileInfoResponse.errorCode || 'N/A'})`, 'error');
        }
      } catch (e: any) {
        console.error('ContextWeaver: Error in active file workflow:', e);
        uiManager.showToast(`Active File Error: ${e.message || 'Failed to process active file request.'}`, 'error');
      } finally {
        if (document.getElementById(uiManager.getConstant('UI_PANEL_ID'))?.classList.contains(uiManager.getConstant('CSS_PREFIX') + 'visible')) {
          activeFileButton.textContent = '📄 Active File';
          activeFileButton.disabled = false;
        }
      }
    }
  });
  contentFragment.appendChild(activeFileButton);

  const openFilesButton = uiManager.createButton('📂 Open Files', {
    id: `${LOCAL_CSS_PREFIX}btn-open-files`,
    classNames: ['vertical-button'],
    onClick: async () => {
      console.log('ContextWeaver: "📂 Open Files" clicked');
      openFilesButton.textContent = '📂 Loading...';
      openFilesButton.disabled = true;
      try {
        const openFilesResponse = await swClient.getOpenFiles();
        console.log('ContextWeaver: Open files response:', openFilesResponse);

        if (openFilesResponse.success && openFilesResponse.data && Array.isArray(openFilesResponse.data.openFiles)) {
          displayOpenFilesSelectorUI(openFilesResponse.data.openFiles);
        } else {
          const errorMsg = openFilesResponse.error || 'Failed to get open files list.';
          console.error('ContextWeaver: Error getting open files list:', errorMsg);
          uiManager.showToast(`Open Files Error: ${errorMsg} (Code: ${openFilesResponse.errorCode || 'N/A'})`, 'error');
        }
      } catch (e: any) {
        console.error('ContextWeaver: Error in open files workflow:', e);
        uiManager.showToast(`Open Files Error: ${e.message || 'Failed to process open files request.'}`, 'error');
      } finally {
        if (document.getElementById(uiManager.getConstant('UI_PANEL_ID'))?.classList.contains(uiManager.getConstant('CSS_PREFIX') + 'visible') && !document.querySelector(`.${LOCAL_CSS_PREFIX}open-files-selector`)) {
          openFilesButton.textContent = '📂 Open Files';
          openFilesButton.disabled = false;
        }
      }
    }
  });
  contentFragment.appendChild(openFilesButton);

  if (workspaceDetails?.workspaceFolders && workspaceDetails.workspaceFolders.length > 0) {
    const separator = document.createElement('hr');
    separator.style.margin = '10px 0';
    separator.style.borderColor = '#4a4a4a';
    contentFragment.appendChild(separator);

    const showFolderGrouping = workspaceDetails.workspaceFolders.length > 1;
    renderWorkspaceFolders(workspaceDetails.workspaceFolders, contentFragment, showFolderGrouping);
  } else {
    if (contentFragment.childNodes.length === 0) {
      uiManager.showToast('No Workspace Open: No workspace folder open in VS Code. Some options may be limited.', 'info');
    }
  }
  return contentFragment;
}

/**
 * Populates the floating UI with content based on the provided UI context.
 * This can trigger a search or display general workspace options.
 * @param uiContext The context determining what content to display in the UI.
 * @returns {Promise<void>} A promise that resolves when the UI content has been populated.
 */
async function populateFloatingUiContent(uiContext: UIContext): Promise<void> {
  if (uiContext.mode === 'search' && uiContext.query?.trim()) {
    debouncedPerformSearch(uiContext.query);
    return;
  }

  uiManager.showLoading('ContextWeaver', 'Loading workspace details...');

  try {
    const response = await swClient.getWorkspaceDetails();
    console.log('ContextWeaver: Workspace details response:', response);

    if (response.error || !response.success) {
      uiManager.showToast(`Workspace Error: ${response.error || 'Unknown error'} (Code: ${response.errorCode || 'N/A'})`, 'error');
      return;
    }

    if (response.data) {
      if (!response.data.isTrusted) {
        uiManager.showToast('Workspace Untrusted: Workspace not trusted. Please trust the workspace in VS Code to proceed.', 'error');
        return;
      }

      // Update title based on the workspace name if available, otherwise fallback
      if (response.data.workspaceName) {
        uiManager.updateTitle(response.data.workspaceName);
      } else if (response.data.workspaceFolders && response.data.workspaceFolders.length > 0) {
        // Fallback to first folder name if workspaceName is not available for some reason
        uiManager.updateTitle(response.data.workspaceFolders[0].name || 'ContextWeaver');
      } else {
        uiManager.updateTitle('ContextWeaver');
      }

      const generalOptionsFragment = createGeneralOptionsSection(response.data);
      uiManager.updateContent(generalOptionsFragment);
    } else {
      uiManager.showToast('Connection Issue: Could not retrieve workspace details. Is ContextWeaver VSCode extension running and connected?', 'error');
    }
  } catch (error: any) {
    console.error('ContextWeaver: Error requesting workspace details from service worker:', error);
    uiManager.showToast(`Communication Error: ${error.message || 'Failed to communicate with service worker.'}`, 'error');
  } finally {
    uiManager.hideLoading();
  }
}


/**
 * Handles the removal of a context indicator and the corresponding content block from the LLM input field.
 * @param uniqueBlockId The unique identifier of the block to be removed.
 * @param blockType The type of the block (e.g., 'file_content', 'CodeSnippet').
 * @returns {void}
 */
function handleRemoveContextIndicator(uniqueBlockId: string, blockType: string): void {
  console.log(LOG_PREFIX_CS, `Request to remove indicator for block ID: ${uniqueBlockId}, Type: ${blockType}`);
  if (!uniqueBlockId || typeof uniqueBlockId !== 'string') {
    console.error(LOG_PREFIX_CS, 'Cannot remove block: uniqueId is invalid.', uniqueBlockId);
    stateManager.removeActiveContextBlock(uniqueBlockId);
    // When the target element is uncertain, passing null to renderContextIndicators might be safer,
    // or always try to get the latest target element from stateManager.
    // To maintain consistency with existing logic, if we exit early, we might not be able to determine currentTargetElement.
    renderContextIndicators(stateManager.getCurrentTargetElementForPanel());
    return;
  }

  let tagNameForRegex = '';
  if (blockType === 'file_content' || blockType === 'folder_content' || blockType === 'codebase_content') {
    tagNameForRegex = 'FileContents';
  } else if (blockType === 'CodeSnippet') {
    tagNameForRegex = 'CodeSnippet';
  } else if (blockType === 'FileTree') {
    tagNameForRegex = 'FileTree';
  } else if (blockType === 'WorkspaceProblems') {
    tagNameForRegex = 'WorkspaceProblems';
  } else {
    console.warn(LOG_PREFIX_CS, `Unknown blockType for removal: ${blockType}`);
    stateManager.removeActiveContextBlock(uniqueBlockId);
    renderContextIndicators(stateManager.getCurrentTargetElementForPanel());
    return;
  }

  const escapedUniqueId = uniqueBlockId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Unified and more robust regex for block removal:
  // - (${tagNameForRegex}) captures the tag name (e.g., "FileContents") into capture group 1.
  // - \\b ensures tagNameForRegex is a whole word (e.g., prevents matching "FileContents-extra").
  // - [^>]* matches any characters inside the opening tag before '>', including other attributes.
  // - \\bid=["']${escapedUniqueId}["'] matches the id attribute (ensuring "id" is a whole word).
  // - ([\\s\\S]*?) non-greedily captures all content between the tags (including newlines) into capture group 2.
  // - </\\1> uses a back-reference \\1 to ensure the closing tag matches the captured opening tag name.
  const blockRegex = new RegExp(
    `<(${tagNameForRegex})\\b[^>]*\\bid=["']${escapedUniqueId}["'][^>]*>([\\s\\S]*?)</\\1>`,
    'g'
  );

  const currentTargetElement = stateManager.getCurrentTargetElementForPanel();
  if (currentTargetElement) {
    if ('value' in currentTargetElement && typeof (currentTargetElement as HTMLTextAreaElement).selectionStart === 'number') {
      const textArea = currentTargetElement as HTMLTextAreaElement;
      const originalValue = textArea.value;

      // --- Detailed Debugging Logs Start ---
      console.groupCollapsed(`${LOG_PREFIX_CS} Block Removal Debug - ID: ${uniqueBlockId}`);
      console.log('Block Type:', blockType, 'Tag Name:', tagNameForRegex);
      console.log('Regex Used:', blockRegex.toString());
      console.log('Attempting to operate on originalValue (length ' + originalValue.length + '):');
      // To prevent console freezing, only print partial content or markers
      // console.log("'''\n" + originalValue.substring(0, 2000) + "\n''' (first 2000 chars)");
      // console.log("'''\n" + originalValue.substring(Math.max(0, originalValue.length - 2000)) + "\n''' (last 2000 chars)");

      // Use exec to check match details
      const execRegex = new RegExp(blockRegex.source, 'g'); // Create new RegExp instance for exec to reset lastIndex
      let match;
      let matchFound = false;
      while ((match = execRegex.exec(originalValue)) !== null) {
        matchFound = true;
        console.log('Regex exec match found at index:', match.index);
        console.log('Full matched string (match[0]) (length ' + match[0].length + '):');
        console.log('\'\'\'\n' + match[0] + '\n\'\'\'');
        console.log('Captured tag name (match[1]):', match[1]);
        console.log('Captured content (match[2]) (length ' + match[2].length + '):');
        console.log('\'\'\'\n' + match[2] + '\n\'\'\'');

        // Print content immediately following the match in the original string
        const afterMatchIndex = match.index + match[0].length;
        const textAfterMatch = originalValue.substring(afterMatchIndex, afterMatchIndex + 100);
        console.log(`Text in originalValue immediately AFTER the matched block (from index ${afterMatchIndex}, next 100 chars):`);
        console.log('\'\'\'\n' + textAfterMatch + '\n\'\'\'');
      }
      if (!matchFound) {
        console.log('No matches found by regex.exec().');
      }
      console.groupEnd();
      // --- Detailed Debugging Logs End ---

      textArea.value = originalValue.replace(blockRegex, '');

      // Debug log: value after replacement
      // console.log(`${LOG_PREFIX_CS} Textarea value after replace (length ${textArea.value.length}):\n`, textArea.value);

      if (originalValue.length !== textArea.value.length) {
        console.log(LOG_PREFIX_CS, `Removed text block ${uniqueBlockId} (type: ${blockType}, tag: ${tagNameForRegex}) from TEXTAREA value.`);
        textArea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      } else {
        console.warn(LOG_PREFIX_CS, `Could not find/remove text block ${uniqueBlockId} (type: ${blockType}, tag: ${tagNameForRegex}) in TEXTAREA value using regex. Regex used: ${blockRegex.toString()}`);
      }
    } else if (currentTargetElement.isContentEditable) {
      const blockInEditor = currentTargetElement.querySelector(`[id="${uniqueBlockId}"]`);
      if (blockInEditor && blockInEditor.tagName.toLowerCase() === tagNameForRegex.toLowerCase()) {
        blockInEditor.remove();
        console.log(LOG_PREFIX_CS, `Removed text block ${uniqueBlockId} (type: ${blockType}, tag: ${tagNameForRegex}) from ContentEditable via querySelector by ID.`);
        currentTargetElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      } else {
        console.warn(LOG_PREFIX_CS, `Could not find text block ${uniqueBlockId} (type: ${blockType}, tag: ${tagNameForRegex}) in ContentEditable via querySelector by ID, or tag name mismatch. Block found:`, blockInEditor);
      }
    }
  } else {
    console.warn(LOG_PREFIX_CS, `currentTargetElementForPanel is null, cannot remove block ${uniqueBlockId}.`);
  }

  stateManager.removeActiveContextBlock(uniqueBlockId);
  renderContextIndicators(currentTargetElement);
}

uiManager.setIndicatorCallbacks(handleRemoveContextIndicator);

/**
 * Renders or updates the context indicators displayed in the LLM input field.
 * @param explicitTarget The specific HTML element where indicators should be rendered.
 * @returns {void}
 */
function renderContextIndicators(explicitTarget: HTMLElement | null): void {
  uiManager.renderContextIndicators(
    stateManager.getActiveContextBlocks(),
    explicitTarget
  );
}


// --- Text Insertion ---
/**
 * Inserts text into the target LLM input field, handling both textarea and contenteditable elements.
 * It attempts to replace the original trigger query if present.
 * @param textToInsert The text content to be inserted.
 * @param targetInput The HTML element (textarea or contenteditable div) where the text should be inserted.
 * @param triggerQuery Optional. The original query text that triggered the insertion (e.g., "search_term" from "@search_term").
 */
function insertTextIntoLLMInput(
  textToInsert: string,
  targetInput: HTMLElement | null,
  triggerQuery?: string // This is the query part only, e.g., "search_term"
): void {
  if (!targetInput) {
    console.error(LOG_PREFIX_CS, 'No target input field to insert text into.');
    return;
  }
  targetInput.focus();

  const fullTriggerTextToReplace = triggerQuery ? `@${triggerQuery}` : '@'; // The text we aim to replace

  if (targetInput instanceof HTMLTextAreaElement) {
    handleTextAreaInsertion(targetInput, textToInsert, fullTriggerTextToReplace);
  } else if (targetInput.isContentEditable) {
    handleContentEditableInsertion(targetInput, textToInsert, fullTriggerTextToReplace);
  } else {
    console.warn(LOG_PREFIX_CS, 'Target input field is neither a textarea nor contenteditable.');
    return;
  }
  console.log(LOG_PREFIX_CS, 'Text insertion attempt completed.');
}

/**
 * Handles the insertion of text into a textarea element.
 * The new content is prepended to the top of the input field, and the original text (minus the trigger) remains below.
 * The input field is then scrolled to the bottom.
 * @param textArea The HTMLTextAreaElement to insert text into.
 * @param textToInsert The text content to be inserted.
 * @param fullTriggerToReplace The full trigger string (e.g., "@" or "@query") to be replaced.
 * @param isSearchTrigger Boolean indicating if the insertion was triggered by a search query.
 */
function handleTextAreaInsertion(
  textArea: HTMLTextAreaElement,
  textToInsert: string,
  fullTriggerToReplace: string
): void {
  const originalValue = textArea.value;

  // 1. Find boundary of all existing CW blocks
  const wrapperTags = ['FileContents', 'FileTree', 'CodeSnippet'];
  let lastWrapperEndIndex = -1;

  for (const tagName of wrapperTags) {
    const closingTag = `</${tagName}>`;
    const lastIndex = originalValue.lastIndexOf(closingTag);
    if (lastIndex !== -1) {
      const endIndex = lastIndex + closingTag.length;
      if (endIndex > lastWrapperEndIndex) {
        lastWrapperEndIndex = endIndex;
      }
    }
  }

  let managedContent = '';
  let userContent = originalValue;

  // 2. Split content based on the last found wrapper tag
  if (lastWrapperEndIndex !== -1) {
    managedContent = originalValue.substring(0, lastWrapperEndIndex).trimEnd();
    userContent = originalValue.substring(lastWrapperEndIndex);
  }

  // 3. Remove the trigger text from the user-typed portion of the content
  const userContentWithoutTrigger = userContent.replace(fullTriggerToReplace, '');

  // 4. Construct the new value with the correct insertion order
  const separator = userContentWithoutTrigger.trim().length > 0 ? '\n\n' : '';
  const newBlockSeparator = managedContent.length > 0 ? '\n\n' : '';

  textArea.value = managedContent + newBlockSeparator + textToInsert + separator + userContentWithoutTrigger.trimStart();

  // After setting the value, move the cursor to the end.
  const endPosition = textArea.value.length;
  textArea.selectionStart = endPosition;
  textArea.selectionEnd = endPosition;

  console.log(LOG_PREFIX_CS, `Inserted content with trigger "${fullTriggerToReplace}" in textarea.`);

  // Dispatch event to notify the host application of the change
  textArea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

  // Scroll to bottom after a short delay to allow for re-render
  setTimeout(() => {
    textArea.scrollTop = textArea.scrollHeight;
  }, 0);
}

// Helper to get text before cursor in a textarea
/**
 * Helper function to get the text content in a textarea before the specified cursor position.
 * @param textArea The HTMLTextAreaElement.
 * @param cursorPos The current cursor position.
 * @returns The substring of the textarea's value from the beginning up to the cursor position.
 */
function textBeforeCursor(textArea: HTMLTextAreaElement, cursorPos: number): string {
  return textArea.value.substring(0, cursorPos);
}

/**
 * Handles the insertion of text into a contenteditable HTML element.
 * The new content is prepended to the top of the input field, and the original text (minus the trigger) remains below.
 * The input field is then scrolled to the bottom, and the cursor is moved to the end of the input.
 * @param targetInput The contenteditable HTML element to insert text into.
 * @param textToInsert The text content (can be HTML) to be inserted.
 * @param fullTriggerToReplace The full trigger string (e.g., "@" or "@query") to be replaced.
 * @param isSearchTrigger Boolean indicating if the insertion was triggered by a search query.
 */
function handleContentEditableInsertion(
  targetInput: HTMLElement,
  textToInsert: string,
  fullTriggerToReplace: string
): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    console.warn(LOG_PREFIX_CS, 'Cannot insert into contentEditable: No selection or range.');
    return;
  }

  let range = selection.getRangeAt(0);

  // --- Best-effort trigger replacement (Unchanged) ---
  if (fullTriggerToReplace.length > 0 && range.collapsed) {
    const container = range.startContainer;
    const offset = range.startOffset;

    if (container.nodeType === Node.TEXT_NODE && container.textContent) {
      const textContentBeforeCursor = container.textContent.substring(0, offset);
      const lastAtIndex = textContentBeforeCursor.lastIndexOf(fullTriggerToReplace);

      if (lastAtIndex !== -1 && (offset - (lastAtIndex + fullTriggerToReplace.length) < 5)) {
        const triggerRange = document.createRange();
        triggerRange.setStart(container, lastAtIndex);
        triggerRange.setEnd(container, lastAtIndex + fullTriggerToReplace.length);
        selection.removeAllRanges();
        selection.addRange(triggerRange);
        range = triggerRange;
        console.log(LOG_PREFIX_CS, `Identified trigger "${fullTriggerToReplace}" in contentEditable for replacement.`);
      }
    }
  }
  // --- End of trigger replacement ---

  // Delete contents of the range (removes trigger text)
  range.deleteContents();

  // --- NEW INSERTION LOGIC ---
  // 1. Find the last existing CW block element
  const wrapperTags = ['FileContents', 'FileTree', 'CodeSnippet'];
  const allWrappers = Array.from(targetInput.querySelectorAll(wrapperTags.join(',')));
  const lastWrapperElement = allWrappers.length > 0 ? allWrappers[allWrappers.length - 1] : null;

  // 2. Create the fragment to insert
  const tempDoc = document.implementation.createHTMLDocument();
  const tempContainer = tempDoc.createElement('div');
  tempContainer.innerHTML = textToInsert;
  const fragment = document.createDocumentFragment();
  while (tempContainer.firstChild) {
    fragment.appendChild(tempContainer.firstChild);
  }

  // 3. Insert the new fragment at the correct position
  if (lastWrapperElement) {
    // There are existing blocks. Insert after the last one, with separators.
    const br1 = document.createElement('br');
    const br2 = document.createElement('br');
    lastWrapperElement.after(br1, br2, fragment); // .after() inserts nodes in order
    console.log(LOG_PREFIX_CS, 'Appended new content block after existing blocks in contentEditable.');
  } else {
    // This is the first block. Prepend it.
    // Add separators before the new content if user text already exists.
    if (targetInput.innerHTML.trim().length > 0) {
      const br1 = document.createElement('br');
      const br2 = document.createElement('br');
      targetInput.insertBefore(br2, targetInput.firstChild);
      targetInput.insertBefore(br1, targetInput.firstChild);
    }
    targetInput.insertBefore(fragment, targetInput.firstChild);
    console.log(LOG_PREFIX_CS, 'Prepended first content block to contentEditable.');
  }

  // --- Move cursor to the end and scroll to bottom (Unchanged) ---
  selection.removeAllRanges();
  const newRange = document.createRange();
  newRange.selectNodeContents(targetInput);
  newRange.collapse(false); // false collapses to the end
  selection.addRange(newRange);

  targetInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

  setTimeout(() => {
    targetInput.scrollTop = targetInput.scrollHeight;
  }, 0);
}


// --- Event Listener Attachment ---
/**
 * Attaches an 'input' event listener to the specified LLM input field to detect trigger characters.
 * @param inputField The HTML element (textarea or contenteditable div) to attach the listener to.
 * @param config The LLMInputConfig object associated with this input field.
 */
function attachListenerToInputField(inputField: HTMLElement, config: LLMInputConfig): void {
  if (config.attachedElement && config.attachedElement.isSameNode(inputField) && eventHandlers.has(inputField)) {
    return;
  }
  if (config.attachedElement && eventHandlers.has(config.attachedElement)) {
    const oldHandler = eventHandlers.get(config.attachedElement);
    if (oldHandler) {
      config.attachedElement.removeEventListener('input', oldHandler);
      eventHandlers.delete(config.attachedElement);
    }
  }

  console.log('ContextWeaver: Attaching listener to input field:', inputField, `with selector: ${config.selector}`);
  inputField.dataset.cwSelector = config.selector;

  const handleSpecificEvent = () => {
    const fieldToRead = inputField as HTMLTextAreaElement | HTMLElement;
    let rawValue = '';
    let cursorPos = 0;

    if (config.isContentEditable) {
      rawValue = fieldToRead.innerText || '';
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        cursorPos = selection.getRangeAt(0).startOffset;
      } else {
        cursorPos = rawValue.length;
      }
    } else {
      rawValue = (fieldToRead as HTMLTextAreaElement).value || '';
      cursorPos = (fieldToRead as HTMLTextAreaElement).selectionStart || 0;
    }

    // --- Step 1: Detect Trigger ---
    // Regex looks for '@' followed by zero or more non-whitespace characters, AT THE END of the substring up to the cursor.
    const textBeforeCursor = rawValue.substring(0, cursorPos);
    const atMatch = /@(\S*)$/.exec(textBeforeCursor);

    if (atMatch) {
      const fullTriggerText = atMatch[0]; // e.g., "@" or "@searchQuery"
      const queryText = atMatch[1];     // e.g., "" or "searchQuery"

      // --- Step 2: Determine UI Mode and Action ---
      // Hide UI if it's visible for a different input field
      if (document.getElementById(uiManager.getConstant('UI_PANEL_ID'))?.classList.contains(uiManager.getConstant('CSS_PREFIX') + 'visible') &&
        stateManager.getCurrentTargetElementForPanel() !== inputField) {
        uiManager.hide(); // This will also trigger stateManager.onUiHidden() via its callback
      }

      stateManager.setCurrentTargetElementForPanel(inputField); // Set current target

      if (queryText.length > 0) {
        // Search Mode: Triggered if there are non-whitespace characters after @
        console.log(LOG_PREFIX_CS, `Search trigger detected. Query: "${queryText}"`);
        stateManager.setOriginalQueryTextFromUI(queryText);
        uiManager.show(
          inputField,
          `"@${queryText}"`, // Set concise title immediately
          null, // Pass null to show an empty content area initially
          () => {
            console.log(LOG_PREFIX_CS, 'UI hidden (search mode), callback from UIManager.');
            stateManager.onUiHidden();
          }
        );
        populateFloatingUiContent({ mode: 'search', query: queryText });
      } else {
        // General Mode: Triggered if it's just "@" or "@ " (space after @)
        // The regex ensures `queryText` is empty if it's just "@".
        // We also need to consider if the character immediately after "@" in the raw input is a space,
        // or if the trigger is at the very end of the input.
        const charImmediatelyAfterAt = rawValue.charAt(textBeforeCursor.lastIndexOf('@') + 1);
        const isAtAloneOrFollowedBySpace = fullTriggerText === '@' || charImmediatelyAfterAt === ' ';

        if (isAtAloneOrFollowedBySpace) {
          console.log(LOG_PREFIX_CS, 'General trigger detected (\'@\' or \'@ \' or \'@\' at end of query).');
          stateManager.setOriginalQueryTextFromUI(undefined); // No specific query text for general mode
          uiManager.show(
            inputField,
            'ContextWeaver',
            uiManager.createParagraph({ classNames: [`${LOCAL_CSS_PREFIX}loading-text`], textContent: 'Loading options...' }),
            () => {
              console.log(LOG_PREFIX_CS, 'UI hidden (general mode), callback from UIManager.');
              stateManager.onUiHidden();
            }
          );
          populateFloatingUiContent({ mode: 'general' });
        } else {
          // This case might occur if the regex matches "@" but the character after it is not a space,
          // and queryText is empty (e.g. user typed "@a" then deleted "a" but cursor is still after @).
          // In this scenario, we probably don't want to show the general UI yet,
          // as the user might be about to type a search query.
          // So, if it's not clearly a search and not clearly "@" or "@ ", we can choose to hide or do nothing.
          // Hiding seems safer to avoid a lingering general UI if the user is mid-typing a search query.
          if (document.getElementById(uiManager.getConstant('UI_PANEL_ID'))?.classList.contains(uiManager.getConstant('CSS_PREFIX') + 'visible') &&
            stateManager.getCurrentTargetElementForPanel()?.isSameNode(inputField)) {
            console.log(LOG_PREFIX_CS, 'Ambiguous \'@\' trigger (not search, not general), hiding UI if currently shown for this input.');
            uiManager.hide();
          }
        }
      }
    } else {
      // No valid "@" trigger ending at the cursor. Hide UI if it's currently shown for this input field.
      if (document.getElementById(uiManager.getConstant('UI_PANEL_ID'))?.classList.contains(uiManager.getConstant('CSS_PREFIX') + 'visible') &&
        stateManager.getCurrentTargetElementForPanel()?.isSameNode(inputField)) {
        console.log(LOG_PREFIX_CS, 'No valid \'@\' trigger found at cursor, hiding UI.');
        uiManager.hide();
      }
    }
    // --- Step 3: Sync Indicators with Input Content ---
    // After any input, check if any context blocks were manually deleted by the user.
    if (stateManager.getActiveContextBlocks().length > 0) {
      const currentContent = config.isContentEditable
        ? (fieldToRead as HTMLElement).innerHTML
        : (fieldToRead as HTMLTextAreaElement).value;

      const blocksToRemove: string[] = [];
      for (const block of stateManager.getActiveContextBlocks()) {
        if (!currentContent.includes(`id="${block.unique_block_id}"`)) {
          blocksToRemove.push(block.unique_block_id);
        }
      }

      if (blocksToRemove.length > 0) {
        console.log(LOG_PREFIX_CS, `Detected manual removal of ${blocksToRemove.length} context blocks. Syncing indicators.`);
        for (const blockId of blocksToRemove) {
          stateManager.removeActiveContextBlock(blockId);
        }
        renderContextIndicators(inputField); // Re-render indicators
      }
    }
  };

  inputField.addEventListener('input', handleSpecificEvent);
  eventHandlers.set(inputField, handleSpecificEvent);
  config.attachedElement = inputField;
  config.isAttached = true;
}

// --- Initialization and Observation ---
/**
 * Initializes the trigger detection mechanism by identifying LLM input fields on the current page
 * and attaching event listeners or MutationObservers as needed.
 */
function initializeTriggerDetection(): void {
  const currentHostname = window.location.hostname;
  console.log(`ContextWeaver: Initializing trigger detection on ${currentHostname}`);

  for (const config of llmInputsConfig) {
    if (currentHostname.includes(config.hostSuffix)) {
      console.log(`ContextWeaver: Hostname match for ${config.hostSuffix}. Looking for selector: ${config.selector}`);
      const inputField = document.querySelector(config.selector) as HTMLElement;
      if (inputField) {
        attachListenerToInputField(inputField, config);
      } else {
        console.log(`ContextWeaver: Input field ${config.selector} not found immediately. Setting up MutationObserver.`);
        observeForElement(config);
      }
    }
  }
}

/**
 * Sets up a MutationObserver to watch for the presence of a specific LLM input element
 * if it's not immediately available on page load.
 * @param config The LLMInputConfig object for the element to observe.
 */
function observeForElement(config: LLMInputConfig): void {
  if (config.isAttached && config.attachedElement && document.body.contains(config.attachedElement)) {
    return;
  }
  config.isAttached = false;
  config.attachedElement = null;

  const observer = new MutationObserver(() => {
    if (config.isAttached && config.attachedElement && document.body.contains(config.attachedElement)) {
      return;
    }
    const inputField = document.querySelector(config.selector) as HTMLElement;
    if (inputField) {
      console.log(`ContextWeaver: Element with selector ${config.selector} found/re-found by MutationObserver.`);
      attachListenerToInputField(inputField, config);
    }
  });
  console.log(`ContextWeaver: Setting up/re-arming MutationObserver for selector: ${config.selector}`);
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeTriggerDetection);
} else {
  initializeTriggerDetection();
}

/**
 * Attempts to find an active (visible and interactable) LLM input field on the current page.
 * This is used as a fallback if the primary target element is lost.
 * @returns The active LLM input HTMLElement if found, otherwise null.
 */
function findActiveLLMInput(): HTMLElement | null {
  const currentHostname = window.location.hostname;
  for (const config of llmInputsConfig) {
    if (currentHostname.includes(config.hostSuffix)) {
      const inputField = document.querySelector(config.selector) as HTMLElement;
      if (inputField && inputField.offsetParent !== null) {
        console.log(LOG_PREFIX_CS, 'findActiveLLMInput: Found active LLM input field:', inputField);
        return inputField;
      }
    }
  }
  console.warn(LOG_PREFIX_CS, 'findActiveLLMInput: No active LLM input field found on the page.');
  return null;
}

chrome.runtime.onMessage.addListener((message) => {
  console.log('ContextWeaver (contentScript.ts): Message received', message);

  if (message.type === 'push' && message.command === 'push_snippet') {
    const snippetData = message.payload;
    console.log('ContextWeaver: Received snippet to insert:', snippetData);

    let targetInputElement = stateManager.getCurrentTargetElementForPanel();
    if (!targetInputElement) {
      console.log(LOG_PREFIX_CS, 'currentTargetElementForPanel is null, attempting to find active LLM input for snippet insertion.');
      targetInputElement = findActiveLLMInput();
    }

    if (targetInputElement) {
      if (snippetData.metadata) {
        const uniqueBlockId = snippetData.metadata.unique_block_id || `cw-snippet-${Date.now()}`;
        const langId = snippetData.language || 'plaintext';
        let formattedSnippet = `<CodeSnippet id="${uniqueBlockId}">\n`;
        formattedSnippet += `File: ${snippetData.filePath}\n`;
        formattedSnippet += `lines: ${snippetData.startLine}-${snippetData.endLine}\n`;
        formattedSnippet += `\`\`\`${langId}\n`;
        formattedSnippet += snippetData.snippet.endsWith('\n') ? snippetData.snippet : `${snippetData.snippet}\n`;
        formattedSnippet += '```\n';
        formattedSnippet += '</CodeSnippet>';

        if (!stateManager.getCurrentTargetElementForPanel() && targetInputElement) {
          stateManager.setCurrentTargetElementForPanel(targetInputElement);
        }
        insertTextIntoLLMInput(formattedSnippet, targetInputElement);

        stateManager.addActiveContextBlock({
          unique_block_id: snippetData.metadata.unique_block_id,
          content_source_id: snippetData.metadata.content_source_id,
          label: snippetData.metadata.label,
          type: snippetData.metadata.type,
          workspaceFolderName: snippetData.metadata.workspaceFolderName,
          workspaceFolderUri: snippetData.metadata.workspaceFolderUri,
          windowId: snippetData.metadata.windowId
        });
        console.log(LOG_PREFIX_CS, 'Added snippet to activeContextBlocks:', snippetData.metadata);
        renderContextIndicators(targetInputElement);
      } else {
        console.warn(LOG_PREFIX_CS, 'Snippet received without metadata, cannot create indicator:', snippetData);
      }
    } else {
      console.warn('ContextWeaver: No target LLM input element known or found for snippet insertion.');
    }
    uiManager.hideLoading(); // Hide loading after snippet insertion attempt
    return false;
  } else if (message.type === 'ERROR_FROM_SERVICE_WORKER' || message.type === 'ERROR_FROM_VSCE_IPC') {
    console.error(`ContextWeaver: Error received: ${message.payload.message}`);
    if (document.getElementById(uiManager.getConstant('UI_PANEL_ID'))?.classList.contains(uiManager.getConstant('CSS_PREFIX') + 'visible')) {
      uiManager.showToast(`Extension Error: ${message.payload.message} (Code: ${message.payload.errorCode || 'N/A'})`, 'error');
    }
    uiManager.hideLoading(); // Hide loading on error
    return false;
  }
  return false;
});


/**
 * Renders buttons for inserting file trees and full codebase content for each workspace folder.
 * @param workspaceFolders An array of workspace folder objects.
 * @param targetContentArea The DocumentFragment or HTMLElement where the buttons should be appended.
 * @param showFolderGrouping Boolean indicating whether to group buttons under folder titles.
 */
function renderWorkspaceFolders(workspaceFolders: any[], targetContentArea: DocumentFragment, showFolderGrouping: boolean): void {
  workspaceFolders.forEach(folder => {
    let sectionContainer: DocumentFragment | HTMLDivElement = targetContentArea;

    if (showFolderGrouping) {
      const folderSectionDiv = uiManager.createDiv({ classNames: [`${LOCAL_CSS_PREFIX}folder-section`] });
      const folderTitleDiv = uiManager.createDiv({ classNames: [`${LOCAL_CSS_PREFIX}folder-title`], textContent: folder.name || 'Workspace Folder' });
      folderSectionDiv.appendChild(folderTitleDiv);
      targetContentArea.appendChild(folderSectionDiv);
      sectionContainer = folderSectionDiv;
    }

    const fileTreeButton = uiManager.createButton('🌲 File Tree', {
      id: `${LOCAL_CSS_PREFIX}btn-file-tree-${folder.uri.replace(/[^a-zA-Z0-9]/g, '_')}`,
      classNames: ['vertical-button'],
      onClick: async () => {
        await processContentInsertion({
          name: `🌲 File Tree - ${folder.name}`,
          contentSourceId: `${folder.uri}::FileTree`,
          type: 'FileTree',
          workspaceFolderUri: folder.uri
        });
      }
    });
    sectionContainer.appendChild(fileTreeButton);

    const fullCodebaseButton = uiManager.createButton('📚 Codebase', {
      id: `${LOCAL_CSS_PREFIX}btn-full-codebase-${folder.uri.replace(/[^a-zA-Z0-9]/g, '_')}`,
      classNames: ['vertical-button'],
      onClick: async () => {
        await processContentInsertion({
          name: `📚 Codebase - ${folder.name}`,
          contentSourceId: `${folder.uri}::codebase`,
          type: 'codebase_content',
          workspaceFolderUri: folder.uri
        });
      }
    });
    sectionContainer.appendChild(fullCodebaseButton);

    const problemsButton = uiManager.createButton('❗ Problems', {
      id: `${LOCAL_CSS_PREFIX}btn-problems-${folder.uri.replace(/[^a-zA-Z0-9]/g, '_')}`,
      classNames: ['vertical-button'],
      onClick: async () => {
        await processContentInsertion({
          name: `❗ Problems - ${folder.name}`,
          contentSourceId: `${folder.uri}::Problems`,
          type: 'WorkspaceProblems',
          workspaceFolderUri: folder.uri
        });
      }
    });
    sectionContainer.appendChild(problemsButton);
  });
}

// Helper for individual browse item
/**
 * Creates an HTMLDivElement representing a single browsable item (file or folder) with a checkbox.
 * @param entry The directory entry data (file or folder).
 * @returns {HTMLDivElement} The created div element for the browse item.
 */
function createBrowseItemElement(entry: CWDirectoryEntry): HTMLDivElement { // Use aliased type
  const itemDiv = uiManager.createDiv({ classNames: [`${LOCAL_CSS_PREFIX}browse-item`] });

  const checkbox = uiManager.createCheckbox({
    checked: true,
    dataset: {
      uri: entry.uri,
      type: entry.type,
      contentSourceId: entry.content_source_id,
      name: entry.name // Add name for processContentInsertion
    }
  });

  const isDuplicate = stateManager.isDuplicateContentSource(entry.content_source_id);
  if (isDuplicate) {
    checkbox.disabled = true;
    itemDiv.style.opacity = '0.6';
    itemDiv.title = 'Already added to context';
  }

  const iconSpan = uiManager.createSpan({ textContent: entry.type === 'file' ? '📄' : '📁', style: { marginRight: '8px' } });
  const nameSpan = uiManager.createSpan({ textContent: entry.name });

  itemDiv.appendChild(checkbox);
  itemDiv.appendChild(iconSpan);
  itemDiv.appendChild(nameSpan);
  return itemDiv;
}

// Helper for browse view buttons
/**
 * Creates the action buttons for the browse view (Insert Selected Items, Back).
 * @param listContainer The HTML element containing the list of browsable items.
 * @param parentFolderUri The URI of the parent folder being browsed.
 * @param parentFolderName The name of the parent folder being browsed.
 * @param workspaceFolderUri The URI of the workspace folder the parent folder belongs to.
 * @returns {HTMLDivElement} The created div element containing the buttons.
 */
function createBrowseViewButtons(
  listContainer: HTMLElement,
  parentFolderUri: string,
  parentFolderName: string,
  workspaceFolderUri: string | null
): HTMLDivElement {
  const buttonContainer = uiManager.createDiv({ style: { marginTop: '10px' } });
  const insertButton = uiManager.createButton('Insert Selected Items', {
    onClick: async () => {
      interface SelectedBrowseEntry { // Define local interface for clarity
        uri: string;
        type: 'file' | 'folder';
        contentSourceId: string;
        name: string;
      }

      const selectedEntries: SelectedBrowseEntry[] = Array.from(listContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked:not(:disabled)'))
        .map(cb => ({
          uri: cb.dataset.uri!,
          type: cb.dataset.type! as 'file' | 'folder',
          contentSourceId: cb.dataset.contentSourceId!,
          name: cb.dataset.name! // Added missing 'name' property
        }));

      if (selectedEntries.length === 0) {
        const tempMsg = uiManager.createParagraph({ textContent: 'No items selected.', style: { color: 'orange' } });
        buttonContainer.appendChild(tempMsg);
        uiManager.updateContent(uiManager.createDiv({ children: [listContainer, buttonContainer, tempMsg] })); // Re-render with message
        setTimeout(() => { if (tempMsg.parentNode) tempMsg.parentNode.removeChild(tempMsg); }, 2000);
        return;
      }

      insertButton.disabled = true;
      insertButton.textContent = `Loading ${selectedEntries.length} selected items...`;
      const progressDiv = uiManager.createDiv({ classNames: [`${LOCAL_CSS_PREFIX}progress`], style: { marginTop: '10px' } });
      buttonContainer.appendChild(progressDiv);
      uiManager.updateContent(uiManager.createDiv({ children: [listContainer, buttonContainer, progressDiv] })); // Re-render with progress

      let successCount = 0;
      let failureCount = 0;
      let allContentToInsert = '';
      const newContextBlocks: ContextBlockMetadata[] = [];

      try {
        for (let i = 0; i < selectedEntries.length; i++) {
          const entry = selectedEntries[i];
          progressDiv.textContent = `Processing item ${i + 1} of ${selectedEntries.length}: ${entry.name}...`;

          try {
            let responsePayload: FileContentResponsePayload | FolderContentResponsePayload;
            if (entry.type === 'file') {
              responsePayload = await swClient.getFileContent(entry.uri);
            } else { // 'folder'
              responsePayload = await swClient.getFolderContent(entry.uri, workspaceFolderUri);
            }

            if (responsePayload.success && responsePayload.data) {
              const actualData = responsePayload.data as any;
              const filesToFormat = entry.type === 'file' ? [actualData.fileData] : actualData.filesData;
              const metadataFromResponse = actualData.metadata as ContextBlockMetadata;

              const uniqueBlockId = metadataFromResponse.unique_block_id || `cw-block-${Date.now()}`;
              const rawContent = formatFileContentsForLLM(filesToFormat);
              const contentTag = 'FileContents'; // Always FileContents for these types
              const finalBlock = `<${contentTag} id="${uniqueBlockId}">\n${rawContent}\n</${contentTag}>`;
              allContentToInsert += finalBlock + '\n\n';
              newContextBlocks.push({ ...metadataFromResponse, unique_block_id: uniqueBlockId });
              successCount++;
            } else {
              failureCount++;
              console.warn(LOG_PREFIX_CS, `Failed to get content for ${entry.name}: ${responsePayload.error || 'No data'}`);
            }
          } catch (innerError: any) {
            failureCount++;
            console.error(LOG_PREFIX_CS, `Error fetching content for ${entry.name}:`, innerError);
          }
        }

        if (successCount > 0) {
          insertTextIntoLLMInput(allContentToInsert.trim(), stateManager.getCurrentTargetElementForPanel(), stateManager.getOriginalQueryTextFromUI());
          newContextBlocks.forEach(block => stateManager.addActiveContextBlock(block));
          renderContextIndicators(stateManager.getCurrentTargetElementForPanel());
          uiManager.hide();
        } else {
          uiManager.showToast('Insertion Failed: Failed to insert any of the selected items.', 'error');
        }
        if (failureCount > 0) console.warn(LOG_PREFIX_CS, `${failureCount} items failed to insert.`);
      } catch (error: any) {
        console.error(LOG_PREFIX_CS, 'Error processing selected items:', error);
        uiManager.showToast(`Insertion Error: ${error.message || 'Failed to process selected items.'}`, 'error');
      } finally {
        uiManager.hideLoading(); // Hide loading for this operation
        if (document.getElementById(uiManager.getConstant('UI_PANEL_ID'))?.classList.contains(uiManager.getConstant('CSS_PREFIX') + 'visible')) {
          insertButton.disabled = false;
          insertButton.textContent = 'Insert Selected Items';
          if (progressDiv.parentNode) progressDiv.parentNode.removeChild(progressDiv);
        }
      }
    }
  });
  buttonContainer.appendChild(insertButton);

  const backButton = uiManager.createButton('Back', {
    style: { marginLeft: '10px' },
    onClick: () => {
      const currentSearchResponse = stateManager.getSearchResponse();
      const currentSearchQuery = stateManager.getSearchQuery();
      if (currentSearchResponse && currentSearchQuery) {
        renderSearchResults(currentSearchResponse, currentSearchQuery);
      } else {
        uiManager.showToast('Navigation Error: Could not restore previous search results.', 'error');
      }
    }
  });
  buttonContainer.appendChild(backButton);
  return buttonContainer;
}

/**
 * Renders the browse view for a specific folder, displaying its contents and providing options to insert selected items.
 * @param browseResponse The response payload containing the folder's contents.
 * @param parentFolderUri The URI of the parent folder being browsed.
 * @param parentFolderName The name of the parent folder being browsed.
 * @param workspaceFolderUri The URI of the workspace folder the parent folder belongs to.
 * @returns {void}
 */
function renderBrowseView(browseResponse: ListFolderContentsResponsePayload, parentFolderUri: string, parentFolderName: string, workspaceFolderUri: string | null): void {
  if (!browseResponse.success || !browseResponse.data?.entries) {
    uiManager.showToast(`Error Browsing ${parentFolderName}: ${browseResponse.error || 'Failed to load folder contents.'} (Code: ${browseResponse.errorCode || 'N/A'})`, 'error');
    return;
  }

  const contentFragment = document.createDocumentFragment();
  uiManager.updateTitle(`Browsing: ${parentFolderName}`);


  if (browseResponse.data.filterTypeApplied === 'default') {
    const filterStatusMessage = uiManager.createParagraph({ classNames: [`${LOCAL_CSS_PREFIX}filter-status-text`], textContent: '(Using default ignore rules for this listing)' });
    contentFragment.appendChild(filterStatusMessage);
  }

  const listContainer = uiManager.createDiv({ style: { maxHeight: '250px', overflowY: 'auto', marginBottom: '10px' } });

  browseResponse.data.entries.forEach((entry: CWDirectoryEntry) => { // Use aliased type
    const itemDiv = createBrowseItemElement(entry);
    listContainer.appendChild(itemDiv);
  });
  contentFragment.appendChild(listContainer);

  const buttonContainer = createBrowseViewButtons(listContainer, parentFolderUri, parentFolderName, workspaceFolderUri);
  contentFragment.appendChild(buttonContainer);
  uiManager.updateContent(contentFragment);
}

// Helper for individual open file list item
/**
 * Creates an HTMLDivElement representing a single open file in the selection list.
 * @param file The file object containing path, name, and workspace details.
 * @param groupedOpenFilesMapSize The size of the map used for grouping open files, to determine if workspace name should be shown.
 * @returns {HTMLDivElement} The created div element for the open file list item.
 */
function createOpenFilesListItem(file: { path: string; name: string; workspaceFolderUri: string | null; workspaceFolderName: string | null }, groupedOpenFilesMapSize: number): HTMLDivElement {
  const listItem = uiManager.createDiv({ style: { marginBottom: '5px', padding: '3px', borderBottom: '1px solid #3a3a3a' } });
  const checkboxId = `${LOCAL_CSS_PREFIX}openfile-${file.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const checkbox = uiManager.createCheckbox({ id: checkboxId, checked: true, dataset: { value: file.path } });

  let labelText = file.name;
  // Check if there's only one workspace or if it's an 'unknown_workspace' group
  if (file.workspaceFolderName && (groupedOpenFilesMapSize === 0 || (groupedOpenFilesMapSize === 1 && groupItemsByWorkspace([file]).keys().next().value === 'unknown_workspace'))) { // Corrected .keys().next().value
    labelText += ` (${file.workspaceFolderName})`;
  }
  const label = uiManager.createLabel(labelText, checkboxId, { style: { fontSize: '13px' } });

  if (stateManager.isDuplicateContentSource(file.path)) {
    checkbox.disabled = true;
    label.style.textDecoration = 'line-through';
    label.title = 'This file has already been added to the context.';
    const alreadyAddedSpan = uiManager.createSpan({ textContent: ' (already added)', style: { fontStyle: 'italic', color: '#888' } });
    label.appendChild(alreadyAddedSpan);
  }
  listItem.appendChild(checkbox);
  listItem.appendChild(label);
  return listItem;
}

// Helper for open files form and buttons
/**
 * Creates the form elements for the open files selector UI, including the list of files and action buttons.
 * @param openFilesList An array of open file objects.
 * @param groupedOpenFilesMap A Map of open files grouped by workspace.
 * @returns {HTMLFormElement} The created form element.
 */
function createOpenFilesFormElements(
  openFilesList: { path: string; name: string; workspaceFolderUri: string | null; workspaceFolderName: string | null; windowId?: string }[],
  groupedByWindow: Map<string, GroupedWindowItems<{ path: string; name: string; workspaceFolderUri: string | null; workspaceFolderName: string | null; windowId?: string }>>
): HTMLFormElement {
  const form = document.createElement('form');
  const listContainer = uiManager.createDiv({ style: { maxHeight: '250px', overflowY: 'auto', marginBottom: '10px' } });

  // If we have files from multiple windows, show window grouping
  if (groupedByWindow.size > 1) {
    for (const [, windowGroupData] of groupedByWindow.entries()) {
      const windowHeader = uiManager.createDiv({
        classNames: [`${LOCAL_CSS_PREFIX}window-header`],
        textContent: windowGroupData.name,
        style: { fontWeight: 'bold', marginTop: '10px', marginBottom: '5px' }
      });
      listContainer.appendChild(windowHeader);

      // Then group by workspace within each window
      const groupedByWorkspace = groupItemsByWorkspace(windowGroupData.items);

      if (groupedByWorkspace.size > 1) {
        for (const [, workspaceGroupData] of groupedByWorkspace.entries()) {
          const workspaceHeader = uiManager.createDiv({
            classNames: [`${LOCAL_CSS_PREFIX}group-header`],
            textContent: `  ${workspaceGroupData.name}`,
            style: { marginLeft: '15px' }
          });
          listContainer.appendChild(workspaceHeader);
          workspaceGroupData.items.forEach(file => {
            const listItem = createOpenFilesListItem(file, groupedByWorkspace.size);
            listItem.style.marginLeft = '30px';
            listContainer.appendChild(listItem);
          });
        }
      } else {
        windowGroupData.items.forEach(file => {
          const listItem = createOpenFilesListItem(file, 1);
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
        const groupHeader = uiManager.createDiv({ classNames: [`${LOCAL_CSS_PREFIX}group-header`], textContent: groupData.name });
        listContainer.appendChild(groupHeader);
        groupData.items.forEach(file => {
          const listItem = createOpenFilesListItem(file, groupedByWorkspace.size);
          listContainer.appendChild(listItem);
        });
      }
    } else {
      openFilesList.forEach(file => {
        const listItem = createOpenFilesListItem(file, groupedByWorkspace.size);
        listContainer.appendChild(listItem);
      });
    }
  }
  form.appendChild(listContainer);

  const insertButton = uiManager.createButton('Insert Selected Files', {
    onClick: async () => {
      const selectedFiles = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked:not(:disabled)'))
        .map(cb => cb.dataset.value!);

      if (selectedFiles.length === 0) {
        const tempMsg = uiManager.createParagraph({ textContent: 'No new files selected.', style: { color: 'orange' } });
        form.appendChild(tempMsg);
        setTimeout(() => { if (tempMsg.parentNode) tempMsg.parentNode.removeChild(tempMsg); }, 2000);
        return;
      }

      insertButton.textContent = 'Loading Content...';
      insertButton.disabled = true;

      try {
        const response = await swClient.getContentsForSelectedOpenFiles(selectedFiles);

        if (response.success && response.data) {
          const successfulFiles = response.data;
          let allContentToInsert = '';
          successfulFiles.forEach(item => {
            const rawContent = formatFileContentsForLLM([item.fileData]);
            const uniqueBlockId = item.metadata.unique_block_id || `cw-block-${Date.now()}`;
            const contentTag = 'FileContents'; // This flow only deals with FileContents
            const finalBlock = `<${contentTag} id="${uniqueBlockId}">\n${rawContent}\n</${contentTag}>`;
            allContentToInsert += finalBlock + '\n\n';
            stateManager.addActiveContextBlock({ ...item.metadata, unique_block_id: uniqueBlockId });
          });

          if (allContentToInsert.trim()) {
            insertTextIntoLLMInput(allContentToInsert.trim(), stateManager.getCurrentTargetElementForPanel());
            renderContextIndicators(stateManager.getCurrentTargetElementForPanel());
          }
          uiManager.hide();
          if (response.errors && response.errors.length > 0) {
            console.warn('ContextWeaver: Some files failed to load:', response.errors);
          }
        } else {
          uiManager.showToast(`File Content Error: ${response.error || 'Unknown error fetching content.'} (Code: ${response.errorCode || 'N/A'})`, 'error');
        }
      } catch (e: any) {
        console.error('ContextWeaver: Error requesting selected files content:', e);
        uiManager.showToast(`File Content Error: ${e.message || 'Failed to process request.'}`, 'error');
      } finally {
        uiManager.hideLoading(); // Hide loading for this operation
      }
    }
  });
  form.appendChild(insertButton);

  const backButton = uiManager.createButton('Back', {
    style: { marginLeft: '10px' },
    onClick: () => {
      populateFloatingUiContent({ mode: 'general' });
    }
  });
  form.appendChild(backButton);

  return form;
}

/**
 * Displays the UI for selecting open files to insert their content.
 * @param openFilesList An array of open file objects to display.
 * @returns {void}
 */
function displayOpenFilesSelectorUI(
  openFilesList: { path: string; name: string; workspaceFolderUri: string | null; workspaceFolderName: string | null; windowId?: string }[] // Updated type to include windowId
): void {
  uiManager.updateTitle('Select Open Files');
  const selectorWrapper = uiManager.createDiv({ classNames: [`${LOCAL_CSS_PREFIX}open-files-selector`] });


  if (openFilesList.length === 0) {
    uiManager.showToast('No Open Files: No open (saved) files found in trusted workspace(s).', 'info');
    const backButton = uiManager.createButton('Back', { onClick: () => populateFloatingUiContent({ mode: 'general' }) });
    selectorWrapper.appendChild(uiManager.createParagraph({ textContent: 'No open (saved) files found in trusted workspace(s).' }));
    selectorWrapper.appendChild(backButton);
    uiManager.updateContent(selectorWrapper);
    return;
  }

  // First group by window, then by workspace
  const groupedByWindow = groupItemsByWindow(openFilesList);
  const form = createOpenFilesFormElements(openFilesList, groupedByWindow);

  selectorWrapper.appendChild(form);
  uiManager.updateContent(selectorWrapper);
}
