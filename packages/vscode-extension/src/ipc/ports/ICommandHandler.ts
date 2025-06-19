/**
 * @file ICommandHandler.ts
 * @description Generic interface for handling IPC commands with typed request and response payloads.
 * @module ContextWeaver/VSCE
 */

/**
 * Generic interface for handling IPC commands with typed request and response payloads.
 * Provides a contract for command processing with window-specific context.
 * @template TReq - The type of the request payload
 * @template TRes - The type of the response payload
 */
export interface ICommandHandler<TReq, TRes> {
    /**
     * Handles an incoming command with the specified payload and window context.
     * @param payload - The request payload to process
     * @param windowId - The identifier of the window that initiated the request
     * @returns A promise that resolves to the command response
     */
    handle(payload: TReq, windowId: string): Promise<TRes>;
}