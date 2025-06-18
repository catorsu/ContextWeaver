import { Logger } from '@contextweaver/shared';

const logger = new Logger('Formatters');

/**
 * Formats an array of file data objects into a single string suitable for LLM input.
 * Each file's content is wrapped in a code block with its language ID, and the entire block is enclosed in `<FileContents>` tags.
 * @param filesData An array of objects, each containing `fullPath`, `content`, and `languageId` for a file.
 * @returns {string} The formatted string of file contents.
 */
export function formatFileContentsForLLM(filesData: { fullPath: string; content: string; languageId: string }[]): string {
    if (!Array.isArray(filesData) || filesData.length === 0) {
        logger.warn('formatFileContentsForLLM: Invalid or empty filesData array.');
        return '';
    }
    const formattedBlocks = [];
    const tagsToNeutralize = ['FileContents', 'FileTree', 'CodeSnippet', 'WorkspaceProblems']; // Contains all wrapper tags we use

    for (const file of filesData) {
        if (file && typeof file.fullPath === 'string' && typeof file.content === 'string') {
            let processedContent = file.content;

            // Neutralize potential conflicting tags within the content to prevent premature matching by removal regex.
            for (const tagName of tagsToNeutralize) {
                const closeTagPattern = new RegExp(`</${tagName}\\b`, 'g');
                processedContent = processedContent.replace(closeTagPattern, `</\u200B${tagName}`);

                const openTagPattern = new RegExp(`<${tagName}\\b`, 'g');
                processedContent = processedContent.replace(openTagPattern, `<\u200B${tagName}`);
            }

            const langId = (typeof file.languageId === 'string' && file.languageId) ? file.languageId : 'plaintext';
            let fileBlock = `File: ${file.fullPath}\n`;
            fileBlock += `\`\`\`${langId}\n`;
            fileBlock += processedContent.endsWith('\n') ? processedContent : `${processedContent}\n`;
            fileBlock += '```\n';
            formattedBlocks.push(fileBlock);
        } else {
            logger.warn('formatFileContentsForLLM: Skipping invalid file data object:', file);
        }
    }
    if (formattedBlocks.length === 0) return '';
    // Return only the concatenated blocks. The caller is responsible for the final wrapper tag with ID.
    return formattedBlocks.join('');
}