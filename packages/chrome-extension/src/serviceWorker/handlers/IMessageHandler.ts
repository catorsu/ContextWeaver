/**
 * @file IMessageHandler.ts
 * @description Interface for handling IPC messages in the service worker.
 * @module ContextWeaver/CE
 */

import { IPCClient } from '../ipcClient';

/**
 * Generic response structure for handler results.
 */
export interface HandlerResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    errorCode?: string;
}

/**
 * Interface for handling IPC messages in the service worker.
 * Provides a standardized contract for processing incoming messages.
 */
export interface IMessageHandler<TPayload = unknown, TResponse = unknown> {
  /**
   * Handles an incoming message payload.
   * @param payload - The message payload to process.
   * @param ipcClient - The IPC client for communication with the VS Code extension.
   * @returns Promise resolving to the response data.
   */
  handle(payload: TPayload, ipcClient: IPCClient): Promise<TResponse>;
}