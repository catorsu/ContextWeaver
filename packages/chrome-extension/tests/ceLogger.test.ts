/**
 * @file ceLogger.test.ts
 * @description Unit tests for BrowserConsoleLogger
 * @module ContextWeaver/CE/Tests
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { BrowserConsoleLogger } from '../src/ceLogger';
import { LogLevel } from '@contextweaver/shared';

// Mock the console methods
const mockConsole = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    log: jest.fn(),
    trace: jest.fn()
};

// Replace global console with mock
(global as any).console = mockConsole;

describe('BrowserConsoleLogger', () => {
    let logger: BrowserConsoleLogger;

    beforeEach(() => {
        jest.clearAllMocks();
        logger = new BrowserConsoleLogger();
    });

    test('should log ERROR level messages to console.error', () => {
        const message = 'This is an error message';
        logger.log(LogLevel.ERROR, message);

        expect(mockConsole.error).toHaveBeenCalledWith(message);
        expect(mockConsole.error).toHaveBeenCalledTimes(1);
        expect(mockConsole.warn).not.toHaveBeenCalled();
        expect(mockConsole.info).not.toHaveBeenCalled();
        expect(mockConsole.log).not.toHaveBeenCalled();
        expect(mockConsole.trace).not.toHaveBeenCalled();
    });

    test('should log WARN level messages to console.warn', () => {
        const message = 'This is a warning message';
        logger.log(LogLevel.WARN, message);

        expect(mockConsole.warn).toHaveBeenCalledWith(message);
        expect(mockConsole.warn).toHaveBeenCalledTimes(1);
        expect(mockConsole.error).not.toHaveBeenCalled();
        expect(mockConsole.info).not.toHaveBeenCalled();
        expect(mockConsole.log).not.toHaveBeenCalled();
        expect(mockConsole.trace).not.toHaveBeenCalled();
    });

    test('should log INFO level messages to console.info', () => {
        const message = 'This is an info message';
        logger.log(LogLevel.INFO, message);

        expect(mockConsole.info).toHaveBeenCalledWith(message);
        expect(mockConsole.info).toHaveBeenCalledTimes(1);
        expect(mockConsole.error).not.toHaveBeenCalled();
        expect(mockConsole.warn).not.toHaveBeenCalled();
        expect(mockConsole.log).not.toHaveBeenCalled();
        expect(mockConsole.trace).not.toHaveBeenCalled();
    });

    test('should log DEBUG level messages to console.log', () => {
        const message = 'This is a debug message';
        logger.log(LogLevel.DEBUG, message);

        expect(mockConsole.log).toHaveBeenCalledWith(message);
        expect(mockConsole.log).toHaveBeenCalledTimes(1);
        expect(mockConsole.error).not.toHaveBeenCalled();
        expect(mockConsole.warn).not.toHaveBeenCalled();
        expect(mockConsole.info).not.toHaveBeenCalled();
        expect(mockConsole.trace).not.toHaveBeenCalled();
    });

    test('should log TRACE level messages to console.trace', () => {
        const message = 'This is a trace message';
        logger.log(LogLevel.TRACE, message);

        expect(mockConsole.trace).toHaveBeenCalledWith(message);
        expect(mockConsole.trace).toHaveBeenCalledTimes(1);
        expect(mockConsole.error).not.toHaveBeenCalled();
        expect(mockConsole.warn).not.toHaveBeenCalled();
        expect(mockConsole.info).not.toHaveBeenCalled();
        expect(mockConsole.log).not.toHaveBeenCalled();
    });

    test('should handle empty messages', () => {
        logger.log(LogLevel.INFO, '');

        expect(mockConsole.info).toHaveBeenCalledWith('');
        expect(mockConsole.info).toHaveBeenCalledTimes(1);
    });

    test('should handle messages with special characters', () => {
        const message = 'Message with \n newline and \t tab and "quotes"';
        logger.log(LogLevel.DEBUG, message);

        expect(mockConsole.log).toHaveBeenCalledWith(message);
    });

    test('should handle multiple log calls correctly', () => {
        logger.log(LogLevel.ERROR, 'Error 1');
        logger.log(LogLevel.WARN, 'Warning 1');
        logger.log(LogLevel.INFO, 'Info 1');
        logger.log(LogLevel.DEBUG, 'Debug 1');
        logger.log(LogLevel.TRACE, 'Trace 1');

        expect(mockConsole.error).toHaveBeenCalledTimes(1);
        expect(mockConsole.warn).toHaveBeenCalledTimes(1);
        expect(mockConsole.info).toHaveBeenCalledTimes(1);
        expect(mockConsole.log).toHaveBeenCalledTimes(1);
        expect(mockConsole.trace).toHaveBeenCalledTimes(1);
    });

    test('should handle invalid log level gracefully', () => {
        // Test with an invalid log level (TypeScript would normally prevent this)
        const invalidLevel = 999 as LogLevel;
        
        // Should not throw
        expect(() => {
            logger.log(invalidLevel, 'Test message');
        }).not.toThrow();

        // None of the console methods should be called
        expect(mockConsole.error).not.toHaveBeenCalled();
        expect(mockConsole.warn).not.toHaveBeenCalled();
        expect(mockConsole.info).not.toHaveBeenCalled();
        expect(mockConsole.log).not.toHaveBeenCalled();
        expect(mockConsole.trace).not.toHaveBeenCalled();
    });

    test('should handle very long messages', () => {
        const longMessage = 'A'.repeat(10000);
        logger.log(LogLevel.INFO, longMessage);

        expect(mockConsole.info).toHaveBeenCalledWith(longMessage);
    });

    test('should preserve message format when logging', () => {
        const formattedMessage = 'User: %s, ID: %d, Data: %o';
        logger.log(LogLevel.DEBUG, formattedMessage);

        expect(mockConsole.log).toHaveBeenCalledWith(formattedMessage);
    });
});