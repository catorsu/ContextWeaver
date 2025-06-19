/**
 * @file MessageHandlerMap.ts
 * @description Map of message handlers for the service worker.
 * @module ContextWeaver/CE
 */

import { IMessageHandler } from './IMessageHandler';
import { GetWorkspaceDetailsHandler } from './GetWorkspaceDetailsHandler';
import { GetFileTreeHandler } from './GetFileTreeHandler';
import { GetActiveFileInfoHandler } from './GetActiveFileInfoHandler';
import { GetFileContentHandler } from './GetFileContentHandler';
import { GetEntireCodebaseHandler } from './GetEntireCodebaseHandler';
import { GetOpenFilesHandler } from './GetOpenFilesHandler';
import { GetContentsForSelectedOpenFilesHandler } from './GetContentsForSelectedOpenFilesHandler';
import { GetFolderContentHandler } from './GetFolderContentHandler';
import { ListFolderContentsHandler } from './ListFolderContentsHandler';
import { SearchWorkspaceHandler } from './SearchWorkspaceHandler';
import { GetWorkspaceProblemsHandler } from './GetWorkspaceProblemsHandler';
import { PushSnippetHandler } from './PushSnippetHandler';

/**
 * Map of message type strings to their corresponding handler instances.
 * Each handler is responsible for processing a specific message type.
 */
export class MessageHandlerMap {
    private readonly handlers: Map<string, IMessageHandler> = new Map();

    constructor() {
        this.initializeHandlers();
    }

    /**
     * Initializes all message handlers and registers them with their corresponding message types.
     */
    private initializeHandlers(): void {
        // Register handlers for each message type
        this.handlers.set('GET_WORKSPACE_DETAILS_FOR_UI', new GetWorkspaceDetailsHandler());
        this.handlers.set('GET_FileTree', new GetFileTreeHandler());
        this.handlers.set('GET_ACTIVE_FILE_INFO', new GetActiveFileInfoHandler());
        this.handlers.set('GET_FILE_CONTENT', new GetFileContentHandler());
        this.handlers.set('GET_ENTIRE_CODEBASE', new GetEntireCodebaseHandler());
        this.handlers.set('GET_OPEN_FILES_FOR_UI', new GetOpenFilesHandler());
        this.handlers.set('GET_CONTENTS_FOR_SELECTED_OPEN_FILES', new GetContentsForSelectedOpenFilesHandler());
        this.handlers.set('GET_FOLDER_CONTENT', new GetFolderContentHandler());
        this.handlers.set('LIST_FOLDER_CONTENTS', new ListFolderContentsHandler());
        this.handlers.set('SEARCH_WORKSPACE', new SearchWorkspaceHandler());
        this.handlers.set('GET_WORKSPACE_PROBLEMS', new GetWorkspaceProblemsHandler());
        
        // Special handler for push messages
        this.handlers.set('push_snippet', new PushSnippetHandler());
    }

    /**
     * Gets the handler for a specific message type.
     * @param messageType The message type string.
     * @returns The handler instance if found, undefined otherwise.
     */
    getHandler(messageType: string): IMessageHandler | undefined {
        return this.handlers.get(messageType);
    }

    /**
     * Checks if a handler exists for a specific message type.
     * @param messageType The message type string.
     * @returns True if handler exists, false otherwise.
     */
    hasHandler(messageType: string): boolean {
        return this.handlers.has(messageType);
    }

    /**
     * Gets all registered message types.
     * @returns Array of message type strings.
     */
    getRegisteredMessageTypes(): string[] {
        return Array.from(this.handlers.keys());
    }
}