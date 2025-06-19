/**
 * @file IpcServer.ts
 * @description Interface for IPC server functionality with event handling and message transmission.
 * @module ContextWeaver/VSCE
 */

import { IPCMessageRequest } from '@contextweaver/shared';
import { WebSocket } from 'ws';

/**
 * Interface for IPC server functionality with event handling and message transmission.
 * Provides a contract for managing IPC communication lifecycle and message routing.
 */
export interface IpcServer {
    /**
     * Starts the IPC server and begins listening for incoming connections.
     * @returns A promise that resolves when the server is successfully started
     */
    start(): Promise<void>;

    /**
     * Stops the IPC server and closes all active connections.
     */
    stop(): void;

    /**
     * Registers an event listener for the specified event type.
     * @param event - The event type to listen for
     * @param listener - The callback function to invoke when the event occurs
     * @returns This instance for method chaining
     */
    on(event: 'message', listener: (data: IPCMessageRequest, sender: WebSocket) => void): this;

    /**
     * Sends a message to the specified target.
     * @param target - The target recipient for the message
     * @param message - The message payload to send
     */
    send(target: WebSocket, message: string): void;
}