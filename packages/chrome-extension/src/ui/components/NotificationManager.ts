/**
 * @file NotificationManager.ts
 * @description Manages toast notifications and modal dialogs for the Chrome Extension.
 * Provides methods for displaying different types of user feedback and information.
 * @module ContextWeaver/CE
 */

import { INotificationManager } from '../ports/INotificationManager';
import { StyleManager } from './StyleManager';
import { DOMFactory } from './DOMFactory';
import { Logger } from '@contextweaver/shared';

const logger = new Logger('NotificationManager');

/**
 * Manages user notifications including toast messages and modal dialogs.
 * Implements the INotificationManager interface for standardized notification handling.
 */
export class NotificationManager implements INotificationManager {
  private styleManager: StyleManager;
  private domFactory: DOMFactory;

  /**
   * Initializes the NotificationManager with required dependencies.
   * @param styleManager - The StyleManager instance for applying styles
   * @param domFactory - The DOMFactory instance for creating DOM elements
   */
  constructor(styleManager: StyleManager, domFactory: DOMFactory) {
    this.styleManager = styleManager;
    this.domFactory = domFactory;
    logger.info('NotificationManager initialized.');
  }

  /**
   * Displays a non-blocking toast notification.
   * @param message The message to display in the toast.
   * @param type The type of toast ('success', 'error', 'warning', or 'info') for styling.
   * @param duration Optional duration in milliseconds before auto-dismiss (default: 3000).
   */
  public showToast(message: string, type: 'success' | 'error' | 'warning' | 'info', duration: number = 3000): void {
    const toast = document.createElement('div');
    toast.className = `${this.styleManager.getConstant('CSS_PREFIX')}toast-notification ${type}`;

    // Create message span
    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    toast.appendChild(messageSpan);

    // Create dismiss button
    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = '×';
    Object.assign(dismissBtn.style, {
      background: 'none',
      border: 'none',
      color: 'inherit',
      fontSize: '20px',
      marginLeft: '12px',
      cursor: 'pointer',
      padding: '0',
      lineHeight: '1'
    });

    let isManuallyDismissed = false;
    dismissBtn.onclick = () => {
      isManuallyDismissed = true;
      toast.classList.remove('show');
      toast.addEventListener('transitionend', () => toast.remove());
    };
    toast.appendChild(dismissBtn);

    document.body.appendChild(toast);

    // Trigger reflow to enable transition
    void toast.offsetWidth;
    toast.classList.add('show');

    setTimeout(() => {
      if (!isManuallyDismissed) {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
      }
    }, duration);

    logger.debug(`Toast notification shown: ${message} (type: ${type})`);
  }

  /**
   * Displays a modal window with the provided content.
   * @param title The title for the modal window.
   * @param content The text content to display within the modal.
   * @param actions Optional array of action buttons for the modal.
   */
  public showContentModal(title: string, content: string, actions?: Array<{text: string, callback: () => void}>): void {
    // Remove existing modal if any to prevent duplicates
    const existingModal = document.querySelector(`.${this.styleManager.getConstant('CSS_PREFIX')}modal-overlay`);
    if (existingModal) {
      existingModal.remove();
    }

    const modalOverlay = this.domFactory.createDiv({ classNames: [`${this.styleManager.getConstant('CSS_PREFIX')}modal-overlay`] });
    const modalContent = this.domFactory.createDiv({ classNames: [`${this.styleManager.getConstant('CSS_PREFIX')}modal-content`] });

    const modalHeader = this.domFactory.createDiv({ classNames: [`${this.styleManager.getConstant('CSS_PREFIX')}modal-header`] });
    const modalTitle = this.domFactory.createDiv({ classNames: [`${this.styleManager.getConstant('CSS_PREFIX')}modal-title`], textContent: title });
    const modalClose = this.domFactory.createButton('×', {
      classNames: [`${this.styleManager.getConstant('CSS_PREFIX')}modal-close`],
      onClick: () => {
        modalOverlay.classList.remove('visible');
        modalOverlay.addEventListener('transitionend', () => modalOverlay.remove(), { once: true });
      }
    });

    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(modalClose);

    const modalBody = this.domFactory.createDiv({ classNames: [`${this.styleManager.getConstant('CSS_PREFIX')}modal-body`] });
    modalBody.textContent = content; // Use textContent to preserve formatting within the pre-styled div

    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalBody);

    // Add action buttons if provided
    if (actions && actions.length > 0) {
      const modalFooter = this.domFactory.createDiv({ classNames: [`${this.styleManager.getConstant('CSS_PREFIX')}modal-footer`] });
      actions.forEach(action => {
        const actionButton = this.domFactory.createButton(action.text, {
          classNames: [`${this.styleManager.getConstant('CSS_PREFIX')}modal-action-btn`],
          onClick: () => {
            action.callback();
            modalClose.click(); // Close modal after action
          }
        });
        modalFooter.appendChild(actionButton);
      });
      modalContent.appendChild(modalFooter);
    }

    modalOverlay.appendChild(modalContent);

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        modalClose.click();
      }
    });

    document.body.appendChild(modalOverlay);

    // Trigger transition
    requestAnimationFrame(() => {
      modalOverlay.classList.add('visible');
    });

    logger.debug(`Content modal shown: ${title}`);
  }

  /**
   * Displays an error message as a toast notification.
   * This is a convenience method that creates an error toast with the provided title and message.
   * @param title The title for the error message.
   * @param errorMessage The main error message to display.
   * @param errorCode Optional. An error code to display alongside the message.
   */
  public showError(title: string, errorMessage: string, errorCode?: string): void {
    const fullErrorMessage = errorCode ? `${title}: ${errorMessage} (Code: ${errorCode})` : `${title}: ${errorMessage}`;
    this.showToast(fullErrorMessage, 'error');
    logger.warn(`Error notification shown: ${fullErrorMessage}`);
  }
}