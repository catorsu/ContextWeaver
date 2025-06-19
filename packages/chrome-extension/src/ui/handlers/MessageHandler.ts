/**
 * @file MessageHandler.ts
 * @description Handles incoming messages from the service worker and dispatches them to the AppCoordinator.
 * @module ContextWeaver/VSCE
 */
import { Logger, PushSnippetPayload } from '@contextweaver/shared';
import { AppCoordinator } from '../AppCoordinator';

export class MessageHandler {
    private coordinator: AppCoordinator;
    private logger = new Logger('MessageHandler');

    constructor(coordinator: AppCoordinator) {
        this.coordinator = coordinator;
    }

    public initialize(): void {
        chrome.runtime.onMessage.addListener((message) => {
            this.logger.debug('Message received', { type: message.type, command: message.command });

            if (message.type === 'push' && message.command === 'push_snippet') {
                this.coordinator.handleSnippetInsertion(message.payload as PushSnippetPayload);
                return false; // No async response
            } else if (message.type === 'ERROR_FROM_SERVICE_WORKER' || message.type === 'ERROR_FROM_VSCE_IPC') {
                this.coordinator.handleExtensionError(message.payload);
                return false;
            }
            return false;
        });
        this.logger.info('Message handler initialized.');
    }
}
