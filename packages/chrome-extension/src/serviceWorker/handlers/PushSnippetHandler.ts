/**
 * @file PushSnippetHandler.ts
 * @description Handler for push_snippet messages from VSCE.
 * @module ContextWeaver/CE
 */

import { IPCMessagePush } from '@contextweaver/shared';
import { Logger } from '@contextweaver/shared';
import { IMessageHandler } from './IMessageHandler';
import { IPCClient } from '../ipcClient';

/**
 * Handles push_snippet messages by broadcasting snippets to LLM tabs.
 */
export class PushSnippetHandler implements IMessageHandler {
    private readonly logger = new Logger('PushSnippetHandler');
    
    private readonly SUPPORTED_LLM_HOST_SUFFIXES = [
        'chat.deepseek.com',
        'aistudio.google.com'
    ];

    /**
     * Handles push_snippet messages by broadcasting to all LLM tabs.
     * @param payload The push message payload.
     * @param ipcClient The IPC client (not used for this handler).
     * @returns Promise resolving to void (no response needed).
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async handle(payload: IPCMessagePush, ipcClient: IPCClient): Promise<void> {
        const pushMessage = payload;
        this.logger.debug('Handling push_snippet from VSCE, broadcasting to LLM tabs.');

        try {
            // Query for all tabs matching supported LLM host permissions
            const urlsToQuery = this.SUPPORTED_LLM_HOST_SUFFIXES.map(suffix => `*://${suffix}/*`);
            const tabs = await chrome.tabs.query({ url: urlsToQuery });
            
            this.logger.debug(`Found ${tabs.length} LLM tabs to send snippet to`);

            // Send the snippet message to each tab
            const sendPromises = tabs.map(tab => {
                if (tab.id) {
                    return chrome.tabs.sendMessage(tab.id, pushMessage)
                        .then(() => {
                            if (chrome.runtime.lastError) {
                                this.logger.warn(`Error sending push_snippet to tab ${tab.id}: ${chrome.runtime.lastError.message}`);
                            } else {
                                this.logger.debug(`Successfully sent push_snippet to tab ${tab.id}`);
                            }
                        })
                        .catch(e => {
                            this.logger.warn(`Error sending push_snippet message to tab ${tab.id}:`, e);
                        });
                }
                return Promise.resolve();
            });

            await Promise.all(sendPromises);
        } catch (e) {
            this.logger.error('Error querying tabs for push_snippet broadcast:', e);
        }
    }
}