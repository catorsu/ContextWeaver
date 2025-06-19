// file: packages/chrome-extension/src/app/AppCoordinator.ts
// This is the final, complete version of the AppCoordinator.
// (This file is a combination of all previous steps and is provided for completeness)
import { UIManager } from '../uiManager';
import { StateManager } from '../ui/stateManager';
import { ThemeService } from './services/ThemeService';
import { ContextAPIService } from './services/ContextAPIService';
import { TextInsertionService } from './services/TextInsertionService';
import { InputHandler } from './handlers/InputHandler';
import { MessageHandler } from './handlers/MessageHandler';
import { ViewManager } from './view/ViewManager';
import { Logger, PushSnippetPayload, ContextBlockMetadata, SearchResult, FileContentResponsePayload, FolderContentResponsePayload, FileTreeResponsePayload, WorkspaceProblemsResponsePayload, EntireCodebaseResponsePayload } from '@contextweaver/shared';
import { debounce } from './utils/domUtils';
import { formatFileContentsForLLM } from './utils/formatters';

export class AppCoordinator {
    public readonly uiManager: UIManager;
    public readonly stateManager: StateManager;
    public readonly apiService: ContextAPIService;
    public readonly themeService: ThemeService;
    public readonly textInsertionService: TextInsertionService;
    public readonly viewManager: ViewManager;

    private readonly logger = new Logger('AppCoordinator');
    private readonly inputHandler: InputHandler;
    private readonly messageHandler: MessageHandler;
    private debouncedPerformSearch: (query: string) => Promise<void>;

    constructor() {
        this.uiManager = new UIManager();
        this.stateManager = new StateManager();
        this.apiService = new ContextAPIService();
        this.textInsertionService = new TextInsertionService();
        this.themeService = new ThemeService(this.uiManager);
        this.viewManager = new ViewManager(this.uiManager, this.stateManager, this);
        this.inputHandler = new InputHandler(this);
        this.messageHandler = new MessageHandler(this);
        this.debouncedPerformSearch = debounce(this.performSearch.bind(this), 300);
    }

    public initialize(): void {
        this.themeService.initialize();
        this.inputHandler.initialize();
        this.messageHandler.initialize();
        this.uiManager.setIndicatorCallbacks(
            this.handleIndicatorRemoval.bind(this),
            this.handleIndicatorClick.bind(this)
        );
        this.logger.info('AppCoordinator initialized and all components are ready.');
    }

    public handleTrigger(targetElement: HTMLElement, query?: string): void {
        this.stateManager.setCurrentTargetElementForPanel(targetElement);
        this.stateManager.setOriginalQueryTextFromUI(query);
        const onHideCallback = () => {
            this.logger.debug('UI hidden, callback from UIManager.');
            this.stateManager.onUiHidden();
        };
        if (query) {
            this.uiManager.show(targetElement, `"@${query}"`, null, onHideCallback);
            this.populateFloatingUiContent({ mode: 'search', query });
        } else {
            this.uiManager.show(targetElement, 'ContextWeaver', this.uiManager.getDOMFactory().createParagraph({ classNames: ['cw-loading-text'], textContent: 'Loading options...' }), onHideCallback);
            this.populateFloatingUiContent({ mode: 'general' });
        }
    }

    public async populateFloatingUiContent(uiContext: { mode: 'general' | 'search', query?: string }): Promise<void> {
        if (uiContext.mode === 'search' && uiContext.query?.trim()) {
            this.debouncedPerformSearch(uiContext.query);
            return;
        }
        this.uiManager.showLoading('ContextWeaver', 'Loading workspace details...');
        try {
            const response = await this.apiService.getWorkspaceDetails();
            if (response.error || !response.success) {
                this.uiManager.showToast(`Workspace Error: ${response.error || 'Unknown error'} (Code: ${response.errorCode || 'N/A'})`, 'error');
                return;
            }
            if (response.data) {
                if (!response.data.isTrusted) {
                    this.uiManager.showToast('Workspace Untrusted: Please trust the workspace in VS Code.', 'error');
                    return;
                }
                this.viewManager.showGeneralOptions(response);
            } else {
                this.uiManager.showToast('Connection Issue: Could not retrieve workspace details.', 'error');
            }
        } catch (error) {
            this.logger.error('Error requesting workspace details:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.uiManager.showToast(`Communication Error: ${errorMessage}`, 'error');
        } finally {
            this.uiManager.hideLoading();
        }
    }

    public async performSearch(query: string): Promise<void> {
        this.stateManager.setSearchQuery(query);
        try {
            const response = await this.apiService.searchWorkspace(query, null);
            this.stateManager.setSearchResponse(response);
            this.viewManager.showSearchResults(response, query);
        } catch (error) {
            this.logger.error('Error during search:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.uiManager.showToast(`Search Error: ${errorMessage}`, 'error');
        }
    }

    public async handleContentInsertionRequest(itemMetadata: { type: string; name: string; contentSourceId: string; uri?: string; workspaceFolderUri?: string | null }, itemDivForFeedback?: HTMLElement | null, hideOnSuccess: boolean = true): Promise<void> {
        const targetElementForThisOperation = this.stateManager.getCurrentTargetElementForPanel();
        if (this.stateManager.isDuplicateContentSource(itemMetadata.contentSourceId)) {
            this.uiManager.showError('Content Already Added', `Content from '${itemMetadata.name}' is already added.`);
            setTimeout(() => this.uiManager.hide(), 2000);
            return;
        }
        if (itemDivForFeedback) {
            itemDivForFeedback.style.opacity = '0.5';
            itemDivForFeedback.style.pointerEvents = 'none';
        }
        this.uiManager.showLoading(`Loading ${itemMetadata.name}...`, 'Fetching content...');
        try {
            let responsePayload: FileContentResponsePayload | FolderContentResponsePayload | FileTreeResponsePayload | EntireCodebaseResponsePayload | WorkspaceProblemsResponsePayload;
            let contentTag: 'FileContents' | 'FileTree' | 'WorkspaceProblems' = 'FileContents';
            if (itemMetadata.type === 'file') responsePayload = await this.apiService.getFileContent(itemMetadata.uri!);
            else if (itemMetadata.type === 'folder') responsePayload = await this.apiService.getFolderContent(itemMetadata.uri!, itemMetadata.workspaceFolderUri || null);
            else if (itemMetadata.type === 'FileTree') { contentTag = 'FileTree'; responsePayload = await this.apiService.getFileTree(itemMetadata.workspaceFolderUri || null); }
            else if (itemMetadata.type === 'codebase_content') responsePayload = await this.apiService.getEntireCodebase(itemMetadata.workspaceFolderUri || null);
            else if (itemMetadata.type === 'WorkspaceProblems') { contentTag = 'WorkspaceProblems'; responsePayload = await this.apiService.getWorkspaceProblems(itemMetadata.workspaceFolderUri!); }
            else throw new Error(`Unsupported item type: ${itemMetadata.type}`);

            if (responsePayload.success && responsePayload.data) {
                if (itemMetadata.type === 'WorkspaceProblems' && 'problemCount' in responsePayload.data && responsePayload.data.problemCount === 0) {
                    this.uiManager.showToast('No problems found in this workspace.', 'info');
                    return;
                }
                let contentToInsert: string;
                let metadataFromResponse: ContextBlockMetadata;
                if (itemMetadata.type === 'FileTree') { contentToInsert = (responsePayload as FileTreeResponsePayload).data!.fileTreeString; metadataFromResponse = (responsePayload as FileTreeResponsePayload).data!.metadata; }
                else if (itemMetadata.type === 'WorkspaceProblems') { contentToInsert = (responsePayload as WorkspaceProblemsResponsePayload).data!.problemsString; metadataFromResponse = (responsePayload as WorkspaceProblemsResponsePayload).data!.metadata; }
                else if (itemMetadata.type === 'file') { contentToInsert = formatFileContentsForLLM([(responsePayload as FileContentResponsePayload).data!.fileData]); metadataFromResponse = (responsePayload as FileContentResponsePayload).data!.metadata; }
                else { contentToInsert = formatFileContentsForLLM((responsePayload as FolderContentResponsePayload).data!.filesData); metadataFromResponse = (responsePayload as FolderContentResponsePayload).data!.metadata; }

                const uniqueBlockId = metadataFromResponse.unique_block_id || `cw-block-${Date.now()}`;
                const finalContentToInsertInLLM = `<${contentTag} id="${uniqueBlockId}">\n${contentToInsert}\n</${contentTag}>`;
                this.textInsertionService.insertTextIntoLLMInput(finalContentToInsertInLLM, targetElementForThisOperation, this.stateManager.getOriginalQueryTextFromUI());
                this.stateManager.addActiveContextBlock({ ...metadataFromResponse, unique_block_id: uniqueBlockId });
                if (targetElementForThisOperation) {
                    this.renderContextIndicators(targetElementForThisOperation);
                }
                if (hideOnSuccess) this.uiManager.hide();
            } else {
                this.uiManager.showToast(`Error Loading ${itemMetadata.name}: ${responsePayload.error || 'Failed to get content.'}`, 'error');
            }
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Error fetching content for ${itemMetadata.name}:`, err);
            this.uiManager.showToast(`Error Loading ${itemMetadata.name}: ${err.message}`, 'error');
        } finally {
            if (itemDivForFeedback) { itemDivForFeedback.style.opacity = ''; itemDivForFeedback.style.pointerEvents = ''; }
            if (hideOnSuccess) {
                this.uiManager.hideLoading();
            }
        }
    }

    public handleIndicatorRemoval(uniqueBlockId: string, blockType: string): void {
        const targetElement = this.stateManager.getCurrentTargetElementForPanel();
        if (targetElement) {
            if (this.stateManager.getActiveContextBlocks().some(block => block.unique_block_id === uniqueBlockId)) {
                // Map blockType from metadata to the actual tag name used for insertion
                let tagName: string;
                switch (blockType) {
                    case 'file_content':
                    case 'folder_content':
                    case 'codebase_content':
                        tagName = 'FileContents';
                        break;
                    case 'FileTree':
                        tagName = 'FileTree';
                        break;
                    case 'WorkspaceProblems':
                        tagName = 'WorkspaceProblems';
                        break;
                    case 'CodeSnippet':
                        tagName = 'CodeSnippet';
                        break;
                    default:
                        this.logger.error(`Unknown blockType for removal: ${blockType}`);
                        return;
                }

                // Remove text block from input
                const blockPattern = new RegExp(`<${tagName}[^>]*id="${uniqueBlockId}"[^>]*>[\\s\\S]*?</${tagName}>\\n?`, 'g');
                this.textInsertionService.replaceInLLMInput(blockPattern, '', targetElement);
                // Remove block from state
                this.stateManager.removeActiveContextBlock(uniqueBlockId);
                // Re-render indicators
                this.renderContextIndicators(targetElement);
            }
        }
    }

    public handleIndicatorClick(uniqueBlockId: string, label: string): void {
        const targetElement = this.stateManager.getCurrentTargetElementForPanel();
        if (targetElement) {
            const textContent = targetElement instanceof HTMLTextAreaElement ? targetElement.value : targetElement.textContent || '';
            // Find the block content
            const blockMatch = textContent.match(new RegExp(`<[^>]*id="${uniqueBlockId}"[^>]*>([\\s\\S]*?)</[^>]*>`, 'i'));
            if (blockMatch && blockMatch[1]) {
                this.uiManager.showContentModal(label, blockMatch[1]);
            }
        }
    }

    public renderContextIndicators(explicitTarget: HTMLElement | null): void {
        this.uiManager.renderContextIndicators(this.stateManager.getActiveContextBlocks(), explicitTarget);
    }

    public async handleBrowseFolder(item: SearchResult): Promise<void> {
        this.uiManager.showLoading(`Browsing: ${item.name}`, 'Loading folder contents...');
        try {
            const browseResponse = await this.apiService.listFolderContents(item.uri, item.workspaceFolderUri);
            this.viewManager.showBrowseView(browseResponse, item.workspaceFolderUri);
        } catch (error) {
            const err = error as Error;
            this.logger.error('Error getting folder contents:', err);
            this.uiManager.showToast(`Error Browsing ${item.name}: ${err.message}`, 'error');
        } finally {
            this.uiManager.hideLoading();
        }
    }

    public async handleShowOpenFiles(): Promise<void> {
        this.uiManager.showLoading('Loading Open Files', 'Fetching list of open files...');
        try {
            const openFilesResponse = await this.apiService.getOpenFiles();
            if (openFilesResponse.success && openFilesResponse.data?.openFiles) {
                // Filter out files without a workspaceFolderUri since they're required by the UI
                const validOpenFiles = openFilesResponse.data.openFiles
                    .filter((file): file is typeof file & { workspaceFolderUri: string } => file.workspaceFolderUri !== null);
                this.viewManager.showOpenFiles(validOpenFiles);
            } else {
                const errorMsg = openFilesResponse.error || 'Failed to get open files list.';
                this.uiManager.showToast(`Open Files Error: ${errorMsg}`, 'error');
            }
        } catch (err) {
            const error = err as Error;
            this.logger.error('Error in open files workflow:', error);
            this.uiManager.showToast(`Open Files Error: ${error.message}`, 'error');
        } finally {
            this.uiManager.hideLoading();
        }
    }

    public handleBackToSearchResults(): void {
        const response = this.stateManager.getSearchResponse();
        const query = this.stateManager.getSearchQuery();
        if (response && query) {
            this.viewManager.showSearchResults(response, query);
        } else {
            this.uiManager.showToast('Navigation Error: Could not restore search results.', 'error');
        }
    }

    public handleSnippetInsertion(payload: PushSnippetPayload): void {
        const targetElement = this.stateManager.getCurrentTargetElementForPanel();
        if (targetElement) {
            const uniqueBlockId = payload.metadata.unique_block_id;
            const formattedSnippet = `<CodeSnippet id="${uniqueBlockId}" filePath="${payload.filePath}" startLine="${payload.startLine}" endLine="${payload.endLine}">
${payload.snippet}
</CodeSnippet>`;
            this.textInsertionService.insertTextIntoLLMInput(formattedSnippet, targetElement, undefined);
            this.stateManager.addActiveContextBlock(payload.metadata);
            this.renderContextIndicators(targetElement);
        }
    }

    public handleExtensionError(payload: unknown): void {
        const errorMessage = payload && typeof payload === 'object' && 'message' in payload ? String(payload.message) : 'Unknown error';
        this.uiManager.showToast(`Extension Error: ${errorMessage}`, 'error');
    }

    public async handleActiveFileSelect(): Promise<void> {
        const targetElement = this.stateManager.getCurrentTargetElementForPanel();
        if (targetElement) {
            try {
                const response = await this.apiService.getActiveFileInfo();
                if (response.success && response.data) {
                    await this.handleContentInsertionRequest({ 
                        type: 'file', 
                        name: response.data.activeFileLabel,
                        contentSourceId: response.data.activeFilePath,
                        uri: response.data.activeFilePath,
                        workspaceFolderUri: response.data.workspaceFolderUri
                    });
                } else {
                    this.uiManager.showToast(`Failed to get active file info: ${response.error || 'Unknown error'}`, 'error');
                }
            } catch (error) {
                const err = error as Error;
                this.logger.error('Error getting active file info:', err);
                this.uiManager.showToast(`Failed to get active file info: ${err.message}`, 'error');
            }
        }
    }

    public handleOpenFilesSelect(): void {
        this.handleShowOpenFiles();
    }

    public handleFileTreeSelect(name: string, contentSourceId: string, workspaceFolderUri: string | null): void {
        this.handleContentInsertionRequest({ type: 'FileTree', name, contentSourceId, workspaceFolderUri });
    }

    public handleCodebaseSelect(name: string, contentSourceId: string, workspaceFolderUri: string | null): void {
        this.handleContentInsertionRequest({ type: 'codebase_content', name, contentSourceId, workspaceFolderUri });
    }

    public handleProblemsSelect(name: string, contentSourceId: string, workspaceFolderUri: string | null): void {
        this.handleContentInsertionRequest({ type: 'WorkspaceProblems', name, contentSourceId, workspaceFolderUri });
    }

    private async _batchInsert(items: Array<{ type: string; name: string; contentSourceId: string; uri?: string; workspaceFolderUri?: string | null }>, loadingTitle: string): Promise<void> {
        this.logger.info(`Batch inserting ${items.length} items.`);
        if (items.length === 0) {
            this.uiManager.showToast('No items selected.', 'info');
            return;
        }

        this.uiManager.showLoading(loadingTitle, `Inserting ${items.length} selected items...`);

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const isLastItem = i === items.length - 1;
            await this.handleContentInsertionRequest(item, null, isLastItem);
        }
    }

    public async handleInsertSelectedFiles(selectedFiles: Array<{ type: string; name: string; contentSourceId: string; uri?: string; workspaceFolderUri?: string | null }>): Promise<void> {
        await this._batchInsert(selectedFiles, 'Inserting Files...');
    }

    public async handleInsertSelectedBrowseItems(selectedItems: Array<{ type: string; name: string; contentSourceId: string; uri?: string; workspaceFolderUri?: string | null }>): Promise<void> {
        await this._batchInsert(selectedItems, 'Inserting Items...');
    }
}
