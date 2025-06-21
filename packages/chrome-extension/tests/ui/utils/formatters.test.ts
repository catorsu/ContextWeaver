/**
 * @file formatters.test.ts
 * @description Unit tests for UI formatting utilities
 * @module ContextWeaver/CE/Tests
 */

import { describe, test, expect, jest } from '@jest/globals';
import { formatFileContentsForLLM } from '../../../src/ui/utils/formatters';

// Mock the Logger
jest.mock('@contextweaver/shared', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        warn: jest.fn()
    }))
}));

describe('formatFileContentsForLLM', () => {
    test('should format single file correctly', () => {
        const filesData = [{
            fullPath: '/project/src/index.ts',
            content: 'console.log("Hello");',
            languageId: 'typescript'
        }];

        const result = formatFileContentsForLLM(filesData);
        expect(result).toBe(
            'File: /project/src/index.ts\n' +
            '```typescript\n' +
            'console.log("Hello");\n' +
            '```\n'
        );
    });

    test('should format multiple files correctly', () => {
        const filesData = [
            {
                fullPath: '/project/src/index.ts',
                content: 'export const greeting = "Hello";',
                languageId: 'typescript'
            },
            {
                fullPath: '/project/src/utils.py',
                content: 'def greet():\n    print("Hello")',
                languageId: 'python'
            }
        ];

        const result = formatFileContentsForLLM(filesData);
        expect(result).toBe(
            'File: /project/src/index.ts\n' +
            '```typescript\n' +
            'export const greeting = "Hello";\n' +
            '```\n' +
            'File: /project/src/utils.py\n' +
            '```python\n' +
            'def greet():\n    print("Hello")\n' +
            '```\n'
        );
    });

    test('should handle content with newline at end', () => {
        const filesData = [{
            fullPath: '/project/file.js',
            content: 'console.log("test");\n',
            languageId: 'javascript'
        }];

        const result = formatFileContentsForLLM(filesData);
        expect(result).toContain('console.log("test");\n```');
    });

    test('should handle content without newline at end', () => {
        const filesData = [{
            fullPath: '/project/file.js',
            content: 'console.log("test");',
            languageId: 'javascript'
        }];

        const result = formatFileContentsForLLM(filesData);
        expect(result).toContain('console.log("test");\n```');
    });

    test('should use plaintext for missing language ID', () => {
        const filesData = [{
            fullPath: '/project/file.txt',
            content: 'Hello World',
            languageId: ''
        }];

        const result = formatFileContentsForLLM(filesData);
        expect(result).toContain('```plaintext\n');
    });

    test('should neutralize tag-like content', () => {
        const filesData = [{
            fullPath: '/project/test.xml',
            content: '<FileContents>data</FileContents>\n<FileTree>tree</FileTree>',
            languageId: 'xml'
        }];

        const result = formatFileContentsForLLM(filesData);
        expect(result).toContain('<\u200BFileContents>');
        expect(result).toContain('</\u200BFileContents>');
        expect(result).toContain('<\u200BFileTree>');
        expect(result).toContain('</\u200BFileTree>');
    });

    test('should handle empty array', () => {
        const result = formatFileContentsForLLM([]);
        expect(result).toBe('');
    });

    test('should handle null/undefined input', () => {
        expect(formatFileContentsForLLM(null as any)).toBe('');
        expect(formatFileContentsForLLM(undefined as any)).toBe('');
    });

    test('should skip invalid file objects', () => {
        const filesData = [
            {
                fullPath: '/valid/file.ts',
                content: 'valid content',
                languageId: 'typescript'
            },
            {
                fullPath: null as any,
                content: 'missing path',
                languageId: 'text'
            },
            {
                fullPath: '/missing/content.ts',
                content: null as any,
                languageId: 'typescript'
            },
            {} as any
        ];

        const result = formatFileContentsForLLM(filesData);
        // Should only contain the valid file
        expect(result).toContain('File: /valid/file.ts');
        expect(result).not.toContain('missing path');
        expect(result).not.toContain('/missing/content.ts');
    });

    test('should handle special tag names in content', () => {
        const filesData = [{
            fullPath: '/project/test.html',
            content: '<CodeSnippet>example</CodeSnippet><WorkspaceProblems>none</WorkspaceProblems>',
            languageId: 'html'
        }];

        const result = formatFileContentsForLLM(filesData);
        expect(result).toContain('<\u200BCodeSnippet>');
        expect(result).toContain('</\u200BCodeSnippet>');
        expect(result).toContain('<\u200BWorkspaceProblems>');
        expect(result).toContain('</\u200BWorkspaceProblems>');
    });

    test('should handle tag names with attributes', () => {
        const filesData = [{
            fullPath: '/project/test.xml',
            content: '<FileContents id="123" class="test">data</FileContents>',
            languageId: 'xml'
        }];

        const result = formatFileContentsForLLM(filesData);
        expect(result).toContain('<\u200BFileContents id="123" class="test">');
        expect(result).toContain('</\u200BFileContents>');
    });

    test('should handle self-closing tags', () => {
        const filesData = [{
            fullPath: '/project/test.xml',
            content: '<FileTree/>Some content<FileContents />',
            languageId: 'xml'
        }];

        const result = formatFileContentsForLLM(filesData);
        expect(result).toContain('<\u200BFileTree/>');
        expect(result).toContain('<\u200BFileContents />');
    });

    test('should handle very large files', () => {
        const largeContent = 'a'.repeat(100000); // 100KB of content
        const filesData = [{
            fullPath: '/project/large.txt',
            content: largeContent,
            languageId: 'plaintext'
        }];

        const result = formatFileContentsForLLM(filesData);
        expect(result).toContain(largeContent);
        expect(result.length).toBeGreaterThan(100000);
    });

    test('should preserve exact formatting and whitespace', () => {
        const filesData = [{
            fullPath: '/project/formatted.py',
            content: 'def foo():\n    return {\n        "key": "value",\n        "nested": {\n            "deep": True\n        }\n    }',
            languageId: 'python'
        }];

        const result = formatFileContentsForLLM(filesData);
        expect(result).toContain('def foo():\n    return {\n        "key": "value",\n        "nested": {\n            "deep": True\n        }\n    }');
    });

    test('should handle files with only whitespace', () => {
        const filesData = [{
            fullPath: '/project/whitespace.txt',
            content: '   \n\t\n   ',
            languageId: 'plaintext'
        }];

        const result = formatFileContentsForLLM(filesData);
        expect(result).toContain('```plaintext\n   \n\t\n   \n```');
    });

    test('should handle file paths with special characters', () => {
        const filesData = [{
            fullPath: '/project/src/@components/[id]/file$.ts',
            content: 'export default {};',
            languageId: 'typescript'
        }];

        const result = formatFileContentsForLLM(filesData);
        expect(result).toContain('File: /project/src/@components/[id]/file$.ts');
    });

    test('should handle mixed valid and invalid file objects in array', () => {
        const filesData = [
            {
                fullPath: '/valid1.ts',
                content: 'valid1',
                languageId: 'typescript'
            },
            {
                fullPath: '',  // Invalid: empty path
                content: 'content',
                languageId: 'text'
            },
            {
                fullPath: '/valid2.js',
                content: 'valid2',
                languageId: 'javascript'
            },
            {
                fullPath: '/path.ts',
                content: '',  // Valid: empty content is allowed
                languageId: 'typescript'
            }
        ];

        const result = formatFileContentsForLLM(filesData);
        expect(result).toContain('File: /valid1.ts');
        expect(result).toContain('File: /valid2.js');
        expect(result).toContain('File: /path.ts');
        expect(result).toContain('valid1');
        expect(result).toContain('valid2');
        expect(result).toContain('```typescript\n\n```'); // Empty content file
    });

    test('should handle unicode content correctly', () => {
        const filesData = [{
            fullPath: '/project/unicode.js',
            content: 'const emoji = "🎉🚀😊";\nconst chinese = "你好世界";\nconst arabic = "مرحبا بالعالم";',
            languageId: 'javascript'
        }];

        const result = formatFileContentsForLLM(filesData);
        expect(result).toContain('🎉🚀😊');
        expect(result).toContain('你好世界');
        expect(result).toContain('مرحبا بالعالم');
    });

    test('should handle case-sensitive tag matching', () => {
        const filesData = [{
            fullPath: '/project/test.xml',
            content: '<filecontents>lowercase</filecontents><FILECONTENTS>UPPERCASE</FILECONTENTS>',
            languageId: 'xml'
        }];

        const result = formatFileContentsForLLM(filesData);
        // Only exact case matches should be neutralized
        expect(result).toContain('<filecontents>lowercase</filecontents>');
        expect(result).toContain('<FILECONTENTS>UPPERCASE</FILECONTENTS>');
        expect(result).not.toContain('<\u200Bfilecontents>');
        expect(result).not.toContain('<\u200BFILECONTENTS>');
    });
});