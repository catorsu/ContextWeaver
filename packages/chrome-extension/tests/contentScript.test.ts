/**
 * @file contentScript.test.ts
 * @description Unit tests for content script UI grouping functionality
 * @module ContextWeaver/CE/Tests
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { SearchWorkspaceResponsePayload, SearchResult } from '@contextweaver/shared';

// Define test-specific types to match contentScript
interface WindowGroupable {
  windowId?: string;
  [key: string]: any;
}

interface GroupedWindowItems<T extends WindowGroupable> {
  name: string;
  items: T[];
}

// Mock Chrome API
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn()
    },
    sendMessage: jest.fn()
  }
};

// Setup global mocks
(global as any).chrome = mockChrome;

describe('groupItemsByWindow', () => {
  let dom: JSDOM;
  let window: any;
  let groupItemsByWindow: <T extends WindowGroupable>(items: T[]) => Map<string, GroupedWindowItems<T>>;

  beforeEach(() => {
    // Create a new JSDOM instance for each test
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://chatgpt.com',
      runScripts: 'dangerously'
    });
    window = dom.window;
    
    // Define the groupItemsByWindow function (copied from contentScript)
    const groupItemsByWindowCode = `
      function groupItemsByWindow(items) {
        const grouped = new Map();
        if (!items || items.length === 0) {
          return grouped;
        }

        for (const item of items) {
          const key = item.windowId || 'unknown_window';
          const name = item.windowId ? 'Window: ' + item.windowId.substring(0, 8) : 'Unknown Window';

          if (!grouped.has(key)) {
            grouped.set(key, { name, items: [] });
          }
          grouped.get(key).items.push(item);
        }
        return grouped;
      }
      window.groupItemsByWindow = groupItemsByWindow;
    `;
    
    // Execute the code in the JSDOM context
    window.eval(groupItemsByWindowCode);
    groupItemsByWindow = window.groupItemsByWindow;
  });

  afterEach(() => {
    dom.window.close();
  });

  test('should group items from multiple windows', () => {
    const mockSearchResults: SearchResult[] = [
      {
        path: '/workspace1/file1.js',
        name: 'file1.js',
        type: 'file',
        uri: 'file:///workspace1/file1.js',
        content_source_id: 'file:///workspace1/file1.js',
        workspaceFolderUri: 'file:///workspace1',
        workspaceFolderName: 'Workspace1',
        relativePath: 'file1.js',
        windowId: '12345678-1234-1234-1234-123456789012'
      },
      {
        path: '/workspace1/file2.js',
        name: 'file2.js',
        type: 'file',
        uri: 'file:///workspace1/file2.js',
        content_source_id: 'file:///workspace1/file2.js',
        workspaceFolderUri: 'file:///workspace1',
        workspaceFolderName: 'Workspace1',
        relativePath: 'file2.js',
        windowId: '12345678-1234-1234-1234-123456789012'
      },
      {
        path: '/workspace2/file3.js',
        name: 'file3.js',
        type: 'file',
        uri: 'file:///workspace2/file3.js',
        content_source_id: 'file:///workspace2/file3.js',
        workspaceFolderUri: 'file:///workspace2',
        workspaceFolderName: 'Workspace2',
        relativePath: 'file3.js',
        windowId: '87654321-4321-4321-4321-210987654321'
      }
    ];

    const grouped = groupItemsByWindow(mockSearchResults);

    // Assert correct structure
    expect(grouped.size).toBe(2);
    
    // Check first window group
    const window1Group = grouped.get('12345678-1234-1234-1234-123456789012');
    expect(window1Group).toBeDefined();
    expect(window1Group!.name).toBe('Window: 12345678');
    expect(window1Group!.items.length).toBe(2);
    expect(window1Group!.items[0].name).toBe('file1.js');
    expect(window1Group!.items[1].name).toBe('file2.js');
    
    // Check second window group
    const window2Group = grouped.get('87654321-4321-4321-4321-210987654321');
    expect(window2Group).toBeDefined();
    expect(window2Group!.name).toBe('Window: 87654321');
    expect(window2Group!.items.length).toBe(1);
    expect(window2Group!.items[0].name).toBe('file3.js');
  });

  test('should handle items without windowId', () => {
    const mockItems = [
      {
        path: '/workspace/file1.js',
        name: 'file1.js',
        windowId: '12345678-1234-1234-1234-123456789012'
      },
      {
        path: '/workspace/file2.js',
        name: 'file2.js'
        // No windowId
      }
    ];

    const grouped = groupItemsByWindow(mockItems);

    expect(grouped.size).toBe(2);
    
    // Check window group
    const windowGroup = grouped.get('12345678-1234-1234-1234-123456789012');
    expect(windowGroup).toBeDefined();
    expect(windowGroup!.items.length).toBe(1);
    
    // Check unknown window group
    const unknownGroup = grouped.get('unknown_window');
    expect(unknownGroup).toBeDefined();
    expect(unknownGroup!.name).toBe('Unknown Window');
    expect(unknownGroup!.items.length).toBe(1);
    expect(unknownGroup!.items[0].name).toBe('file2.js');
  });

  test('should handle empty input', () => {
    const grouped = groupItemsByWindow([]);
    expect(grouped.size).toBe(0);
  });

  test('should handle null/undefined input', () => {
    const grouped1 = groupItemsByWindow(null as any);
    expect(grouped1.size).toBe(0);
    
    const grouped2 = groupItemsByWindow(undefined as any);
    expect(grouped2.size).toBe(0);
  });
});

describe('renderSearchResults', () => {
  let dom: JSDOM;
  let window: any;
  let document: any;
  let renderSearchResults: (response: SearchWorkspaceResponsePayload, query: string) => void;
  let mockUiManager: any;

  beforeEach(() => {
    // Create a new JSDOM instance
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="content"></div></body></html>', {
      url: 'https://chatgpt.com',
      runScripts: 'dangerously'
    });
    window = dom.window;
    document = window.document;
    
    // Mock UI Manager
    mockUiManager = {
      updateContent: jest.fn(),
      updateTitle: jest.fn(),
      createDiv: jest.fn((options: any) => {
        const div = document.createElement('div');
        if (options.classNames) {
          div.className = options.classNames.join(' ');
        }
        if (options.textContent) {
          div.textContent = options.textContent;
        }
        if (options.style) {
          Object.assign(div.style, options.style);
        }
        return div;
      })
    };
    
    // Set up globals in window context
    window.eval(`
      window.LOCAL_CSS_PREFIX = 'cw-';
      window.uiManager = ${JSON.stringify({})};
      window.groupItemsByWindow = function(items) {
        const grouped = new Map();
        if (!items || items.length === 0) {
          return grouped;
        }
        for (const item of items) {
          const key = item.windowId || 'unknown_window';
          const name = item.windowId ? 'Window: ' + item.windowId.substring(0, 8) : 'Unknown Window';
          if (!grouped.has(key)) {
            grouped.set(key, { name, items: [] });
          }
          grouped.get(key).items.push(item);
        }
        return grouped;
      };
      window.groupItemsByWorkspace = function(items) {
        const grouped = new Map();
        if (!items || items.length === 0) {
          return grouped;
        }
        for (const item of items) {
          const key = item.workspaceFolderUri || 'unknown_workspace';
          const name = item.workspaceFolderName || 'Unknown Workspace';
          if (!grouped.has(key)) {
            grouped.set(key, { name, items: [] });
          }
          grouped.get(key).items.push(item);
        }
        return grouped;
      };
      window.createSearchResultItemElement = function(result, isGrouped) {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.textContent = result.name;
        return div;
      };
    `);
    
    // Replace the mock uiManager methods
    window.uiManager = mockUiManager;
    
    // Define renderSearchResults function (simplified from contentScript)
    const renderSearchResultsCode = `
      window.renderSearchResults = function(response, query) {
        const titleText = 'Search results for: ' + query;
        const contentFragment = document.createDocumentFragment();
        const results = response.data.results;
        
        // First group by window
        const groupedByWindow = window.groupItemsByWindow(results);
        
        // If we have results from multiple windows, show window grouping
        if (groupedByWindow.size > 1) {
          for (const [_windowKey, windowGroupData] of groupedByWindow.entries()) {
            const windowHeader = window.uiManager.createDiv({ 
              classNames: [window.LOCAL_CSS_PREFIX + 'window-header'], 
              textContent: windowGroupData.name,
              style: { fontWeight: 'bold', marginTop: '10px', marginBottom: '5px' }
            });
            contentFragment.appendChild(windowHeader);
            
            // Then group by workspace within each window
            const groupedByWorkspace = window.groupItemsByWorkspace(windowGroupData.items);
            
            if (groupedByWorkspace.size > 1) {
              for (const [_workspaceKey, workspaceGroupData] of groupedByWorkspace.entries()) {
                const workspaceHeader = window.uiManager.createDiv({ 
                  classNames: [window.LOCAL_CSS_PREFIX + 'group-header'], 
                  textContent: '  ' + workspaceGroupData.name,
                  style: { marginLeft: '15px' }
                });
                contentFragment.appendChild(workspaceHeader);
                workspaceGroupData.items.forEach(result => {
                  const itemDiv = window.createSearchResultItemElement(result, true);
                  itemDiv.style.marginLeft = '30px';
                  contentFragment.appendChild(itemDiv);
                });
              }
            } else {
              windowGroupData.items.forEach(result => {
                const itemDiv = window.createSearchResultItemElement(result, false);
                itemDiv.style.marginLeft = '15px';
                contentFragment.appendChild(itemDiv);
              });
            }
          }
        } else {
          // Single window - use original workspace grouping logic
          const groupedResultsMap = window.groupItemsByWorkspace(results);
          
          if (groupedResultsMap.size > 1) {
            for (const [_workspaceKey, groupData] of groupedResultsMap.entries()) {
              const groupHeader = window.uiManager.createDiv({ 
                classNames: [window.LOCAL_CSS_PREFIX + 'group-header'], 
                textContent: groupData.name 
              });
              contentFragment.appendChild(groupHeader);
              groupData.items.forEach(result => {
                const itemDiv = window.createSearchResultItemElement(result, true);
                contentFragment.appendChild(itemDiv);
              });
            }
          } else {
            results.forEach(result => {
              const itemDiv = window.createSearchResultItemElement(result, false);
              contentFragment.appendChild(itemDiv);
            });
          }
        }
        
        window.uiManager.updateTitle(titleText);
        window.uiManager.updateContent(contentFragment);
      };
    `;
    
    window.eval(renderSearchResultsCode);
    renderSearchResults = window.renderSearchResults;
  });

  afterEach(() => {
    dom.window.close();
  });

  test('should render window group headers for multi-window results', () => {
    const mockResponse: SearchWorkspaceResponsePayload = {
      success: true,
      data: {
        results: [
          {
            path: '/workspace1/file1.js',
            name: 'file1.js',
            type: 'file',
            uri: 'file:///workspace1/file1.js',
            content_source_id: 'file:///workspace1/file1.js',
            workspaceFolderUri: 'file:///workspace1',
            workspaceFolderName: 'Workspace1',
            relativePath: 'file1.js',
            windowId: '11111111-1111-1111-1111-111111111111'
          },
          {
            path: '/workspace2/file2.js',
            name: 'file2.js',
            type: 'file',
            uri: 'file:///workspace2/file2.js',
            content_source_id: 'file:///workspace2/file2.js',
            workspaceFolderUri: 'file:///workspace2',
            workspaceFolderName: 'Workspace2',
            relativePath: 'file2.js',
            windowId: '22222222-2222-2222-2222-222222222222'
          }
        ],
        windowId: '11111111-1111-1111-1111-111111111111'
      },
      error: null,
      query: 'test'
    };

    renderSearchResults(mockResponse, 'test');

    // Check that updateContent was called
    expect(mockUiManager.updateContent).toHaveBeenCalledTimes(1);
    const contentFragment = mockUiManager.updateContent.mock.calls[0][0];
    
    // Convert fragment to array of elements for easier testing
    const elements = Array.from(contentFragment.childNodes) as HTMLElement[];
    
    // Should have window headers
    const windowHeaders = elements.filter(el => 
      el.className && el.className.includes('cw-window-header')
    );
    expect(windowHeaders.length).toBe(2);
    expect(windowHeaders[0].textContent).toBe('Window: 11111111');
    expect(windowHeaders[1].textContent).toBe('Window: 22222222');
    
    // Check that updateTitle was called
    expect(mockUiManager.updateTitle).toHaveBeenCalledWith('Search results for: test');
  });

  test('should not show window headers for single-window results', () => {
    const mockResponse: SearchWorkspaceResponsePayload = {
      success: true,
      data: {
        results: [
          {
            path: '/workspace1/file1.js',
            name: 'file1.js',
            type: 'file',
            uri: 'file:///workspace1/file1.js',
            content_source_id: 'file:///workspace1/file1.js',
            workspaceFolderUri: 'file:///workspace1',
            workspaceFolderName: 'Workspace1',
            relativePath: 'file1.js',
            windowId: '11111111-1111-1111-1111-111111111111'
          },
          {
            path: '/workspace1/file2.js',
            name: 'file2.js',
            type: 'file',
            uri: 'file:///workspace1/file2.js',
            content_source_id: 'file:///workspace1/file2.js',
            workspaceFolderUri: 'file:///workspace1',
            workspaceFolderName: 'Workspace1',
            relativePath: 'file2.js',
            windowId: '11111111-1111-1111-1111-111111111111'
          }
        ],
        windowId: '11111111-1111-1111-1111-111111111111'
      },
      error: null,
      query: 'test'
    };

    renderSearchResults(mockResponse, 'test');

    // Check that updateContent was called
    expect(mockUiManager.updateContent).toHaveBeenCalledTimes(1);
    const contentFragment = mockUiManager.updateContent.mock.calls[0][0];
    
    // Convert fragment to array of elements
    const elements = Array.from(contentFragment.childNodes) as HTMLElement[];
    
    // Should NOT have window headers
    const windowHeaders = elements.filter(el => 
      el.className && el.className.includes('cw-window-header')
    );
    expect(windowHeaders.length).toBe(0);
    
    // Should have search result items
    const resultItems = elements.filter(el => 
      el.className && el.className.includes('search-result-item')
    );
    expect(resultItems.length).toBe(2);
  });

  test('should handle workspace grouping within window groups', () => {
    const mockResponse: SearchWorkspaceResponsePayload = {
      success: true,
      data: {
        results: [
          {
            path: '/workspace1/file1.js',
            name: 'file1.js',
            type: 'file',
            uri: 'file:///workspace1/file1.js',
            content_source_id: 'file:///workspace1/file1.js',
            workspaceFolderUri: 'file:///workspace1',
            workspaceFolderName: 'Workspace1',
            relativePath: 'file1.js',
            windowId: '11111111-1111-1111-1111-111111111111'
          },
          {
            path: '/workspace2/file2.js',
            name: 'file2.js',
            type: 'file',
            uri: 'file:///workspace2/file2.js',
            content_source_id: 'file:///workspace2/file2.js',
            workspaceFolderUri: 'file:///workspace2',
            workspaceFolderName: 'Workspace2',
            relativePath: 'file2.js',
            windowId: '11111111-1111-1111-1111-111111111111'
          },
          {
            path: '/workspace3/file3.js',
            name: 'file3.js',
            type: 'file',
            uri: 'file:///workspace3/file3.js',
            content_source_id: 'file:///workspace3/file3.js',
            workspaceFolderUri: 'file:///workspace3',
            workspaceFolderName: 'Workspace3',
            relativePath: 'file3.js',
            windowId: '22222222-2222-2222-2222-222222222222'
          }
        ],
        windowId: '11111111-1111-1111-1111-111111111111'
      },
      error: null,
      query: 'test'
    };

    renderSearchResults(mockResponse, 'test');

    const contentFragment = mockUiManager.updateContent.mock.calls[0][0];
    const elements = Array.from(contentFragment.childNodes) as HTMLElement[];
    
    // Should have 2 window headers
    const windowHeaders = elements.filter(el => 
      el.className && el.className.includes('cw-window-header')
    );
    expect(windowHeaders.length).toBe(2);
    
    // Should have workspace headers within first window
    const workspaceHeaders = elements.filter(el => 
      el.className && el.className.includes('cw-group-header')
    );
    expect(workspaceHeaders.length).toBeGreaterThan(0);
    
    // Check indentation styles
    const searchItems = elements.filter(el => 
      el.className && el.className.includes('search-result-item')
    );
    expect(searchItems.some(item => item.style.marginLeft === '30px')).toBe(true);
  });
});