/**
 * @file IpcClient.ts
 * @description Interface for IPC client communication with VS Code extension.
 * @module ContextWeaver/CE
 */

/**
 * Interface for IPC client that manages communication with the VS Code extension.
 * Provides connection management and request/response functionality.
 */
export interface IpcClient {
  /**
   * Ensures the client is connected to the VS Code extension.
   * @returns Promise that resolves when connection is established.
   */
  ensureConnected(): Promise<void>;

  /**
   * Sends a request to the VS Code extension and waits for response.
   * @param command - The command to execute.
   * @param payload - The request payload.
   * @returns Promise resolving to the response data.
   */
  sendRequest<TReq, TRes>(command: string, payload: TReq): Promise<TRes>;

  /**
   * Disconnects from the VS Code extension.
   */
  disconnect(): void;

  /**
   * Checks if the client is currently connected.
   * @returns True if connected, false otherwise.
   */
  isConnected(): boolean;

  /**
   * Updates the browser extension badge to reflect connection status.
   * @param status - The current connection status to display.
   */
  updateBadge(status: 'connected' | 'connecting' | 'failed'): void;
}