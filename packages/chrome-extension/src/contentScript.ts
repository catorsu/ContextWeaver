/**
 * @file contentScript.ts
 * @description Content script for ContextWeaver Chrome Extension.
 * Handles detection of the '@' trigger in designated LLM chat input fields and
 * manages the floating UI.
 * @module ContextWeaver/CE
 */

console.log('ContextWeaver: Content script loaded.');

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
const UI_PANEL_ID = 'contextweaver-floating-panel';
const CSS_PREFIX = 'cw-';

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
  `;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);
  console.log('ContextWeaver: Floating UI CSS injected/updated.');
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
function showFloatingUi(targetInputElement: HTMLElement): void {
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

  console.log('ContextWeaver: Floating UI shown. Requesting workspace details...');
  populateFloatingUiContent();
}

function hideFloatingUi(): void {
  if (floatingUIPanel && floatingUIPanel.classList.contains(`${CSS_PREFIX}visible`)) {
    floatingUIPanel.classList.remove(`${CSS_PREFIX}visible`);
    console.log('ContextWeaver: Floating UI hidden.');
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


async function populateFloatingUiContent(): Promise<void> {
  if (!floatingUIPanel) return;
  const contentArea = floatingUIPanel.querySelector(`.${CSS_PREFIX}content`) as HTMLElement;
  const titleArea = floatingUIPanel.querySelector(`.${CSS_PREFIX}title`) as HTMLElement;

  if (!contentArea || !titleArea) return;

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
        renderWorkspaceUi(response.data.workspaceFolders, contentArea);
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

function renderWorkspaceUi(workspaceFolders: any[], contentArea: HTMLElement): void {

  workspaceFolders.forEach(folder => {
    const folderSection = document.createElement('div');
    folderSection.className = `${CSS_PREFIX}folder-section`;

    const folderTitleEl = document.createElement('h3');
    folderTitleEl.className = `${CSS_PREFIX}folder-title`;
    folderTitleEl.textContent = `Folder: ${folder.name}`;
    folderSection.appendChild(folderTitleEl);

    // --- File Tree Button ---
    const fileTreeButton = document.createElement('button');
    fileTreeButton.className = `${CSS_PREFIX}button`;
    fileTreeButton.textContent = 'File Tree';
    fileTreeButton.id = `${CSS_PREFIX}btn-file-tree-${folder.uri}`; // Use folder.uri for unique ID
    fileTreeButton.onclick = async () => {
      console.log(`ContextWeaver: "File Tree" clicked for ${folder.uri}`);
      fileTreeButton.textContent = 'Loading...';
      fileTreeButton.disabled = true;
      try {
        const ftResponse = await chrome.runtime.sendMessage({
          type: 'GET_FILE_TREE',
          payload: { workspaceFolderUri: folder.uri }
        });
        console.log('ContextWeaver: File tree response:', ftResponse);
        if (ftResponse.success && ftResponse.data && ftResponse.data.fileTreeString !== undefined) {
          insertTextIntoLLMInput(ftResponse.data.fileTreeString, currentTargetElementForPanel);
          // TODO: Add context block indicator using ftResponse.data.metadata
          hideFloatingUi();
        } else {
          contentArea.innerHTML = `<p>Error getting file tree: ${ftResponse.error || 'No file tree data received.'}</p>`;
        }
      } catch (e: any) {
        console.error('ContextWeaver: Error requesting file tree:', e);
        contentArea.innerHTML = `<p>Error requesting file tree: ${e.message}</p>`;
      } finally {
        if (floatingUIPanel && floatingUIPanel.classList.contains(`${CSS_PREFIX}visible`)) {
          fileTreeButton.textContent = 'File Tree';
          fileTreeButton.disabled = false;
        }
      }
    };
    folderSection.appendChild(fileTreeButton);

    // --- Full Codebase Button ---
    const fullCodebaseButton = document.createElement('button');
    fullCodebaseButton.className = `${CSS_PREFIX}button`;
    fullCodebaseButton.textContent = 'Full Codebase';
    fullCodebaseButton.id = `${CSS_PREFIX}btn-full-codebase-${folder.uri}`; // Use folder.uri for unique ID
    fullCodebaseButton.onclick = async () => {
      console.log(`ContextWeaver: "Full Codebase" clicked for ${folder.uri}`);
      fullCodebaseButton.textContent = 'Loading Codebase...';
      fullCodebaseButton.disabled = true;
      try {
        const cbResponse = await chrome.runtime.sendMessage({
          type: 'GET_ENTIRE_CODEBASE',
          payload: { workspaceFolderUri: folder.uri }
        });
        console.log('ContextWeaver: Full codebase response:', cbResponse);
        // cbResponse.data.filesData is the array of {fullPath, content, languageId}
        if (cbResponse.success && cbResponse.data && Array.isArray(cbResponse.data.filesData)) {
          const formattedCodebaseString = formatFileContentsForLLM(cbResponse.data.filesData);
          insertTextIntoLLMInput(formattedCodebaseString, currentTargetElementForPanel);
          // TODO: Add context block indicator using cbResponse.data.metadata
          hideFloatingUi();
        } else {
          contentArea.innerHTML = `<p>Error getting full codebase: ${cbResponse.error || 'No codebase data received.'}</p>`;
        }
      } catch (e: any) {
        console.error('ContextWeaver: Error requesting full codebase:', e);
        contentArea.innerHTML = `<p>Error requesting full codebase: ${e.message}</p>`;
      } finally {
        if (floatingUIPanel && floatingUIPanel.classList.contains(`${CSS_PREFIX}visible`)) {
          fullCodebaseButton.textContent = 'Full Codebase';
          fullCodebaseButton.disabled = false;
        }
      }
    };
    folderSection.appendChild(fullCodebaseButton);

    contentArea.appendChild(folderSection);
  });
}


function insertTextIntoLLMInput(text: string, targetInput: HTMLElement | null): void {
  if (!targetInput) {
    console.error('ContextWeaver: No target input field to insert text into.');
    return;
  }
  targetInput.focus();

  // Remove the '@' trigger character if it's still there
  let currentContent = '';
  let triggerCharRemoved = false;

  if ((targetInput as HTMLTextAreaElement).value !== undefined && typeof (targetInput as HTMLTextAreaElement).selectionStart === 'number') {
    const textArea = targetInput as HTMLTextAreaElement;
    currentContent = textArea.value;
    const atIndex = currentContent.lastIndexOf('@', textArea.selectionStart - 1);
    if (atIndex !== -1) {
      // Check if it's the @ that triggered the UI
      // This is a heuristic; might need refinement if users type @ normally
      if (textArea.selectionStart - atIndex <= 20) { // Assuming query won't be too long
        textArea.value = currentContent.substring(0, atIndex) + text + currentContent.substring(textArea.selectionEnd);
        textArea.selectionStart = textArea.selectionEnd = atIndex + text.length;
        triggerCharRemoved = true;
      }
    }
    if (!triggerCharRemoved) {
      const start = textArea.selectionStart;
      const end = textArea.selectionEnd;
      textArea.value = textArea.value.substring(0, start) + text + textArea.value.substring(end);
      textArea.selectionStart = textArea.selectionEnd = start + text.length;
    }
    textArea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

  } else if (targetInput.isContentEditable) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);

      // Attempt to find and remove the '@' trigger
      // This is more complex for contentEditable and might need a robust solution
      // For now, we'll assume the trigger is just before the current cursor or part of the selection
      const container = range.startContainer;
      if (container.nodeType === Node.TEXT_NODE && container.textContent) {
        const atIndex = container.textContent.lastIndexOf('@', range.startOffset - 1);
        if (atIndex !== -1 && (range.startOffset - atIndex <= 20)) {
          range.setStart(container, atIndex); // Expand range to include '@'
          triggerCharRemoved = true;
        }
      }
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
      targetInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    } else { // Fallback if no selection
      targetInput.innerText += text; // This might not correctly replace '@'
      targetInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }
  } else {
    console.warn('ContextWeaver: Target input field is neither a textarea nor contenteditable with selection support.');
    return; // Don't log "Text inserted" if it wasn't
  }
  console.log('ContextWeaver: Text inserted.');
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
    let currentValue = '';
    const fieldToRead = inputField; // Use the closure's inputField

    if (config.isContentEditable) {
      currentValue = fieldToRead.innerText || '';
    } else {
      currentValue = (fieldToRead as HTMLTextAreaElement).value || '';
    }

    const inputEvent = event as InputEvent; // For potential use of inputEvent.data

    // Check if the last typed character is '@' or if the input data itself is '@'
    // This logic might need refinement to distinguish between typing '@' to trigger
    // and typing '@' as part of normal text.
    if (currentValue.endsWith('@') || (inputEvent.data === '@')) {
      // If UI is visible for another target, hide it first
      if (floatingUIPanel && floatingUIPanel.classList.contains(`${CSS_PREFIX}visible`) && currentTargetElementForPanel !== inputField) {
        hideFloatingUi();
      }
      showFloatingUi(inputField);
    } else {
      // If UI is visible for the current target and no '@' is present (or relevant part is deleted)
      if (floatingUIPanel && floatingUIPanel.classList.contains(`${CSS_PREFIX}visible`) && currentTargetElementForPanel?.isSameNode(inputField)) {
        // A more robust check would be to see if the specific '@' that triggered it is gone.
        // For now, if no '@' is in the current value, hide.
        if (!currentValue.includes('@')) { // Simplified check
          hideFloatingUi();
        }
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
      populateFloatingUiContent(); // Go back to main view
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
    populateFloatingUiContent(); // Go back to main view
  };
  form.appendChild(backButton);

  contentArea.appendChild(form);
}