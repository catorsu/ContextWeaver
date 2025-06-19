/**
 * @file IDomFactory.ts
 * @description Interface for creating DOM elements in the Chrome extension UI.
 * @module ContextWeaver/CE
 */

/**
 * Interface for creating DOM elements with consistent styling and attributes.
 * Provides factory methods for common HTML elements used in the extension UI.
 */
export interface IDomFactory {
  /**
   * Creates an HTML button element with specified text and options.
   * @param text The text content of the button.
   * @param options Optional. An object containing button properties like id, classNames, onClick handler, disabled state, and inline styles.
   * @returns The created HTMLButtonElement.
   */
  createButton(text: string, options?: { id?: string; classNames?: string[]; onClick?: (event: MouseEvent) => void; disabled?: boolean; style?: Partial<CSSStyleDeclaration> }): HTMLButtonElement;

  /**
   * Creates an HTML div element with specified options.
   * @param options Optional. An object containing div properties like id, classNames, textContent, child elements, and inline styles.
   * @returns The created HTMLDivElement.
   */
  createDiv(options?: { id?: string; classNames?: string[]; textContent?: string; children?: (HTMLElement | DocumentFragment | string)[]; style?: Partial<CSSStyleDeclaration> }): HTMLDivElement;

  /**
   * Creates an HTML span element with specified options.
   * @param options Optional. An object containing span properties like classNames, textContent, and inline styles.
   * @returns The created HTMLSpanElement.
   */
  createSpan(options?: { classNames?: string[]; textContent?: string; style?: Partial<CSSStyleDeclaration> }): HTMLSpanElement;

  /**
   * Creates an HTML paragraph element with specified options.
   * @param options Optional. An object containing paragraph properties like classNames, textContent, htmlContent, and inline styles.
   * @returns The created HTMLParagraphElement.
   */
  createParagraph(options?: { classNames?: string[]; textContent?: string; htmlContent?: string; style?: Partial<CSSStyleDeclaration> }): HTMLParagraphElement;

  /**
   * Creates an HTML checkbox input element with specified options.
   * @param options Optional. An object containing checkbox properties like id, checked state, disabled state, and dataset attributes.
   * @returns The created HTMLInputElement (checkbox).
   */
  createCheckbox(options?: { id?: string; checked?: boolean; disabled?: boolean; dataset?: Record<string, string> }): HTMLInputElement;

  /**
   * Creates an HTML label element with specified text and options.
   * @param text The text content of the label.
   * @param htmlFor Optional. The ID of the form control with which the label is associated.
   * @param options Optional. An object containing inline styles for the label.
   * @returns The created HTMLLabelElement.
   */
  createLabel(text: string, htmlFor?: string, options?: { style?: Partial<CSSStyleDeclaration> }): HTMLLabelElement;

  /**
   * Creates an HTML img element for a Material Symbols SVG icon.
   * @param iconName The name of the SVG icon file (without .svg extension).
   * @param options Optional. An object containing classNames and inline styles.
   * @returns The created HTMLDivElement, styled as an icon using an SVG mask.
   */
  createIcon(iconName: string, options?: { classNames?: string[]; style?: Partial<CSSStyleDeclaration> }): HTMLDivElement;
}