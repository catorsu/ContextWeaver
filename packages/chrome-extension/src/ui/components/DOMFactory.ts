/**
 * @file DOMFactory.ts
 * @description Pure DOM element factory providing consistent element creation with theming support.
 * @module ContextWeaver/CE
 */

import { IDomFactory } from '../ports/IDomFactory';
import { StyleManager } from './StyleManager';

/**
 * Factory for creating DOM elements with consistent styling and theming.
 * Provides pure functions for creating common HTML elements used in the extension UI.
 */
export class DOMFactory implements IDomFactory {
  private styleManager: StyleManager;

  /**
   * Initializes the DOMFactory with a StyleManager for consistent theming.
   * @param styleManager - The StyleManager instance for applying consistent styles
   */
  constructor(styleManager: StyleManager) {
    this.styleManager = styleManager;
  }

  /**
   * Creates an HTML button element with specified text and options.
   * @param text The text content of the button.
   * @param options Optional. An object containing button properties like id, classNames, onClick handler, disabled state, and inline styles.
   * @returns The created HTMLButtonElement.
   */
  public createButton(text: string, options?: { id?: string; classNames?: string[]; onClick?: (event: MouseEvent) => void; disabled?: boolean; style?: Partial<CSSStyleDeclaration> }): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${this.styleManager.getConstant('CSS_PREFIX')}button`;
    if (options?.classNames) {
      options.classNames.forEach(cn => button.classList.add(cn.startsWith(this.styleManager.getConstant('CSS_PREFIX')) ? cn : `${this.styleManager.getConstant('CSS_PREFIX')}${cn}`));
    }
    if (options?.id) {
      button.id = options.id;
    }
    button.textContent = text;
    if (options?.onClick) {
      button.onclick = options.onClick;
    }
    if (options?.disabled) {
      button.disabled = options.disabled;
    }
    if (options?.style) {
      Object.assign(button.style, options.style);
    }
    return button;
  }

  /**
   * Creates an HTML div element with specified options.
   * @param options Optional. An object containing div properties like id, classNames, textContent, child elements, and inline styles.
   * @returns The created HTMLDivElement.
   */
  public createDiv(options?: { id?: string; classNames?: string[]; textContent?: string; children?: (HTMLElement | DocumentFragment | string)[]; style?: Partial<CSSStyleDeclaration> }): HTMLDivElement {
    const div = document.createElement('div');
    if (options?.id) {
      div.id = options.id;
    }
    if (options?.classNames) {
      options.classNames.forEach(cn => div.classList.add(cn.startsWith(this.styleManager.getConstant('CSS_PREFIX')) ? cn : `${this.styleManager.getConstant('CSS_PREFIX')}${cn}`));
    }
    if (options?.textContent) {
      div.textContent = options.textContent;
    }
    if (options?.children) {
      options.children.forEach(child => {
        if (typeof child === 'string') {
          div.appendChild(document.createTextNode(child));
        } else {
          div.appendChild(child);
        }
      });
    }
    if (options?.style) {
      Object.assign(div.style, options.style);
    }
    return div;
  }

  /**
   * Creates an HTML span element with specified options.
   * @param options Optional. An object containing span properties like classNames, textContent, and inline styles.
   * @returns The created HTMLSpanElement.
   */
  public createSpan(options?: { classNames?: string[]; textContent?: string; style?: Partial<CSSStyleDeclaration> }): HTMLSpanElement {
    const span = document.createElement('span');
    if (options?.classNames) {
      options.classNames.forEach(cn => span.classList.add(cn.startsWith(this.styleManager.getConstant('CSS_PREFIX')) ? cn : `${this.styleManager.getConstant('CSS_PREFIX')}${cn}`));
    }
    if (options?.textContent) {
      span.textContent = options.textContent;
    }
    if (options?.style) {
      Object.assign(span.style, options.style);
    }
    return span;
  }

  /**
   * Creates an HTML paragraph element with specified options.
   * @param options Optional. An object containing paragraph properties like classNames, textContent, htmlContent, and inline styles.
   * @returns The created HTMLParagraphElement.
   */
  public createParagraph(options?: { classNames?: string[]; textContent?: string; htmlContent?: string; style?: Partial<CSSStyleDeclaration> }): HTMLParagraphElement {
    const p = document.createElement('p');
    if (options?.classNames) {
      options.classNames.forEach(cn => p.classList.add(cn.startsWith(this.styleManager.getConstant('CSS_PREFIX')) ? cn : `${this.styleManager.getConstant('CSS_PREFIX')}${cn}`));
    }
    if (options?.textContent) {
      p.textContent = options.textContent;
    }
    if (options?.htmlContent) {
      p.innerHTML = options.htmlContent;
    }
    if (options?.style) {
      Object.assign(p.style, options.style);
    }
    return p;
  }

  /**
   * Creates an HTML checkbox input element with specified options.
   * @param options Optional. An object containing checkbox properties like id, checked state, disabled state, and dataset attributes.
   * @returns The created HTMLInputElement (checkbox).
   */
  public createCheckbox(options?: { id?: string; checked?: boolean; disabled?: boolean; dataset?: Record<string, string> }): HTMLInputElement {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    if (options?.id) {
      checkbox.id = options.id;
    }
    if (options?.checked !== undefined) {
      checkbox.checked = options.checked;
    }
    if (options?.disabled !== undefined) {
      checkbox.disabled = options.disabled;
    }
    if (options?.dataset) {
      Object.entries(options.dataset).forEach(([key, value]) => checkbox.dataset[key] = value);
    }
    checkbox.style.marginRight = '8px';
    return checkbox;
  }

  /**
   * Creates an HTML label element with specified text and options.
   * @param text The text content of the label.
   * @param htmlFor Optional. The ID of the form control with which the label is associated.
   * @param options Optional. An object containing inline styles for the label.
   * @returns The created HTMLLabelElement.
   */
  public createLabel(text: string, htmlFor?: string, options?: { style?: Partial<CSSStyleDeclaration> }): HTMLLabelElement {
    const label = document.createElement('label');
    label.textContent = text;
    if (htmlFor) {
      label.htmlFor = htmlFor;
    }
    if (options?.style) {
      Object.assign(label.style, options.style);
    }
    return label;
  }

  /**
   * Creates an HTML img element for a Material Symbols SVG icon.
   * @param iconName The name of the SVG icon file (without .svg extension).
   * @param options Optional. An object containing classNames and inline styles.
   * @returns The created HTMLDivElement, styled as an icon using an SVG mask.
   */
  public createIcon(iconName: string, options?: { classNames?: string[]; style?: Partial<CSSStyleDeclaration> }): HTMLDivElement {
    const iconDiv = document.createElement('div');
    iconDiv.className = `${this.styleManager.getConstant('CSS_PREFIX')}icon`;
    if (options?.classNames) {
      options.classNames.forEach(cn => iconDiv.classList.add(cn));
    }

    const iconUrl = chrome.runtime.getURL(`assets/icons/${iconName}.svg`);
    iconDiv.style.webkitMaskImage = `url(${iconUrl})`;
    iconDiv.style.maskImage = `url(${iconUrl})`;

    iconDiv.setAttribute('role', 'img');
    iconDiv.setAttribute('aria-label', iconName);

    if (options?.style) {
      Object.assign(iconDiv.style, options.style);
    }
    return iconDiv;
  }
}