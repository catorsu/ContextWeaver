import { AppCoordinator } from './AppCoordinator';
import { Logger } from '@contextweaver/shared';

/**
 * Main entry function for the ContextWeaver content script application.
 * Initializes and starts the AppCoordinator.
 */
export function main() {
    const logger = new Logger('main');
    logger.info('ContextWeaver: Initializing modular content script...');
    try {
        const coordinator = new AppCoordinator();
        coordinator.initialize();
        logger.info('ContextWeaver: Modular content script initialized successfully.');
    } catch (error) {
        logger.error('Failed to initialize ContextWeaver content script:', error);
    }
}

// The check for DOMContentLoaded is now handled by the bootstrap file (contentScript.ts)
// which is configured in manifest.json to run at `document_idle`.
