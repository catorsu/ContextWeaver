/**
 * @file INotificationManager.ts
 * @description Interface for managing notifications and modal dialogs in the Chrome extension.
 * @module ContextWeaver/CE
 */

/**
 * Interface for managing user notifications including toast messages and modal dialogs.
 * Provides methods for displaying different types of user feedback and information.
 */
export interface INotificationManager {
  /**
   * Shows a toast notification with the specified message and type.
   * @param message - The message to display in the toast
   * @param type - The type of toast (success, error, warning, info)
   * @param duration - Optional duration in milliseconds before auto-dismiss
   */
  showToast(message: string, type: 'success' | 'error' | 'warning' | 'info', duration?: number): void;

  /**
   * Shows a content modal dialog with the specified configuration.
   * @param title - The modal title
   * @param content - The modal content (HTML string or text)
   * @param actions - Optional array of action buttons for the modal
   */
  showContentModal(title: string, content: string, actions?: Array<{text: string, callback: () => void}>): void;
}