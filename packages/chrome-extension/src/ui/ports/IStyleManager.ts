/**
 * @file IStyleManager.ts
 * @description Interface for managing CSS injection and theme application in the Chrome extension.
 * @module ContextWeaver/CE
 */

/**
 * Interface for managing CSS styles and themes in the Chrome extension UI.
 * Provides methods for injecting core styles and applying theme changes.
 */
export interface IStyleManager {
  /**
   * Injects the core CSS styles required for the extension UI.
   * This method should be called during initialization to ensure proper styling.
   */
  injectCoreCss(): void;

  /**
   * Applies a specific theme to the extension UI.
   * @param theme - The theme to apply, either 'light' or 'dark'
   */
  applyTheme(theme: 'light' | 'dark'): void;
}