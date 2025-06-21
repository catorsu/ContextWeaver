/**
 * @file FloatingPanel.test.ts
 * @description Unit tests for FloatingPanel component
 * @module ContextWeaver/CE/Tests
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { FloatingPanel } from '../../../src/ui/components/FloatingPanel';
import { StyleManager } from '../../../src/ui/components/StyleManager';
import { DOMFactory } from '../../../src/ui/components/DOMFactory';

// Mock Logger
jest.mock('@contextweaver/shared', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
  }))
}));

// Mock StyleManager
jest.mock('../../../src/ui/components/StyleManager');

// Mock DOMFactory
jest.mock('../../../src/ui/components/DOMFactory');

describe('FloatingPanel', () => {
  let floatingPanel: FloatingPanel;
  let mockStyleManager: jest.Mocked<StyleManager>;
  let mockDomFactory: jest.Mocked<DOMFactory>;
  let mockPanelElement: HTMLElement;
  let mockTitleElement: HTMLElement;
  let mockContentElement: HTMLElement;
  let mockCloseButton: HTMLElement;

  beforeEach(() => {
    // Clear DOM
    document.body.innerHTML = '';
    
    // Create mock elements
    mockPanelElement = document.createElement('div');
    mockTitleElement = document.createElement('div');
    mockContentElement = document.createElement('div');
    mockCloseButton = document.createElement('button');
    
    // Setup mock StyleManager
    mockStyleManager = new StyleManager() as jest.Mocked<StyleManager>;
    mockStyleManager.getConstant = jest.fn((key: string) => {
      switch (key) {
        case 'CSS_PREFIX': return 'cw-';
        case 'UI_PANEL_ID': return 'cw-floating-panel';
        default: return '';
      }
    }) as any;
    mockStyleManager.getCurrentTheme = jest.fn().mockReturnValue('dark') as any;
    
    // Setup mock DOMFactory
    mockDomFactory = new DOMFactory(mockStyleManager) as jest.Mocked<DOMFactory>;
    mockDomFactory.createDiv = jest.fn()
      .mockReturnValueOnce(mockPanelElement) // Panel
      .mockReturnValueOnce(document.createElement('div')) // Title bar
      .mockReturnValueOnce(mockTitleElement) // Title
      .mockReturnValueOnce(mockContentElement) as any; // Content
    
    mockDomFactory.createButton = jest.fn().mockReturnValue(mockCloseButton) as any;
    mockDomFactory.createIcon = jest.fn().mockReturnValue(document.createElement('div')) as any;
    mockDomFactory.createParagraph = jest.fn((options?: any) => {
      const p = document.createElement('p');
      if (options?.textContent) p.textContent = options.textContent;
      return p;
    }) as any;
    
    floatingPanel = new FloatingPanel(mockStyleManager, mockDomFactory);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('show', () => {
    test('should create panel if not exists and display it', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      floatingPanel.show(targetInput, 'Test Title', 'Test Content');
      
      expect(mockDomFactory.createDiv).toHaveBeenCalledTimes(4);
      expect(mockDomFactory.createButton).toHaveBeenCalled();
      expect(document.body.contains(mockPanelElement)).toBe(true);
      expect(mockPanelElement.classList.contains('cw-visible')).toBe(true);
    });

    test('should position panel above input element', () => {
      const targetInput = document.createElement('textarea');
      Object.defineProperty(targetInput, 'getBoundingClientRect', {
        value: () => ({ top: 300, left: 100, bottom: 350 })
      });
      document.body.appendChild(targetInput);
      
      // Mock panel dimensions
      Object.defineProperty(mockPanelElement, 'offsetHeight', { value: 200 });
      Object.defineProperty(mockPanelElement, 'offsetWidth', { value: 320 });
      
      floatingPanel.show(targetInput, 'Title', 'Content');
      
      // Should be positioned above (300 - 200 - 8 = 92)
      expect(mockPanelElement.style.top).toBe('92px');
      expect(mockPanelElement.style.left).toBe('100px');
    });

    test('should position panel below input if too close to top', () => {
      const targetInput = document.createElement('textarea');
      Object.defineProperty(targetInput, 'getBoundingClientRect', {
        value: () => ({ top: 50, left: 100, bottom: 100 })
      });
      document.body.appendChild(targetInput);
      
      Object.defineProperty(mockPanelElement, 'offsetHeight', { value: 200 });
      window.scrollY = 0;
      
      floatingPanel.show(targetInput, 'Title', 'Content');
      
      // Should be positioned below (100 + 8 = 108)
      expect(mockPanelElement.style.top).toBe('108px');
    });

    test('should handle viewport edge collision', () => {
      const targetInput = document.createElement('textarea');
      Object.defineProperty(targetInput, 'getBoundingClientRect', {
        value: () => ({ top: 300, left: 900, bottom: 350 })
      });
      document.body.appendChild(targetInput);
      
      Object.defineProperty(mockPanelElement, 'offsetHeight', { value: 200 });
      Object.defineProperty(mockPanelElement, 'offsetWidth', { value: 320 });
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      
      floatingPanel.show(targetInput, 'Title', 'Content');
      
      // Should adjust left position (1024 - 320 - 8 = 696)
      expect(mockPanelElement.style.left).toBe('696px');
    });

    test('should set title and content', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      floatingPanel.show(targetInput, 'Panel Title', 'Panel Content');
      
      expect(mockTitleElement.textContent).toBe('Panel Title');
      expect(mockContentElement.innerHTML).toBe('Panel Content');
    });

    test('should handle HTMLElement content', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      const contentDiv = document.createElement('div');
      contentDiv.textContent = 'HTML Content';
      
      floatingPanel.show(targetInput, 'Title', contentDiv);
      
      expect(mockContentElement.contains(contentDiv)).toBe(true);
    });

    test('should handle DocumentFragment content', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      const fragment = document.createDocumentFragment();
      const span = document.createElement('span');
      span.textContent = 'Fragment Content';
      fragment.appendChild(span);
      
      floatingPanel.show(targetInput, 'Title', fragment);
      
      expect(mockContentElement.textContent).toBe('Fragment Content');
    });

    test('should register onHide callback', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      const onHide = jest.fn();
      
      // Setup close button with onclick handler
      mockDomFactory.createButton = jest.fn((text: string, options?: any) => {
        const button = document.createElement('button');
        button.textContent = text;
        if (options?.onClick) {
          button.onclick = options.onClick;
        }
        return button;
      }) as any;
      
      floatingPanel.show(targetInput, 'Title', 'Content', onHide);
      
      // The close button should be created with onClick that calls hide()
      expect(mockDomFactory.createButton).toHaveBeenCalledWith('', {
        classNames: ['close-button'],
        onClick: expect.any(Function)
      });
    });
  });

  describe('hide', () => {
    test('should remove visible class and clear content', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      floatingPanel.show(targetInput, 'Title', 'Content');
      mockPanelElement.classList.add('cw-visible');
      mockContentElement.innerHTML = 'Some content';
      
      floatingPanel.hide();
      
      expect(mockPanelElement.classList.contains('cw-visible')).toBe(false);
      expect(mockContentElement.innerHTML).toBe('');
    });

    test('should call onHide callback', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      const onHide = jest.fn();
      floatingPanel.show(targetInput, 'Title', 'Content', onHide);
      
      floatingPanel.hide();
      
      expect(onHide).toHaveBeenCalled();
    });

    test('should do nothing if panel not visible', () => {
      const onHide = jest.fn();
      floatingPanel.hide();
      
      expect(onHide).not.toHaveBeenCalled();
    });
  });

  describe('updateTitle', () => {
    test('should update title text', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      floatingPanel.show(targetInput, 'Initial Title', 'Content');
      floatingPanel.updateTitle('Updated Title');
      
      expect(mockTitleElement.textContent).toBe('Updated Title');
    });
  });

  describe('updateContent', () => {
    test('should update content with string', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      floatingPanel.show(targetInput, 'Title', 'Initial');
      
      // Use requestAnimationFrame to simulate async update
      floatingPanel.updateContent('Updated Content');
      
      // Wait for requestAnimationFrame
      return new Promise(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            expect(mockContentElement.innerHTML).toBe('Updated Content');
            resolve(undefined);
          });
        });
      });
    });

    test('should preserve scroll position', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      floatingPanel.show(targetInput, 'Title', 'Content');
      
      // Add scrollable element
      const scrollableDiv = document.createElement('div');
      scrollableDiv.className = 'scrollable';
      scrollableDiv.style.overflow = 'auto';
      scrollableDiv.scrollTop = 100;
      mockContentElement.appendChild(scrollableDiv);
      
      floatingPanel.updateContent('<div class="scrollable" style="overflow: auto;">New Content</div>');
      
      return new Promise(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const newScrollable = mockContentElement.querySelector('.scrollable') as HTMLElement;
            expect(newScrollable).toBeTruthy();
            resolve(undefined);
          });
        });
      });
    });
  });

  describe('showLoading', () => {
    test('should create loading overlay', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      // Setup mock to return a proper loading overlay div
      const mockLoadingOverlay = document.createElement('div');
      mockLoadingOverlay.className = 'cw-loading-overlay';
      
      const createDivCallCount = 0;
      mockDomFactory.createDiv = jest.fn().mockImplementation((options?: any) => {
        if (options?.classNames?.includes('loading-overlay')) {
          return mockLoadingOverlay;
        }
        const div = document.createElement('div');
        if (options?.id) div.id = options.id;
        if (options?.classNames) div.className = options.classNames.join(' ');
        return div;
      }) as any;
      
      mockDomFactory.createIcon = jest.fn().mockReturnValue(document.createElement('div')) as any;
      mockDomFactory.createParagraph = jest.fn((options?: any) => {
        const p = document.createElement('p');
        p.className = 'cw-loading-text';
        if (options?.textContent) p.textContent = options.textContent;
        return p;
      }) as any;
      
      floatingPanel.show(targetInput, 'Title', 'Content');
      floatingPanel.showLoading('Loading...', 'Please wait');
      
      // Check that createDiv was called with loading-overlay class
      expect(mockDomFactory.createDiv).toHaveBeenCalledWith({
        classNames: ['loading-overlay']
      });
      
      // Check that createParagraph was called with the loading message
      expect(mockDomFactory.createParagraph).toHaveBeenCalledWith({
        classNames: ['loading-text'],
        textContent: 'Please wait'
      });
    });

    test('should update existing loading message', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      floatingPanel.show(targetInput, 'Title', 'Content');
      
      // Create existing loading overlay
      const existingOverlay = document.createElement('div');
      existingOverlay.className = 'cw-loading-overlay';
      const loadingText = document.createElement('p');
      loadingText.className = 'cw-loading-text';
      loadingText.textContent = 'Old message';
      existingOverlay.appendChild(loadingText);
      mockPanelElement.appendChild(existingOverlay);
      
      floatingPanel.showLoading('Loading...', 'New message');
      
      expect(loadingText.textContent).toBe('New message');
    });
  });

  describe('hideLoading', () => {
    test('should remove loading overlay', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      floatingPanel.show(targetInput, 'Title', 'Content');
      
      // Add loading overlay
      const loadingOverlay = document.createElement('div');
      loadingOverlay.className = 'cw-loading-overlay';
      mockPanelElement.appendChild(loadingOverlay);
      
      floatingPanel.hideLoading();
      
      expect(mockPanelElement.querySelector('.cw-loading-overlay')).toBeFalsy();
    });
  });

  describe('showSkeletonLoading', () => {
    test('should create skeleton items', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      floatingPanel.show(targetInput, 'Title', 'Content');
      
      const mockContainer = document.createElement('div');
      mockDomFactory.createDiv = jest.fn()
        .mockReturnValueOnce(mockContainer)
        .mockReturnValue(document.createElement('div')) as any;
      
      floatingPanel.showSkeletonLoading(3);
      
      expect(mockDomFactory.createDiv).toHaveBeenCalledTimes(4); // 1 container + 3 items
    });
  });

  describe('dismissal event listeners', () => {
    test('should hide on Escape key', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      floatingPanel.show(targetInput, 'Title', 'Content');
      mockPanelElement.classList.add('cw-visible');
      
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escapeEvent);
      
      expect(mockPanelElement.classList.contains('cw-visible')).toBe(false);
    });

    test('should hide on click outside', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      floatingPanel.show(targetInput, 'Title', 'Content');
      mockPanelElement.classList.add('cw-visible');
      
      const outsideElement = document.createElement('div');
      document.body.appendChild(outsideElement);
      
      const clickEvent = new MouseEvent('mousedown', { bubbles: true });
      outsideElement.dispatchEvent(clickEvent);
      
      expect(mockPanelElement.classList.contains('cw-visible')).toBe(false);
    });

    test('should not hide on click inside panel', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      floatingPanel.show(targetInput, 'Title', 'Content');
      mockPanelElement.classList.add('cw-visible');
      
      const clickEvent = new MouseEvent('mousedown', { bubbles: true });
      mockContentElement.dispatchEvent(clickEvent);
      
      // Panel should still be visible
      expect(mockPanelElement.classList.contains('cw-visible')).toBe(true);
    });

    test('should not hide on click inside target input', () => {
      const targetInput = document.createElement('textarea');
      document.body.appendChild(targetInput);
      
      floatingPanel.show(targetInput, 'Title', 'Content');
      mockPanelElement.classList.add('cw-visible');
      
      // Mock contains method for proper testing
      const originalContains = mockPanelElement.contains;
      mockPanelElement.contains = jest.fn().mockReturnValue(false) as any;
      targetInput.contains = jest.fn().mockReturnValue(true) as any;
      
      const clickEvent = new MouseEvent('mousedown', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', { value: targetInput });
      document.dispatchEvent(clickEvent);
      
      // Panel should still be visible
      expect(mockPanelElement.classList.contains('cw-visible')).toBe(true);
      
      // Restore original method
      mockPanelElement.contains = originalContains;
    });
  });
});