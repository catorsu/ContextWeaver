/**
 * @file IMessageHandler.ts
 * @description Interface for handling IPC messages in the service worker.
 * @module ContextWeaver/CE
 */

import { IPCClient } from '../ipcClient';

/**
 * Interface for handling IPC messages in the service worker.
 * Provides a standardized contract for processing incoming messages.
 */
export interface IMessageHandler {
  /**
   * Handles an incoming message payload.
   * @param payload - The message payload to process.
   * @param ipcClient - The IPC client for communication with the VS Code extension.
   * @returns Promise resolving to the response data.
   */
  handle(payload: any, ipcClient: IPCClient): Promise<any>;
}