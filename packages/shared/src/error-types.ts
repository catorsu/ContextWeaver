/**
 * @file error-types.ts
 * @description Defines error types and utilities for consistent error handling across ContextWeaver.
 * @module ContextWeaver/Shared
 */

/**
 * Extended Error class that includes an optional error code for machine-readable error identification.
 */
export class ContextWeaverError extends Error {
    /**
     * Machine-readable error code for identifying specific error types.
     */
    public readonly errorCode?: string;

    /**
     * Creates a new ContextWeaverError instance.
     * @param message Human-readable error message.
     * @param errorCode Optional machine-readable error code.
     */
    constructor(message: string, errorCode?: string) {
        super(message);
        this.name = 'ContextWeaverError';
        this.errorCode = errorCode;

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ContextWeaverError);
        }
    }
}

/**
 * Type guard to check if an error is a ContextWeaverError with an error code.
 * @param error The error to check.
 * @returns True if the error is a ContextWeaverError with an error code.
 */
export function isContextWeaverError(error: unknown): error is ContextWeaverError {
    return error instanceof ContextWeaverError;
}

/**
 * Safely extracts error message and code from an unknown error value.
 * @param error The error value to extract from.
 * @returns An object containing the error message and optional error code.
 */
export function extractErrorInfo(error: unknown): { message: string; errorCode?: string } {
    if (isContextWeaverError(error)) {
        return { message: error.message, errorCode: error.errorCode };
    } else if (error instanceof Error) {
        return { message: error.message };
    } else if (typeof error === 'string') {
        return { message: error };
    } else {
        return { message: 'An unknown error occurred' };
    }
}