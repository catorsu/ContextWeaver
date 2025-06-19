/**
 * @file IndicatorManager.ts
 * @description Manages context indicators for the Chrome Extension UI.
 * Handles rendering, positioning, and interaction with context block indicators.
 * @module ContextWeaver/CE
 */

import { ContextBlockMetadata } from '@contextweaver/shared';
import { Logger } from '@contextweaver/shared';
import { IIndicatorManager } from '../ports/IIndicatorManager';
import { StyleManager } from './StyleManager';
import { DOMFactory } from './DOMFactory';

const logger = new Logger('IndicatorManager');

/**
 * Manages the display and interaction of context indicators in the Chrome Extension.
 * Context indicators show active context blocks above input elements.
 */
export class IndicatorManager implements IIndicatorManager {
  private contextIndicatorArea: HTMLElement | null = null;
  private styleManager: StyleManager;
  private domFactory: DOMFactory;
  private onIndicatorRemoveCallback: ((uniqueBlockId: string, blockType: string) => void) | null = null;
  private onIndicatorClickCallback: ((uniqueBlockId: string, label: string) => void) | null = null;

  /**
   * Initializes the IndicatorManager with required dependencies.
   * @param styleManager The StyleManager instance for styling operations.
   * @param domFactory The DOMFactory instance for creating DOM elements.
   */
  constructor(styleManager: StyleManager, domFactory: DOMFactory) {
    this.styleManager = styleManager;
    this.domFactory = domFactory;
    logger.info('IndicatorManager initialized.');
  }

  /**
   * Sets the callback functions to be invoked when context indicators are interacted with.
   * @param onRemove The callback function that receives the unique block ID and block type of the indicator to be removed.
   * @param onClick The callback function that receives the unique block ID and label when an indicator is clicked.
   */
  public setIndicatorCallbacks(
    onRemove: (uniqueBlockId: string, blockType: string) => void,
    onClick: (uniqueBlockId: string, label: string) => void
  ): void {
    this.onIndicatorRemoveCallback = onRemove;
    this.onIndicatorClickCallback = onClick;
  }

  /**
   * Renders or updates the context indicators above the target input element.
   * Each indicator represents an active context block (e.g., an inserted file).
   * This method handles creating the indicator area and inserting it into the DOM
   * with site-specific placement logic.
   * @param activeContextBlocks A readonly array of ContextBlockMetadata objects for the active context blocks.
   * @param targetInputElement The HTML element (textarea or contenteditable) above which the indicators should be rendered.
   */
  public renderContextIndicators(
    activeContextBlocks: Readonly<ContextBlockMetadata[]>,
    targetInputElement: HTMLElement | null
  ): void {
    if (!targetInputElement) {
      logger.warn('No target input for context indicators.');
      if (this.contextIndicatorArea) this.contextIndicatorArea.style.display = 'none';
      return;
    }

    if (!this.contextIndicatorArea) {
      this.contextIndicatorArea = this.domFactory.createDiv({
        id: this.styleManager.getConstant('CONTEXT_INDICATOR_AREA_ID')
      });
      // Apply current theme to context indicator area
      this.contextIndicatorArea.setAttribute('data-theme', this.styleManager.getCurrentTheme());

      const currentHostname = window.location.hostname;

      if (currentHostname.includes('chat.deepseek.com')) {
        // For DeepSeek, the structure is more nested. The goal is to place the indicator area
        // as a sibling to the main chat message area, which means placing it before the
        // main container of the input textarea. This is typically 3 levels up from the textarea.
        const inputWrapper = targetInputElement.parentElement?.parentElement?.parentElement;
        if (inputWrapper && inputWrapper.parentElement) {
          logger.debug('Applying DeepSeek-specific indicator placement.');
          // Insert the indicator area BEFORE the wrapper of the text input area.
          inputWrapper.parentElement.insertBefore(this.contextIndicatorArea, inputWrapper);
        } else {
          // Fallback to generic logic if the expected structure isn't found
          logger.warn('DeepSeek structure not found, using generic placement.');
          this.insertIndicatorAreaGeneric(targetInputElement);
        }
      } else if (currentHostname.includes('aistudio.google.com')) {
        // For AI Studio, the best anchor is the <ms-prompt-input-wrapper> custom element.
        // We traverse up from the textarea to find it.
        const promptWrapper = targetInputElement.closest('ms-prompt-input-wrapper');
        if (promptWrapper) {
          logger.debug('Applying AI Studio-specific indicator placement.');
          // Prepend the indicator area as the first child of the wrapper for encapsulation.
          promptWrapper.prepend(this.contextIndicatorArea);
        } else {
          logger.warn('AI Studio <ms-prompt-input-wrapper> not found, using generic placement.');
          this.insertIndicatorAreaGeneric(targetInputElement);
        }
      } else {
        // Use generic placement for other sites
        this.insertIndicatorAreaGeneric(targetInputElement);
      }
    }

    this.contextIndicatorArea.innerHTML = ''; // Clear existing indicators

    activeContextBlocks.forEach((block: { unique_block_id: string; content_source_id: string; type: string; label: string }) => {
      const indicator = this.domFactory.createDiv({
        classNames: ['context-indicator']
      });
      indicator.dataset.uniqueBlockId = block.unique_block_id;
      indicator.dataset.contentSourceId = block.content_source_id;
      indicator.title = 'Click to view content';

      let iconName: string;
      switch (block.type) {
        case 'file_content': iconName = 'description'; break;
        case 'folder_content': iconName = 'folder'; break;
        case 'codebase_content': iconName = 'menu_book'; break;
        case 'FileTree': iconName = 'account_tree'; break;
        case 'CodeSnippet': iconName = 'content_cut'; break;
        case 'WorkspaceProblems': iconName = 'error'; break;
        default: iconName = 'help';
      }
      indicator.appendChild(this.domFactory.createIcon(iconName, { style: { marginRight: '4px' } }));

      const labelSpan = this.domFactory.createSpan({
        textContent: block.label,
        style: { marginLeft: '4px' }
      });
      indicator.appendChild(labelSpan);

      const closeBtn = this.domFactory.createButton('×', {
        classNames: ['indicator-close-btn'],
        onClick: (e) => {
          e.stopPropagation(); // Prevent the main indicator click handler from firing
          if (this.onIndicatorRemoveCallback && closeBtn.dataset.uniqueBlockId && closeBtn.dataset.blockType) {
            this.onIndicatorRemoveCallback(closeBtn.dataset.uniqueBlockId, closeBtn.dataset.blockType);
          } else {
            logger.error('Indicator remove callback not set or button missing data.');
          }
        }
      });
      closeBtn.dataset.uniqueBlockId = block.unique_block_id;
      closeBtn.dataset.blockType = block.type; // Store block type for removal logic

      indicator.onclick = () => {
        if (this.onIndicatorClickCallback && block.unique_block_id && block.label) {
          this.onIndicatorClickCallback(block.unique_block_id, block.label);
        }
      };

      indicator.appendChild(closeBtn);
      this.contextIndicatorArea!.appendChild(indicator);
    });

    if (activeContextBlocks.length === 0) {
      this.contextIndicatorArea.style.display = 'none';
    } else {
      this.contextIndicatorArea.style.display = 'flex';
    }
  }

  /**
   * Helper method for generic placement of the context indicator area.
   * @param targetInputElement The element to position relative to.
   */
  private insertIndicatorAreaGeneric(targetInputElement: HTMLElement): void {
    if (!this.contextIndicatorArea) return; // Guard

    // Check if both parent and grandparent exist for robust insertion
    if (targetInputElement.parentElement && targetInputElement.parentElement.parentElement) {
      // Insert the indicator area BEFORE the input element's parent (targetInputElement.parentElement)
      // This makes the indicator area a sibling to the input field's parent, effectively placing it "above" the entire input block.
      targetInputElement.parentElement.parentElement.insertBefore(this.contextIndicatorArea, targetInputElement.parentElement);
    } else if (targetInputElement.parentElement) {
      // Fallback: If no grandparent, but a parent exists, insert as a sibling to the input.
      // This might still cause overlap on some sites but is better than appending to body globally.
      logger.warn('Target input\'s grandparent not found for indicator area. Inserting as sibling to input.');
      targetInputElement.parentElement.insertBefore(this.contextIndicatorArea, targetInputElement);
    }
    else {
      // Last resort: Append to body.
      logger.warn('Target input has no parent for indicator area. Appending to body.');
      document.body.appendChild(this.contextIndicatorArea);
    }
  }
}