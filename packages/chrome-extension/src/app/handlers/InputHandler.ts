/**
 * @file InputHandler.ts
 * @description Manages the LLM input field, detects the '@' trigger, and notifies the coordinator.
 * @module ContextWeaver/VSCE
 */
import { AppCoordinator } from '../AppCoordinator';
import { Logger } from '@contextweaver/shared';

interface LLMInputConfig {
    hostSuffix: string;
    selector: string;
    isAttached?: boolean;
    attachedElement?: HTMLElement | null;
}

export class InputHandler {
    private coordinator: AppCoordinator;
    private logger = new Logger('InputHandler');
    private llmInputsConfig: LLMInputConfig[] = [
        { hostSuffix: 'chat.deepseek.com', selector: 'textarea#chat-input' },
        { hostSuffix: 'aistudio.google.com', selector: 'ms-chunk-input textarea' }
    ];
    private eventHandlers = new Map<HTMLElement, (event: Event) => void>();

    /**
     * @description Creates an instance of InputHandler.
     * @param {AppCoordinator} coordinator - The AppCoordinator instance to interact with.
     */
    constructor(coordinator: AppCoordinator) {
        this.coordinator = coordinator;
    }

    /**
     * @description Initializes the trigger detection by observing LLM input fields.
     * It checks for existing input fields and sets up MutationObservers for dynamically loaded ones.
     */
    public initialize(): void {
        const currentHostname = window.location.hostname;
        this.logger.debug(`Initializing trigger detection on ${currentHostname}`);

        for (const config of this.llmInputsConfig) {
            if (currentHostname.includes(config.hostSuffix)) {
                this.logger.debug(`Hostname match for ${config.hostSuffix}. Looking for selector: ${config.selector}`);
                const inputField = document.querySelector(config.selector) as HTMLElement;
                if (inputField) {
                    this.attachListenerToInputField(inputField, config);
                } else {
                    this.logger.debug(`Input field ${config.selector} not found immediately. Setting up MutationObserver.`);
                    this.observeForElement(config);
                }
            }
        }
    }

    /**
     * @description Attaches an input event listener to the specified LLM input field.
     * This listener detects the '@' trigger and orchestrates UI updates via the coordinator.
     * @param {HTMLElement} inputField - The input field to attach the listener to.
     * @param {LLMInputConfig} config - The configuration for the current LLM input field.
     */
    private attachListenerToInputField(inputField: HTMLElement, config: LLMInputConfig): void {
        if (config.attachedElement?.isSameNode(inputField) && this.eventHandlers.has(inputField)) {
            return;
        }
        if (config.attachedElement && this.eventHandlers.has(config.attachedElement)) {
            const oldHandler = this.eventHandlers.get(config.attachedElement);
            if (oldHandler) {
                config.attachedElement.removeEventListener('input', oldHandler);
                this.eventHandlers.delete(config.attachedElement);
            }
        }

        this.logger.debug('Attaching listener to input field:', { selector: config.selector, element: inputField });
        inputField.dataset.cwSelector = config.selector;

        const handleSpecificEvent = () => {
            const fieldToRead = inputField as HTMLTextAreaElement | HTMLElement;
            const rawValue = (fieldToRead as HTMLTextAreaElement).value || '';
            const cursorPos = (fieldToRead as HTMLTextAreaElement).selectionStart || 0;
            const textBeforeCursor = rawValue.substring(0, cursorPos);
            const atMatch = /@(\S*)$/.exec(textBeforeCursor);

            if (atMatch) {
                const fullTriggerText = atMatch[0];
                const queryText = atMatch[1];

                if (this.coordinator.uiManager.getConstant('UI_PANEL_ID') && this.coordinator.stateManager.getCurrentTargetElementForPanel() !== inputField) {
                    this.coordinator.uiManager.hide();
                }

                this.coordinator.stateManager.setCurrentTargetElementForPanel(inputField);

                if (queryText.length > 0) {
                    this.coordinator.handleTrigger(inputField, queryText);
                } else {
                    const charImmediatelyAfterAt = rawValue.charAt(textBeforeCursor.lastIndexOf('@') + 1);
                    const isAtAloneOrFollowedBySpace = fullTriggerText === '@' || charImmediatelyAfterAt === ' ';
                    if (isAtAloneOrFollowedBySpace) {
                        this.coordinator.handleTrigger(inputField);
                    } else {
                        if (document.getElementById(this.coordinator.uiManager.getConstant('UI_PANEL_ID'))?.classList.contains('cw-visible') && this.coordinator.stateManager.getCurrentTargetElementForPanel()?.isSameNode(inputField)) {
                            this.logger.debug('Ambiguous \'@\' trigger, hiding UI.');
                            this.coordinator.uiManager.hide();
                        }
                    }
                }
            } else {
                if (document.getElementById(this.coordinator.uiManager.getConstant('UI_PANEL_ID'))?.classList.contains('cw-visible') && this.coordinator.stateManager.getCurrentTargetElementForPanel()?.isSameNode(inputField)) {
                    this.logger.debug('No valid \'@\' trigger found at cursor, hiding UI.');
                    this.coordinator.uiManager.hide();
                }
            }

            if (this.coordinator.stateManager.getActiveContextBlocks().length > 0) {
                const currentContent = (fieldToRead as HTMLTextAreaElement).value;
                const blocksToRemove = this.coordinator.stateManager.getActiveContextBlocks()
                    .filter(block => !currentContent.includes(`id="${block.unique_block_id}"`))
                    .map(block => block.unique_block_id);

                if (blocksToRemove.length > 0) {
                    this.logger.debug(`Detected manual removal of ${blocksToRemove.length} context blocks. Syncing indicators.`);
                    blocksToRemove.forEach(blockId => this.coordinator.stateManager.removeActiveContextBlock(blockId));
                    this.coordinator.renderContextIndicators(inputField);
                }
            }
        };

        inputField.addEventListener('input', handleSpecificEvent);
        this.eventHandlers.set(inputField, handleSpecificEvent);
        config.attachedElement = inputField;
        config.isAttached = true;
    }

    /**
     * @description Sets up a MutationObserver to detect when the LLM input field becomes available in the DOM.
     * This is crucial for dynamically loaded content.
     * @param {LLMInputConfig} config - The configuration for the current LLM input field.
     */
    private observeForElement(config: LLMInputConfig): void {
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
                this.logger.debug(`Element with selector ${config.selector} found/re-found by MutationObserver.`);
                this.attachListenerToInputField(inputField, config);
            }
        });
        this.logger.debug(`Setting up/re-arming MutationObserver for selector: ${config.selector}`);
        observer.observe(document.body, { childList: true, subtree: true });
    }
}
