/**
 * @file DOMFactory.test.ts
 * @description Unit tests for DOMFactory component
 * @module ContextWeaver/CE/Tests
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { DOMFactory } from '../../../src/ui/components/DOMFactory';
import { StyleManager } from '../../../src/ui/components/StyleManager';

// Mock StyleManager
jest.mock('../../../src/ui/components/StyleManager');

// Mock chrome.runtime.getURL
global.chrome = {
  runtime: {
    getURL: jest.fn((path: string) => `chrome-extension://mock-id/${path}`)
  }
} as any;

describe('DOMFactory', () => {
  let domFactory: DOMFactory;
  let mockStyleManager: jest.Mocked<StyleManager>;

  beforeEach(() => {
    // Clear DOM
    document.body.innerHTML = '';
    
    // Create mock StyleManager
    mockStyleManager = new StyleManager() as jest.Mocked<StyleManager>;
    mockStyleManager.getConstant = jest.fn((key: string) => {
      if (key === 'CSS_PREFIX') return 'cw-';
      return '';
    }) as any;
    
    domFactory = new DOMFactory(mockStyleManager);
  });

  describe('createButton', () => {
    test('should create button with text', () => {
      const button = domFactory.createButton('Click me');
      
      expect(button).toBeInstanceOf(HTMLButtonElement);
      expect(button.type).toBe('button');
      expect(button.textContent).toBe('Click me');
      expect(button.className).toBe('cw-button');
    });

    test('should apply optional properties', () => {
      const onClick = jest.fn();
      const button = domFactory.createButton('Test', {
        id: 'test-btn',
        classNames: ['primary', 'cw-large'],
        onClick,
        disabled: true,
        style: { color: 'red', fontSize: '16px' }
      });
      
      expect(button.id).toBe('test-btn');
      expect(button.classList.contains('cw-primary')).toBe(true);
      expect(button.classList.contains('cw-large')).toBe(true);
      expect(button.disabled).toBe(true);
      expect(button.style.color).toBe('red');
      expect(button.style.fontSize).toBe('16px');
      
      // Test click handler
      expect(button.onclick).toBe(onClick);
    });

    test('should not duplicate CSS prefix', () => {
      const button = domFactory.createButton('Test', {
        classNames: ['cw-existing', 'new-class']
      });
      
      expect(button.classList.contains('cw-existing')).toBe(true);
      expect(button.classList.contains('cw-new-class')).toBe(true);
      expect(button.classList.length).toBe(3); // cw-button + 2 classes
    });
  });

  describe('createDiv', () => {
    test('should create empty div', () => {
      const div = domFactory.createDiv();
      
      expect(div).toBeInstanceOf(HTMLDivElement);
      expect(div.childNodes.length).toBe(0);
    });

    test('should apply optional properties', () => {
      const div = domFactory.createDiv({
        id: 'test-div',
        classNames: ['container', 'cw-panel'],
        textContent: 'Hello World',
        style: { width: '100px' }
      });
      
      expect(div.id).toBe('test-div');
      expect(div.classList.contains('cw-container')).toBe(true);
      expect(div.classList.contains('cw-panel')).toBe(true);
      expect(div.textContent).toBe('Hello World');
      expect(div.style.width).toBe('100px');
    });

    test('should handle children array', () => {
      const childDiv = document.createElement('div');
      childDiv.textContent = 'Child';
      
      const fragment = document.createDocumentFragment();
      const span = document.createElement('span');
      span.textContent = 'Fragment span';
      fragment.appendChild(span);
      
      const div = domFactory.createDiv({
        children: [childDiv, 'Text node', fragment]
      });
      
      expect(div.childNodes.length).toBe(3);
      expect(div.childNodes[0]).toBe(childDiv);
      expect(div.childNodes[1].textContent).toBe('Text node');
      expect(div.childNodes[2]).toBe(span);
    });

    test('should set textContent before adding children', () => {
      const childDiv = document.createElement('div');
      childDiv.textContent = 'Child';
      
      const div = domFactory.createDiv({
        textContent: 'This should be overwritten',
        children: [childDiv]
      });
      
      // The textContent is set first, then children are appended
      // So the final textContent includes both
      expect(div.textContent).toBe('This should be overwrittenChild');
      expect(div.childNodes.length).toBe(2); // text node + child div
    });
  });

  describe('createSpan', () => {
    test('should create span with text', () => {
      const span = domFactory.createSpan({
        textContent: 'Span text'
      });
      
      expect(span).toBeInstanceOf(HTMLSpanElement);
      expect(span.textContent).toBe('Span text');
    });

    test('should apply classes and styles', () => {
      const span = domFactory.createSpan({
        classNames: ['highlight', 'bold'],
        style: { fontWeight: 'bold' }
      });
      
      expect(span.classList.contains('cw-highlight')).toBe(true);
      expect(span.classList.contains('cw-bold')).toBe(true);
      expect(span.style.fontWeight).toBe('bold');
    });
  });

  describe('createParagraph', () => {
    test('should create paragraph with text', () => {
      const p = domFactory.createParagraph({
        textContent: 'Paragraph text'
      });
      
      expect(p).toBeInstanceOf(HTMLParagraphElement);
      expect(p.textContent).toBe('Paragraph text');
    });

    test('should handle HTML content', () => {
      const p = domFactory.createParagraph({
        htmlContent: '<strong>Bold</strong> text'
      });
      
      expect(p.innerHTML).toBe('<strong>Bold</strong> text');
    });

    test('should prefer htmlContent over textContent', () => {
      const p = domFactory.createParagraph({
        textContent: 'Plain text',
        htmlContent: '<em>HTML</em> content'
      });
      
      expect(p.innerHTML).toBe('<em>HTML</em> content');
    });
  });

  describe('createCheckbox', () => {
    test('should create checkbox input', () => {
      const checkbox = domFactory.createCheckbox();
      
      expect(checkbox).toBeInstanceOf(HTMLInputElement);
      expect(checkbox.type).toBe('checkbox');
      expect(checkbox.style.marginRight).toBe('8px');
    });

    test('should apply optional properties', () => {
      const checkbox = domFactory.createCheckbox({
        id: 'test-check',
        checked: true,
        disabled: true,
        dataset: {
          value: 'test',
          index: '1'
        }
      });
      
      expect(checkbox.id).toBe('test-check');
      expect(checkbox.checked).toBe(true);
      expect(checkbox.disabled).toBe(true);
      expect(checkbox.dataset.value).toBe('test');
      expect(checkbox.dataset.index).toBe('1');
    });
  });

  describe('createLabel', () => {
    test('should create label with text', () => {
      const label = domFactory.createLabel('Label text');
      
      expect(label).toBeInstanceOf(HTMLLabelElement);
      expect(label.textContent).toBe('Label text');
    });

    test('should set htmlFor attribute', () => {
      const label = domFactory.createLabel('Check me', 'checkbox-id');
      
      expect(label.htmlFor).toBe('checkbox-id');
    });

    test('should apply styles', () => {
      const label = domFactory.createLabel('Styled', undefined, {
        style: { color: 'blue' }
      });
      
      expect(label.style.color).toBe('blue');
    });
  });

  describe('createIcon', () => {
    test('should create icon div with SVG mask', () => {
      const icon = domFactory.createIcon('close');
      
      expect(icon).toBeInstanceOf(HTMLDivElement);
      expect(icon.className).toBe('cw-icon');
      expect(icon.style.webkitMaskImage).toBe('url(chrome-extension://mock-id/assets/icons/close.svg)');
      expect(icon.style.maskImage).toBe('url(chrome-extension://mock-id/assets/icons/close.svg)');
      expect(icon.getAttribute('role')).toBe('img');
      expect(icon.getAttribute('aria-label')).toBe('close');
    });

    test('should apply additional classes and styles', () => {
      const icon = domFactory.createIcon('menu', {
        classNames: ['large', 'primary'],
        style: { width: '24px', height: '24px' }
      });
      
      expect(icon.classList.contains('cw-icon')).toBe(true);
      expect(icon.classList.contains('large')).toBe(true);
      expect(icon.classList.contains('primary')).toBe(true);
      expect(icon.style.width).toBe('24px');
      expect(icon.style.height).toBe('24px');
    });

    test('should call chrome.runtime.getURL with correct path', () => {
      domFactory.createIcon('settings');
      
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('assets/icons/settings.svg');
    });
  });
});