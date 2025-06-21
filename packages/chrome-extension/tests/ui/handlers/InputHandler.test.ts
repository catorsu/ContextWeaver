/**
 * @file InputHandler.test.ts
 * @description Unit tests for InputHandler
 * @module ContextWeaver/CE/Tests
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { InputHandler } from '../../../src/ui/handlers/InputHandler';
import { AppCoordinator } from '../../../src/ui/AppCoordinator';

// Mock Logger
jest.mock('@contextweaver/shared', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    debug: jest.fn()
  }))
}));

// Mock AppCoordinator
jest.mock('../../../src/ui/AppCoordinator');

describe('InputHandler', () => {
  let inputHandler: InputHandler;
  let mockCoordinator: jest.Mocked<AppCoordinator>;
  let mockInputField: HTMLTextAreaElement;
  let mutationObserverInstances: any[] = [];
  let originalMutationObserver: typeof MutationObserver;

  beforeEach(() => {
    // Clear DOM
    document.body.innerHTML = '';
    
    // Store original MutationObserver
    originalMutationObserver = global.MutationObserver;
    
    // Mock MutationObserver to track instances
    global.MutationObserver = jest.fn().mockImplementation(function(callback) {
      const instance = {
        observe: jest.fn(),
        disconnect: jest.fn(),
        takeRecords: jest.fn().mockReturnValue([]),
        callback: callback
      };
      mutationObserverInstances.push(instance as any);
      return instance;
    }) as any;
    
    // Create mock coordinator
    mockCoordinator = {
      handleTrigger: jest.fn(),
      uiManager: {
        getConstant: jest.fn().mockReturnValue('cw-floating-panel'),
        hide: jest.fn()
      },
      stateManager: {
        getCurrentTargetElementForPanel: jest.fn(),
        setCurrentTargetElementForPanel: jest.fn(),
        getActiveContextBlocks: jest.fn().mockReturnValue([]),
        removeActiveContextBlock: jest.fn()
      },
      renderContextIndicators: jest.fn()
    } as any;
    
    // Create mock input field
    mockInputField = document.createElement('textarea');
    mockInputField.id = 'chat-input';
    
    inputHandler = new InputHandler(mockCoordinator);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Disconnect all MutationObservers
    mutationObserverInstances.forEach(observer => {
      if (observer.disconnect) {
        observer.disconnect();
      }
    });
    mutationObserverInstances = [];
    // Restore original MutationObserver
    global.MutationObserver = originalMutationObserver;
  });

  describe('initialize', () => {
    test('should attach listener to existing input field', () => {
      // Mock hostname
      Object.defineProperty(window, 'location', {
        value: { hostname: 'chat.deepseek.com' },
        writable: true
      });
      
      document.body.appendChild(mockInputField);
      
      inputHandler.initialize();
      
      // Trigger input event
      const inputEvent = new Event('input');
      mockInputField.value = '@test';
      mockInputField.selectionStart = 5;
      mockInputField.dispatchEvent(inputEvent);
      
      expect(mockCoordinator.handleTrigger).toHaveBeenCalledWith(mockInputField, 'test');
    });

    test('should setup MutationObserver for missing input field', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'aistudio.google.com' },
        writable: true
      });
      
      inputHandler.initialize();
      
      // Check that a MutationObserver was created
      expect(mutationObserverInstances.length).toBeGreaterThan(0);
      const observer = mutationObserverInstances[mutationObserverInstances.length - 1];
      expect(observer.observe).toHaveBeenCalledWith(document.body, {
        childList: true,
        subtree: true
      });
    });

    test('should handle multiple hostname configs', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'aistudio.google.com' },
        writable: true
      });
      
      // Create AI Studio specific input
      const aiStudioInput = document.createElement('textarea');
      const wrapper = document.createElement('ms-chunk-input');
      wrapper.appendChild(aiStudioInput);
      document.body.appendChild(wrapper);
      
      inputHandler.initialize();
      
      // Trigger input event
      const inputEvent = new Event('input');
      aiStudioInput.value = '@';
      aiStudioInput.selectionStart = 1;
      aiStudioInput.dispatchEvent(inputEvent);
      
      expect(mockCoordinator.handleTrigger).toHaveBeenCalledWith(aiStudioInput);
    });
  });

  describe('input event handling', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'chat.deepseek.com' },
        writable: true
      });
      document.body.appendChild(mockInputField);
      inputHandler.initialize();
    });

    test('should handle @ trigger at beginning', () => {
      mockInputField.value = '@';
      mockInputField.selectionStart = 1;
      mockInputField.dispatchEvent(new Event('input'));
      
      expect(mockCoordinator.handleTrigger).toHaveBeenCalledWith(mockInputField);
    });

    test('should handle @ trigger with query text', () => {
      mockInputField.value = 'Hello @context';
      mockInputField.selectionStart = 14;
      mockInputField.dispatchEvent(new Event('input'));
      
      expect(mockCoordinator.handleTrigger).toHaveBeenCalledWith(mockInputField, 'context');
    });

    test('should hide UI when @ trigger is removed', () => {
      // Setup panel as visible
      const mockPanel = document.createElement('div');
      mockPanel.id = 'cw-floating-panel';
      mockPanel.classList.add('cw-visible');
      document.body.appendChild(mockPanel);
      
      mockCoordinator.stateManager.getCurrentTargetElementForPanel = jest.fn().mockReturnValue(mockInputField) as any;
      
      mockInputField.value = 'Hello world';
      mockInputField.selectionStart = 11;
      mockInputField.dispatchEvent(new Event('input'));
      
      expect(mockCoordinator.uiManager.hide).toHaveBeenCalled();
    });

    test('should trigger on @ at end of text', () => {
      mockInputField.value = 'email@example.com';
      mockInputField.selectionStart = 17; // Position after the full email
      mockInputField.dispatchEvent(new Event('input'));
      
      // The regex /@(\S*)$/ will match @example.com at the end
      expect(mockCoordinator.handleTrigger).toHaveBeenCalledWith(mockInputField, 'example.com');
    });

    test('should handle @ followed by space', () => {
      mockInputField.value = '@ ';
      mockInputField.selectionStart = 1;
      mockInputField.dispatchEvent(new Event('input'));
      
      expect(mockCoordinator.handleTrigger).toHaveBeenCalledWith(mockInputField);
    });

    test('should detect manual removal of context blocks', () => {
      mockCoordinator.stateManager.getActiveContextBlocks = jest.fn().mockReturnValue([
        { unique_block_id: 'block1', type: 'file_content' },
        { unique_block_id: 'block2', type: 'folder_content' }
      ]) as any;
      
      mockInputField.value = 'Some text with id="block1"';
      mockInputField.dispatchEvent(new Event('input'));
      
      expect(mockCoordinator.stateManager.removeActiveContextBlock).toHaveBeenCalledWith('block2');
      expect(mockCoordinator.renderContextIndicators).toHaveBeenCalledWith(mockInputField);
    });

    test('should hide UI when targeting different input', () => {
      const mockPanel = document.createElement('div');
      mockPanel.id = 'cw-floating-panel';
      document.body.appendChild(mockPanel);
      
      const differentInput = document.createElement('textarea');
      mockCoordinator.stateManager.getCurrentTargetElementForPanel = jest.fn().mockReturnValue(differentInput) as any;
      
      mockInputField.value = '@test';
      mockInputField.selectionStart = 5;
      mockInputField.dispatchEvent(new Event('input'));
      
      expect(mockCoordinator.uiManager.hide).toHaveBeenCalled();
    });
  });

  describe('event listener management', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'chat.deepseek.com' },
        writable: true
      });
    });

    test('should not attach duplicate listeners', () => {
      document.body.appendChild(mockInputField);
      
      const addEventListenerSpy = jest.spyOn(mockInputField, 'addEventListener');
      
      inputHandler.initialize();
      inputHandler.initialize(); // Initialize twice
      
      expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
    });

    test('should not re-attach listener to same element', () => {
      document.body.appendChild(mockInputField);
      
      const addEventListenerSpy = jest.spyOn(mockInputField, 'addEventListener');
      
      inputHandler.initialize();
      const firstCallCount = addEventListenerSpy.mock.calls.length;
      
      // Try to attach again to the same element
      (inputHandler as any).attachListenerToInputField(mockInputField, {
        hostSuffix: 'chat.deepseek.com',
        selector: 'textarea#chat-input',
        attachedElement: mockInputField,
        isAttached: true
      });
      
      // Should not add another listener
      expect(addEventListenerSpy.mock.calls.length).toBe(firstCallCount);
    });

    test('should add dataset attribute to input field', () => {
      document.body.appendChild(mockInputField);
      
      inputHandler.initialize();
      
      expect(mockInputField.dataset.cwSelector).toBe('textarea#chat-input');
    });
  });

  describe('MutationObserver behavior', () => {
    test('should detect dynamically added input field', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'chat.deepseek.com' },
        writable: true
      });
      
      inputHandler.initialize();
      
      // Get the MutationObserver instance
      const observer = mutationObserverInstances[mutationObserverInstances.length - 1];
      
      // Add input field and manually trigger observer callback
      document.body.appendChild(mockInputField);
      observer.callback([{ type: 'childList' }], observer);
      
      // Test that input is now being monitored
      mockInputField.value = '@test';
      mockInputField.selectionStart = 5;
      mockInputField.dispatchEvent(new Event('input'));
      
      expect(mockCoordinator.handleTrigger).toHaveBeenCalledWith(mockInputField, 'test');
    });

    test('should re-attach listener when element is re-added', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'chat.deepseek.com' },
        writable: true
      });
      
      document.body.appendChild(mockInputField);
      inputHandler.initialize();
      
      // Get the MutationObserver instance
      const observer = mutationObserverInstances[mutationObserverInstances.length - 1];
      
      // Remove input
      mockInputField.remove();
      
      // Re-add input and trigger observer
      document.body.appendChild(mockInputField);
      
      // Trigger the MutationObserver callback
      if (observer && observer.callback) {
        observer.callback([{ type: 'childList' }], observer);
      }
      
      // Test re-attached listener
      mockInputField.value = '@reattached';
      mockInputField.selectionStart = 11;
      mockInputField.dispatchEvent(new Event('input'));
      
      expect(mockCoordinator.handleTrigger).toHaveBeenCalledWith(mockInputField, 'reattached');
    });
  });
});