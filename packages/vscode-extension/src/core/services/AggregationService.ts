/**
 * @file AggregationService.ts
 * @description Service for aggregating responses from multiple VSCE instances in Primary/Secondary architecture.
 * @module ContextWeaver/VSCE
 */

import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { Logger, extractErrorInfo } from '@contextweaver/shared';
import { IAggregationService } from '../ports/IAggregationService';

// Import types from shared module
import {
    SearchWorkspaceResponsePayload as CWSearchWorkspaceResponsePayload,
    ErrorResponsePayload,
    SearchResult as CWSearchResult,
    FileContentResponseData,
    IPCBaseMessage,
    IPCMessageResponse
} from '@contextweaver/shared';

interface AggregationResponse {
    windowId: string;
    payload: unknown;
}

interface AggregationSession {
    originalRequester: WebSocket;
    responses: AggregationResponse[];
    expectedResponses: number;
    timeout: NodeJS.Timeout;
    originalMessageId: string;
    originalCommand: string;
    completed?: boolean;
}

/**
 * Service for managing response aggregation from primary and secondary VSCE instances.
 * Handles collecting responses from multiple sources and combining them appropriately.
 */
export class AggregationService implements IAggregationService {
    private pendingAggregatedResponses: Map<string, AggregationSession> = new Map();
    private messageIdToAggregationId: Map<string, string> = new Map();
    private readonly logger = new Logger('AggregationService');
    private readonly windowId: string;

    constructor(windowId: string) {
        this.windowId = windowId;
        this.logger.info(`AggregationService initialized for window ${windowId}`);
    }

    /**
     * Starts a new aggregation session for a request that will be broadcast to secondaries.
     */
    public startAggregation(
        aggregationId: string,
        originalRequester: WebSocket,
        expectedResponses: number,
        originalMessageId: string,
        originalCommand: string
    ): void {
        this.logger.debug(`Starting aggregation session ${aggregationId} for command ${originalCommand}`);

        const timeout = setTimeout(() => {
            this.completeAggregation(aggregationId);
        }, 5000); // 5 second timeout

        this.pendingAggregatedResponses.set(aggregationId, {
            originalRequester,
            responses: [],
            expectedResponses,
            timeout,
            originalMessageId,
            originalCommand
        });

        // Map the original message ID to the aggregation ID for primary response tracking
        this.messageIdToAggregationId.set(originalMessageId, aggregationId);
    }

    /**
     * Adds a response from a secondary VSCE instance to the aggregation.
     */
    public addResponse(aggregationId: string, windowId: string, responsePayload: unknown): void {
        const aggregation = this.pendingAggregatedResponses.get(aggregationId);
        if (!aggregation) {
            this.logger.warn(`No aggregation session found for ID ${aggregationId}`);
            return;
        }

        const wrappedResponse = {
            windowId,
            payload: responsePayload
        };

        aggregation.responses.push(wrappedResponse);
        this.logger.debug(`Added response from ${windowId} to aggregation ${aggregationId}. Total: ${aggregation.responses.length}/${aggregation.expectedResponses}`);

        if (aggregation.responses.length >= aggregation.expectedResponses) {
            this.completeAggregation(aggregationId);
        }
    }

    /**
     * Adds the primary VSCE instance's own response to the aggregation.
     */
    public addPrimaryResponse(messageId: string, primaryWindowId: string, responsePayload: unknown): boolean {
        const aggregationId = this.messageIdToAggregationId.get(messageId);
        if (!aggregationId) {
            // This message is not part of an aggregation
            return false;
        }

        const aggregation = this.pendingAggregatedResponses.get(aggregationId);
        if (!aggregation || aggregation.completed) {
            if (aggregation?.completed) {
                this.logger.warn(`Aggregation for ${aggregation.originalCommand} (ID: ${aggregationId}) already completed. Dropping late primary response.`);
            }
            return true; // Return true to indicate this was handled (even if dropped)
        }

        this.logger.debug(`Capturing primary's local response for aggregation ID ${aggregationId}.`);
        aggregation.responses.push({ windowId: primaryWindowId, payload: responsePayload });
        
        if (aggregation.responses.length >= aggregation.expectedResponses) {
            this.completeAggregation(aggregationId);
        }
        
        return true; // Return true to indicate this was handled by aggregation
    }

    /**
     * Checks if a message ID is part of an ongoing aggregation.
     */
    public isMessagePartOfAggregation(messageId: string): boolean {
        return this.messageIdToAggregationId.has(messageId);
    }

    /**
     * Completes response aggregation and sends the combined response to the CE.
     */
    private completeAggregation(aggregationId: string): void {
        const aggregation = this.pendingAggregatedResponses.get(aggregationId);
        if (!aggregation || aggregation.completed) return;

        this.logger.debug(`Completing aggregation ${aggregationId} for command ${aggregation.originalCommand}`);

        // Mark as completed to prevent race conditions where the timeout fires
        // before the primary's own response is processed.
        aggregation.completed = true;
        clearTimeout(aggregation.timeout);

        // Defer deletion to allow any late-arriving primary responses to be gracefully dropped.
        setTimeout(() => {
            this.pendingAggregatedResponses.delete(aggregationId);
            this.messageIdToAggregationId.delete(aggregation.originalMessageId);
        }, 2000);

        // Aggregate responses based on command type
        let aggregatedPayload: unknown;
        const command = aggregation.originalCommand;

        switch (command) {
            case 'search_workspace': {
                // Combine search results
                const allResults: CWSearchResult[] = [];
                const allErrors: { windowId: string, error: string, errorCode?: string }[] = [];
                for (const response of aggregation.responses) {
                    // response.payload is a SearchWorkspaceResponsePayload or ErrorResponsePayload
                    const payload = response.payload as CWSearchWorkspaceResponsePayload | ErrorResponsePayload;
                    if (payload.success && 'data' in payload && payload.data?.results) {
                        allResults.push(...payload.data.results);
                    } else if (!payload.success) {
                        allErrors.push({
                            windowId: response.windowId,
                            error: payload.error || 'Unknown error from secondary',
                            errorCode: payload.errorCode
                        });
                    }
                }
                aggregatedPayload = {
                    success: allErrors.length === 0,
                    data: { results: allResults, windowId: this.windowId, errors: allErrors.length > 0 ? allErrors : undefined },
                    error: null
                };
                break;
            }
 
            case 'get_workspace_details': {
                const allFolders: Array<{ uri: string; name: string; isTrusted: boolean }> = [];
                let isTrusted = true;
                let primaryWorkspaceName: string | undefined;
 
                for (const response of aggregation.responses) {
                    const payload = response.payload as { data?: { workspaceFolders?: Array<{ uri: string; name: string; isTrusted: boolean }>; isTrusted?: boolean; workspaceName?: string } };
                    if (payload?.data?.workspaceFolders) {
                        allFolders.push(...payload.data.workspaceFolders);
                    }
                    if (payload?.data?.isTrusted === false) isTrusted = false;
                    if (response.windowId === this.windowId) primaryWorkspaceName = payload?.data?.workspaceName;
                }
                aggregatedPayload = {
                    success: true,
                    data: { isTrusted, workspaceFolders: allFolders, workspaceName: primaryWorkspaceName },
                    error: null
                };
                break;
            }

            case 'get_open_files': {
                // Combine open files
                const allOpenFiles: Array<{
                    path: string;
                    name: string;
                    workspaceFolderUri: string | null;
                    workspaceFolderName: string | null;
                    windowId: string;
                }> = [];
                for (const response of aggregation.responses) {
                    const payload = response.payload as { data?: { openFiles?: typeof allOpenFiles } };
                    if (payload?.data?.openFiles) {
                        allOpenFiles.push(...payload.data.openFiles);
                    }
                }
                aggregatedPayload = {
                    success: true,
                    data: { openFiles: allOpenFiles },
                    error: null
                };
                break;
            }

            case 'get_contents_for_files': {
                const allData: FileContentResponseData[] = [];
                const allErrors: { uri: string; error: string; errorCode?: string }[] = [];
                for (const response of aggregation.responses) {
                    // The payload of each response is a ContentsForFilesResponsePayload
                    const payload = response.payload as { data?: FileContentResponseData[]; errors?: typeof allErrors };
                    if (payload?.data) {
                        allData.push(...payload.data);
                    }
                    if (payload?.errors) {
                        allErrors.push(...payload.errors);
                    }
                }
                aggregatedPayload = {
                    success: true,
                    data: allData,
                    errors: allErrors,
                    error: null
                };
                break;
            }

            // Add more aggregation logic for other commands as needed
            default: {
                // For commands that don't need special aggregation, prioritize the primary's response.
                // This avoids non-deterministic behavior where a secondary's response might be used.
                const primaryResponse = aggregation.responses.find(r => r.windowId === this.windowId);
                aggregatedPayload = primaryResponse?.payload || aggregation.responses[0]?.payload || { success: false, error: 'No responses received' };
            }
        }

        // Send aggregated response
        this.sendMessage(aggregation.originalRequester, 'response', `response_${command}` as IPCMessageResponse['command'], aggregatedPayload, aggregation.originalMessageId, true);
    }

    /**
     * Sends a response message to a connected WebSocket client.
     */
    private sendMessage<TResponsePayload>(
        ws: WebSocket,
        type: IPCMessageResponse['type'],
        command: IPCMessageResponse['command'],
        payload: TResponsePayload,
        message_id?: string,
        _bypassAggregation?: boolean
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
            this.logger.trace(`Sending aggregated message for command '${command}'. ReadyState: ${ws.readyState}.`, { message_id: message.message_id, type: message.type, payloadKeys: message.payload ? Object.keys(message.payload) : [] });

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(messageString);
                this.logger.trace(`Aggregated message sent successfully for command: ${command}`);
            } else {
                this.logger.warn(`WebSocket not OPEN (state: ${ws.readyState}). Aggregated message for command '${command}' NOT sent.`);
            }
        } catch (error) {
            const errorInfo = extractErrorInfo(error);
            this.logger.error(`Error during ws.send() for aggregated command '${command}': ${errorInfo.message}`, { message_id: message.message_id, type: message.type });
        }
    }
}