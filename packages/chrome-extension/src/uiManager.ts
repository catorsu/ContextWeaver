/**
 * @file uiManager.ts
 * @description Manages the floating user interface elements and context indicators for the Chrome Extension.
 * Provides methods for showing/hiding the UI, updating its content, and creating various DOM elements.
 * @module ContextWeaver/CE
 */

import { ContextBlockMetadata } from '@contextweaver/shared'; // Import shared type

import { Logger } from '@contextweaver/shared';
import { StyleManager } from './ui/components/StyleManager';
import { DOMFactory } from './ui/components/DOMFactory';
import { NotificationManager } from './ui/components/NotificationManager';
import { FloatingPanel } from './ui/components/FloatingPanel';
import { IndicatorManager } from './ui/components/IndicatorManager';

const logger = new Logger('UIManager');

/**
 * Manages the floating user interface (UI) panel and context indicators for the Chrome Extension.
 * Provides methods to control the visibility, content, and styling of the UI.
 */
export class UIManager {
  private styleManager: StyleManager;
  private domFactory: DOMFactory;
  private notificationManager: NotificationManager;
  private floatingPanel: FloatingPanel;
  private indicatorManager: IndicatorManager;


  /**
   * Initializes the UIManager, injecting necessary CSS into the document.
   */
  constructor() {
    this.styleManager = new StyleManager();
    this.domFactory = new DOMFactory(this.styleManager);
    this.notificationManager = new NotificationManager(this.styleManager, this.domFactory);
    this.floatingPanel = new FloatingPanel(this.styleManager, this.domFactory);
    this.indicatorManager = new IndicatorManager(this.styleManager, this.domFactory);
    logger.info('UIManager initialized with StyleManager, DOMFactory, NotificationManager, FloatingPanel, and IndicatorManager.');
  }

  /**
   * Sets the theme for the UI.
   * @param theme The theme to apply ('light' or 'dark').
   */
  public setTheme(theme: 'light' | 'dark'): void {
    this.styleManager.applyTheme(theme);
    logger.debug(`Theme set to: ${theme}`);
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
    this.floatingPanel.show(targetInputElement, uiInitialTitle, uiInitialContent, onHide);
  }

  /**
   * Hides the floating UI panel, clears its content, and invokes the onHide callback if provided.
   */
  public hide(): void {
    this.floatingPanel.hide();
  }

  /**
   * Updates the title of the floating UI panel.
   * @param titleText The new title text.
   */
  public updateTitle(titleText: string): void {
    this.floatingPanel.updateTitle(titleText);
  }

  /**
   * Updates the main content area of the floating UI panel.
   * @param content The new content to display. Can be an HTMLElement, DocumentFragment, or HTML string.
   */
  public updateContent(content: HTMLElement | DocumentFragment | string): void {
    this.floatingPanel.updateContent(content);
  }

  /**
   * Displays a loading state in the UI panel with a spinner and a message.
   * @param title The title to display during the loading state.
   * @param loadingMessage The message to display below the loading spinner.
   */
  public showLoading(title: string, loadingMessage: string): void {
    this.floatingPanel.showLoading(title, loadingMessage);
  }

  /**
   * Hides the loading indicator.
   */
  public hideLoading(): void {
    this.floatingPanel.hideLoading();
  }

  /**
   * Displays skeleton loading items in the content area.
   * @param count The number of skeleton items to display.
   */
  public showSkeletonLoading(count: number = 5): void {
    this.floatingPanel.showSkeletonLoading(count);
  }

  /**
   * Displays an error message in the UI panel.
   * @param title The title for the error message.
   * @param errorMessage The main error message to display.
   * @param errorCode Optional. An error code to display alongside the message.
   */
  public showError(title: string, errorMessage: string, errorCode?: string): void {
    this.notificationManager.showError(title, errorMessage, errorCode);
    // The main floating panel's content and state remain unchanged.
    // It is not cleared or closed by showError.
  }

  /**
   * Displays a modal window with the provided content.
   * @param title The title for the modal window.
   * @param content The text content to display within the modal.
   */
  public showContentModal(title: string, content: string): void {
    this.notificationManager.showContentModal(title, content);
  }

  /**
   * Displays a non-blocking toast notification.
   * @param message The message to display in the toast.
   * @param type The type of toast ('success', 'error', 'warning', or 'info') for styling.
   */
  public showToast(message: string, type: 'success' | 'error' | 'warning' | 'info'): void {
    this.notificationManager.showToast(message, type);
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
    this.indicatorManager.setIndicatorCallbacks(onRemove, onClick);
  }

  /**
   * Renders or updates the context indicators above the target input element.
   * Each indicator represents an active context block (e.g., an inserted file).
   * @param activeContextBlocks A readonly array of ContextBlockMetadata objects for the active context blocks.
   * @param targetInputElement The HTML element (textarea or contenteditable) above which the indicators should be rendered.
   */
  public renderContextIndicators(
    activeContextBlocks: Readonly<ContextBlockMetadata[]>, // Use shared type
    targetInputElement: HTMLElement | null
  ): void {
    this.indicatorManager.renderContextIndicators(activeContextBlocks, targetInputElement);
  }




  /**
   * Retrieves a constant value used within the UIManager for CSS prefixes or element IDs.
   * @param key The name of the constant to retrieve.
   * @returns The string value of the requested constant.
   */
  public getConstant(key: 'CSS_PREFIX' | 'UI_PANEL_ID' | 'CONTEXT_INDICATOR_AREA_ID'): string {
    return this.styleManager.getConstant(key);
  }

  /**
   * Provides access to the DOMFactory for external components that need to create DOM elements.
   * @returns The DOMFactory instance used by this UIManager.
   */
  public getDOMFactory(): DOMFactory {
    return this.domFactory;
  }
}