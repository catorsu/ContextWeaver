/**
 * @file CommandRegistry.ts
 * @description Registry for managing command handlers in the IPC system.
 * @module ContextWeaver/VSCE
 */

import { ICommandHandler } from './ICommandHandler';

/**
 * Registry for managing command handlers using the Command Pattern.
 * Provides registration and retrieval of handlers for specific commands.
 */
export class CommandRegistry {
    private readonly handlers: Map<string, ICommandHandler<unknown, unknown>> = new Map();

    /**
     * Registers a command handler for a specific command.
     * @param command - The command name to register the handler for.
     * @param handler - The handler implementation for the command.
     */
    register(command: string, handler: ICommandHandler<unknown, unknown>): void {
        this.handlers.set(command, handler);
    }

    /**
     * Retrieves a handler for a specific command.
     * @param command - The command name to get the handler for.
     * @returns The handler implementation if found, undefined otherwise.
     */
    getHandler(command: string): ICommandHandler<unknown, unknown> | undefined {
        return this.handlers.get(command);
    }
}