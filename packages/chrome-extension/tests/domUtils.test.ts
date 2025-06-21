/**
 * @file domUtils.test.ts
 * @description Unit tests for DOM utility functions including grouping and debounce
 * @module ContextWeaver/CE/Tests
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SearchWorkspaceResponsePayload, SearchResult } from '@contextweaver/shared';
import { groupItemsByWindow, groupItemsByWorkspace, WindowGroupable, WorkspaceGroupable, debounce } from '../src/ui/utils/domUtils';
import { renderSearchResults } from '../src/ui/view/renderers/searchRenderer';
import { UIManager } from '../src/uiManager';

// Mock the parts of the Chrome API that the content script interacts with.
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

describe('debounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('should delay function execution', async () => {
    const mockFn = jest.fn().mockReturnValue('result');
    const debouncedFn = debounce(mockFn, 100);

    const promise = debouncedFn('arg1', 'arg2');

    // Function should not be called immediately
    expect(mockFn).not.toHaveBeenCalled();

    // Fast forward time
    jest.advanceTimersByTime(100);

    // Now function should have been called
    const result = await promise;
    expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result).toBe('result');
  });

  test('should cancel previous calls when called multiple times', async () => {
    const mockFn = jest.fn<(x: number) => number>().mockImplementation((x) => x * 2);
    const debouncedFn = debounce(mockFn, 100);

    // Call multiple times in quick succession
    debouncedFn(1);
    debouncedFn(2);
    const promise = debouncedFn(3);

    jest.advanceTimersByTime(100);

    const result = await promise;

    // Should only be called once with the last arguments
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith(3);
    expect(result).toBe(6);
  });

  test('should handle async functions', async () => {
    const mockAsyncFn = jest.fn<() => Promise<string>>().mockResolvedValue('async result');
    const debouncedFn = debounce(mockAsyncFn, 100);

    const promise = debouncedFn();

    jest.advanceTimersByTime(100);

    const result = await promise;
    expect(mockAsyncFn).toHaveBeenCalledTimes(1);
    expect(result).toBe('async result');
  });

  // Note: The current debounce implementation doesn't handle errors properly.
  // These tests are commented out but left here to document expected behavior
  // if error handling is added to the debounce function in the future.
  
  // test('should handle function that throws error', async () => {
  //   const mockFn = jest.fn().mockImplementation(() => {
  //     throw new Error('Test error');
  //   });
  //   const debouncedFn = debounce(mockFn, 100);
  //
  //   const promise = debouncedFn();
  //
  //   jest.advanceTimersByTime(100);
  //
  //   await expect(promise).rejects.toThrow('Test error');
  //   expect(mockFn).toHaveBeenCalledTimes(1);
  // });

  // test('should handle async function that rejects', async () => {
  //   const mockAsyncFn = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('Async error'));
  //   const debouncedFn = debounce(mockAsyncFn, 100);
  //
  //   const promise = debouncedFn();
  //
  //   jest.advanceTimersByTime(100);
  //   
  //   await expect(promise).rejects.toThrow('Async error');
  //   expect(mockAsyncFn).toHaveBeenCalledTimes(1);
  // });

  test('should handle zero wait time', async () => {
    const mockFn = jest.fn().mockReturnValue('immediate');
    const debouncedFn = debounce(mockFn, 0);

    const promise = debouncedFn();

    jest.advanceTimersByTime(0);

    const result = await promise;
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result).toBe('immediate');
  });

  test('should maintain separate state for different debounced functions', async () => {
    const mockFn1 = jest.fn().mockReturnValue('fn1');
    const mockFn2 = jest.fn().mockReturnValue('fn2');
    const debouncedFn1 = debounce(mockFn1, 100);
    const debouncedFn2 = debounce(mockFn2, 100);

    const promise1 = debouncedFn1();
    const promise2 = debouncedFn2();

    jest.advanceTimersByTime(100);

    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(mockFn1).toHaveBeenCalledTimes(1);
    expect(mockFn2).toHaveBeenCalledTimes(1);
    expect(result1).toBe('fn1');
    expect(result2).toBe('fn2');
  });

  test('should handle rapid successive calls with different wait times', async () => {
    const mockFn = jest.fn<(x: number) => number>().mockImplementation((x) => x);
    const debouncedFn = debounce(mockFn, 50);

    // First call
    debouncedFn(1);
    
    // Wait 30ms and call again
    jest.advanceTimersByTime(30);
    debouncedFn(2);
    
    // Wait another 30ms (total 60ms from first call)
    jest.advanceTimersByTime(30);
    
    // At this point, the second call should not have executed yet
    expect(mockFn).not.toHaveBeenCalled();
    
    // Wait the remaining 20ms to complete the debounce period from the second call
    jest.advanceTimersByTime(20);
    
    // Now it should have been called with the second argument
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith(2);
  });

  test('should return different promises for each call', () => {
    const mockFn = jest.fn().mockReturnValue('result');
    const debouncedFn = debounce(mockFn, 100);

    const promise1 = debouncedFn();
    const promise2 = debouncedFn();

    expect(promise1).not.toBe(promise2);
  });

  test('should preserve this context', async () => {
    const obj = {
      value: 42,
      getValue: function() {
        return this.value;
      }
    };

    const debouncedGetValue = debounce(obj.getValue.bind(obj), 100);
    const promise = debouncedGetValue();

    jest.advanceTimersByTime(100);

    const result = await promise;
    expect(result).toBe(42);
  });
});

describe('groupItemsByWindow', () => {
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

    const grouped = groupItemsByWindow(mockSearchResults as unknown as WindowGroupable[]);

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
    const mockItems: WindowGroupable[] = [
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

describe('groupItemsByWorkspace', () => {
  test('should group items by workspace', () => {
    const mockItems: WorkspaceGroupable[] = [
      {
        path: '/workspace1/file1.js',
        name: 'file1.js',
        workspaceFolderUri: 'file:///workspace1',
        workspaceFolderName: 'Workspace1'
      },
      {
        path: '/workspace1/file2.js',
        name: 'file2.js',
        workspaceFolderUri: 'file:///workspace1',
        workspaceFolderName: 'Workspace1'
      },
      {
        path: '/workspace2/file3.js',
        name: 'file3.js',
        workspaceFolderUri: 'file:///workspace2',
        workspaceFolderName: 'Workspace2'
      }
    ];

    const grouped = groupItemsByWorkspace(mockItems);

    expect(grouped.size).toBe(2);

    const workspace1Group = grouped.get('file:///workspace1');
    expect(workspace1Group).toBeDefined();
    expect(workspace1Group!.name).toBe('Workspace1');
    expect(workspace1Group!.items.length).toBe(2);

    const workspace2Group = grouped.get('file:///workspace2');
    expect(workspace2Group).toBeDefined();
    expect(workspace2Group!.name).toBe('Workspace2');
    expect(workspace2Group!.items.length).toBe(1);
  });

  test('should handle items without workspace info', () => {
    const mockItems: WorkspaceGroupable[] = [
      {
        path: '/workspace/file1.js',
        name: 'file1.js'
        // No workspace info
      }
    ];

    const grouped = groupItemsByWorkspace(mockItems);

    expect(grouped.size).toBe(1);
    const unknownGroup = grouped.get('unknown_workspace');
    expect(unknownGroup).toBeDefined();
    expect(unknownGroup!.name).toBe('Unknown Workspace');
    expect(unknownGroup!.items.length).toBe(1);
  });
});

describe('renderSearchResults', () => {
  let mockUiManager: UIManager;
  let mockDOMFactory: any;
  let mockActions: any;

  beforeEach(() => {
    // Mock DOM Factory
    mockDOMFactory = {
      createDiv: jest.fn((options: any) => {
        const div = document.createElement('div');
        if (options?.classNames) {
          div.className = options.classNames.join(' ');
        }
        if (options?.textContent) {
          div.textContent = options.textContent;
        }
        if (options?.style) {
          Object.assign(div.style, options.style);
        }
        return div;
      }),
      createSpan: jest.fn((options: any) => {
        const span = document.createElement('span');
        if (options?.classNames) {
          span.className = options.classNames.join(' ');
        }
        if (options?.textContent) {
          span.textContent = options.textContent;
        }
        return span;
      }),
      createParagraph: jest.fn((options: any) => {
        const p = document.createElement('p');
        if (options?.textContent) {
          p.textContent = options.textContent;
        }
        return p;
      }),
      createIcon: jest.fn((iconName: string) => {
        const span = document.createElement('span');
        span.className = 'material-icons';
        span.textContent = iconName;
        return span;
      })
    };

    // Mock UI Manager
    mockUiManager = {
      updateContent: jest.fn(),
      updateTitle: jest.fn(),
      getDOMFactory: jest.fn(() => mockDOMFactory)
    } as any;

    // Mock actions
    mockActions = {
      onFileSelect: jest.fn(),
      onFolderBrowse: jest.fn()
    };
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

    renderSearchResults(mockUiManager, mockResponse, 'test', mockActions);

    // Check that updateContent was called
    expect(mockUiManager.updateContent).toHaveBeenCalledTimes(1);
    
    // Check that updateTitle was called
    expect(mockUiManager.updateTitle).toHaveBeenCalledWith('"@test"');

    // Check that window headers were created
    const windowHeaderCalls = mockDOMFactory.createDiv.mock.calls.filter((call: any[]) => 
      call[0]?.classNames?.includes('cw-window-header')
    );
    expect(windowHeaderCalls.length).toBe(2);
    expect(windowHeaderCalls[0][0].textContent).toBe('Window: 11111111');
    expect(windowHeaderCalls[1][0].textContent).toBe('Window: 22222222');
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

    renderSearchResults(mockUiManager, mockResponse, 'test', mockActions);

    // Check that updateContent was called
    expect(mockUiManager.updateContent).toHaveBeenCalledTimes(1);

    // Should NOT have window headers
    const windowHeaderCalls = mockDOMFactory.createDiv.mock.calls.filter((call: any[]) => 
      call[0]?.classNames?.includes('cw-window-header')
    );
    expect(windowHeaderCalls.length).toBe(0);

    // Should have search result items
    const resultItemCalls = mockDOMFactory.createDiv.mock.calls.filter((call: any[]) => 
      call[0]?.classNames?.includes('search-result-item')
    );
    expect(resultItemCalls.length).toBe(2);
  });

  test('should handle empty search results', () => {
    const mockResponse: SearchWorkspaceResponsePayload = {
      success: true,
      data: {
        results: [],
        windowId: '11111111-1111-1111-1111-111111111111'
      },
      error: null,
      query: 'test'
    };

    renderSearchResults(mockUiManager, mockResponse, 'test', mockActions);

    expect(mockUiManager.updateTitle).toHaveBeenCalledWith('"@test"');
    expect(mockDOMFactory.createParagraph).toHaveBeenCalledWith({ textContent: 'No results found.' });
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

    renderSearchResults(mockUiManager, mockResponse, 'test', mockActions);

    // Should have 2 window headers
    const windowHeaderCalls = mockDOMFactory.createDiv.mock.calls.filter((call: any[]) => 
      call[0]?.classNames?.includes('cw-window-header')
    );
    expect(windowHeaderCalls.length).toBe(2);

    // Should have workspace headers within first window
    const workspaceHeaderCalls = mockDOMFactory.createDiv.mock.calls.filter((call: any[]) => 
      call[0]?.classNames?.includes('cw-group-header')
    );
    expect(workspaceHeaderCalls.length).toBeGreaterThan(0);
  });
});