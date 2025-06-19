/**
 * @file StyleManager.ts
 * @description Manages CSS injection and theme application for the Chrome extension UI.
 * @module ContextWeaver/CE
 */

import { IStyleManager } from '../ports/IStyleManager';
import { Logger } from '@contextweaver/shared';

const logger = new Logger('StyleManager');

/**
 * Manages CSS injection and theme application for the Chrome extension UI.
 * Handles core style injection and dynamic theme switching.
 */
export class StyleManager implements IStyleManager {
  private currentTheme: 'light' | 'dark' = 'dark';

  // CSS-related constants
  private readonly CSS_PREFIX = 'cw-';
  private readonly UI_PANEL_ID = `${this.CSS_PREFIX}floating-panel`;
  private readonly CONTEXT_INDICATOR_AREA_ID = `${this.CSS_PREFIX}context-indicator-area`;

  /**
   * Initializes the StyleManager and injects core CSS.
   */
  constructor() {
    this.injectCoreCss();
    logger.info('StyleManager initialized and core CSS injected.');
  }

  /**
   * Injects the core CSS styles required for the extension UI.
   * This method should be called during initialization to ensure proper styling.
   */
  public injectCoreCss(): void {
    const styleId = `${this.CSS_PREFIX}styles`;
    if (document.getElementById(styleId)) return;

    // Theme-aware CSS with light and dark mode support
    const css = `
    /* Dark theme (default) */
    #${this.UI_PANEL_ID} {
      position: absolute; background-color: rgba(40, 40, 40, 0.95); color: #f0f0f0; border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px; padding: 12px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px; line-height: 1.5; box-shadow: 0 2px 8px rgba(0,0,0,0.1); width: 300px;
      height: 350px; overflow-y: auto; 
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      opacity: 0; pointer-events: none; transform: translateY(4px);
      transition: opacity 150ms ease-out, transform 150ms ease-out;    
    }
    
    /* Light theme overrides */
    #${this.UI_PANEL_ID}[data-theme="light"] {
      background-color: rgba(255, 255, 255, 0.95);
      color: #1a1a1a;
      border: 1px solid rgba(0, 0, 0, 0.1);
      box-shadow: 0 2px 12px rgba(0,0,0,0.15);
    }
    #${this.UI_PANEL_ID}.${this.CSS_PREFIX}visible { opacity: 1; pointer-events: auto; transform: translateY(0); }
    .${this.CSS_PREFIX}title-bar {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #4a4a4a;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}title-bar {
      border-bottom: 1px solid #e0e0e0;
    }
    .${this.CSS_PREFIX}title { font-size: 16px; font-weight: bold; }
    .${this.CSS_PREFIX}close-button {
      background: none; border: none; color: #aaa; font-size: 20px; font-weight: bold;
      cursor: pointer; padding: 0 5px; line-height: 1;
    }
    .${this.CSS_PREFIX}close-button:hover { color: #fff; }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}close-button {
      color: #666;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}close-button:hover {
      color: #000;
    }
    .${this.CSS_PREFIX}content { /* No height or overflow properties */ }
    .${this.CSS_PREFIX}content p { margin: 10px 0; color: #ccc; }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}content p {
      color: #333;
    } 
    .${this.CSS_PREFIX}folder-section { margin-bottom: 15px; }
    .${this.CSS_PREFIX}folder-title {
      font-size: 14px; font-weight: bold; color: #bbb; margin-bottom: 5px;
      padding-bottom: 3px; border-bottom: 1px dashed #444;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}folder-title {
      color: #444;
      border-bottom: 1px dashed #ccc;
    }
    .${this.CSS_PREFIX}button {
      background-color: #3a3a3a; color: #e0e0e0; border: 1px solid #4a4a4a;
      border-radius: 4px; padding: 5px 10px; margin-top: 5px; margin-right: 8px;
      cursor: pointer; font-size: 13px; transition: background-color 0.2s;
    }
    .${this.CSS_PREFIX}button:hover { background-color: #4a4a4a; }
    .${this.CSS_PREFIX}button:disabled { background-color: #2a2a2a; color: #777; cursor: not-allowed; }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}button {
      background-color: #f5f5f5;
      color: #1a1a1a;
      border: 1px solid #ddd;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}button:hover {
      background-color: #e8e8e8;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}button:disabled {
      background-color: #fafafa;
      color: #999;
    }
    
    /* Vertical button layout */
    .${this.CSS_PREFIX}vertical-button {
      display: block;
      width: 100%;
      box-sizing: border-box;
      margin-right: 0;
      margin-bottom: 8px;
    }
    .${this.CSS_PREFIX}vertical-button:last-of-type {
      margin-bottom: 0px;
    }
    .${this.CSS_PREFIX}search-result-item {
      padding: 8px 12px;
      margin-bottom: 4px;
      border-radius: 3px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .${this.CSS_PREFIX}search-result-item:hover {
      background-color: #4a4a4a;
      border-color: #666;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}search-result-item:hover {
      background-color: #f0f0f0;
      border-color: #ddd;
    }
    .${this.CSS_PREFIX}context-indicator span.${this.CSS_PREFIX}type-icon {
      font-size: 16px;
      margin-right: 4px;
      display: inline-block;
    }

    .${this.CSS_PREFIX}search-result-item span.${this.CSS_PREFIX}type-icon { /* Adjusted selector */
      margin-right: 8px;
    }
    .${this.CSS_PREFIX}search-result-item span.workspace-name { /* This class is locally defined in contentScript, not prefixed by UIManager */
      font-size: 0.8em;
      color: #aaa;
      margin-left: 5px;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}search-result-item span.workspace-name {
      color: #666;
    }
    #${this.CONTEXT_INDICATOR_AREA_ID} {
      display: flex;
      flex-wrap: nowrap;
      gap: 4px;
      margin-bottom: 8px;
      padding: 2px 0;
      width: 100%;
      box-sizing: border-box;
      overflow-x: auto;
      white-space: nowrap;
    }
    /* Make scrollbar more visible */
    #${this.CONTEXT_INDICATOR_AREA_ID}::-webkit-scrollbar {
      height: 6px;
    }
    #${this.CONTEXT_INDICATOR_AREA_ID}::-webkit-scrollbar-thumb {
      background-color: #888;
      border-radius: 3px;
    }
    #${this.CONTEXT_INDICATOR_AREA_ID}::-webkit-scrollbar-thumb:hover {
      background-color: #aaa;
    }
    #${this.CONTEXT_INDICATOR_AREA_ID}[data-theme="light"]::-webkit-scrollbar-thumb {
      background: #bbb;
    }
    .${this.CSS_PREFIX}context-indicator {
      background-color: #3a3a3a;
      color: #e0e0e0;
      padding: 0 12px;
      height: 28px;
      border-radius: 16px;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      cursor: pointer;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}context-indicator {
      background-color: #f0f0f0;
      color: #1a1a1a;
    }
    /* Standalone context indicators (not inside panel) */
    #${this.CONTEXT_INDICATOR_AREA_ID}[data-theme="light"] .${this.CSS_PREFIX}context-indicator {
      background-color: #f0f0f0;
      color: #1a1a1a;
    }
    .${this.CSS_PREFIX}context-indicator:hover {
      filter: brightness(1.2);
    }
    .${this.CSS_PREFIX}indicator-close-btn {
      background: none;
      border: none;
      color: #aaa;
      font-size: 14px;
      margin-left: 5px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
      opacity: 0;
      transition: opacity 150ms ease-out;
    }
    .${this.CSS_PREFIX}context-indicator:hover .${this.CSS_PREFIX}indicator-close-btn {
      opacity: 1;
    }
    .${this.CSS_PREFIX}indicator-close-btn:hover {
      color: #fff;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}indicator-close-btn {
      color: #666;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}indicator-close-btn:hover {
      color: #000;
    }
    /* Standalone context indicator close buttons */
    #${this.CONTEXT_INDICATOR_AREA_ID}[data-theme="light"] .${this.CSS_PREFIX}indicator-close-btn {
      color: #666;
    }
    #${this.CONTEXT_INDICATOR_AREA_ID}[data-theme="light"] .${this.CSS_PREFIX}indicator-close-btn:hover {
      color: #000;
    }
    .${this.CSS_PREFIX}loader {
      border: 4px solid #f3f3f3; /* Light grey */
      border-top: 4px solid #3498db; /* Blue */
      border-radius: 50%;
      width: 30px;
      height: 30px;
      animation: ${this.CSS_PREFIX}spin 1s linear infinite;
      margin: 20px auto; /* Center the spinner */
    }
    .${this.CSS_PREFIX}spinning {
      animation: ${this.CSS_PREFIX}spin 1.2s linear infinite;
      display: inline-block; /* Needed for transform to work */
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}loader {
      border: 4px solid #e0e0e0;
      border-top: 4px solid #2563eb;
    }
    @keyframes ${this.CSS_PREFIX}spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .${this.CSS_PREFIX}loading-text {
      text-align: center;
      color: #ccc;
      margin-top: 10px;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}loading-text {
      color: #555;
    }
    .${this.CSS_PREFIX}loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7); /* Semi-transparent overlay */
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 10; /* Above other content in the panel */
      border-radius: 8px; /* Match panel border-radius */
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}loading-overlay {
      background-color: rgba(255, 255, 255, 0.8);
    }
    .${this.CSS_PREFIX}error-panel {
      padding: 15px;
      background-color: #3c3c3c;
      border-radius: 8px;
      margin-top: 10px;
      border: 1px solid #6a0000;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}error-panel {
      background-color: #fef2f2;
      border: 1px solid #f87171;
    }
    .${this.CSS_PREFIX}error-icon {
      font-size: 30px;
      color: #ff6b6b; /* A vibrant red */
      display: block;
      text-align: center;
      margin-bottom: 10px;
      content: "\\26A0"; /* Unicode warning sign (⚠️) */
    }
    .${this.CSS_PREFIX}error-text {
      text-align: center;
      color: #f8d7da; /* Light red/pink */
      font-size: 13px;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}error-text {
      color: #b91c1c;
    }
    .${this.CSS_PREFIX}group-header {
      font-size: 15px;
      font-weight: bold;
      color: #e0e0e0;
      margin-top: 12px;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid #555;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}group-header {
      color: #1a1a1a;
      border-bottom: 1px solid #d1d5db;
    }
    .${this.CSS_PREFIX}filter-status-text {
      font-size: 0.85em;
      color: #aaa; /* Muted gray */
      font-style: italic;
      text-align: center;
      margin-bottom: 8px;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}filter-status-text {
      color: #6b7280;
    }
    .${this.CSS_PREFIX}browse-item { /* Added from renderBrowseView */
        padding: 6px 8px;
        margin-bottom: 4px;
        border-radius: 3px;
        display: flex;
        align-items: center;
    }
    .${this.CSS_PREFIX}tree-node {
        display: block;
    }
    .${this.CSS_PREFIX}tree-children {
        display: block;
    }
    .${this.CSS_PREFIX}open-files-selector { /* Added from displayOpenFilesSelectorUI */
        /* No specific styles provided, but class is available */
    }
    .${this.CSS_PREFIX}button-row {
      display: flex;
      justify-content: flex-start; /* Align buttons to the start */
      gap: 10px; /* Space between buttons */
    }
    .${this.CSS_PREFIX}relative-path {
      color: #888;
      font-size: 0.8em;
      margin-left: 5px;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}relative-path {
      color: #6b7280;
    }
    .${this.CSS_PREFIX}button-subtle {
      background: none;
      border: none;
      color: #aaa;
      font-size: 0.8em;
      padding: 5px;
      margin-top: 5px;
    }
    .${this.CSS_PREFIX}button-subtle:hover {
      color: #fff;
      background-color: #3a3a3a;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}button-subtle {
      color: #6b7280;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}button-subtle:hover {
      color: #1a1a1a;
      background-color: #f3f4f6;
    }
    /* Toast Notifications */
    .${this.CSS_PREFIX}toast-notification {
      position: fixed;
      top: 16px;
      right: 16px;
      transform: none;
      background-color: #333;
      color: #fff;
      padding: 10px 20px;
      border-radius: 5px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
      z-index: 2147483647; /* Ensure it's on top */
      opacity: 0;
      transition: opacity 0.3s ease-in-out;
      min-width: 250px;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .${this.CSS_PREFIX}toast-notification.show {
      opacity: 1;
    }
    .${this.CSS_PREFIX}toast-notification.error {
      background-color: #dc3545; /* Red for errors */
    }
    .${this.CSS_PREFIX}toast-notification.success {
      background-color: #28a745; /* Green for success */
    }
    .${this.CSS_PREFIX}toast-notification.info {
      background-color: #17a2b8; /* Blue for info */
    }

    /* Content Modal */
    .${this.CSS_PREFIX}modal-overlay {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background-color: rgba(0, 0, 0, 0.6);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 200ms ease-in-out;
      pointer-events: none;
    }
    .${this.CSS_PREFIX}modal-overlay.visible {
      opacity: 1;
      pointer-events: auto;
    }
    .${this.CSS_PREFIX}modal-content {
      background-color: #282828;
      color: #f0f0f0;
      border: 1px solid #444;
      border-radius: 8px;
      padding: 16px;
      width: 80vw;
      max-width: 900px;
      height: 70vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 5px 15px rgba(0,0,0,0.5);
    }
    body[data-theme="light"] .${this.CSS_PREFIX}modal-content {
      background-color: #fff;
      color: #1a1a1a;
      border-color: #ddd;
    }
    .${this.CSS_PREFIX}modal-header {
      display: flex; justify-content: space-between; align-items: center;
      padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid #4a4a4a;
    }
    body[data-theme="light"] .${this.CSS_PREFIX}modal-header {
      border-bottom-color: #e0e0e0;
    }
    .${this.CSS_PREFIX}modal-title { font-size: 18px; font-weight: bold; }
    .${this.CSS_PREFIX}modal-close {
      background: none; border: none; color: #aaa; font-size: 24px;
      cursor: pointer; padding: 0 8px;
    }
    .${this.CSS_PREFIX}modal-body {
      flex-grow: 1; overflow-y: auto;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
      font-size: 13px; white-space: pre-wrap;
      background-color: #1e1e1e; padding: 10px; border-radius: 4px;
    }
    body[data-theme="light"] .${this.CSS_PREFIX}modal-body {
      background-color: #f5f5f5;
    }
    
    /* Focus state styling for keyboard navigation */
    .${this.CSS_PREFIX}button:focus-visible, 
    .${this.CSS_PREFIX}search-result-item:focus-visible, 
    .${this.CSS_PREFIX}indicator-close-btn:focus-visible, 
    .${this.CSS_PREFIX}close-button:focus-visible {
      outline: 2px solid #4285f4;
      outline-offset: 2px;
    }
    
    /* Skeleton loading items */
    .${this.CSS_PREFIX}skeleton-item {
      height: 48px;
      background: linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%);
      background-size: 200% 100%;
      animation: ${this.CSS_PREFIX}skeleton-pulse 1.5s infinite;
      border-radius: 4px;
      margin-bottom: 8px;
    }
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}skeleton-item {
      background: linear-gradient(90deg, rgba(0,0,0,0.03) 25%, rgba(0,0,0,0.06) 50%, rgba(0,0,0,0.03) 75%);
    }
    
    @keyframes ${this.CSS_PREFIX}skeleton-pulse {
      0% { background-position: 200% center; }
      100% { background-position: -200% center; }
    }
    
    /* Respect reduced motion preference */
    @media (prefers-reduced-motion: reduce) {
      #${this.UI_PANEL_ID}, .${this.CSS_PREFIX}toast-notification {
        transition: none;
      }
      .${this.CSS_PREFIX}skeleton-item {
        animation: none;
        background: rgba(255,255,255,0.05);
      }
    }
    
    /* --- NEW ICON STYLING (SVG METHOD) --- */
    .${this.CSS_PREFIX}icon {
      width: 20px;
      height: 20px;
      display: inline-block;
      vertical-align: middle;
      margin-right: 8px;
      flex-shrink: 0;
      /* Use background-color with a mask for reliable coloring */
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      -webkit-mask-position: center;
      mask-position: center;
      -webkit-mask-size: contain;
      mask-size: contain;
      background-color: #e3e3e3; /* Default: light gray for dark theme, from your screenshot */
    }
    
    /* Light theme icon override */
    #${this.UI_PANEL_ID}[data-theme="light"] .${this.CSS_PREFIX}icon,
    #${this.CONTEXT_INDICATOR_AREA_ID}[data-theme="light"] .${this.CSS_PREFIX}icon {
      background-color: #5f6368; /* Dark gray for good contrast on light theme */
    }
  `;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
    logger.debug('Core CSS injected with SVG icons.');
  }

  /**
   * Applies a specific theme to the extension UI.
   * Updates theme-related styling and element attributes.
   * @param theme - The theme to apply, either 'light' or 'dark'
   */
  public applyTheme(theme: 'light' | 'dark'): void {
    this.currentTheme = theme;
    this.updateThemeStyles();
    logger.debug(`Theme applied: ${theme}`);
  }

  /**
   * Updates the CSS to reflect the current theme.
   * Removes existing styles and re-injects with current theme.
   */
  private updateThemeStyles(): void {
    // Update existing style or reinject with new theme
    const styleId = `${this.CSS_PREFIX}styles`;
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }
    this.injectCoreCss();

    // Apply theme class to floating panel if it exists
    const floatingPanel = document.getElementById(this.UI_PANEL_ID);
    if (floatingPanel) {
      floatingPanel.setAttribute('data-theme', this.currentTheme);
    }

    // Apply theme to context indicator area if it exists
    const contextIndicatorArea = document.getElementById(this.CONTEXT_INDICATOR_AREA_ID);
    if (contextIndicatorArea) {
      contextIndicatorArea.setAttribute('data-theme', this.currentTheme);
    }

    // Also update body theme attribute for modals that might be created independently
    const currentBodyTheme = document.body.getAttribute('data-theme');
    if (currentBodyTheme !== this.currentTheme) {
      document.body.setAttribute('data-theme', this.currentTheme);
    }
  }

  /**
   * Gets the current theme.
   * @returns The current theme ('light' or 'dark').
   */
  public getCurrentTheme(): 'light' | 'dark' {
    return this.currentTheme;
  }

  /**
   * Gets CSS-related constants used by the StyleManager.
   * @param key The constant to retrieve.
   * @returns The requested constant value.
   */
  public getConstant(key: 'CSS_PREFIX' | 'UI_PANEL_ID' | 'CONTEXT_INDICATOR_AREA_ID'): string {
    switch (key) {
      case 'CSS_PREFIX': return this.CSS_PREFIX;
      case 'UI_PANEL_ID': return this.UI_PANEL_ID;
      case 'CONTEXT_INDICATOR_AREA_ID': return this.CONTEXT_INDICATOR_AREA_ID;
      default: return '';
    }
  }
}