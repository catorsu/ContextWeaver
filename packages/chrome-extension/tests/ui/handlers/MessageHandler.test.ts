/**
 * @file MessageHandler.test.ts
 * @description Unit tests for MessageHandler
 * @module ContextWeaver/CE/Tests
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MessageHandler } from '../../../src/ui/handlers/MessageHandler';
import { AppCoordinator } from '../../../src/ui/AppCoordinator';
import { PushSnippetPayload } from '@contextweaver/shared';

// Mock Logger
jest.mock('@contextweaver/shared', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    debug: jest.fn()
  })),
  // Re-export types
  PushSnippetPayload: {}
}));

// Mock AppCoordinator
jest.mock('../../../src/ui/AppCoordinator');

// Mock chrome.runtime
global.chrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn()
    }
  }
} as any;

describe('MessageHandler', () => {
  let messageHandler: MessageHandler;
  let mockCoordinator: jest.Mocked<AppCoordinator>;
  let messageListener: (message: any, sender: any, sendResponse: any) => boolean | void;

  beforeEach(() => {
    // Create mock coordinator
    mockCoordinator = {
      handleSnippetInsertion: jest.fn(),
      handleExtensionError: jest.fn()
    } as any;
    
    // Clear previous listeners
    (chrome.runtime.onMessage.addListener as jest.Mock).mockClear();
    
    messageHandler = new MessageHandler(mockCoordinator);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    test('should register message listener', () => {
      messageHandler.initialize();
      
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    test('should only register listener once', () => {
      messageHandler.initialize();
      messageHandler.initialize(); // Call twice
      
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(2);
    });
  });

  describe('message handling', () => {
    beforeEach(() => {
      messageHandler.initialize();
      // Capture the listener function
      messageListener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0] as (message: any, sender: any, sendResponse: any) => boolean | void;
    });

    test('should handle push_snippet message', () => {
      const mockPayload: PushSnippetPayload = {
        content: 'test content',
        timestamp: Date.now()
      } as any;
      
      const message = {
        type: 'push',
        command: 'push_snippet',
        payload: mockPayload
      };
      
      const result = messageListener(message, {}, jest.fn());
      
      expect(mockCoordinator.handleSnippetInsertion).toHaveBeenCalledWith(mockPayload);
      expect(result).toBe(false); // No async response
    });

    test('should handle ERROR_FROM_SERVICE_WORKER message', () => {
      const errorPayload = {
        error: 'Service worker error',
        code: 'SW_ERROR'
      };
      
      const message = {
        type: 'ERROR_FROM_SERVICE_WORKER',
        payload: errorPayload
      };
      
      const result = messageListener(message, {}, jest.fn());
      
      expect(mockCoordinator.handleExtensionError).toHaveBeenCalledWith(errorPayload);
      expect(result).toBe(false);
    });

    test('should handle ERROR_FROM_VSCE_IPC message', () => {
      const errorPayload = {
        error: 'IPC error',
        code: 'IPC_ERROR'
      };
      
      const message = {
        type: 'ERROR_FROM_VSCE_IPC',
        payload: errorPayload
      };
      
      const result = messageListener(message, {}, jest.fn());
      
      expect(mockCoordinator.handleExtensionError).toHaveBeenCalledWith(errorPayload);
      expect(result).toBe(false);
    });

    test('should return false for unhandled message types', () => {
      const message = {
        type: 'unknown',
        command: 'unknown'
      };
      
      const result = messageListener(message, {}, jest.fn());
      
      expect(mockCoordinator.handleSnippetInsertion).not.toHaveBeenCalled();
      expect(mockCoordinator.handleExtensionError).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    test('should handle messages without payload', () => {
      const message = {
        type: 'push',
        command: 'push_snippet'
        // No payload
      };
      
      const result = messageListener(message, {}, jest.fn());
      
      expect(mockCoordinator.handleSnippetInsertion).toHaveBeenCalledWith(undefined);
      expect(result).toBe(false);
    });

    test('should handle malformed messages', () => {
      const messages = [
        {},
        { type: 'push' }, // Missing command
        { command: 'push_snippet' }, // Missing type
        { type: 'unknown', command: 'unknown' }
      ];
      
      messages.forEach(message => {
        const result = messageListener(message, {}, jest.fn());
        expect(result).toBe(false);
      });
      
      expect(mockCoordinator.handleSnippetInsertion).not.toHaveBeenCalled();
      expect(mockCoordinator.handleExtensionError).not.toHaveBeenCalled();
    });

    test('should log received messages', () => {
      const loggerDebug = jest.fn();
      jest.mock('@contextweaver/shared', () => ({
        Logger: jest.fn().mockImplementation(() => ({
          info: jest.fn(),
          debug: loggerDebug
        }))
      }));
      
      const message = {
        type: 'push',
        command: 'push_snippet',
        payload: { content: 'test' }
      };
      
      messageListener(message, {}, jest.fn());
      
      // Logger should have been called with message details
      expect(mockCoordinator.handleSnippetInsertion).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      messageHandler.initialize();
      messageListener = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0] as (message: any, sender: any, sendResponse: any) => boolean | void;
    });

    test('should handle simultaneous messages', () => {
      const messages = [
        {
          type: 'push',
          command: 'push_snippet',
          payload: { content: 'snippet1' }
        },
        {
          type: 'ERROR_FROM_SERVICE_WORKER',
          payload: { error: 'error1' }
        },
        {
          type: 'push',
          command: 'push_snippet',
          payload: { content: 'snippet2' }
        }
      ];
      
      messages.forEach(message => {
        messageListener(message, {}, jest.fn());
      });
      
      expect(mockCoordinator.handleSnippetInsertion).toHaveBeenCalledTimes(2);
      expect(mockCoordinator.handleExtensionError).toHaveBeenCalledTimes(1);
    });

    test('should handle push message with wrong command', () => {
      const message = {
        type: 'push',
        command: 'wrong_command',
        payload: { content: 'test' }
      };
      
      const result = messageListener(message, {}, jest.fn());
      
      expect(mockCoordinator.handleSnippetInsertion).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    test('should preserve payload structure', () => {
      const complexPayload = {
        content: 'test content',
        metadata: {
          timestamp: Date.now(),
          source: 'vscode',
          nested: {
            deep: 'value'
          }
        },
        array: [1, 2, 3]
      };
      
      const message = {
        type: 'push',
        command: 'push_snippet',
        payload: complexPayload
      };
      
      messageListener(message, {}, jest.fn());
      
      expect(mockCoordinator.handleSnippetInsertion).toHaveBeenCalledWith(complexPayload);
    });
  });
});