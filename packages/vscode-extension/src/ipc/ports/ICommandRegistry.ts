/**
 * @file ICommandRegistry.ts
 * @description Interface for registering and retrieving IPC command handlers.
 * @module ContextWeaver/VSCE
 */

import { ICommandHandler } from './ICommandHandler';

/**
 * Interface for registering and retrieving IPC command handlers.
 * Provides a centralized registry for mapping command strings to their handlers.
 */
export interface ICommandRegistry {
    /**
     * Registers a command handler for the specified command string.
     * @param command - The command string to register the handler for
     * @param handler - The command handler to associate with the command
     */
    register(command: string, handler: ICommandHandler<unknown, unknown>): void;

    /**
     * Retrieves the registered handler for the specified command.
     * @param command - The command string to look up
     * @returns The associated command handler, or undefined if not found
     */
    getHandler(command: string): ICommandHandler<unknown, unknown> | undefined;
}