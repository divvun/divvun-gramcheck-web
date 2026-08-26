/**
 * Custom error types for grammar checking API
 */

export enum ErrorType {
    NETWORK_ERROR = 'NETWORK_ERROR',
    API_ERROR = 'API_ERROR',
    TIMEOUT_ERROR = 'TIMEOUT_ERROR',
    PARSE_ERROR = 'PARSE_ERROR',
    OFFLINE_ERROR = 'OFFLINE_ERROR'
}

export interface ErrorDetails {
    type: ErrorType;
    message: string;
    userMessage: string;
    statusCode?: number;
    retryable: boolean;
    originalError?: Error;
}

export class GrammarCheckError extends Error {
    public readonly type: ErrorType;
    public readonly userMessage: string;
    public readonly statusCode?: number;
    public readonly retryable: boolean;
    public readonly originalError?: Error;

    constructor(details: ErrorDetails) {
        super(details.message);
        this.name = 'GrammarCheckError';
        this.type = details.type;
        this.userMessage = details.userMessage;
        this.statusCode = details.statusCode;
        this.retryable = details.retryable;
        this.originalError = details.originalError;
    }

    static networkError(originalError: Error): GrammarCheckError {
        return new GrammarCheckError({
            type: ErrorType.NETWORK_ERROR,
            message: `Network error: ${originalError.message}`,
            userMessage: 'Unable to connect to grammar checking service. Please check your internet connection.',
            retryable: true,
            originalError
        });
    }

    static timeoutError(): GrammarCheckError {
        return new GrammarCheckError({
            type: ErrorType.TIMEOUT_ERROR,
            message: 'Request timed out',
            userMessage: 'The request took too long to complete. Please try again.',
            retryable: true
        });
    }

    static apiError(statusCode: number, message: string): GrammarCheckError {
        const userMessages: { [key: number]: string } = {
            400: 'Invalid request. Please try with different text.',
            401: 'Authentication failed. Please refresh and try again.',
            403: 'Access denied. You may not have permission to use this service.',
            404: 'Grammar checking service not found. The selected language may not be supported.',
            429: 'Too many requests. Please wait a moment and try again.',
            500: 'Grammar checking service is experiencing issues. Please try again later.',
            502: 'Gateway error. The service is temporarily unavailable.',
            503: 'Service temporarily unavailable. Please try again later.'
        };

        return new GrammarCheckError({
            type: ErrorType.API_ERROR,
            message: `API error ${statusCode}: ${message}`,
            userMessage: userMessages[statusCode] || 'An error occurred while checking grammar. Please try again.',
            statusCode,
            retryable: statusCode >= 500 || statusCode === 429
        });
    }

    static parseError(originalError: Error): GrammarCheckError {
        return new GrammarCheckError({
            type: ErrorType.PARSE_ERROR,
            message: `Failed to parse response: ${originalError.message}`,
            userMessage: 'Received invalid response from grammar checking service. Please try again.',
            retryable: true,
            originalError
        });
    }

    static offlineError(): GrammarCheckError {
        return new GrammarCheckError({
            type: ErrorType.OFFLINE_ERROR,
            message: 'No internet connection',
            userMessage: 'You are currently offline. Grammar checking requires an internet connection.',
            retryable: true
        });
    }
}

export interface RetryOptions {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
}

export const defaultRetryOptions: RetryOptions = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000
};

export function getRetryDelay(attempt: number, options: RetryOptions): number {
    const exponentialDelay = options.baseDelayMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay; // Add 10% jitter
    return Math.min(exponentialDelay + jitter, options.maxDelayMs);
}