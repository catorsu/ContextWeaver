/**
 * @file Client.ts
 * @description Core data structure representing a connected client.
 * @module ContextWeaver/VSCE
 */

import { WebSocket } from 'ws';

/**
 * Represents a connected client in the IPC system.
 */
export interface Client {
    /** Unique identifier for the client */
    id: string;
    /** WebSocket connection to the client */
    ws: WebSocket;
    /** Type of client (e.g., 'chrome-extension', 'vscode-secondary') */
    type: string;
    /** Timestamp when the client connected */
    connectedAt: Date;
    /** Optional window ID for VS Code secondary instances */
    windowId?: string;
}