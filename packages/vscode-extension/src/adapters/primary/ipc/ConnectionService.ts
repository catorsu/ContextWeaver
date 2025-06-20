/**
 * @file ConnectionService.ts
 * @description Manages WebSocket server lifecycle, client connections, and low-level message transmission.
 * @module ContextWeaver/VSCE
 */

import * as WebSocket from 'ws';
import { Logger } from '@contextweaver/shared';
import { v4 as uuidv4 } from 'uuid';
import {
    IPCBaseMessage,
    IPCMessageResponse,
    IPCMessageErrorResponse,
    ErrorResponsePayload
} from '@contextweaver/shared';

const PORT_RANGE_START = 30001;
const PORT_RANGE_END = 30005;

/**
 * Represents a connected client (Chrome Extension instance or Secondary VSCE) to the IPC server.
 */
export interface Client {
    ws: WebSocket.WebSocket;
    isAuthenticated: boolean;
    ip: string;
    activeLLMTabId?: number;
    activeLLMHost?: string;
    windowId?: string; // For secondary VSCE clients
}

/**
 * Manages WebSocket server lifecycle and client connections.
 * Handles low-level connection management, port scanning, and message transmission.
 */
export class ConnectionService {
    private wss: WebSocket.WebSocketServer | null = null;
    private clients: Map<WebSocket.WebSocket, Client> = new Map();
    private activePort: number | null = null;
    private readonly logger = new Logger('ConnectionService');

    /**
     * Attempts to start the WebSocket server on a specific port.
     * @param port The port number to attempt to bind to.
     * @returns A promise that resolves if the server starts successfully, or rejects if the port is in use or another error occurs.
     */
    public tryStartServerOnPort(port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const wss = new WebSocket.WebSocketServer({ port, host: '127.0.0.1' });

            const onError = (error: Error & { code?: string }) => {
                wss.removeAllListeners();
                wss.close();
                reject(error);
            };

            const onListening = () => {
                wss.removeListener('error', onError); // Don't reject on subsequent errors
                this.wss = wss;
                this.activePort = port;
                resolve();
            };

            wss.once('error', onError);
            wss.once('listening', onListening);
        });
    }

    /**
     * Starts the WebSocket server by trying ports in the configured range.
     * @param onConnection Callback to handle new client connections.
     * @returns Promise that resolves with the port number when server starts successfully.
     */
    public async startServer(
        onConnection: (client: Client) => void
    ): Promise<number> {
        for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
            try {
                await this.tryStartServerOnPort(port);
                break; // Exit loop on success
            } catch (error) {
                const errorWithCode = error as Error & { code?: string };
                if (errorWithCode.code === 'EADDRINUSE') {
                    this.logger.info(`Port ${port} is in use, trying next...`);
                    continue;
                }
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.error(`Failed to start server with unexpected error: ${errorMessage}`);
                throw new Error(`Failed to start server: ${errorMessage}`);
            }
        }

        if (!this.wss || !this.activePort) {
            const errorMessage = `All ports in range ${PORT_RANGE_START}-${PORT_RANGE_END} are in use.`;
            this.logger.error(`CRITICAL: ${errorMessage}`);
            throw new Error(errorMessage);
        }

        this.logger.info(`WebSocket server listening on 127.0.0.1:${this.activePort}`);

        // Set up connection handler
        this.wss.on('connection', (ws: WebSocket.WebSocket, req) => {
            const clientIp = req.socket.remoteAddress || 'unknown';
            this.logger.info(`Client connected from ${clientIp}`);
            const client: Client = { ws, isAuthenticated: true, ip: clientIp }; // Token auth removed
            this.logger.info(`Client from ${client.ip} authenticated (token auth removed).`);
            this.clients.set(ws, client);

            // Set up client event handlers
            ws.on('close', () => {
                this.logger.info(`Client from ${client.ip} disconnected.`);
                ws.removeAllListeners();
                this.clients.delete(ws);
            });

            ws.on('error', (error) => {
                this.logger.error(`Error on WebSocket connection from ${client.ip}: ${error.message}`);
                if (this.clients.has(ws)) {
                    ws.removeAllListeners();
                    this.clients.delete(ws);
                }
            });

            // Notify caller about new connection
            onConnection(client);
        });

        return this.activePort;
    }

    /**
     * Sends a response message to a connected WebSocket client.
     * @param ws The WebSocket instance of the client.
     * @param type The type of the IPC message (e.g., 'response').
     * @param command The specific command associated with the response.
     * @param payload The payload data of the response.
     * @param message_id Optional. The ID of the original request message, if applicable.
     */
    public sendMessage<TResponsePayload>(
        ws: WebSocket.WebSocket,
        type: IPCMessageResponse['type'], // Should always be 'response' for this method
        command: IPCMessageResponse['command'], // Specific response command
        payload: TResponsePayload, // Typed payload
        message_id?: string
    ): void {
        const message: IPCBaseMessage & { type: typeof type, command: typeof command, payload: TResponsePayload } = {
            protocol_version: '1.0',
            message_id: message_id || uuidv4(),
            type,
            command,
            payload
        };
        try {
            const messageString = JSON.stringify(message);
            this.logger.trace(`Sending message for command '${command}'. ReadyState: ${ws.readyState}.`, { message_id: message.message_id, type: message.type, payloadKeys: message.payload ? Object.keys(message.payload) : [] });

            if (ws.readyState === WebSocket.WebSocket.OPEN) { // Check if OPEN before sending
                ws.send(messageString);
                this.logger.trace(`Message sent successfully for command: ${command}`);
            } else {
                this.logger.warn(`WebSocket not OPEN (state: ${ws.readyState}). Message for command '${command}' NOT sent.`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error during ws.send() for command '${command}': ${errorMessage}`, { message_id: message.message_id, type: message.type });
        }
    }

    /**
     * Sends an error response message to a connected WebSocket client.
     * @param ws The WebSocket instance of the client.
     * @param original_message_id The ID of the original request message that caused the error, or null if not applicable.
     * @param errorCode A specific error code identifying the type of error.
     * @param errorMessage A human-readable error message.
     */
    public sendError(ws: WebSocket.WebSocket, original_message_id: string | null, errorCode: string, errorMessage: string): void {
        if (!ws) {
            this.logger.error('Attempted to send error but WebSocket was null.', { errorCode, errorMessage });
            return;
        }
        // Add a central log point for all errors sent to clients.
        this.logger.warn(`Sending error to client: ${errorMessage}`, { errorCode, original_message_id });
        const errorPayload: ErrorResponsePayload = {
            success: false,
            error: errorMessage,
            errorCode: errorCode,
            // originalCommand: null // Could be populated if we parse command before erroring
        };
        // Send error response directly as a response type message
        const errorResponseMessage: IPCMessageErrorResponse = {
            protocol_version: '1.0',
            message_id: original_message_id || uuidv4(),
            type: 'error_response',
            command: 'error_response',
            payload: errorPayload
        };
        ws.send(JSON.stringify(errorResponseMessage));
    }

    /**
     * Gets all connected clients.
     */
    public getClients(): Map<WebSocket.WebSocket, Client> {
        return this.clients;
    }

    /**
     * Gets a client by WebSocket instance.
     */
    public getClient(ws: WebSocket.WebSocket): Client | undefined {
        return this.clients.get(ws);
    }

    /**
     * Updates a client's properties.
     */
    public updateClient(ws: WebSocket.WebSocket, updates: Partial<Client>): void {
        const client = this.clients.get(ws);
        if (client) {
            Object.assign(client, updates);
        }
    }

    /**
     * Removes a client from the connection pool.
     */
    public removeClient(ws: WebSocket.WebSocket): void {
        const client = this.clients.get(ws);
        if (client) {
            this.logger.info(`Removing client from ${client.ip}`);
            this.clients.delete(ws);
        }
    }

    /**
     * Gets the active port the server is listening on.
     */
    public getActivePort(): number | null {
        return this.activePort;
    }

    /**
     * Checks if the service is running (has an active WebSocket server).
     */
    public isRunning(): boolean {
        return this.wss !== null && this.activePort !== null;
    }

    /**
     * Stops the WebSocket server and closes all client connections.
     */
    public stop(): void {
        if (this.wss) {
            this.logger.info('Stopping WebSocket server...');
            this.clients.forEach(client => {
                try {
                    client.ws.removeAllListeners();
                    client.ws.close();
                } catch (err) {
                    this.logger.error('Error cleaning up client:', err);
                }
            });
            this.clients.clear();
            this.wss.removeAllListeners();
            this.wss.close((err) => {
                if (err) {
                    this.logger.error(`Error closing WebSocket server: ${err.message}`);
                } else {
                    this.logger.info('WebSocket server stopped.');
                }
                this.wss = null;
                this.activePort = null;
            });
        }
    }
}