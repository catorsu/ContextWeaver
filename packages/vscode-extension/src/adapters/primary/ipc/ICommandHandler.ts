/**
 * @file ICommandHandler.ts
 * @description Interface definition for command handlers in the IPC system.
 * @module ContextWeaver/VSCE
 */

import { ClientContext } from './types';

/**
 * Interface for handling IPC commands using the Command Pattern.
 * @template TReq - The type of the request payload.
 * @template TRes - The type of the response payload.
 */
export interface ICommandHandler<TReq, TRes> {
    /**
     * Handles an IPC command request.
     * @param request - The request containing payload and client context.
     * @returns A promise that resolves to the response payload.
     */
    handle(request: { payload: TReq; client: ClientContext }): Promise<TRes>;
}