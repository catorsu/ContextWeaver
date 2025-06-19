/**
 * @file RegisterActiveTargetHandler.ts
 * @description Handler for register_active_target IPC command requests.
 * @module ContextWeaver/VSCE
 */

import { Logger } from '@contextweaver/shared';

import { ICommandHandler } from '../ICommandHandler';
import { ClientContext } from '../types';
import {
    RegisterActiveTargetRequestPayload,
    GenericAckResponsePayload
} from '@contextweaver/shared';

/**
 * Handler for processing register_active_target command requests.
 * Registers an active LLM tab for a Chrome Extension client.
 */
export class RegisterActiveTargetHandler implements ICommandHandler<RegisterActiveTargetRequestPayload, GenericAckResponsePayload> {
    private readonly logger = new Logger('RegisterActiveTargetHandler');

    constructor() {}

    /**
     * Handles a register_active_target request by updating the client's active target information.
     */
    async handle(request: { payload: RegisterActiveTargetRequestPayload; client: ClientContext }): Promise<GenericAckResponsePayload> {
        const { payload, client } = request;

        this.logger.debug(`Registering active target: TabID ${payload.tabId}, Host ${payload.llmHost} for client ${client.ip}`);
        
        // Update the client's active target information
        client.activeLLMTabId = payload.tabId;
        client.activeLLMHost = payload.llmHost;
        
        this.logger.info(`Registered active target for client ${client.ip}: TabID ${payload.tabId}, Host ${payload.llmHost}`);

        return {
            success: true,
            message: 'Target registered successfully.'
        };
    }
}