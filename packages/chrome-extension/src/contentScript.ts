/**
 * @file contentScript.ts
 * @description Content script for ContextWeaver Chrome Extension.
 * Handles detection of the '@' trigger in designated LLM chat input fields and
 * manages the floating UI.
 * @module ContextWeaver/CE
 */

const LOG_PREFIX_CS = '[ContextWeaver CS]';
const CSS_PREFIX = 'cw-';
console.log(`${LOG_PREFIX_CS} Content script loaded.`);

interface ActiveContextBlock {
  uniqueBlockId: string;
  contentSourceId: string;
  label: string;
  type: string;
}

let activeContextBlocks: ActiveContextBlock[] = [];
const CONTEXT_INDICATOR_AREA_ID = `${CSS_PREFIX}context-indicator-area`;
const CONTEXT_BLOCK_CLASS = `${CSS_PREFIX}context-block`;

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

// --- Configuration for LLM Inputs ---
interface LLMInputConfig {
  hostSuffix: string;
  selector: string;
  isContentEditable: boolean;
  isAttached?: boolean;
  attachedElement?: HTMLElement | null;
}

const llmInputsConfig: LLMInputConfig[] = [
  { hostSuffix: 'gemini.google.com', selector: 'div.ql-editor[contenteditable=\\\"true\\\"][role=\\\"textbox\\\"]', isContentEditable: true },
  { hostSuffix: 'chatgpt.com', selector: 'div#prompt-textarea[contenteditable=\\\"true\\\"]', isContentEditable: true },
  { hostSuffix: 'claude.ai', selector: 'div.ProseMirror[contenteditable=\\\"true\\\"]', isContentEditable: true },
  { hostSuffix: 'chat.deepseek.com', selector: 'textarea#chat-input', isContentEditable: false }
];

// --- Global state for UI and listeners ---
const eventHandlers = new Map<HTMLElement, (event: Event) => void>();
let floatingUIPanel: HTMLElement | null = null;
let currentTargetElementForPanel: HTMLElement | null = null;
let originalQueryTextFromUI: string | undefined = undefined;
const UI_PANEL_ID = 'contextweaver-floating-panel';

interface UIContext {
  mode: 'general' | 'search';
  query?: string;
}

interface SearchResponse {
  success: boolean;
  error?: string;
  data?: {
    results: SearchResult[];
  };
}

interface SearchResult {
  path: string;
  name: string;
  type: 'file' | 'folder';
  uri: string;
  content_source_id: string;
  workspaceFolderUri: string | null;
  workspaceFolderName: string | null;
}

async function performSearch(query: string): Promise<void> {
  if (!floatingUIPanel || !query || query.trim() === "") {
    const contentArea = floatingUIPanel?.querySelector(`.${CSS_PREFIX}content`) as HTMLElement;
    if (contentArea) contentArea.innerHTML = '<p>Type to search...</p>';
    return;
  }

  const titleArea = floatingUIPanel.querySelector(`.${CSS_PREFIX}title`) as HTMLElement;
  const contentArea = floatingUIPanel.querySelector(`.${CSS_PREFIX}content`) as HTMLElement;

  if (titleArea) titleArea.textContent = `Searching for "@${query}"...`;
  if (contentArea) contentArea.innerHTML = '<p>Loading results...</p>';

  try {
    console.log(LOG_PREFIX_CS, `Sending SEARCH_WORKSPACE for query: "${query}"`);
    const response = await chrome.runtime.sendMessage({
      type: 'SEARCH_WORKSPACE',
      payload: { query: query, workspaceFolderUri: null }
    });
    console.log(LOG_PREFIX_CS, 'Search response from service worker:', response);
    renderSearchResults(response, query);
  } catch (error: any) {
    console.error(LOG_PREFIX_CS, 'Error sending search request or processing response:', error);
    if (contentArea) {
      contentArea.innerHTML = `<p>Error performing search: ${error.message || 'Unknown error'}</p>`;
    }
  }
}

const debouncedPerformSearch = debounce(performSearch, 300);

let searchResponse: SearchResponse | null = null;
let searchQuery: string | null = null;

function renderSearchResults(response: SearchResponse, query: string): void {
  searchResponse = response;
  searchQuery = query;
  if (!floatingUIPanel) return;

  const titleArea = floatingUIPanel.querySelector(`.${CSS_PREFIX}title`) as HTMLElement;
  const contentArea = floatingUIPanel.querySelector(`.${CSS_PREFIX}content`) as HTMLElement;

  if (!titleArea || !contentArea) return;

  if (!response.success || response.error) {
    titleArea.textContent = 'Search Error';
    contentArea.innerHTML = `<p>Error: ${response.error || 'Unknown error occurred'}</p>`;
    return;
  }

  titleArea.textContent = `Results for "@${query}"`;

  if (!response.data?.results || response.data.results.length === 0) {
    contentArea.innerHTML = `<p>No results found for '@${query}'</p>`;
    return;
  }

  contentArea.innerHTML = '';
  const results = response.data.results as SearchResult[];

  results.forEach(result => {
    const itemDiv = document.createElement('div');
    itemDiv.className = `${CSS_PREFIX}search-result-item`;

    const iconSpan = document.createElement('span');
    iconSpan.className = `${CSS_PREFIX}type-icon`;
    iconSpan.textContent = result.type === 'file' ? '📄' : '📁';
    itemDiv.appendChild(iconSpan);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = result.name;
    itemDiv.appendChild(nameSpan);

    if (result.workspaceFolderName) {
      const workspaceSpan = document.createElement('span');
      workspaceSpan.className = 'workspace-name';
      workspaceSpan.textContent = `(${result.workspaceFolderName})`;
      itemDiv.appendChild(workspaceSpan);
    }

    itemDiv.dataset.uri = result.uri;
    itemDiv.dataset.type = result.type;
    itemDiv.dataset.contentSourceId = result.content_source_id;
    if (result.workspaceFolderUri) {
      itemDiv.dataset.workspaceFolderUri = result.workspaceFolderUri;
    }

    itemDiv.onclick = async () => {
      const fileUri = itemDiv.dataset.uri!;
      const fileType = itemDiv.dataset.type as 'file' | 'folder';
      const fileContentSourceId = itemDiv.dataset.contentSourceId!;
      const fileName = itemDiv.textContent?.replace(/📄|📁|\s*\(.*\)$/g, '').trim() || 'unknown file';
      const originalQueryText = (floatingUIPanel?.querySelector(`.${CSS_PREFIX}title`) as HTMLElement)
        ?.textContent?.match(/@(.*)"\.\.\.$$/)?.[1] || '';

      console.log(LOG_PREFIX_CS, `CLICKED ITEM: Name: "${fileName}", SourceID: "${fileContentSourceId}"`);
      console.log(LOG_PREFIX_CS, `ACTIVE BLOCKS before check:`, JSON.parse(JSON.stringify(activeContextBlocks))); // Deep copy for logging

      const isDuplicate = activeContextBlocks.some(block => block.contentSourceId === fileContentSourceId);
      console.log(LOG_PREFIX_CS, `IS DUPLICATE? ${isDuplicate}`);

      if (fileType === 'folder') {
        console.log(LOG_PREFIX_CS, 'Folder clicked:', fileName);
        contentArea.innerHTML = '';
        titleArea.textContent = `Folder: ${fileName}`;

        // Create "Insert All Content" button
        const insertAllButton = document.createElement('button');
        insertAllButton.className = `${CSS_PREFIX}button`;
        insertAllButton.textContent = `Insert All Content from ${fileName}`;
        insertAllButton.id = `${CSS_PREFIX}btn-insert-all-${fileContentSourceId.replace(/[^a-zA-Z0-9]/g, '_')}`;
        insertAllButton.onclick = async () => {
          // Check for duplicates
          if (isDuplicate) {
            contentArea.innerHTML = `<p>Content from folder '${fileName}' is already added.</p>`;
            setTimeout(() => hideFloatingUi(), 2000);
            return;
          }

          // Show loading state
          insertAllButton.disabled = true;
          insertAllButton.textContent = `Loading all content from ${fileName}...`;
          browseButton.disabled = true;
          backButton.disabled = true;

          try {
            const folderContentResponse = await chrome.runtime.sendMessage({
              type: 'GET_FOLDER_CONTENT',
              payload: {
                folderPath: fileUri,
                workspaceFolderUri: itemDiv.dataset.workspaceFolderUri || null
              }
            });

            if (folderContentResponse.success && folderContentResponse.data?.filesData) {
              const { filesData, metadata } = folderContentResponse.data;
              const uniqueBlockId = metadata.unique_block_id || `cw-block-${Date.now()}`;
              const formattedContent = formatFileContentsForLLM(filesData);
              const contentToInsertInLLM = formattedContent.replace('<file_contents>', `<file_contents id="${uniqueBlockId}">`);

              insertTextIntoLLMInput(contentToInsertInLLM, currentTargetElementForPanel, originalQueryText);

              activeContextBlocks.push({
                uniqueBlockId,
                contentSourceId: metadata.content_source_id,
                label: metadata.label,
                type: metadata.type
              });

              renderContextIndicators();
              hideFloatingUi();
            } else {
              contentArea.innerHTML = `<p>Error: ${folderContentResponse.error || 'Failed to get folder content'}</p>`;
            }
          } catch (error: any) {
            console.error(LOG_PREFIX_CS, 'Error fetching folder content:', error);
            contentArea.innerHTML = `<p>Error: ${error.message || 'Failed to get folder content'}</p>`;
          } finally {
            insertAllButton.disabled = false;
            insertAllButton.textContent = `Insert All Content from ${fileName}`;
            browseButton.disabled = false;
            backButton.disabled = false;
          }
        };
        contentArea.appendChild(insertAllButton);

        // Create "Browse Files" button
        const browseButton = document.createElement('button');
        browseButton.className = `${CSS_PREFIX}button`;
        browseButton.textContent = `Browse Files in ${fileName}`;
        browseButton.id = `${CSS_PREFIX}btn-browse-folder-${fileContentSourceId.replace(/[^a-zA-Z0-9]/g, '_')}`;
        browseButton.onclick = async () => {
          console.log(LOG_PREFIX_CS, 'Browse folder clicked for:', fileName);
          titleArea.textContent = `Browsing: ${fileName}`;
          contentArea.innerHTML = '<p>Loading folder contents...</p>';

          try {
            const browseResponse = await chrome.runtime.sendMessage({
              type: 'LIST_FOLDER_CONTENTS',
              payload: { 
                folderUri: fileUri,
                workspaceFolderUri: itemDiv.dataset.workspaceFolderUri || null
              }
            });
            renderBrowseView(browseResponse, fileUri, fileName, itemDiv.dataset.workspaceFolderUri || null);
          } catch (error: any) {
            console.error(LOG_PREFIX_CS, 'Error getting folder contents:', error);
            contentArea.innerHTML = `<p>Error: ${error.message || 'Failed to get folder contents'}</p>`;
          }
        };
        contentArea.appendChild(browseButton);

        // Create "Back to Search Results" button
        const backButton = document.createElement('button');
        backButton.className = `${CSS_PREFIX}button`;
        backButton.textContent = 'Back to Search Results';
        backButton.style.marginTop = '10px';
        backButton.onclick = () => {
          // Re-render the search results if we have them
          if (searchResponse && searchQuery) {
            renderSearchResults(searchResponse, searchQuery);
          } else {
            contentArea.innerHTML = '<p>Could not restore previous search results.</p>';
          }
        };
        contentArea.appendChild(backButton);

        return;
      }

      if (isDuplicate) {
        console.warn(LOG_PREFIX_CS, `Duplicate content source: ${fileContentSourceId}. Label: "${fileName}"`);
        contentArea.innerHTML = `<p>Content from "${fileName}" is already added.</p>`;
        setTimeout(() => hideFloatingUi(), 2000);
        return;
      }

      itemDiv.style.opacity = '0.5';
      itemDiv.style.pointerEvents = 'none';
      titleArea.textContent = `Loading ${fileName}...`;
      contentArea.innerHTML = `<p>Loading content for ${fileName}...</p>`;

      try {
        const contentResponse = await chrome.runtime.sendMessage({
          type: 'GET_FILE_CONTENT',
          payload: { filePath: fileUri }
        });

        if (contentResponse.success && contentResponse.data?.fileData) {
          const { fileData, metadata } = contentResponse.data;
          const uniqueBlockId = metadata.unique_block_id || `cw-block-${Date.now()}`;
          const contentTag = metadata.type === 'code_snippet' ? 'code_snippet' : 'file_contents';

          // Format the content first
          const formattedContent = formatFileContentsForLLM([fileData]);

          const contentToInsertInLLM = formattedContent.replace(
            `<${contentTag}>`,
            `<${contentTag} id="${uniqueBlockId}">`
          );

          insertTextIntoLLMInput(contentToInsertInLLM, currentTargetElementForPanel, originalQueryTextFromUI);

          activeContextBlocks.push({
            uniqueBlockId,
            contentSourceId: metadata.content_source_id,
            label: metadata.label,
            type: metadata.type
          });
          const newBlockToAdd = activeContextBlocks[activeContextBlocks.length - 1];
          console.log(LOG_PREFIX_CS, `ADDED TO activeContextBlocks: Name: "${newBlockToAdd.label}", SourceID: "${newBlockToAdd.contentSourceId}"`);
          console.log(LOG_PREFIX_CS, `ACTIVE BLOCKS after add:`, JSON.parse(JSON.stringify(activeContextBlocks)));

          renderContextIndicators();
          hideFloatingUi();
        } else {
          contentArea.innerHTML = `<p>Error: ${contentResponse.error || 'Failed to get file content'}</p>`;
          itemDiv.style.opacity = '';
          itemDiv.style.pointerEvents = '';
        }
      } catch (error: any) {
        console.error(LOG_PREFIX_CS, 'Error fetching file content:', error);
        contentArea.innerHTML = `<p>Error: ${error.message || 'Failed to get file content'}</p>`;
        itemDiv.style.opacity = '';
        itemDiv.style.pointerEvents = '';
      }
    };

    contentArea.appendChild(itemDiv);
  });
}

// --- CSS Injection ---
function injectFloatingUiCss(): void {
  const styleId = `${CSS_PREFIX}styles`;
  if (document.getElementById(styleId)) return;

  const css = `
    #${UI_PANEL_ID} {
      position: absolute; background-color: #2d2d2d; color: #f0f0f0; border: 1px solid #4a4a4a;
      border-radius: 8px; padding: 10px; z-index: 2147483647; font-family: sans-serif;
      font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); width: 320px;
      max-height: 450px; overflow-y: auto; display: none;
    }
    #${UI_PANEL_ID}.${CSS_PREFIX}visible { display: block; }
    .${CSS_PREFIX}title-bar {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #4a4a4a;
    }
    .${CSS_PREFIX}title { font-size: 16px; font-weight: bold; }
    .${CSS_PREFIX}close-button {
      background: none; border: none; color: #aaa; font-size: 20px; font-weight: bold;
      cursor: pointer; padding: 0 5px; line-height: 1;
    }
    .${CSS_PREFIX}close-button:hover { color: #fff; }
    .${CSS_PREFIX}content { max-height: 350px; overflow-y: auto; }
    .${CSS_PREFIX}content p { margin: 10px 0; color: #ccc; } 
    .${CSS_PREFIX}folder-section { margin-bottom: 15px; }
    .${CSS_PREFIX}folder-title {
      font-size: 14px; font-weight: bold; color: #bbb; margin-bottom: 5px;
      padding-bottom: 3px; border-bottom: 1px dashed #444;
    }
    .${CSS_PREFIX}button {
      background-color: #3a3a3a; color: #e0e0e0; border: 1px solid #555;
      border-radius: 4px; padding: 5px 10px; margin-top: 5px; margin-right: 8px;
      cursor: pointer; font-size: 13px; transition: background-color 0.2s;
    }
    .${CSS_PREFIX}button:hover { background-color: #4a4a4a; }
    .${CSS_PREFIX}button:disabled { background-color: #2a2a2a; color: #777; cursor: not-allowed; }
    .${CSS_PREFIX}search-result-item {
      padding: 6px 8px;
      margin-bottom: 4px;
      border-radius: 3px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .${CSS_PREFIX}search-result-item:hover {
      background-color: #4a4a4a;
      border-color: #666;
    }
    .${CSS_PREFIX}context-indicator span.${CSS_PREFIX}type-icon {
      margin-right: 5px;
      display: inline-block;
    }

    .${CSS_PREFIX}search-result-item span.type-icon {
      margin-right: 8px;
    }
    .${CSS_PREFIX}search-result-item span.workspace-name {
      font-size: 0.8em;
      color: #aaa;
      margin-left: 5px;
    }
    #${CONTEXT_INDICATOR_AREA_ID} {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-bottom: 5px;
      padding: 5px;
      border: 1px solid #444;
      border-radius: 4px;
    }
    .${CSS_PREFIX}context-indicator {
      background-color: #3a3a3a;
      color: #e0e0e0;
      padding: 3px 8px;
      border-radius: 10px;
      font-size: 12px;
      display: flex;
      align-items: center;
    }
    .${CSS_PREFIX}indicator-close-btn {
      background: none;
      border: none;
      color: #aaa;
      font-size: 14px;
      margin-left: 5px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }
    .${CSS_PREFIX}indicator-close-btn:hover {
      color: #fff;
    }
  `;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);
  console.log(`${LOG_PREFIX_CS} Floating UI CSS injected/updated.`);
}

// --- Event Handlers for Dismissal ---
const handleEscapeKey = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    hideFloatingUi();
  }
};

const handleClickOutside = (event: MouseEvent): void => {
  if (floatingUIPanel && floatingUIPanel.classList.contains(`${CSS_PREFIX}visible`)) {
    const target = event.target as Node;
    if (!floatingUIPanel.contains(target) && !(currentTargetElementForPanel && currentTargetElementForPanel.contains(target))) {
      hideFloatingUi();
    }
  }
};

// --- Floating UI Management ---
function showFloatingUi(targetInputElement: HTMLElement, uiContext: UIContext): void {
  if (uiContext.mode === 'search') {
    originalQueryTextFromUI = uiContext.query;
  } else {
    originalQueryTextFromUI = undefined;
  }

  if (!floatingUIPanel) {
    floatingUIPanel = document.createElement('div');
    floatingUIPanel.id = UI_PANEL_ID;

    const titleBarDiv = document.createElement('div');
    titleBarDiv.className = `${CSS_PREFIX}title-bar`;
    const titleDiv = document.createElement('div');
    titleDiv.className = `${CSS_PREFIX}title`;
    titleBarDiv.appendChild(titleDiv);
    const closeButton = document.createElement('button');
    closeButton.className = `${CSS_PREFIX}close-button`;
    closeButton.innerHTML = '×';
    closeButton.onclick = hideFloatingUi;
    titleBarDiv.appendChild(closeButton);
    floatingUIPanel.appendChild(titleBarDiv);

    const contentDiv = document.createElement('div');
    contentDiv.className = `${CSS_PREFIX}content`;
    floatingUIPanel.appendChild(contentDiv);

    document.body.appendChild(floatingUIPanel);
  }

  const inputRect = targetInputElement.getBoundingClientRect();
  const panelCurrentHeight = floatingUIPanel.offsetHeight;
  const panelHeight = panelCurrentHeight > 0 ? panelCurrentHeight : 200;

  floatingUIPanel.style.top = `${window.scrollY + inputRect.top - panelHeight - 5}px`;
  floatingUIPanel.style.left = `${window.scrollX + inputRect.left}px`;
  floatingUIPanel.classList.add(`${CSS_PREFIX}visible`);
  currentTargetElementForPanel = targetInputElement;

  document.removeEventListener('keydown', handleEscapeKey);
  document.addEventListener('keydown', handleEscapeKey);
  document.removeEventListener('mousedown', handleClickOutside);
  document.addEventListener('mousedown', handleClickOutside);

  console.log(`${LOG_PREFIX_CS} Floating UI shown. Initializing with context:`, uiContext);
  populateFloatingUiContent(uiContext);
}

function hideFloatingUi(): void {
  if (floatingUIPanel && floatingUIPanel.classList.contains(`${CSS_PREFIX}visible`)) {
    floatingUIPanel.classList.remove(`${CSS_PREFIX}visible`);
    console.log(`${LOG_PREFIX_CS} Floating UI hidden.`);
  }
  document.removeEventListener('keydown', handleEscapeKey);
  document.removeEventListener('mousedown', handleClickOutside);
}

/**
 * @description Formats content from one or more files (single file, folder, or entire codebase)
 * for insertion into an LLM chat input, as per SRS 3.3.2.
 * @param {Array<Object>} filesData - An array of file data objects.
 * @param {string} filesData[].fullPath - The full, absolute path to the file.
 * @param {string} filesData[].content - The content of the file.
 * @param {string} filesData[].languageId - The language identifier for the file (e.g., 'javascript', 'python').
 * @returns {string} The formatted string ready for insertion, or an empty string if input is invalid.
 */
async function insertFileContent(fileUri: string, triggerQuery?: string): Promise<boolean> {
  try {
    const contentResponse = await chrome.runtime.sendMessage({
      type: 'GET_FILE_CONTENT',
      payload: { filePath: fileUri }
    });

    if (contentResponse.success && contentResponse.data?.fileData) {
      const { fileData, metadata } = contentResponse.data;
      const uniqueBlockId = metadata.unique_block_id || `cw-block-${Date.now()}`;
      const formattedContent = formatFileContentsForLLM([fileData]);
      const contentToInsertInLLM = formattedContent.replace('<file_contents>', `<file_contents id="${uniqueBlockId}">`);

      insertTextIntoLLMInput(contentToInsertInLLM, currentTargetElementForPanel, triggerQuery);
      
      activeContextBlocks.push({
        uniqueBlockId,
        contentSourceId: metadata.content_source_id,
        label: metadata.label,
        type: metadata.type
      });

      return true;
    }
    return false;
  } catch (error) {
    console.error(LOG_PREFIX_CS, 'Error inserting file content:', error);
    return false;
  }
}

async function insertFolderContent(folderUri: string, workspaceFolderUri: string | null, triggerQuery?: string): Promise<boolean> {
  try {
    const folderContentResponse = await chrome.runtime.sendMessage({
      type: 'GET_FOLDER_CONTENT',
      payload: {
        folderPath: folderUri,
        workspaceFolderUri
      }
    });

    if (folderContentResponse.success && folderContentResponse.data?.filesData) {
      const { filesData, metadata } = folderContentResponse.data;
      const uniqueBlockId = metadata.unique_block_id || `cw-block-${Date.now()}`;
      const formattedContent = formatFileContentsForLLM(filesData);
      const contentToInsertInLLM = formattedContent.replace('<file_contents>', `<file_contents id="${uniqueBlockId}">`);

      insertTextIntoLLMInput(contentToInsertInLLM, currentTargetElementForPanel, triggerQuery);

      activeContextBlocks.push({
        uniqueBlockId,
        contentSourceId: metadata.content_source_id,
        label: metadata.label,
        type: metadata.type
      });
      
      return true;
    }
    return false;
  } catch (error) {
    console.error(LOG_PREFIX_CS, 'Error inserting folder content:', error);
    return false;
  }
}

function formatFileContentsForLLM(filesData: { fullPath: string; content: string; languageId: string }[]): string {
  if (!Array.isArray(filesData) || filesData.length === 0) {
    console.warn('[ContextWeaver CE] formatFileContentsForLLM: Invalid or empty filesData array.');
    return "";
  }

  let formattedBlocks = [];

  for (const file of filesData) {
    if (file && typeof file.fullPath === 'string' && typeof file.content === 'string') {
      const langId = (typeof file.languageId === 'string' && file.languageId) ? file.languageId : 'plaintext';

      let fileBlock = `File: ${file.fullPath}\n`;
      fileBlock += `\`\`\`${langId}\n`;
      fileBlock += file.content.endsWith('\n') ? file.content : `${file.content}\n`;
      fileBlock += `\`\`\`\n`;
      formattedBlocks.push(fileBlock);
    } else {
      console.warn('[ContextWeaver CE] formatFileContentsForLLM: Skipping invalid file data object:', file);
    }
  }

  if (formattedBlocks.length === 0) {
    return "";
  }
  return `<file_contents>\n${formattedBlocks.join('')}</file_contents>`;
}


async function populateFloatingUiContent(uiContext: UIContext): Promise<void> {
  if (!floatingUIPanel) return;
  const contentArea = floatingUIPanel.querySelector(`.${CSS_PREFIX}content`) as HTMLElement;
  const titleArea = floatingUIPanel.querySelector(`.${CSS_PREFIX}title`) as HTMLElement;

  if (!contentArea || !titleArea) return;

  if (uiContext.mode === 'search' && uiContext.query?.trim()) {
    titleArea.textContent = `Searching for "@${uiContext.query}"...`;
    contentArea.innerHTML = '<p>Loading results...</p>';
    debouncedPerformSearch(uiContext.query);
    return;
  }

  contentArea.innerHTML = '<p>Loading workspace details...</p>';
  titleArea.textContent = 'ContextWeaver';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_WORKSPACE_DETAILS_FOR_UI' });
    console.log('ContextWeaver: Workspace details response:', response);

    // Clear the loading message before adding new content
    contentArea.innerHTML = '';

    if (response.error) {
      contentArea.innerHTML = `<p>Error: ${response.error}</p>`;
      titleArea.textContent = 'Error';
    } else if (response.success && response.data) {
      if (!response.data.isTrusted) {
        contentArea.innerHTML = '<p>Workspace not trusted. Please trust the workspace in VS Code to proceed.</p>';
        titleArea.textContent = 'Workspace Untrusted';
        return;
      }
      const activeFileButton = document.createElement('button');
      activeFileButton.className = `${CSS_PREFIX}button`;
      activeFileButton.textContent = "Insert Active File's Content";
      activeFileButton.id = `${CSS_PREFIX}btn-active-file`;
      activeFileButton.onclick = async () => {
        console.log('ContextWeaver: "Insert Active File\'s Content" clicked');
        activeFileButton.textContent = 'Loading Active File...';
        activeFileButton.disabled = true;
        try {
          const activeFileInfoResponse = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_FILE_INFO' });
          console.log('ContextWeaver: Active file info response:', activeFileInfoResponse);

          if (activeFileInfoResponse.success && activeFileInfoResponse.data && activeFileInfoResponse.data.activeFilePath) {
            const activeFilePath = activeFileInfoResponse.data.activeFilePath;
            const fileContentResponse = await chrome.runtime.sendMessage({
              type: 'GET_FILE_CONTENT',
              payload: { filePath: activeFilePath }
            });
            console.log('ContextWeaver: File content response:', fileContentResponse);

            if (fileContentResponse.success && fileContentResponse.data && fileContentResponse.data.fileData) {
              const fileDataArray = [fileContentResponse.data.fileData];
              const formattedContent = formatFileContentsForLLM(fileDataArray);
              insertTextIntoLLMInput(formattedContent, currentTargetElementForPanel);
              hideFloatingUi();
            } else {
              const errorMsg = fileContentResponse.error || 'Failed to get active file content.';
              console.error('ContextWeaver: Error getting active file content:', errorMsg);
              contentArea.innerHTML = `<p>Error: ${errorMsg}</p>`;
            }
          } else {
            const errorMsg = activeFileInfoResponse.error || 'Could not get active file information from VS Code. Is a file editor active?';
            console.error('ContextWeaver: Error getting active file info:', errorMsg);
            contentArea.innerHTML = `<p>Error: ${errorMsg}</p>`;
          }
        } catch (e: any) {
          console.error('ContextWeaver: Error in active file workflow:', e);
          contentArea.innerHTML = `<p>Error: ${e.message || 'Failed to process active file request.'}</p>`;
        } finally {
          if (floatingUIPanel && floatingUIPanel.classList.contains(`${CSS_PREFIX}visible`)) {
            activeFileButton.textContent = "Insert Active File's Content";
            activeFileButton.disabled = false;
          }
        }
      };
      contentArea.appendChild(activeFileButton);

      // --- Insert Content of Open Files Button ---
      const openFilesButton = document.createElement('button');
      openFilesButton.className = `${CSS_PREFIX}button`;
      openFilesButton.textContent = "Insert Content of Open Files";
      openFilesButton.id = `${CSS_PREFIX}btn-open-files`;
      openFilesButton.onclick = async () => {
        console.log('ContextWeaver: "Insert Content of Open Files" clicked');
        openFilesButton.textContent = 'Loading Open Files...';
        openFilesButton.disabled = true;
        try {
          const openFilesResponse = await chrome.runtime.sendMessage({ type: 'GET_OPEN_FILES_FOR_UI' });
          console.log('ContextWeaver: Open files response:', openFilesResponse);

          if (openFilesResponse.success && openFilesResponse.data && Array.isArray(openFilesResponse.data.openFiles)) {
            const activeContextSourceIds: string[] = [];
            displayOpenFilesSelectorUI(openFilesResponse.data.openFiles, activeContextSourceIds, contentArea, titleArea);
          } else {
            const errorMsg = openFilesResponse.error || 'Failed to get open files list.';
            console.error('ContextWeaver: Error getting open files list:', errorMsg);
            contentArea.innerHTML = `<p>Error: ${errorMsg}</p>`;
          }
        } catch (e: any) {
          console.error('ContextWeaver: Error in open files workflow:', e);
          contentArea.innerHTML = `<p>Error: ${e.message || 'Failed to process open files request.'}</p>`;
        } finally {
          if (floatingUIPanel && floatingUIPanel.classList.contains(`${CSS_PREFIX}visible`) && !contentArea.querySelector(`.${CSS_PREFIX}open-files-selector`)) {
            openFilesButton.textContent = "Insert Content of Open Files";
            openFilesButton.disabled = false;
          }
        }
      };
      contentArea.appendChild(openFilesButton);

      if (response.data.workspaceFolders && response.data.workspaceFolders.length > 0) {
        const separator = document.createElement('hr');
        separator.style.margin = '10px 0';
        separator.style.borderColor = '#4a4a4a';
        contentArea.appendChild(separator);

        titleArea.textContent = response.data.vsCodeInstanceName || 'ContextWeaver';
        renderWorkspaceFolders(response.data.workspaceFolders, contentArea);
      } else {
        titleArea.textContent = 'ContextWeaver';
        const noFolderMsg = document.createElement('p');
        noFolderMsg.textContent = 'No workspace folder open in VS Code. Some options may be limited.';
        noFolderMsg.style.marginTop = '10px';
        contentArea.appendChild(noFolderMsg);
      }
    } else {
      contentArea.innerHTML = '<p>Could not retrieve workspace details. Is ContextWeaver VSCode extension running and connected?</p>';
      titleArea.textContent = 'Connection Issue';
    }
  } catch (error: any) {
    console.error('ContextWeaver: Error requesting workspace details from service worker:', error);
    contentArea.innerHTML = '';
    contentArea.innerHTML = `<p>Error: ${error.message || 'Failed to communicate with service worker.'}</p>`;
    titleArea.textContent = 'Communication Error';
  }
}

interface IndicatorUIElements {
  container: HTMLElement | null;
  input: HTMLElement | null;
}

function renderContextIndicators(): void {
  const targetInput = currentTargetElementForPanel;
  if (!targetInput) {
    console.warn(LOG_PREFIX_CS, 'No target input for context indicators');
    const existingIndicatorArea = document.getElementById(CONTEXT_INDICATOR_AREA_ID);
    if (existingIndicatorArea) existingIndicatorArea.style.display = 'none';
    return;
  }

  let indicatorArea = document.getElementById(CONTEXT_INDICATOR_AREA_ID);

  if (!indicatorArea) {
    indicatorArea = document.createElement('div');
    indicatorArea.id = CONTEXT_INDICATOR_AREA_ID;

    let insertionPoint: HTMLElement | null = null;
    let currentElement: HTMLElement | null = targetInput;
    let attempts = 0;

    while (currentElement && attempts < 5) {
      if (currentElement.parentElement && currentElement.parentElement !== document.body) {
        if (targetInput.parentElement) {
          insertionPoint = targetInput.parentElement;
          break;
        }
      }
      currentElement = currentElement.parentElement;
      attempts++;
    }

    if (!insertionPoint && targetInput.parentElement) {
      insertionPoint = targetInput.parentElement;
    }

    if (insertionPoint && insertionPoint.parentElement) {
      insertionPoint.parentElement.insertBefore(indicatorArea, insertionPoint);
      console.log(LOG_PREFIX_CS, `Indicator area inserted before element:`, insertionPoint);
    } else if (targetInput.parentElement) {
      targetInput.parentElement.insertBefore(indicatorArea, targetInput);
      console.log(LOG_PREFIX_CS, `Indicator area inserted before target input (fallback).`);
    } else {
      console.warn(LOG_PREFIX_CS, "Target input has no suitable parent for indicator area placement. Appending to body as last resort.");
      document.body.appendChild(indicatorArea);
    }
  }

  indicatorArea.innerHTML = '';

  activeContextBlocks.forEach(block => {
    const indicator = document.createElement('div');
    indicator.className = `${CSS_PREFIX}context-indicator`;
    indicator.dataset.uniqueBlockId = block.uniqueBlockId;
    indicator.dataset.contentSourceId = block.contentSourceId;

    const iconSpan = document.createElement('span');
    iconSpan.className = `${CSS_PREFIX}type-icon`;
    switch (block.type) {
      case 'file_content': iconSpan.textContent = '📄'; break;
      case 'folder_content': iconSpan.textContent = '📁'; break;
      case 'codebase_content': iconSpan.textContent = '📚'; break;
      case 'file_tree': iconSpan.textContent = '🌲'; break;
      case 'code_snippet': iconSpan.textContent = '✂️'; break;
      default: iconSpan.textContent = '❔';
    }
    indicator.appendChild(iconSpan);

    const labelSpan = document.createElement('span');
    labelSpan.textContent = block.label;
    labelSpan.style.marginLeft = '4px';
    indicator.appendChild(labelSpan);

    const closeBtn = document.createElement('button');
    closeBtn.className = `${CSS_PREFIX}indicator-close-btn`;
    closeBtn.textContent = '×';
    closeBtn.dataset.uniqueBlockId = block.uniqueBlockId;
    closeBtn.dataset.blockType = block.type;

    closeBtn.onclick = () => {
      const uniqueId = closeBtn.dataset.uniqueBlockId;
      const blockType = closeBtn.dataset.blockType;
      if (!uniqueId) {
        console.error(LOG_PREFIX_CS, "Close button clicked, but no uniqueBlockId found in dataset.");
        return;
      }
      console.log(LOG_PREFIX_CS, `Close indicator clicked for block ID: ${uniqueId}`);

      if (currentTargetElementForPanel) {
        if ('value' in currentTargetElementForPanel && typeof (currentTargetElementForPanel as HTMLTextAreaElement).selectionStart === 'number') {
          const textArea = currentTargetElementForPanel as HTMLTextAreaElement;
          const originalValue = textArea.value;

          // Regex to find <file_contents id="UID">...</file_contents> or <code_snippet id="UID">...</code_snippet>
          const blockRegex = new RegExp(
            `<(${blockType === 'code_snippet' ? 'code_snippet' : 'file_contents'})\\s[^>]*id=["']${uniqueId}["'][^>]*>[\\s\\S]*?</\\1>`,
            'g'
          );

          textArea.value = originalValue.replace(blockRegex, '');
          if (originalValue.length !== textArea.value.length) {
            console.log(LOG_PREFIX_CS, `Removed text block ${uniqueId} from TEXTAREA value.`);
            textArea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          } else {
            console.warn(LOG_PREFIX_CS, `Could not find/remove text block ${uniqueId} in TEXTAREA value using regex.`);
          }

        } else if (currentTargetElementForPanel.isContentEditable) {
          // For contentEditable, we look for an element with the ID
          const blockInEditor = currentTargetElementForPanel.querySelector(`[id="${uniqueId}"]`);
          if (blockInEditor) {
            blockInEditor.remove();
            console.log(LOG_PREFIX_CS, `Removed text block ${uniqueId} from ContentEditable via querySelector by ID.`);
            currentTargetElementForPanel.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          } else {
            console.warn(LOG_PREFIX_CS, `Could not find text block ${uniqueId} in ContentEditable via querySelector by ID.`);
          }
        }
      } else {
        console.warn(LOG_PREFIX_CS, `currentTargetElementForPanel is null, cannot remove block ${uniqueId}.`);
      }

      activeContextBlocks = activeContextBlocks.filter(b => b.uniqueBlockId !== uniqueId);
      console.log(LOG_PREFIX_CS, `activeContextBlocks after removal:`, JSON.parse(JSON.stringify(activeContextBlocks)));
      renderContextIndicators();
    };
    indicator.appendChild(closeBtn);
    indicatorArea.appendChild(indicator);
  });

  if (activeContextBlocks.length === 0) {
    indicatorArea.style.display = 'none';
  } else {
    indicatorArea.style.display = 'flex';
  }
}

// --- Text Insertion ---
function insertTextIntoLLMInput(textToInsert: string, targetInput: HTMLElement | null, triggerQuery?: string): void {
  if (!targetInput) {
    console.error(`${LOG_PREFIX_CS} No target input field to insert text into.`);
    return;
  }
  targetInput.focus();

  let insertValue = '';
  let triggerReplaced = false;

  if ('value' in targetInput && typeof (targetInput as HTMLTextAreaElement).selectionStart === 'number') {
    const textArea = targetInput as HTMLTextAreaElement;
    insertValue = textArea.value;
    const fullTriggerText = triggerQuery ? `@${triggerQuery}` : '@';

    let lastAtIndex = -1;
    let searchStartIndex = (textArea.selectionStart || insertValue.length) - fullTriggerText.length;
    if (searchStartIndex < 0) searchStartIndex = 0;

    for (let i = searchStartIndex; i >= 0; i--) {
      if (insertValue.substring(i).startsWith(fullTriggerText)) {
        lastAtIndex = i;
        break;
      }
    }

    if (lastAtIndex !== -1) {
      if (triggerQuery || ((textArea.selectionStart || insertValue.length) - (lastAtIndex + fullTriggerText.length) < 5)) {
        textArea.value = insertValue.substring(0, lastAtIndex) + textToInsert + insertValue.substring(lastAtIndex + fullTriggerText.length);
        textArea.selectionStart = textArea.selectionEnd = lastAtIndex + textToInsert.length;
        triggerReplaced = true;
      }
    }

    if (!triggerReplaced) {
      const start = textArea.selectionStart || 0;
      const end = textArea.selectionEnd || 0;
      textArea.value = insertValue.substring(0, start) + textToInsert + insertValue.substring(end);
      textArea.selectionStart = textArea.selectionEnd = start + textToInsert.length;
    }
    textArea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

  } else if (targetInput.isContentEditable) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);

      // TODO: Implement robust trigger replacement for contentEditable.
      // This is complex. For now, just delete current selection and insert.
      range.deleteContents();

      // textToInsert is the string: <file_contents id="...">...</file_contents>
      // We need to insert this as HTML content.
      const tempDoc = document.implementation.createHTMLDocument();
      const tempContainer = tempDoc.createElement('div');
      tempContainer.innerHTML = textToInsert; // Let browser parse the string into a node

      const nodeToInsert = tempContainer.firstChild;

      if (nodeToInsert) {
        range.insertNode(nodeToInsert.cloneNode(true)); // Insert a clone
        if (nodeToInsert.nextSibling) { // If there were multiple top-level elements (should not happen with our structure)
          let current: ChildNode | null = nodeToInsert.nextSibling;
          while (current) {
            range.insertNode(current.cloneNode(true));
            current = current.nextSibling;
          }
        }
        // Collapse range to the end of inserted content
        if (range.endContainer.lastChild) { // Check if endContainer has a lastChild
          range.setStartAfter(range.endContainer.lastChild);
          range.setEndAfter(range.endContainer.lastChild);
        } else if (nodeToInsert) { // Fallback to after the inserted node itself
          range.setStartAfter(nodeToInsert);
          range.setEndAfter(nodeToInsert);
        }

      } else {
        // Fallback if parsing failed, insert as text (less ideal)
        const textNode = document.createTextNode(textToInsert);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
      }

      selection.removeAllRanges();
      selection.addRange(range);
      targetInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    } else {
      console.warn(`${LOG_PREFIX_CS} Cannot insert into contentEditable without a selection range.`);
    }
  } else {
    console.warn(`${LOG_PREFIX_CS} Target input field is neither a textarea nor contenteditable with selection support.`);
    return;
  }
  console.log(`${LOG_PREFIX_CS} Text inserted.`);
}

// --- Event Listener Attachment ---
function attachListenerToInputField(inputField: HTMLElement, config: LLMInputConfig): void {
  if (config.attachedElement && config.attachedElement.isSameNode(inputField) && eventHandlers.has(inputField)) {
    return; // Already attached to this exact element
  }
  // If previously attached to a different element for this config, remove old listener
  if (config.attachedElement && eventHandlers.has(config.attachedElement)) {
    const oldHandler = eventHandlers.get(config.attachedElement);
    if (oldHandler) {
      config.attachedElement.removeEventListener('input', oldHandler); // Use 'input'
      eventHandlers.delete(config.attachedElement);
    }
  }

  console.log(`ContextWeaver: Attaching listener to input field:`, inputField, `with selector: ${config.selector}`);
  inputField.dataset.cwSelector = config.selector; // For potential debugging or re-identification

  const handleSpecificEvent = (event: Event) => {
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

    const atMatch = /@(\S*)$/.exec(rawValue.substring(0, cursorPos));

    if (atMatch) {
      const fullTrigger = atMatch[0];
      const query = atMatch[1];

      if (floatingUIPanel && floatingUIPanel.classList.contains(`${CSS_PREFIX}visible`) && currentTargetElementForPanel !== inputField) {
        hideFloatingUi();
      }

      if (query.length > 0) {
        console.log(LOG_PREFIX_CS, `Search trigger detected. Query: "${query}"`);
        showFloatingUi(inputField, { mode: 'search', query: query });
      } else {
        const charAfterAt = rawValue.charAt(rawValue.substring(0, cursorPos).lastIndexOf('@') + 1);
        if (charAfterAt === ' ' || fullTrigger === '@') {
          console.log(LOG_PREFIX_CS, "General trigger detected (e.g. '@' or '@ ')");
          showFloatingUi(inputField, { mode: 'general' });
        } else if (query.length === 0 && fullTrigger.length > 1) {
          console.log(LOG_PREFIX_CS, "General trigger detected ('@' alone)");
          showFloatingUi(inputField, { mode: 'general' });
        }
      }
    } else {
      if (floatingUIPanel && floatingUIPanel.classList.contains(`${CSS_PREFIX}visible`) && currentTargetElementForPanel?.isSameNode(inputField)) {
        console.log(LOG_PREFIX_CS, "No valid '@' trigger found, hiding UI.");
        hideFloatingUi();
      }
    }
  };

  inputField.addEventListener('input', handleSpecificEvent); // Use 'input' for better real-time detection
  eventHandlers.set(inputField, handleSpecificEvent);
  config.attachedElement = inputField;
  config.isAttached = true;
}

// --- Initialization and Observation ---
function initializeTriggerDetection(): void {
  injectFloatingUiCss();
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
        observeForElement(config); // Start observing if not found initially
      }
    }
  }
}

function observeForElement(config: LLMInputConfig): void {
  // Check if already attached to a valid element for this config
  if (config.isAttached && config.attachedElement && document.body.contains(config.attachedElement)) {
    return;
  }

  config.isAttached = false; // Reset attachment status
  config.attachedElement = null;

  const observer = new MutationObserver((mutationsList, obs) => {
    // Check again if already attached by another mutation or if element disappeared
    if (config.isAttached && config.attachedElement && document.body.contains(config.attachedElement)) {
      return;
    }

    const inputField = document.querySelector(config.selector) as HTMLElement;
    if (inputField) {
      console.log(`ContextWeaver: Element with selector ${config.selector} found/re-found by MutationObserver.`);
      attachListenerToInputField(inputField, config);
      // obs.disconnect(); // Optionally disconnect if you only need to find it once per page load/major DOM change
      // For SPAs, might need to keep observing or re-observe on navigation events.
    }
  });

  console.log(`ContextWeaver: Setting up/re-arming MutationObserver for selector: ${config.selector}`);
  observer.observe(document.body, { childList: true, subtree: true });
}

// --- Script Execution Start ---
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeTriggerDetection);
} else {
  initializeTriggerDetection();
}

// Listen for messages from the service worker (or other parts of the extension)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("ContextWeaver (contentScript.ts): Message received", message);

  if (message.type === 'push' && message.command === 'push_snippet') {
    const snippetData = message.payload; // This is SnippetPayload from VSCE
    console.log("ContextWeaver: Received snippet to insert:", snippetData);
    if (currentTargetElementForPanel) { // Insert into the last known active LLM input
      // Format snippet according to SRS 3.3.3
      const langId = snippetData.language || 'plaintext';
      let formattedSnippet = `<code_snippet>\n`;
      formattedSnippet += `File: ${snippetData.filePath}\n`; // Use full path
      formattedSnippet += `lines: ${snippetData.startLine}-${snippetData.endLine}\n`;
      formattedSnippet += `\`\`\`${langId}\n`;
      formattedSnippet += snippetData.snippet.endsWith('\n') ? snippetData.snippet : `${snippetData.snippet}\n`;
      formattedSnippet += `\`\`\`\n`;
      formattedSnippet += `</code_snippet>`;
      insertTextIntoLLMInput(formattedSnippet, currentTargetElementForPanel);
      // TODO: Add context block indicator using snippetData.metadata
    } else {
      console.warn("ContextWeaver: No target LLM input element known for snippet insertion.");
      // Optionally, try to find a default LLM input if none is "active"
    }
    return false; // No async response needed from here
  } else if (message.type === 'ERROR_FROM_SERVICE_WORKER' || message.type === 'ERROR_FROM_VSCE_IPC') {
    console.error(`ContextWeaver: Error received: ${message.payload.message}`);
    if (floatingUIPanel && floatingUIPanel.classList.contains(`${CSS_PREFIX}visible`)) {
      const contentArea = floatingUIPanel.querySelector(`.${CSS_PREFIX}content`) as HTMLElement;
      if (contentArea) {
        contentArea.innerHTML = `<p>Error: ${message.payload.message} (Code: ${message.payload.errorCode || 'N/A'})</p>`;
      }
    }
    return false;
  }
  // Handle other messages if necessary
  return false; // Default to not sending an async response
});

/**
 * @description Displays a UI for selecting from a list of open files.
 * @param openFilesList - Array of open file objects from the service worker. Each object should have { path, name, workspaceFolderUri, workspaceFolderName }
 * @param activeContextSourceIds - Array of content_source_ids for currently inserted blocks.
 * @param contentArea - The HTMLElement where the UI should be rendered.
 * @param titleArea - The HTMLElement for the floating UI's title.
 */
function renderWorkspaceFolders(workspaceFolders: any[], contentArea: HTMLElement): void {
  workspaceFolders.forEach(folder => {
    const folderSection = document.createElement('div');
    folderSection.className = `${CSS_PREFIX}folder-section`;

    const folderTitle = document.createElement('div');
    folderTitle.className = `${CSS_PREFIX}folder-title`;
    folderTitle.textContent = folder.name || 'Workspace Folder';
    folderSection.appendChild(folderTitle);

    const addFolderButton = document.createElement('button');
    addFolderButton.className = `${CSS_PREFIX}button`;
    addFolderButton.textContent = 'Add Folder Content';
    addFolderButton.onclick = () => {
      console.log(`${LOG_PREFIX_CS} Add folder content for:`, folder);
      // TODO: Implement folder content addition
    };
    folderSection.appendChild(addFolderButton);

    contentArea.appendChild(folderSection);
  });
}

function renderBrowseView(browseResponse: any, parentFolderUri: string, parentFolderName: string, workspaceFolderUri: string | null): void {
  if (!floatingUIPanel) return;

  const contentArea = floatingUIPanel.querySelector(`.${CSS_PREFIX}content`) as HTMLElement;
  const titleArea = floatingUIPanel.querySelector(`.${CSS_PREFIX}title`) as HTMLElement;
  if (!contentArea || !titleArea) return;

  if (!browseResponse.success || !browseResponse.data?.entries) {
    contentArea.innerHTML = `<p>Error: ${browseResponse.error || 'Failed to load folder contents'}</p>`;
    return;
  }

  contentArea.innerHTML = '';
  const listContainer = document.createElement('div');
  listContainer.style.maxHeight = '250px';
  listContainer.style.overflowY = 'auto';
  listContainer.style.marginBottom = '10px';

  browseResponse.data.entries.forEach((entry: any) => {
    const itemDiv = document.createElement('div');
    itemDiv.className = `${CSS_PREFIX}browse-item`;
    itemDiv.style.padding = '6px 8px';
    itemDiv.style.marginBottom = '4px';
    itemDiv.style.borderRadius = '3px';
    itemDiv.style.display = 'flex';
    itemDiv.style.alignItems = 'center';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.style.marginRight = '8px';
    checkbox.dataset.uri = entry.uri;
    checkbox.dataset.type = entry.type;
    checkbox.dataset.contentSourceId = entry.content_source_id;

    const isDuplicate = activeContextBlocks.some(block => block.contentSourceId === entry.content_source_id);
    if (isDuplicate) {
      checkbox.disabled = true;
      itemDiv.style.opacity = '0.6';
      itemDiv.title = 'Already added to context';
    }

    const iconSpan = document.createElement('span');
    iconSpan.textContent = entry.type === 'file' ? '📄' : '📁';
    iconSpan.style.marginRight = '8px';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = entry.name;

    itemDiv.appendChild(checkbox);
    itemDiv.appendChild(iconSpan);
    itemDiv.appendChild(nameSpan);
    listContainer.appendChild(itemDiv);
  });

  contentArea.appendChild(listContainer);

  const buttonContainer = document.createElement('div');
  buttonContainer.style.marginTop = '10px';

  const insertButton = document.createElement('button');
  insertButton.className = `${CSS_PREFIX}button`;
  insertButton.textContent = 'Insert Selected Items';
  insertButton.onclick = async () => {
    const selectedEntries = Array.from(listContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked:not(:disabled)'))
      .map(cb => ({
        uri: cb.dataset.uri!,
        type: cb.dataset.type! as 'file' | 'folder',
        contentSourceId: cb.dataset.contentSourceId!
      }));

    if (selectedEntries.length === 0) {
      contentArea.innerHTML = '<p>No items selected.</p>';
      return;
    }

    insertButton.disabled = true;
    insertButton.textContent = `Loading ${selectedEntries.length} selected items...`;
    
    const progressDiv = document.createElement('div');
    progressDiv.className = `${CSS_PREFIX}progress`;
    progressDiv.style.marginTop = '10px';
    contentArea.appendChild(progressDiv);

    let successCount = 0;
    let failureCount = 0;

    try {
      for (let i = 0; i < selectedEntries.length; i++) {
        const entry = selectedEntries[i];
        progressDiv.textContent = `Processing item ${i + 1} of ${selectedEntries.length}...`;

        let success = false;
        if (entry.type === 'file') {
          success = await insertFileContent(entry.uri, originalQueryTextFromUI);
        } else if (entry.type === 'folder') {
          success = await insertFolderContent(entry.uri, workspaceFolderUri, originalQueryTextFromUI);
        }

        if (success) {
          successCount++;
          renderContextIndicators();
        } else {
          failureCount++;
        }
      }

      if (successCount > 0) {
        hideFloatingUi();
      } else {
        progressDiv.textContent = 'Failed to insert any items.';
        insertButton.disabled = false;
        insertButton.textContent = 'Insert Selected Items';
      }

      if (failureCount > 0) {
        console.warn(LOG_PREFIX_CS, `${failureCount} items failed to insert.`);
      }

    } catch (error: any) {
      console.error(LOG_PREFIX_CS, 'Error processing selected items:', error);
      progressDiv.textContent = `Error: ${error.message || 'Failed to process selected items'}`;
      insertButton.disabled = false;
      insertButton.textContent = 'Insert Selected Items';
    }
  };
  buttonContainer.appendChild(insertButton);

  const backButton = document.createElement('button');
  backButton.className = `${CSS_PREFIX}button`;
  backButton.textContent = 'Back';
  backButton.style.marginLeft = '10px';
  backButton.onclick = () => {
    if (searchResponse && searchQuery) {
      renderSearchResults(searchResponse, searchQuery);
    } else {
      contentArea.innerHTML = '<p>Could not restore previous search results.</p>';
    }
  };
  buttonContainer.appendChild(backButton);

  contentArea.appendChild(buttonContainer);
}

function displayOpenFilesSelectorUI(
  openFilesList: { path: string; name: string; workspaceFolderUri: string | null; workspaceFolderName: string | null }[],
  activeContextSourceIds: string[],
  contentArea: HTMLElement,
  titleArea: HTMLElement
): void {
  contentArea.innerHTML = ''; // Clear previous content
  titleArea.textContent = 'Select Open Files';
  contentArea.classList.add(`${CSS_PREFIX}open-files-selector`); // Add a class for potential specific styling

  if (openFilesList.length === 0) {
    contentArea.innerHTML = '<p>No open (saved) files found in trusted workspace(s).</p>';
    const backButton = document.createElement('button');
    backButton.className = `${CSS_PREFIX}button`;
    backButton.textContent = 'Back';
    backButton.onclick = () => {
      contentArea.classList.remove(`${CSS_PREFIX}open-files-selector`);
      populateFloatingUiContent({ mode: 'general' }); // Go back to main view
    };
    contentArea.appendChild(backButton);
    return;
  }

  const form = document.createElement('form');
  const listContainer = document.createElement('div');
  listContainer.style.maxHeight = '250px';
  listContainer.style.overflowY = 'auto';
  listContainer.style.marginBottom = '10px';

  openFilesList.forEach(file => {
    const listItem = document.createElement('div');
    listItem.style.marginBottom = '5px';
    listItem.style.padding = '3px';
    listItem.style.borderBottom = '1px solid #3a3a3a';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = file.path; // Store file URI string as value
    checkbox.id = `${CSS_PREFIX}openfile-${file.path.replace(/[^a-zA-Z0-9]/g, '_')}`; // Create a safe ID
    checkbox.style.marginRight = '8px';
    checkbox.checked = true; // Default to checked state

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    let labelText = file.name;
    if (file.workspaceFolderName) {
      labelText += ` (${file.workspaceFolderName})`;
    }
    label.textContent = labelText;
    label.style.fontSize = '13px';

    // FR-CE-007 V1.3: Duplicate check
    // Assuming file.path is the content_source_id for individual files
    if (activeContextSourceIds.includes(file.path)) {
      checkbox.disabled = true;
      label.style.textDecoration = 'line-through';
      label.title = 'This file has already been added to the context.';
      const alreadyAddedSpan = document.createElement('span');
      alreadyAddedSpan.textContent = ' (already added)';
      alreadyAddedSpan.style.fontStyle = 'italic';
      alreadyAddedSpan.style.color = '#888';
      label.appendChild(alreadyAddedSpan);
    }

    listItem.appendChild(checkbox);
    listItem.appendChild(label);
    listContainer.appendChild(listItem);
  });
  form.appendChild(listContainer);

  const insertButton = document.createElement('button');
  insertButton.className = `${CSS_PREFIX}button`;
  insertButton.textContent = 'Insert Selected Files';
  insertButton.type = 'button'; // Important to prevent form submission if inside a form
  insertButton.onclick = async () => {
    const selectedFiles = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked:not(:disabled)'))
      .map(cb => cb.value);

    if (selectedFiles.length === 0) {
      // Consider a small inline message instead of alert
      const tempMsg = document.createElement('p');
      tempMsg.textContent = 'No new files selected.';
      tempMsg.style.color = 'orange';
      contentArea.insertBefore(tempMsg, form.nextSibling); // Insert after the form
      setTimeout(() => tempMsg.remove(), 2000);
      return;
    }

    insertButton.textContent = 'Loading Content...';
    insertButton.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_CONTENTS_FOR_SELECTED_OPEN_FILES',
        payload: { fileUris: selectedFiles }
      });

      if (response.success && response.data) {
        const successfulFiles = response.data as { fileData: any, metadata: any }[]; // From serviceWorker response
        let allContentToInsert = "";

        successfulFiles.forEach(item => {
          const formatted = formatFileContentsForLLM([item.fileData]); // formatFileContentsForLLM expects an array
          allContentToInsert += formatted + "\n\n"; // Add some spacing between file blocks
          // TODO: Add context block indicator using item.metadata
          // TODO: Update activeContextSourceIds with item.metadata.content_source_id
          console.log("ContextWeaver: Would add indicator for:", item.metadata);
        });

        if (allContentToInsert.trim()) {
          insertTextIntoLLMInput(allContentToInsert.trim(), currentTargetElementForPanel);
        }
        hideFloatingUi();

        if (response.errors && response.errors.length > 0) {
          // Handle errors for files that failed to load (e.g., show a toast or log)
          console.warn('ContextWeaver: Some files failed to load:', response.errors);
        }

      } else {
        contentArea.innerHTML = `<p>Error fetching content: ${response.error || 'Unknown error'}</p>`;
      }
    } catch (e: any) {
      console.error('ContextWeaver: Error requesting selected files content:', e);
      contentArea.innerHTML = `<p>Error: ${e.message || 'Failed to process request.'}</p>`;
    } finally {
      // No need to reset button state here as UI will be hidden or re-rendered on error
    }
  };
  form.appendChild(insertButton);

  const backButton = document.createElement('button');
  backButton.className = `${CSS_PREFIX}button`;
  backButton.textContent = 'Back';
  backButton.type = 'button';
  backButton.style.marginLeft = '10px';
  backButton.onclick = () => {
    contentArea.classList.remove(`${CSS_PREFIX}open-files-selector`);
    populateFloatingUiContent({ mode: 'general' }); // Go back to main view
  };
  form.appendChild(backButton);

  contentArea.appendChild(form);
}