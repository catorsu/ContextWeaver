/**
 * @file NotificationManager.test.ts
 * @description Unit tests for NotificationManager component
 * @module ContextWeaver/CE/Tests
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NotificationManager } from '../../../src/ui/components/NotificationManager';
import { StyleManager } from '../../../src/ui/components/StyleManager';
import { DOMFactory } from '../../../src/ui/components/DOMFactory';

// Mock Logger
jest.mock('@contextweaver/shared', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }))
}));

// Mock StyleManager
jest.mock('../../../src/ui/components/StyleManager');

// Mock DOMFactory
jest.mock('../../../src/ui/components/DOMFactory');

describe('NotificationManager', () => {
  let notificationManager: NotificationManager;
  let mockStyleManager: jest.Mocked<StyleManager>;
  let mockDomFactory: jest.Mocked<DOMFactory>;

  beforeEach(() => {
    // Clear DOM
    document.body.innerHTML = '';
    
    // Setup mock StyleManager
    mockStyleManager = new StyleManager() as jest.Mocked<StyleManager>;
    mockStyleManager.getConstant = jest.fn((key: string) => {
      if (key === 'CSS_PREFIX') return 'cw-';
      return '';
    }) as any;
    
    // Setup mock DOMFactory
    mockDomFactory = new DOMFactory(mockStyleManager) as jest.Mocked<DOMFactory>;
    mockDomFactory.createDiv = jest.fn((options: any = {}) => {
      const div = document.createElement('div');
      if (options.classNames) div.className = options.classNames.join(' ');
      if (options.textContent) div.textContent = options.textContent;
      return div;
    }) as any;
    mockDomFactory.createButton = jest.fn((text: string, options: any = {}) => {
      const button = document.createElement('button');
      button.textContent = text;
      if (options.onClick) button.onclick = options.onClick;
      if (options.classNames) button.className = options.classNames.join(' ');
      return button;
    }) as any;
    
    notificationManager = new NotificationManager(mockStyleManager, mockDomFactory);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset timers
    jest.useRealTimers();
  });

  describe('showToast', () => {
    test('should create and display toast notification', () => {
      notificationManager.showToast('Test message', 'success');
      
      const toast = document.querySelector('.cw-toast-notification');
      expect(toast).toBeTruthy();
      expect(toast?.classList.contains('success')).toBe(true);
      expect(toast?.textContent).toContain('Test message');
    });

    test('should apply correct type class', () => {
      const types: Array<'success' | 'error' | 'warning' | 'info'> = ['success', 'error', 'warning', 'info'];
      
      types.forEach(type => {
        notificationManager.showToast(`${type} message`, type);
        
        const toast = document.querySelector(`.cw-toast-notification.${type}`);
        expect(toast).toBeTruthy();
        
        // Clean up for next iteration
        toast?.remove();
      });
    });

    test('should include dismiss button', () => {
      notificationManager.showToast('Test message', 'info');
      
      const dismissBtn = document.querySelector('.cw-toast-notification button');
      expect(dismissBtn).toBeTruthy();
      expect(dismissBtn?.textContent).toBe('×');
    });

    test('should auto-dismiss after duration', () => {
      jest.useFakeTimers();
      
      notificationManager.showToast('Test message', 'info', 1000);
      
      const toast = document.querySelector('.cw-toast-notification');
      expect(toast?.classList.contains('show')).toBe(true);
      
      // Fast forward time
      jest.advanceTimersByTime(1000);
      
      expect(toast?.classList.contains('show')).toBe(false);
    });

    test('should dismiss on button click', () => {
      notificationManager.showToast('Test message', 'info');
      
      const toast = document.querySelector('.cw-toast-notification');
      const dismissBtn = toast?.querySelector('button') as HTMLButtonElement;
      
      expect(toast?.classList.contains('show')).toBe(true);
      
      dismissBtn.click();
      
      expect(toast?.classList.contains('show')).toBe(false);
    });

    test('should not auto-dismiss if manually dismissed', () => {
      jest.useFakeTimers();
      
      notificationManager.showToast('Test message', 'info', 1000);
      
      const toast = document.querySelector('.cw-toast-notification');
      const dismissBtn = toast?.querySelector('button') as HTMLButtonElement;
      
      // Manually dismiss
      dismissBtn.click();
      
      // Fast forward time
      jest.advanceTimersByTime(1000);
      
      // Should already be dismissed, no double dismissal
      expect(toast?.classList.contains('show')).toBe(false);
    });

    test('should add show class after creation', () => {
      notificationManager.showToast('Test message', 'info');
      
      const toast = document.querySelector('.cw-toast-notification') as HTMLElement;
      
      // The toast should have the 'show' class added
      expect(toast.classList.contains('show')).toBe(true);
    });
  });

  describe('showContentModal', () => {
    test('should create and display modal', () => {
      notificationManager.showContentModal('Test Title', 'Test Content');
      
      const modalOverlay = document.querySelector('.cw-modal-overlay');
      const modalContent = document.querySelector('.cw-modal-content');
      const modalTitle = document.querySelector('.cw-modal-title');
      const modalBody = document.querySelector('.cw-modal-body');
      
      expect(modalOverlay).toBeTruthy();
      expect(modalContent).toBeTruthy();
      expect(modalTitle?.textContent).toBe('Test Title');
      expect(modalBody?.textContent).toBe('Test Content');
    });

    test('should remove existing modal before creating new one', () => {
      // Create first modal
      notificationManager.showContentModal('First Modal', 'First Content');
      
      // Create second modal
      notificationManager.showContentModal('Second Modal', 'Second Content');
      
      const modals = document.querySelectorAll('.cw-modal-overlay');
      expect(modals.length).toBe(1);
      
      const modalTitle = document.querySelector('.cw-modal-title');
      expect(modalTitle?.textContent).toBe('Second Modal');
    });

    test('should close modal on close button click', () => {
      notificationManager.showContentModal('Test Title', 'Test Content');
      
      const modalOverlay = document.querySelector('.cw-modal-overlay') as HTMLElement;
      const closeBtn = document.querySelector('.cw-modal-close') as HTMLButtonElement;
      
      modalOverlay.classList.add('visible');
      
      closeBtn.click();
      
      expect(modalOverlay.classList.contains('visible')).toBe(false);
    });

    test('should close modal on overlay click', () => {
      notificationManager.showContentModal('Test Title', 'Test Content');
      
      const modalOverlay = document.querySelector('.cw-modal-overlay') as HTMLElement;
      modalOverlay.classList.add('visible');
      
      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', { value: modalOverlay });
      modalOverlay.dispatchEvent(clickEvent);
      
      expect(modalOverlay.classList.contains('visible')).toBe(false);
    });

    test('should not close modal on content click', () => {
      notificationManager.showContentModal('Test Title', 'Test Content');
      
      const modalOverlay = document.querySelector('.cw-modal-overlay') as HTMLElement;
      const modalContent = document.querySelector('.cw-modal-content') as HTMLElement;
      modalOverlay.classList.add('visible');
      
      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', { value: modalContent });
      modalOverlay.dispatchEvent(clickEvent);
      
      expect(modalOverlay.classList.contains('visible')).toBe(true);
    });

    test('should add action buttons when provided', () => {
      const action1 = jest.fn();
      const action2 = jest.fn();
      
      notificationManager.showContentModal('Test Title', 'Test Content', [
        { text: 'Action 1', callback: action1 },
        { text: 'Action 2', callback: action2 }
      ]);
      
      const modalFooter = document.querySelector('.cw-modal-footer');
      const actionButtons = modalFooter?.querySelectorAll('.cw-modal-action-btn');
      
      expect(modalFooter).toBeTruthy();
      expect(actionButtons?.length).toBe(2);
      expect(actionButtons?.[0].textContent).toBe('Action 1');
      expect(actionButtons?.[1].textContent).toBe('Action 2');
    });

    test('should execute action callback and close modal', () => {
      const actionCallback = jest.fn();
      
      notificationManager.showContentModal('Test Title', 'Test Content', [
        { text: 'Test Action', callback: actionCallback }
      ]);
      
      const modalOverlay = document.querySelector('.cw-modal-overlay') as HTMLElement;
      const actionButton = document.querySelector('.cw-modal-action-btn') as HTMLButtonElement;
      modalOverlay.classList.add('visible');
      
      actionButton.click();
      
      expect(actionCallback).toHaveBeenCalled();
      expect(modalOverlay.classList.contains('visible')).toBe(false);
    });

    test('should trigger transition on show', (done) => {
      notificationManager.showContentModal('Test Title', 'Test Content');
      
      const modalOverlay = document.querySelector('.cw-modal-overlay') as HTMLElement;
      
      // Should not have visible class immediately
      expect(modalOverlay.classList.contains('visible')).toBe(false);
      
      // Should have visible class after requestAnimationFrame
      requestAnimationFrame(() => {
        expect(modalOverlay.classList.contains('visible')).toBe(true);
        done();
      });
    });
  });

  describe('showError', () => {
    test('should show error toast with title and message', () => {
      notificationManager.showError('Error Title', 'Error message');
      
      const toast = document.querySelector('.cw-toast-notification.error');
      expect(toast).toBeTruthy();
      expect(toast?.textContent).toContain('Error Title: Error message');
    });

    test('should include error code when provided', () => {
      notificationManager.showError('Error Title', 'Error message', 'ERR_001');
      
      const toast = document.querySelector('.cw-toast-notification.error');
      expect(toast?.textContent).toContain('Error Title: Error message (Code: ERR_001)');
    });

    test('should call showToast internally', () => {
      const showToastSpy = jest.spyOn(notificationManager, 'showToast');
      
      notificationManager.showError('Test Error', 'Test message', 'TEST_ERR');
      
      expect(showToastSpy).toHaveBeenCalledWith(
        'Test Error: Test message (Code: TEST_ERR)',
        'error'
      );
    });
  });
});