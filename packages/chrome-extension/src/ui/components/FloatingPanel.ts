/**
 * @file FloatingPanel.ts
 * @description Manages the floating UI panel component for the Chrome Extension.
 * Handles panel creation, positioning, content updates, and dismissal logic.
 * @module ContextWeaver/CE
 */

import { Logger } from '@contextweaver/shared';
import { IFloatingPanel } from '../ports/IFloatingPanel';
import { StyleManager } from './StyleManager';
import { DOMFactory } from './DOMFactory';

const logger = new Logger('FloatingPanel');

/**
 * Manages the floating UI panel component with positioning, content updates, and dismissal handling.
 * Implements the IFloatingPanel interface to provide a consistent API for panel operations.
 */
export class FloatingPanel implements IFloatingPanel {
  private floatingUIPanel: HTMLElement | null = null;
  private titleElement: HTMLElement | null = null;
  private contentElement: HTMLElement | null = null;
  private closeButton: HTMLElement | null = null;
  private currentTargetElementForPanel: HTMLElement | null = null;
  private styleManager: StyleManager;
  private domFactory: DOMFactory;

  // Callback for hide event
  private onHideCallback: (() => void) | null = null;

  // Bound event handlers for cleanup
  private boundHandleEscapeKey = this.handleEscapeKey.bind(this);
  private boundHandleClickOutside = this.handleClickOutside.bind(this);

  /**
   * Initializes the FloatingPanel with required dependencies.
   * @param styleManager The StyleManager instance for styling operations.
   * @param domFactory The DOMFactory instance for DOM element creation.
   */
  constructor(styleManager: StyleManager, domFactory: DOMFactory) {
    this.styleManager = styleManager;
    this.domFactory = domFactory;
    logger.info('FloatingPanel initialized.');
  }

  /**
   * Creates the floating panel DOM structure if it doesn't exist.
   */
  private createPanel(): void {
    if (this.floatingUIPanel) return;

    this.floatingUIPanel = this.domFactory.createDiv({
      id: this.styleManager.getConstant('UI_PANEL_ID')
    });
    this.floatingUIPanel.setAttribute('role', 'dialog');
    this.floatingUIPanel.setAttribute('aria-modal', 'true');
    this.floatingUIPanel.setAttribute('aria-label', 'ContextWeaver Panel');
    this.floatingUIPanel.setAttribute('data-theme', this.styleManager.getCurrentTheme());

    const titleBarDiv = this.domFactory.createDiv({
      classNames: ['title-bar']
    });

    this.titleElement = this.domFactory.createDiv({
      classNames: ['title']
    });
    titleBarDiv.appendChild(this.titleElement);

    this.closeButton = this.domFactory.createButton('', {
      classNames: ['close-button'],
      onClick: () => this.hide()
    });
    this.closeButton.appendChild(this.domFactory.createIcon('close', { style: { marginRight: '0' } }));
    titleBarDiv.appendChild(this.closeButton);

    this.floatingUIPanel.appendChild(titleBarDiv);

    this.contentElement = this.domFactory.createDiv({
      classNames: ['content']
    });
    this.floatingUIPanel.appendChild(this.contentElement);

    document.body.appendChild(this.floatingUIPanel);
    logger.debug('Floating panel element created and appended to body.');
  }

  /**
   * Displays the floating UI panel, positioning it relative to a target input element.
   * It handles viewport collision to ensure the panel is always visible.
   * @param targetInputElement The HTML element (textarea or contenteditable) to which the UI panel should be anchored.
   * @param uiInitialTitle The initial title to display in the panel.
   * @param uiInitialContent Optional initial content. Can be an HTMLElement, DocumentFragment, or HTML string.
   * @param onHide Optional callback to execute when the UI is hidden.
   */
  public show(
    targetInputElement: HTMLElement,
    uiInitialTitle: string,
    uiInitialContent?: HTMLElement | DocumentFragment | string | null,
    onHide?: () => void
  ): void {
    this.onHideCallback = onHide || null;
    this.currentTargetElementForPanel = targetInputElement;

    if (!this.floatingUIPanel) {
      this.createPanel();
    }

    if (!this.floatingUIPanel || !this.titleElement || !this.contentElement) {
      logger.error('Panel elements not created, cannot show.');
      return;
    }

    // Step 1: Add the class that makes it display: block.
    // This ensures that when offsetHeight is read, the element has dimensions.
    this.floatingUIPanel.classList.add(`${this.styleManager.getConstant('CSS_PREFIX')}visible`);

    // Step 2: Temporarily make it invisible for measurement to avoid flicker,
    // then get dimensions.
    this.floatingUIPanel.style.visibility = 'hidden';

    const inputRect = targetInputElement.getBoundingClientRect();
    const panelHeight = this.floatingUIPanel.offsetHeight || 200; // Measure height

    // Step 3: Position it with viewport collision detection.
    let top = window.scrollY + inputRect.top - panelHeight - 8;
    let left = window.scrollX + inputRect.left;

    // Check if panel would go above viewport
    if (top < window.scrollY) {
      // Position below input instead
      top = window.scrollY + inputRect.bottom + 8;
    }

    // Check if panel would go beyond right edge
    const panelWidth = this.floatingUIPanel.offsetWidth || 320;
    if (left + panelWidth > window.scrollX + window.innerWidth) {
      left = window.scrollX + window.innerWidth - panelWidth - 8;
    }

    // Check if panel would go beyond left edge
    if (left < window.scrollX) {
      left = window.scrollX + 8;
    }

    this.floatingUIPanel.style.top = `${top}px`;
    this.floatingUIPanel.style.left = `${left}px`;

    // Step 4: Make it fully visible.
    // The 'cw-visible' class already handles 'display: block'.
    this.floatingUIPanel.style.visibility = 'visible';

    this.titleElement.textContent = uiInitialTitle;
    if (uiInitialContent) {
      if (typeof uiInitialContent === 'string') {
        this.contentElement.innerHTML = uiInitialContent;
      } else {
        this.contentElement.innerHTML = ''; // Clear previous
        this.contentElement.appendChild(uiInitialContent); // Works for HTMLElement or DocumentFragment
      }
    } else {
      this.contentElement.innerHTML = ''; // Clear content if null
    }

    this.addDismissalEventListeners();
    logger.info('Floating UI shown.');
  }

  /**
   * Hides the floating UI panel, clears its content, and invokes the onHide callback if provided.
   */
  public hide(): void {
    if (this.floatingUIPanel && this.floatingUIPanel.classList.contains(`${this.styleManager.getConstant('CSS_PREFIX')}visible`)) {
      this.floatingUIPanel.classList.remove(`${this.styleManager.getConstant('CSS_PREFIX')}visible`);

      // Clear content and reset title
      if (this.contentElement) {
        this.contentElement.innerHTML = '';
      }

      this.removeDismissalEventListeners();
      if (this.onHideCallback) {
        this.onHideCallback();
      }
      this.currentTargetElementForPanel = null; // Clear target on hide
      logger.info('Floating UI hidden.');
    }
  }

  /**
   * Updates the title of the floating UI panel.
   * @param titleText The new title text.
   */
  public updateTitle(titleText: string): void {
    if (this.titleElement) {
      this.titleElement.textContent = titleText;
    }
  }

  /**
   * Updates the main content area of the floating UI panel.
   * @param content The new content to display. Can be an HTMLElement, DocumentFragment, or HTML string.
   */
  public updateContent(content: HTMLElement | DocumentFragment | string): void {
    if (this.contentElement) {
      // Preserve scroll position of any scrollable containers
      const scrollableElements = this.contentElement.querySelectorAll('[style*="overflow"]');
      const scrollPositions = new Map<Element, number>();
      scrollableElements.forEach((el) => {
        if (el.scrollTop > 0) {
          scrollPositions.set(el, el.scrollTop);
        }
      });

      window.requestAnimationFrame(() => {
        if (this.contentElement) { // Check again inside requestAnimationFrame
          if (typeof content === 'string') {
            this.contentElement.innerHTML = content;
          } else {
            this.contentElement.innerHTML = ''; // Clear previous content
            this.contentElement.appendChild(content); // Works for HTMLElement or DocumentFragment
          }

          // Restore scroll positions after content update
          if (scrollPositions.size > 0) {
            // Wait for next frame to ensure DOM is updated
            window.requestAnimationFrame(() => {
              scrollPositions.forEach((scrollTop, el) => {
                // Try to find the element by its class or similar identifier
                const selector = el.className ? `.${el.className.split(' ').join('.')}` : null;
                if (selector && this.contentElement) {
                  const newEl = this.contentElement.querySelector(selector);
                  if (newEl) {
                    newEl.scrollTop = scrollTop;
                  }
                }
              });
            });
          }
        }
      });
    }
  }

  /**
   * Displays a loading state in the UI panel with a spinner and a message.
   * @param title The title to display during the loading state.
   * @param loadingMessage The message to display below the loading spinner.
   */
  public showLoading(title: string, loadingMessage: string): void {
    // Update title if needed
    this.updateTitle(title);
    if (!this.floatingUIPanel) {
      this.createPanel();
    }
    if (!this.floatingUIPanel || !this.contentElement) {
      logger.error('Panel elements not created, cannot show loading.');
      return;
    }

    // If a loading overlay already exists, update its message
    let loadingOverlay = this.floatingUIPanel.querySelector(`.${this.styleManager.getConstant('CSS_PREFIX')}loading-overlay`) as HTMLElement;
    if (loadingOverlay) {
      const loadingTextElement = loadingOverlay.querySelector(`.${this.styleManager.getConstant('CSS_PREFIX')}loading-text`);
      if (loadingTextElement) {
        loadingTextElement.textContent = loadingMessage;
      }
      // Ensure it's visible if it was hidden
      loadingOverlay.style.display = 'flex';
      return;
    }

    // Create new loading overlay
    loadingOverlay = this.domFactory.createDiv({
      classNames: ['loading-overlay']
    });
    const loadingIcon = this.domFactory.createIcon('progress_activity', { classNames: [`${this.styleManager.getConstant('CSS_PREFIX')}spinning`] });
    loadingIcon.style.fontSize = '40px';
    loadingIcon.style.margin = '20px auto';
    loadingIcon.style.marginRight = 'auto'; // Center it
    const loadingText = this.domFactory.createParagraph({ classNames: ['loading-text'], textContent: loadingMessage });
    loadingOverlay.appendChild(loadingIcon);
    loadingOverlay.appendChild(loadingText);
    this.floatingUIPanel.appendChild(loadingOverlay);
    logger.debug(`Loading overlay shown with message: ${loadingMessage}`);
  }

  /**
   * Hides the loading indicator.
   */
  public hideLoading(): void {
    if (this.floatingUIPanel) {
      const loadingOverlay = this.floatingUIPanel.querySelector(`.${this.styleManager.getConstant('CSS_PREFIX')}loading-overlay`) as HTMLElement;
      if (loadingOverlay) {
        loadingOverlay.remove();
        logger.debug('Loading overlay hidden.');
      }
    }
  }

  /**
   * Displays skeleton loading items in the content area.
   * @param count The number of skeleton items to display.
   */
  public showSkeletonLoading(count: number = 5): void {
    if (!this.contentElement) return;

    const container = this.domFactory.createDiv();
    for (let i = 0; i < count; i++) {
      const skeletonItem = this.domFactory.createDiv({
        classNames: ['skeleton-item']
      });
      container.appendChild(skeletonItem);
    }

    this.updateContent(container);
  }

  /**
   * Adds event listeners for panel dismissal (Escape key and click outside).
   */
  private addDismissalEventListeners(): void {
    document.addEventListener('keydown', this.boundHandleEscapeKey);
    document.addEventListener('mousedown', this.boundHandleClickOutside);
  }

  /**
   * Removes event listeners for panel dismissal.
   */
  private removeDismissalEventListeners(): void {
    document.removeEventListener('keydown', this.boundHandleEscapeKey);
    document.removeEventListener('mousedown', this.boundHandleClickOutside);
  }

  /**
   * Handles Escape key press to hide the panel.
   * @param event The keyboard event.
   */
  private handleEscapeKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.hide();
    }
  }

  /**
   * Handles click outside the panel to hide it.
   * @param event The mouse event.
   */
  private handleClickOutside(event: MouseEvent): void {
    if (this.floatingUIPanel && this.floatingUIPanel.classList.contains(`${this.styleManager.getConstant('CSS_PREFIX')}visible`)) {
      const target = event.target as Node;
      if (!this.floatingUIPanel.contains(target) && !(this.currentTargetElementForPanel && this.currentTargetElementForPanel.contains(target))) {
        this.hide();
      }
    }
  }
}