/**
 * @file types.ts
 * @description Type definitions for IPC handling system in the VS Code Extension.
 * @module ContextWeaver/VSCE
 */

import WebSocket from 'ws';

/**
 * Represents a connected client (Chrome Extension instance or Secondary VSCE) to the IPC server.
 */
export interface Client {
    ws: WebSocket;
    isAuthenticated: boolean;
    ip: string;
    activeLLMTabId?: number;
    activeLLMHost?: string;
    windowId?: string; // For secondary VSCE clients
}

/**
 * Context type for command handlers, providing client information and metadata.
 */
export interface ClientContext extends Client {}