/**
 * @file uiManager.ts
 * @description Manages the floating user interface elements and context indicators for the Chrome Extension.
 * Provides methods for showing/hiding the UI, updating its content, and creating various DOM elements.
 * @module ContextWeaver/CE
 */

import { ContextBlockMetadata } from '@contextweaver/shared'; // Import shared type

const LOG_PREFIX_UI = '[ContextWeaver UIManager]';
const CSS_PREFIX = 'cw-'; // Encapsulate CSS prefix
const UI_PANEL_ID = `${CSS_PREFIX}floating-panel`;
const CONTEXT_INDICATOR_AREA_ID = `${CSS_PREFIX}context-indicator-area`;

/**
 * Manages the floating user interface (UI) panel and context indicators for the Chrome Extension.
 * Provides methods to control the visibility, content, and styling of the UI.
 */
export class UIManager {
    private floatingUIPanel: HTMLElement | null = null;
    private titleElement: HTMLElement | null = null;
    private contentElement: HTMLElement | null = null;
    private closeButton: HTMLElement | null = null;
    private contextIndicatorArea: HTMLElement | null = null;
    private currentTargetElementForPanel: HTMLElement | null = null; // Added to store target
    private currentTheme: 'light' | 'dark' = 'dark';

    // Callback types for event handlers
    private onHideCallback: (() => void) | null = null;
    private onIndicatorRemoveCallback: ((uniqueBlockId: string, blockType: string) => void) | null = null;


    /**
     * Initializes the UIManager, injecting necessary CSS into the document.
     */
    constructor() {
        this.injectFloatingUiCss();
        console.log(LOG_PREFIX_UI, 'UIManager initialized and CSS injected.');
    }

    /**
     * Sets the theme for the UI.
     * @param theme The theme to apply ('light' or 'dark').
     */
    public setTheme(theme: 'light' | 'dark'): void {
        this.currentTheme = theme;
        this.updateThemeStyles();
        console.log(LOG_PREFIX_UI, `Theme set to: ${theme}`);
    }

    /**
     * Updates the CSS to reflect the current theme.
     */
    private updateThemeStyles(): void {
        // Update existing style or reinject with new theme
        const styleId = `${CSS_PREFIX}styles`;
        const existingStyle = document.getElementById(styleId);
        if (existingStyle) {
            existingStyle.remove();
        }
        this.injectFloatingUiCss();
        
        // Apply theme class to floating panel if it exists
        if (this.floatingUIPanel) {
            this.floatingUIPanel.setAttribute('data-theme', this.currentTheme);
        }
        
        // Apply theme to context indicator area if it exists
        if (this.contextIndicatorArea) {
            this.contextIndicatorArea.setAttribute('data-theme', this.currentTheme);
        }
    }

    private injectFloatingUiCss(): void {
        const styleId = `${CSS_PREFIX}styles`;
        if (document.getElementById(styleId)) return;

        // Theme-aware CSS with light and dark mode support
        const css = `
    /* Dark theme (default) */
    #${UI_PANEL_ID} {
      position: absolute; background-color: rgba(40, 40, 40, 0.95); color: #f0f0f0; border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px; padding: 12px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px; line-height: 1.5; box-shadow: 0 2px 8px rgba(0,0,0,0.1); width: 320px;
      height: 350px; overflow-y: auto; 
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      opacity: 0; pointer-events: none; transform: translateY(4px);
      transition: opacity 150ms ease-out, transform 150ms ease-out;    
    }
    
    /* Light theme overrides */
    #${UI_PANEL_ID}[data-theme="light"] {
      background-color: rgba(255, 255, 255, 0.95);
      color: #1a1a1a;
      border: 1px solid rgba(0, 0, 0, 0.1);
      box-shadow: 0 2px 12px rgba(0,0,0,0.15);
    }
    #${UI_PANEL_ID}.${CSS_PREFIX}visible { opacity: 1; pointer-events: auto; transform: translateY(0); }
    .${CSS_PREFIX}title-bar {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #4a4a4a;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}title-bar {
      border-bottom: 1px solid #e0e0e0;
    }
    .${CSS_PREFIX}title { font-size: 16px; font-weight: bold; }
    .${CSS_PREFIX}close-button {
      background: none; border: none; color: #aaa; font-size: 20px; font-weight: bold;
      cursor: pointer; padding: 0 5px; line-height: 1;
    }
    .${CSS_PREFIX}close-button:hover { color: #fff; }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}close-button {
      color: #666;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}close-button:hover {
      color: #000;
    }
    .${CSS_PREFIX}content { /* No height or overflow properties */ }
    .${CSS_PREFIX}content p { margin: 10px 0; color: #ccc; }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}content p {
      color: #333;
    } 
    .${CSS_PREFIX}folder-section { margin-bottom: 15px; }
    .${CSS_PREFIX}folder-title {
      font-size: 14px; font-weight: bold; color: #bbb; margin-bottom: 5px;
      padding-bottom: 3px; border-bottom: 1px dashed #444;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}folder-title {
      color: #444;
      border-bottom: 1px dashed #ccc;
    }
    .${CSS_PREFIX}button {
      background-color: #3a3a3a; color: #e0e0e0; border: 1px solid #4a4a4a;
      border-radius: 4px; padding: 5px 10px; margin-top: 5px; margin-right: 8px;
      cursor: pointer; font-size: 13px; transition: background-color 0.2s;
    }
    .${CSS_PREFIX}button:hover { background-color: #4a4a4a; }
    .${CSS_PREFIX}button:disabled { background-color: #2a2a2a; color: #777; cursor: not-allowed; }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}button {
      background-color: #f5f5f5;
      color: #1a1a1a;
      border: 1px solid #ddd;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}button:hover {
      background-color: #e8e8e8;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}button:disabled {
      background-color: #fafafa;
      color: #999;
    }
    
    /* Vertical button layout */
    .${CSS_PREFIX}vertical-button {
      display: block;
      width: 100%;
      box-sizing: border-box;
      margin-right: 0;
      margin-bottom: 8px;
    }
    .${CSS_PREFIX}vertical-button:last-of-type {
      margin-bottom: 0px;
    }
    .${CSS_PREFIX}search-result-item {
      padding: 8px 12px;
      margin-bottom: 4px;
      border-radius: 3px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .${CSS_PREFIX}search-result-item:hover {
      background-color: #4a4a4a;
      border-color: #666;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}search-result-item:hover {
      background-color: #f0f0f0;
      border-color: #ddd;
    }
    .${CSS_PREFIX}context-indicator span.${CSS_PREFIX}type-icon {
      font-size: 16px;
      margin-right: 4px;
      display: inline-block;
    }

    .${CSS_PREFIX}search-result-item span.${CSS_PREFIX}type-icon { /* Adjusted selector */
      margin-right: 8px;
    }
    .${CSS_PREFIX}search-result-item span.workspace-name { /* This class is locally defined in contentScript, not prefixed by UIManager */
      font-size: 0.8em;
      color: #aaa;
      margin-left: 5px;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}search-result-item span.workspace-name {
      color: #666;
    }
    #${CONTEXT_INDICATOR_AREA_ID} {
      display: flex;       /* For layout of indicators inside */
      flex-wrap: nowrap;
      gap: 4px;
      margin-bottom: 5px;  /* Space below the indicator area */
      padding: 5px;
      background-color: rgba(40, 40, 40, 0.95); /* Dark theme background */
      border: 1px solid #444;
      border-radius: 4px;
      width: 100%;         /* ADDED: Make it take full available width */
      box-sizing: border-box; /* ADDED: Include padding and border in the element's total width and height */
      overflow-x: auto;
      white-space: nowrap;
    }
    #${UI_PANEL_ID}[data-theme="light"] #${CONTEXT_INDICATOR_AREA_ID} {
      border: 1px solid #ddd;
    }
    /* Standalone context indicator area (not inside panel) */
    #${CONTEXT_INDICATOR_AREA_ID}[data-theme="light"] {
      background-color: rgba(255, 255, 255, 0.95);
      border: 1px solid #ddd;
    }
    #${CONTEXT_INDICATOR_AREA_ID}::-webkit-scrollbar { height: 4px; }
    #${CONTEXT_INDICATOR_AREA_ID}::-webkit-scrollbar-thumb { background: #555; border-radius: 2px; }
    #${UI_PANEL_ID}[data-theme="light"] #${CONTEXT_INDICATOR_AREA_ID}::-webkit-scrollbar-thumb {
      background: #bbb;
    }
    .${CSS_PREFIX}context-indicator {
      background-color: #3a3a3a;
      color: #e0e0e0;
      padding: 0 12px;
      height: 28px;
      border-radius: 16px;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}context-indicator {
      background-color: #f0f0f0;
      color: #1a1a1a;
    }
    /* Standalone context indicators (not inside panel) */
    #${CONTEXT_INDICATOR_AREA_ID}[data-theme="light"] .${CSS_PREFIX}context-indicator {
      background-color: #f0f0f0;
      color: #1a1a1a;
    }
    .${CSS_PREFIX}indicator-close-btn {
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
    .${CSS_PREFIX}context-indicator:hover .${CSS_PREFIX}indicator-close-btn {
      opacity: 1;
    }
    .${CSS_PREFIX}indicator-close-btn:hover {
      color: #fff;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}indicator-close-btn {
      color: #666;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}indicator-close-btn:hover {
      color: #000;
    }
    /* Standalone context indicator close buttons */
    #${CONTEXT_INDICATOR_AREA_ID}[data-theme="light"] .${CSS_PREFIX}indicator-close-btn {
      color: #666;
    }
    #${CONTEXT_INDICATOR_AREA_ID}[data-theme="light"] .${CSS_PREFIX}indicator-close-btn:hover {
      color: #000;
    }
    .${CSS_PREFIX}loader {
      border: 4px solid #f3f3f3; /* Light grey */
      border-top: 4px solid #3498db; /* Blue */
      border-radius: 50%;
      width: 30px;
      height: 30px;
      animation: ${CSS_PREFIX}spin 1s linear infinite;
      margin: 20px auto; /* Center the spinner */
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}loader {
      border: 4px solid #e0e0e0;
      border-top: 4px solid #2563eb;
    }
    @keyframes ${CSS_PREFIX}spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .${CSS_PREFIX}loading-text {
      text-align: center;
      color: #ccc;
      margin-top: 10px;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}loading-text {
      color: #555;
    }
    .${CSS_PREFIX}loading-overlay {
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
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}loading-overlay {
      background-color: rgba(255, 255, 255, 0.8);
    }
    .${CSS_PREFIX}error-panel {
      padding: 15px;
      background-color: #3c3c3c;
      border-radius: 8px;
      margin-top: 10px;
      border: 1px solid #6a0000;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}error-panel {
      background-color: #fef2f2;
      border: 1px solid #f87171;
    }
    .${CSS_PREFIX}error-icon {
      font-size: 30px;
      color: #ff6b6b; /* A vibrant red */
      display: block;
      text-align: center;
      margin-bottom: 10px;
      content: "\\26A0"; /* Unicode warning sign (⚠️) */
    }
    .${CSS_PREFIX}error-text {
      text-align: center;
      color: #f8d7da; /* Light red/pink */
      font-size: 13px;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}error-text {
      color: #b91c1c;
    }
    .${CSS_PREFIX}group-header {
      font-size: 15px;
      font-weight: bold;
      color: #e0e0e0;
      margin-top: 12px;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid #555;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}group-header {
      color: #1a1a1a;
      border-bottom: 1px solid #d1d5db;
    }
    .${CSS_PREFIX}filter-status-text {
      font-size: 0.85em;
      color: #aaa; /* Muted gray */
      font-style: italic;
      text-align: center;
      margin-bottom: 8px;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}filter-status-text {
      color: #6b7280;
    }
    .${CSS_PREFIX}browse-item { /* Added from renderBrowseView */
        padding: 6px 8px;
        margin-bottom: 4px;
        border-radius: 3px;
        display: flex;
        align-items: center;
    }
    .${CSS_PREFIX}tree-node {
        display: block;
    }
    .${CSS_PREFIX}tree-children {
        display: block;
    }
    .${CSS_PREFIX}open-files-selector { /* Added from displayOpenFilesSelectorUI */
        /* No specific styles provided, but class is available */
    }
    .${CSS_PREFIX}button-row {
      display: flex;
      justify-content: flex-start; /* Align buttons to the start */
      gap: 10px; /* Space between buttons */
    }
    .${CSS_PREFIX}relative-path {
      color: #888;
      font-size: 0.8em;
      margin-left: 5px;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}relative-path {
      color: #6b7280;
    }
    .${CSS_PREFIX}button-subtle {
      background: none;
      border: none;
      color: #aaa;
      font-size: 0.8em;
      padding: 5px;
      margin-top: 5px;
    }
    .${CSS_PREFIX}button-subtle:hover {
      color: #fff;
      background-color: #3a3a3a;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}button-subtle {
      color: #6b7280;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}button-subtle:hover {
      color: #1a1a1a;
      background-color: #f3f4f6;
    }
    /* Toast Notifications */
    .${CSS_PREFIX}toast-notification {
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
    .${CSS_PREFIX}toast-notification.show {
      opacity: 1;
    }
    .${CSS_PREFIX}toast-notification.error {
      background-color: #dc3545; /* Red for errors */
    }
    .${CSS_PREFIX}toast-notification.success {
      background-color: #28a745; /* Green for success */
    }
    .${CSS_PREFIX}toast-notification.info {
      background-color: #17a2b8; /* Blue for info */
    }
    
    /* Focus state styling for keyboard navigation */
    .${CSS_PREFIX}button:focus-visible, 
    .${CSS_PREFIX}search-result-item:focus-visible, 
    .${CSS_PREFIX}indicator-close-btn:focus-visible, 
    .${CSS_PREFIX}close-button:focus-visible {
      outline: 2px solid #4285f4;
      outline-offset: 2px;
    }
    
    /* Skeleton loading items */
    .${CSS_PREFIX}skeleton-item {
      height: 48px;
      background: linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%);
      background-size: 200% 100%;
      animation: ${CSS_PREFIX}skeleton-pulse 1.5s infinite;
      border-radius: 4px;
      margin-bottom: 8px;
    }
    #${UI_PANEL_ID}[data-theme="light"] .${CSS_PREFIX}skeleton-item {
      background: linear-gradient(90deg, rgba(0,0,0,0.03) 25%, rgba(0,0,0,0.06) 50%, rgba(0,0,0,0.03) 75%);
    }
    
    @keyframes ${CSS_PREFIX}skeleton-pulse {
      0% { background-position: 200% center; }
      100% { background-position: -200% center; }
    }
    
    /* Respect reduced motion preference */
    @media (prefers-reduced-motion: reduce) {
      #${UI_PANEL_ID}, .${CSS_PREFIX}toast-notification {
        transition: none;
      }
      .${CSS_PREFIX}skeleton-item {
        animation: none;
        background: rgba(255,255,255,0.05);
      }
    }
  `;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        document.head.appendChild(style);
        console.log(LOG_PREFIX_UI, 'Floating UI CSS injected/updated.');
    }

    private createPanel(): void {
        if (this.floatingUIPanel) return;

        this.floatingUIPanel = document.createElement('div');
        this.floatingUIPanel.id = UI_PANEL_ID;
        this.floatingUIPanel.setAttribute('role', 'dialog');
        this.floatingUIPanel.setAttribute('aria-modal', 'true');
        this.floatingUIPanel.setAttribute('aria-label', 'ContextWeaver Panel');
        this.floatingUIPanel.setAttribute('data-theme', this.currentTheme);

        const titleBarDiv = document.createElement('div');
        titleBarDiv.className = `${CSS_PREFIX}title-bar`;

        this.titleElement = document.createElement('div');
        this.titleElement.className = `${CSS_PREFIX}title`;
        titleBarDiv.appendChild(this.titleElement);

        this.closeButton = document.createElement('button');
        this.closeButton.className = `${CSS_PREFIX}close-button`;
        this.closeButton.innerHTML = '×';
        this.closeButton.onclick = () => this.hide(); // Internal hide call
        titleBarDiv.appendChild(this.closeButton);

        this.floatingUIPanel.appendChild(titleBarDiv);

        this.contentElement = document.createElement('div');
        this.contentElement.className = `${CSS_PREFIX}content`;
        this.floatingUIPanel.appendChild(this.contentElement);

        document.body.appendChild(this.floatingUIPanel);
        console.log(LOG_PREFIX_UI, 'Floating panel element created and appended to body.');
    }

    /**
     * Displays the floating UI panel, positioning it relative to a target input element.
     * @param targetInputElement The HTML element (e.g., textarea, contenteditable div) to which the UI panel should be anchored.
     * @param uiInitialTitle The initial title to display in the UI panel.
     * @param uiInitialContent Optional. The initial content to display in the UI panel. Can be an HTMLElement, DocumentFragment, or HTML string.
     * @param onHide Optional. A callback function to execute when the UI panel is hidden.
     */
    public show(
        targetInputElement: HTMLElement,
        uiInitialTitle: string,
        uiInitialContent?: HTMLElement | DocumentFragment | string | null,
        onHide?: () => void
    ): void {
        this.onHideCallback = onHide || null;
        this.currentTargetElementForPanel = targetInputElement; // Store for click-outside logic

        if (!this.floatingUIPanel) {
            this.createPanel();
        }

        if (!this.floatingUIPanel || !this.titleElement || !this.contentElement) {
            console.error(LOG_PREFIX_UI, 'Panel elements not created, cannot show.');
            return;
        }

        // Step 1: Add the class that makes it display: block.
        // This ensures that when offsetHeight is read, the element has dimensions.
        this.floatingUIPanel.classList.add(`${CSS_PREFIX}visible`);

        // Step 2: Temporarily make it invisible for measurement to avoid flicker,
        // then get dimensions.
        this.floatingUIPanel.style.visibility = 'hidden';

        const inputRect = targetInputElement.getBoundingClientRect();
        const panelHeight = this.floatingUIPanel.offsetHeight || 200; // Measure height

        // Step 3: Position it with viewport collision detection.
        let top = window.scrollY + inputRect.top - panelHeight - 8;
        let left = window.scrollX + inputRect.left;

        // Check if panel would go above viewport
        if (top < window.scrollY) {
            // Position below input instead
            top = window.scrollY + inputRect.bottom + 8;
        }

        // Check if panel would go beyond right edge
        const panelWidth = this.floatingUIPanel.offsetWidth || 320;
        if (left + panelWidth > window.scrollX + window.innerWidth) {
            left = window.scrollX + window.innerWidth - panelWidth - 8;
        }

        // Check if panel would go beyond left edge
        if (left < window.scrollX) {
            left = window.scrollX + 8;
        }

        this.floatingUIPanel.style.top = `${top}px`;
        this.floatingUIPanel.style.left = `${left}px`;

        // Step 4: Make it fully visible.
        // The 'cw-visible' class already handles 'display: block'.
        this.floatingUIPanel.style.visibility = 'visible';

        this.titleElement.textContent = uiInitialTitle;
        if (uiInitialContent) {
            if (typeof uiInitialContent === 'string') {
                this.contentElement.innerHTML = uiInitialContent;
            } else {
                this.contentElement.innerHTML = ''; // Clear previous
                this.contentElement.appendChild(uiInitialContent); // Works for HTMLElement or DocumentFragment
            }
        } else {
            this.contentElement.innerHTML = ''; // Clear content if null
        }

        this.addDismissalEventListeners();
        console.log(LOG_PREFIX_UI, 'Floating UI shown.');
    }

    /**
     * Hides the floating UI panel and clears its content.
     */
    public hide(): void {
        if (this.floatingUIPanel && this.floatingUIPanel.classList.contains(`${CSS_PREFIX}visible`)) {
            this.floatingUIPanel.classList.remove(`${CSS_PREFIX}visible`);

            // Clear content and reset title
            if (this.contentElement) {
                this.contentElement.innerHTML = '';
            }
            if (this.titleElement) {
                // Optionally reset to a default title or leave as is if it's managed by 'show'
                // For now, let's not reset title here, as 'show' always sets it.
                // this.titleElement.textContent = 'ContextWeaver'; // Example default
            }

            this.removeDismissalEventListeners();
            if (this.onHideCallback) {
                this.onHideCallback();
            }
            this.currentTargetElementForPanel = null; // Clear target on hide
            console.log(LOG_PREFIX_UI, 'Floating UI hidden.');
        }
    }

    /**
     * Updates the title of the floating UI panel.
     * @param titleText The new title text.
     */
    public updateTitle(titleText: string): void {
        if (this.titleElement) {
            this.titleElement.textContent = titleText;
        }
    }

    /**
     * Updates the main content area of the floating UI panel.
     * @param content The new content to display. Can be an HTMLElement, DocumentFragment, or HTML string.
     */
    public updateContent(content: HTMLElement | DocumentFragment | string): void {
        if (this.contentElement) {
            // Preserve scroll position of any scrollable containers
            const scrollableElements = this.contentElement.querySelectorAll('[style*="overflow"]');
            const scrollPositions = new Map<Element, number>();
            scrollableElements.forEach((el) => {
                if (el.scrollTop > 0) {
                    scrollPositions.set(el, el.scrollTop);
                }
            });

            window.requestAnimationFrame(() => {
                if (this.contentElement) { // Check again inside requestAnimationFrame
                    if (typeof content === 'string') {
                        this.contentElement.innerHTML = content;
                    } else {
                        this.contentElement.innerHTML = ''; // Clear previous content
                        this.contentElement.appendChild(content); // Works for HTMLElement or DocumentFragment
                    }

                    // Restore scroll positions after content update
                    if (scrollPositions.size > 0) {
                        // Wait for next frame to ensure DOM is updated
                        window.requestAnimationFrame(() => {
                            scrollPositions.forEach((scrollTop, el) => {
                                // Try to find the element by its class or similar identifier
                                const selector = el.className ? `.${el.className.split(' ').join('.')}` : null;
                                if (selector && this.contentElement) {
                                    const newEl = this.contentElement.querySelector(selector);
                                    if (newEl) {
                                        newEl.scrollTop = scrollTop;
                                    }
                                }
                            });
                        });
                    }
                }
            });
        }
    }

    /**
     * Displays a loading state in the UI panel with a spinner and a message.
     * @param title The title to display during the loading state.
     * @param loadingMessage The message to display below the loading spinner.
     */
    public showLoading(title: string, loadingMessage: string): void {
        // Update title if needed
        this.updateTitle(title);
        if (!this.floatingUIPanel) {
            this.createPanel();
        }
        if (!this.floatingUIPanel || !this.contentElement) {
            console.error(LOG_PREFIX_UI, 'Panel elements not created, cannot show loading.');
            return;
        }

        // If a loading overlay already exists, update its message
        let loadingOverlay = this.floatingUIPanel.querySelector(`.${CSS_PREFIX}loading-overlay`) as HTMLElement;
        if (loadingOverlay) {
            const loadingTextElement = loadingOverlay.querySelector(`.${CSS_PREFIX}loading-text`);
            if (loadingTextElement) {
                loadingTextElement.textContent = loadingMessage;
            }
            // Ensure it's visible if it was hidden
            loadingOverlay.style.display = 'flex';
            return;
        }

        // Create new loading overlay
        loadingOverlay = document.createElement('div');
        loadingOverlay.className = `${CSS_PREFIX}loading-overlay`;
        loadingOverlay.innerHTML = `
            <div class="${CSS_PREFIX}loader"></div>
            <p class="${CSS_PREFIX}loading-text">${loadingMessage}</p>
        `;
        this.floatingUIPanel.appendChild(loadingOverlay);
        console.log(LOG_PREFIX_UI, `Loading overlay shown with message: ${loadingMessage}`);
    }

    /**
     * Hides the loading indicator.
     */
    public hideLoading(): void {
        if (this.floatingUIPanel) {
            const loadingOverlay = this.floatingUIPanel.querySelector(`.${CSS_PREFIX}loading-overlay`) as HTMLElement;
            if (loadingOverlay) {
                loadingOverlay.remove();
                console.log(LOG_PREFIX_UI, 'Loading overlay hidden.');
            }
        }
    }

    /**
     * Displays skeleton loading items in the content area.
     * @param count The number of skeleton items to display.
     */
    public showSkeletonLoading(count: number = 5): void {
        if (!this.contentElement) return;

        const container = document.createElement('div');
        for (let i = 0; i < count; i++) {
            const skeletonItem = document.createElement('div');
            skeletonItem.className = `${CSS_PREFIX}skeleton-item`;
            container.appendChild(skeletonItem);
        }

        this.updateContent(container);
    }

    /**
     * Displays an error message in the UI panel.
     * @param title The title for the error message.
     * @param errorMessage The main error message to display.
     * @param errorCode Optional. An error code to display alongside the message.
     */
    public showError(title: string, errorMessage: string, errorCode?: string): void {
        const fullErrorMessage = errorCode ? `${title}: ${errorMessage} (Code: ${errorCode})` : `${title}: ${errorMessage}`;
        this.showToast(fullErrorMessage, 'error');
        // The main floating panel's content and state remain unchanged.
        // It is not cleared or closed by showError.
    }

    /**
     * Displays a non-blocking toast notification.
     * @param message The message to display in the toast.
     * @param type The type of toast ('success', 'error', or 'info') for styling.
     */
    public showToast(message: string, type: 'success' | 'error' | 'info'): void {
        const toast = document.createElement('div');
        toast.className = `${CSS_PREFIX}toast-notification ${type}`;

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
        }, 3000); // Toast disappears after 3 seconds if not manually dismissed
    }

    // --- Context Indicators ---
    /**
     * Sets the callback function to be invoked when a context indicator's remove button is clicked.
     * @param onRemove The callback function that receives the unique block ID and block type of the indicator to be removed.
     */
    public setIndicatorCallbacks(onRemove: (uniqueBlockId: string, blockType: string) => void): void {
        this.onIndicatorRemoveCallback = onRemove;
    }

    /**
     * Renders or updates the context indicators above the target input element.
     * Each indicator represents an active context block (e.g., inserted file content).
     * @param activeContextBlocks A readonly array of ContextBlockMetadata objects representing the currently active context blocks.
     * @param targetInputElement The HTML element (e.g., textarea, contenteditable div) above which the indicators should be rendered.
     */
    public renderContextIndicators(
        activeContextBlocks: Readonly<ContextBlockMetadata[]>, // Use shared type
        targetInputElement: HTMLElement | null
    ): void {
        if (!targetInputElement) {
            console.warn(LOG_PREFIX_UI, 'No target input for context indicators.');
            if (this.contextIndicatorArea) this.contextIndicatorArea.style.display = 'none';
            return;
        }

        if (!this.contextIndicatorArea) {
            this.contextIndicatorArea = document.createElement('div');
            this.contextIndicatorArea.id = CONTEXT_INDICATOR_AREA_ID;
            // Apply current theme to context indicator area
            this.contextIndicatorArea.setAttribute('data-theme', this.currentTheme);
            // Check if both parent and grandparent exist for robust insertion
            if (targetInputElement.parentElement && targetInputElement.parentElement.parentElement) {
                // Insert the indicator area BEFORE the input element's parent (targetInputElement.parentElement)
                // This makes the indicator area a sibling to the input field's parent, effectively placing it "above" the entire input block.
                targetInputElement.parentElement.parentElement.insertBefore(this.contextIndicatorArea, targetInputElement.parentElement);
            } else if (targetInputElement.parentElement) {
                // Fallback: If no grandparent, but a parent exists, insert as a sibling to the input.
                // This might still cause overlap on some sites but is better than appending to body globally.
                console.warn(LOG_PREFIX_UI, 'Target input\'s grandparent not found for indicator area. Inserting as sibling to input.');
                targetInputElement.parentElement.insertBefore(this.contextIndicatorArea, targetInputElement);
            }
            else {
                // Last resort: Append to body.
                console.warn(LOG_PREFIX_UI, 'Target input has no parent for indicator area. Appending to body.');
                document.body.appendChild(this.contextIndicatorArea);
            }
        }

        this.contextIndicatorArea.innerHTML = ''; // Clear existing indicators

        activeContextBlocks.forEach(block => {
            const indicator = document.createElement('div');
            indicator.className = `${CSS_PREFIX}context-indicator`;
            indicator.dataset.uniqueBlockId = block.unique_block_id;
            indicator.dataset.contentSourceId = block.content_source_id;

            const iconSpan = document.createElement('span');
            iconSpan.className = `${CSS_PREFIX}type-icon`;
            switch (block.type) {
                case 'file_content': iconSpan.textContent = '📄'; break;
                case 'folder_content': iconSpan.textContent = '📁'; break;
                case 'codebase_content': iconSpan.textContent = '📚'; break;
                case 'FileTree': iconSpan.textContent = '🌲'; break;
                case 'CodeSnippet': iconSpan.textContent = '✂️'; break;
                case 'WorkspaceProblems': iconSpan.textContent = '❗'; break;
                default: iconSpan.textContent = '❔';
            }
            indicator.appendChild(iconSpan);

            const labelSpan = document.createElement('span');
            labelSpan.textContent = block.label;
            labelSpan.style.marginLeft = '4px';
            indicator.appendChild(labelSpan);

            const closeBtn = document.createElement('button');
            closeBtn.className = `${CSS_PREFIX}indicator-close-btn`;
            closeBtn.textContent = '×';
            closeBtn.dataset.uniqueBlockId = block.unique_block_id;
            closeBtn.dataset.blockType = block.type; // Store block type for removal logic

            closeBtn.onclick = () => {
                if (this.onIndicatorRemoveCallback && closeBtn.dataset.uniqueBlockId && closeBtn.dataset.blockType) {
                    this.onIndicatorRemoveCallback(closeBtn.dataset.uniqueBlockId, closeBtn.dataset.blockType);
                } else {
                    console.error(LOG_PREFIX_UI, 'Indicator remove callback not set or button missing data.');
                }
            };
            indicator.appendChild(closeBtn);
            this.contextIndicatorArea!.appendChild(indicator);
        });

        if (activeContextBlocks.length === 0) {
            this.contextIndicatorArea.style.display = 'none';
        } else {
            this.contextIndicatorArea.style.display = 'flex';
        }
    }

    // --- Dismissal Event Handlers ---
    private boundHandleEscapeKey = this.handleEscapeKey.bind(this);
    private boundHandleClickOutside = this.handleClickOutside.bind(this);

    private addDismissalEventListeners(): void {
        document.addEventListener('keydown', this.boundHandleEscapeKey);
        document.addEventListener('mousedown', this.boundHandleClickOutside);
    }

    private removeDismissalEventListeners(): void {
        document.removeEventListener('keydown', this.boundHandleEscapeKey);
        document.removeEventListener('mousedown', this.boundHandleClickOutside);
    }

    private handleEscapeKey(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            this.hide();
        }
    }

    private handleClickOutside(event: MouseEvent): void {
        if (this.floatingUIPanel && this.floatingUIPanel.classList.contains(`${CSS_PREFIX}visible`)) {
            const target = event.target as Node;
            if (!this.floatingUIPanel.contains(target) && !(this.currentTargetElementForPanel && this.currentTargetElementForPanel.contains(target))) {
                this.hide();
            }
        }
    }

    // --- DOM Element Creation Utilities ---
    /**
     * Creates an HTML button element with specified text and options.
     * @param text The text content of the button.
     * @param options Optional. An object containing button properties like id, classNames, onClick handler, disabled state, and inline styles.
     * @returns The created HTMLButtonElement.
     */
    public createButton(text: string, options?: { id?: string; classNames?: string[]; onClick?: (event: MouseEvent) => void; disabled?: boolean; style?: Partial<CSSStyleDeclaration> }): HTMLButtonElement {
        const button = document.createElement('button');
        button.className = `${CSS_PREFIX}button`; // Default class
        if (options?.classNames) {
            options.classNames.forEach(cn => button.classList.add(cn.startsWith(CSS_PREFIX) ? cn : `${CSS_PREFIX}${cn}`));
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
            options.classNames.forEach(cn => div.classList.add(cn.startsWith(CSS_PREFIX) ? cn : `${CSS_PREFIX}${cn}`));
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
            options.classNames.forEach(cn => span.classList.add(cn.startsWith(CSS_PREFIX) ? cn : `${CSS_PREFIX}${cn}`));
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
            options.classNames.forEach(cn => p.classList.add(cn.startsWith(CSS_PREFIX) ? cn : `${CSS_PREFIX}${cn}`));
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
        checkbox.style.marginRight = '8px'; // Default style from original code
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
     * Retrieves a constant value used within the UIManager for CSS prefixes or element IDs.
     * @param key The name of the constant to retrieve.
     * @returns The string value of the requested constant.
     */
    public getConstant(key: 'CSS_PREFIX' | 'UI_PANEL_ID' | 'CONTEXT_INDICATOR_AREA_ID'): string {
        switch (key) {
            case 'CSS_PREFIX': return CSS_PREFIX;
            case 'UI_PANEL_ID': return UI_PANEL_ID;
            case 'CONTEXT_INDICATOR_AREA_ID': return CONTEXT_INDICATOR_AREA_ID;
            default: return '';
        }
    }
}
