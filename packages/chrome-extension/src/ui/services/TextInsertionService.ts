import { Logger } from '@contextweaver/shared';

/**
 * Handles the logic for inserting text into the target LLM input field.
 */
export class TextInsertionService {
    private logger = new Logger('TextInsertionService');

    /**
     * Inserts text into the target LLM input field.
     * @param textToInsert The text content to be inserted.
     * @param targetInput The HTML element where the text should be inserted.
     * @param triggerQuery Optional. The original query text that triggered the insertion.
     */
    public insertTextIntoLLMInput(
        textToInsert: string,
        targetInput: HTMLElement | null,
        triggerQuery?: string
    ): void {
        if (!targetInput) {
            this.logger.error('No target input field to insert text into.');
            return;
        }
        targetInput.focus();

        const fullTriggerTextToReplace = triggerQuery ? `@${triggerQuery}` : '@';

        if (targetInput instanceof HTMLTextAreaElement) {
            this.handleTextAreaInsertion(targetInput, textToInsert, fullTriggerTextToReplace);
        } else {
            this.logger.warn('Target input field is not a textarea.');
        }
        this.logger.debug('Text insertion attempt completed.');
    }

    public replaceInLLMInput(pattern: RegExp, replacement: string, targetInput: HTMLElement | null): void {
        if (!targetInput || !(targetInput instanceof HTMLTextAreaElement)) {
            this.logger.error('No valid target input field for text replacement.');
            return;
        }
        targetInput.value = targetInput.value.replace(pattern, replacement);
        targetInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }

    private handleTextAreaInsertion(
        textArea: HTMLTextAreaElement,
        textToInsert: string,
        fullTriggerToReplace: string
    ): void {
        const originalValue = textArea.value;
        const wrapperTags = ['FileContents', 'FileTree', 'CodeSnippet', 'WorkspaceProblems'];
        let lastWrapperEndIndex = -1;

        for (const tagName of wrapperTags) {
            const closingTag = `</${tagName}>`;
            const lastIndex = originalValue.lastIndexOf(closingTag);
            if (lastIndex !== -1) {
                const endIndex = lastIndex + closingTag.length;
                if (endIndex > lastWrapperEndIndex) {
                    lastWrapperEndIndex = endIndex;
                }
            }
        }

        let managedContent = '';
        let userContent = originalValue;

        if (lastWrapperEndIndex !== -1) {
            managedContent = originalValue.substring(0, lastWrapperEndIndex).trimEnd();
            userContent = originalValue.substring(lastWrapperEndIndex);
        }

        const userContentWithoutTrigger = userContent.replace(fullTriggerToReplace, '');
        const separator = userContentWithoutTrigger.trim().length > 0 ? '\n\n' : '';
        const newBlockSeparator = managedContent.length > 0 ? '\n\n' : '';

        textArea.value = managedContent + newBlockSeparator + textToInsert + separator + userContentWithoutTrigger.trimStart();

        const endPosition = textArea.value.length;
        textArea.selectionStart = endPosition;
        textArea.selectionEnd = endPosition;

        this.logger.debug('Inserted content in textarea.');
        textArea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

        setTimeout(() => {
            textArea.scrollTop = textArea.scrollHeight;
        }, 0);
    }
}