/**
 * @file TextInsertionService.test.ts
 * @description Unit tests for TextInsertionService
 * @module ContextWeaver/CE/Tests
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { TextInsertionService } from '../../../src/ui/services/TextInsertionService';
import { Logger } from '@contextweaver/shared';

// Mock the Logger
jest.mock('@contextweaver/shared', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    }))
}));

describe('TextInsertionService', () => {
    let service: TextInsertionService;
    let mockTextArea: HTMLTextAreaElement;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new TextInsertionService();
        
        // Get the mocked logger instance
        mockLogger = (service as any).logger;

        // Create mock textarea
        mockTextArea = document.createElement('textarea');
        mockTextArea.value = '';
        mockTextArea.focus = jest.fn();
        mockTextArea.dispatchEvent = jest.fn(() => true);
        
        // Mock selection properties
        Object.defineProperty(mockTextArea, 'selectionStart', {
            writable: true,
            value: 0
        });
        Object.defineProperty(mockTextArea, 'selectionEnd', {
            writable: true,
            value: 0
        });
        Object.defineProperty(mockTextArea, 'scrollHeight', {
            writable: true,
            value: 100
        });
        Object.defineProperty(mockTextArea, 'scrollTop', {
            writable: true,
            value: 0
        });
    });

    describe('insertTextIntoLLMInput', () => {
        test('should insert text into empty textarea', () => {
            const textToInsert = '<FileContents>\ntest content\n</FileContents>';
            
            service.insertTextIntoLLMInput(textToInsert, mockTextArea);

            expect(mockTextArea.focus).toHaveBeenCalled();
            expect(mockTextArea.value).toBe(textToInsert);
            expect(mockTextArea.selectionStart).toBe(textToInsert.length);
            expect(mockTextArea.selectionEnd).toBe(textToInsert.length);
            expect(mockTextArea.dispatchEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'input',
                    bubbles: true,
                    cancelable: true
                })
            );
        });

        test('should replace trigger query with content', () => {
            mockTextArea.value = 'Hello @search-query';
            
            const textToInsert = '<FileContents>\nfound content\n</FileContents>';
            service.insertTextIntoLLMInput(textToInsert, mockTextArea, 'search-query');

            // The service inserts content and preserves 'Hello ' (with trailing space)
            expect(mockTextArea.value).toBe(textToInsert + '\n\nHello ');
        });

        test('should handle null target input', () => {
            service.insertTextIntoLLMInput('test', null);

            expect(mockLogger.error).toHaveBeenCalledWith('No target input field to insert text into.');
        });

        test('should handle non-textarea elements', () => {
            const mockDiv = document.createElement('div');
            mockDiv.focus = jest.fn();

            service.insertTextIntoLLMInput('test', mockDiv);

            expect(mockDiv.focus).toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith('Target input field is not a textarea.');
        });

        test('should append after existing managed content', () => {
            mockTextArea.value = '<FileContents>\nexisting content\n</FileContents>\nUser text here';
            
            const newContent = '<FileTree>\ntree structure\n</FileTree>';
            service.insertTextIntoLLMInput(newContent, mockTextArea, '');

            expect(mockTextArea.value).toBe(
                '<FileContents>\nexisting content\n</FileContents>\n\n' +
                '<FileTree>\ntree structure\n</FileTree>\n\n' +
                'User text here'
            );
        });

        test('should handle multiple wrapper tags correctly', () => {
            mockTextArea.value = 
                '<FileContents>\nfile1\n</FileContents>\n' +
                '<CodeSnippet>\ncode\n</CodeSnippet>\n' +
                'User message @';
            
            const newContent = '<WorkspaceProblems>\nerrors\n</WorkspaceProblems>';
            service.insertTextIntoLLMInput(newContent, mockTextArea, '');

            expect(mockTextArea.value).toBe(
                '<FileContents>\nfile1\n</FileContents>\n' +
                '<CodeSnippet>\ncode\n</CodeSnippet>\n\n' +
                '<WorkspaceProblems>\nerrors\n</WorkspaceProblems>\n\n' +
                'User message '
            );
        });

        test('should handle FileTree wrapper tag', () => {
            mockTextArea.value = '<FileTree>\ntree\n</FileTree>\nSome text @query';
            
            const newContent = '<FileContents>\ncontent\n</FileContents>';
            service.insertTextIntoLLMInput(newContent, mockTextArea, 'query');

            expect(mockTextArea.value).toBe(
                '<FileTree>\ntree\n</FileTree>\n\n' +
                '<FileContents>\ncontent\n</FileContents>\n\n' +
                'Some text '
            );
        });

        test('should set cursor position at end of inserted text', (done) => {
            const textToInsert = '<FileContents>\nlong content here\n</FileContents>';
            service.insertTextIntoLLMInput(textToInsert, mockTextArea);

            // Wait for setTimeout to execute
            setTimeout(() => {
                expect(mockTextArea.scrollTop).toBe(mockTextArea.scrollHeight);
                done();
            }, 10);
        });

        test('should handle empty user content after trigger', () => {
            mockTextArea.value = '@search';
            
            const textToInsert = '<FileContents>\ncontent\n</FileContents>';
            service.insertTextIntoLLMInput(textToInsert, mockTextArea, 'search');

            expect(mockTextArea.value).toBe(textToInsert);
        });

        test('should preserve whitespace in user content', () => {
            mockTextArea.value = '  \n  User text with spaces  \n  @trigger  \n  ';
            
            const textToInsert = '<FileContents>\ncontent\n</FileContents>';
            service.insertTextIntoLLMInput(textToInsert, mockTextArea, 'trigger');

            expect(mockTextArea.value).toContain('User text with spaces');
            expect(mockTextArea.value).toBe(textToInsert + '\n\nUser text with spaces  \n    \n  ');
        });
    });

    describe('replaceInLLMInput', () => {
        test('should replace pattern in textarea', () => {
            mockTextArea.value = 'Hello @placeholder world';
            
            service.replaceInLLMInput(/@placeholder/g, 'replaced', mockTextArea);

            expect(mockTextArea.value).toBe('Hello replaced world');
            expect(mockTextArea.dispatchEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'input',
                    bubbles: true,
                    cancelable: true
                })
            );
        });

        test('should handle multiple replacements', () => {
            mockTextArea.value = '@test one @test two @test three';
            
            service.replaceInLLMInput(/@test/g, '[REPLACED]', mockTextArea);

            expect(mockTextArea.value).toBe('[REPLACED] one [REPLACED] two [REPLACED] three');
        });

        test('should handle null target input', () => {
            service.replaceInLLMInput(/test/, 'replacement', null);

            expect(mockLogger.error).toHaveBeenCalledWith('No valid target input field for text replacement.');
        });

        test('should handle non-textarea elements', () => {
            const mockDiv = document.createElement('div');
            
            service.replaceInLLMInput(/test/, 'replacement', mockDiv);

            expect(mockLogger.error).toHaveBeenCalledWith('No valid target input field for text replacement.');
        });

        test('should handle no matches', () => {
            mockTextArea.value = 'Hello world';
            
            service.replaceInLLMInput(/notfound/g, 'replacement', mockTextArea);

            expect(mockTextArea.value).toBe('Hello world');
            expect(mockTextArea.dispatchEvent).toHaveBeenCalled();
        });

        test('should handle complex regex patterns', () => {
            mockTextArea.value = 'Price: $100.50, Tax: $10.05';
            
            service.replaceInLLMInput(/\$\d+\.\d{2}/g, '[AMOUNT]', mockTextArea);

            expect(mockTextArea.value).toBe('Price: [AMOUNT], Tax: [AMOUNT]');
        });
    });

    describe('edge cases and special scenarios', () => {
        test('should handle textarea with only trigger', () => {
            mockTextArea.value = '@';
            
            const textToInsert = '<FileContents>\ncontent\n</FileContents>';
            service.insertTextIntoLLMInput(textToInsert, mockTextArea);

            expect(mockTextArea.value).toBe(textToInsert);
        });

        test('should handle nested wrapper tags in existing content', () => {
            // This shouldn't happen in practice, but test the behavior
            mockTextArea.value = '<FileContents>\n<FileTree>nested</FileTree>\n</FileContents>\nUser text';
            
            const newContent = '<CodeSnippet>\ncode\n</CodeSnippet>';
            service.insertTextIntoLLMInput(newContent, mockTextArea);

            // Should find the last closing tag
            expect(mockTextArea.value).toBe(
                '<FileContents>\n<FileTree>nested</FileTree>\n</FileContents>\n\n' +
                '<CodeSnippet>\ncode\n</CodeSnippet>\n\n' +
                'User text'
            );
        });

        test('should handle malformed wrapper tags gracefully', () => {
            mockTextArea.value = '<FileContents>no closing tag\nUser text @trigger';
            
            const newContent = '<FileTree>\ntree\n</FileTree>';
            service.insertTextIntoLLMInput(newContent, mockTextArea, 'trigger');

            // Should treat entire content as user content since no valid closing tag
            expect(mockTextArea.value).toBe(
                '<FileTree>\ntree\n</FileTree>\n\n' +
                '<FileContents>no closing tag\nUser text '
            );
        });

        test('should handle very long content', () => {
            const longContent = 'x'.repeat(10000);
            mockTextArea.value = `Previous content\n@trigger`;
            
            const textToInsert = `<FileContents>\n${longContent}\n</FileContents>`;
            service.insertTextIntoLLMInput(textToInsert, mockTextArea, 'trigger');

            expect(mockTextArea.value.length).toBeGreaterThan(10000);
            expect(mockTextArea.value).toContain(longContent);
        });

        test('should handle special characters in trigger query', () => {
            mockTextArea.value = 'Text @search.with.dots';
            
            const textToInsert = '<FileContents>\ncontent\n</FileContents>';
            service.insertTextIntoLLMInput(textToInsert, mockTextArea, 'search.with.dots');

            // The service inserts content and preserves 'Text ' (with trailing space)
            expect(mockTextArea.value).toBe(textToInsert + '\n\nText ');
        });

        test('should handle whitespace-only user content', () => {
            mockTextArea.value = '<FileContents>\ncontent\n</FileContents>\n   \n   \n   @';
            
            const newContent = '<FileTree>\ntree\n</FileTree>';
            service.insertTextIntoLLMInput(newContent, mockTextArea, '');

            expect(mockTextArea.value).toBe(
                '<FileContents>\ncontent\n</FileContents>\n\n' +
                '<FileTree>\ntree\n</FileTree>'
            );
        });

        test('should call debug log after insertion', () => {
            service.insertTextIntoLLMInput('test', mockTextArea);

            expect(mockLogger.debug).toHaveBeenCalledWith('Text insertion attempt completed.');
            expect(mockLogger.debug).toHaveBeenCalledWith('Inserted content in textarea.');
        });
    });
});