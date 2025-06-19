/**
 * @file IFloatingPanel.ts
 * @description Interface for managing floating panel UI components in the Chrome extension.
 * @module ContextWeaver/CE
 */

/**
 * Interface for managing floating panel components that can be shown/hidden and updated dynamically.
 * Provides methods for controlling panel visibility and content updates.
 */
export interface IFloatingPanel {
  /**
   * Displays the floating UI panel, positioning it relative to a target input element.
   * @param targetInputElement The HTML element to anchor the panel to.
   * @param uiInitialTitle The initial title to display in the panel.
   * @param uiInitialContent Optional initial content.
   * @param onHide Optional callback to execute when the UI is hidden.
   */
  show(
    targetInputElement: HTMLElement,
    uiInitialTitle: string,
    uiInitialContent?: HTMLElement | DocumentFragment | string | null,
    onHide?: () => void
  ): void;

  /**
   * Hides the floating panel from view.
   */
  hide(): void;

  /**
   * Updates the content displayed within the floating panel.
   * @param content The new content to display.
   */
  updateContent(content: HTMLElement | DocumentFragment | string): void;

  /**
   * Updates the title of the floating panel.
   * @param title The new title text to display.
   */
  updateTitle(title: string): void;

  /**
   * Displays a loading state in the UI panel with a spinner and a message.
   * @param title The title to display during the loading state.
   * @param loadingMessage The message to display below the loading spinner.
   */
  showLoading(title: string, loadingMessage: string): void;

  /**
   * Hides the loading indicator.
   */
  hideLoading(): void;

  /**
   * Displays skeleton loading items in the content area.
   * @param count The number of skeleton items to display.
   */
  showSkeletonLoading(count?: number): void;
}