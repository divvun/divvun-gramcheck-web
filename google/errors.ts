/**
 * Custom error types for grammar checking API
 * Adapted from msoffice/src/utils/errors.ts for Google Apps Script
 */

enum ErrorType {
    NETWORK_ERROR = 'NETWORK_ERROR',
    API_ERROR = 'API_ERROR',
    TIMEOUT_ERROR = 'TIMEOUT_ERROR',
    PARSE_ERROR = 'PARSE_ERROR'
}

interface ErrorDetails {
    type: ErrorType;
    message: string;
    userMessage: string;
    statusCode?: number;
    retryable: boolean;
}

interface GrammarCheckErrorData {
    type: ErrorType;
    message: string;
    userMessage: string;
    statusCode?: number;
    retryable: boolean;
}

function createGrammarCheckError(details: ErrorDetails): GrammarCheckErrorData {
    return {
        type: details.type,
        message: details.message,
        userMessage: details.userMessage,
        statusCode: details.statusCode,
        retryable: details.retryable
    };
}

function createNetworkError(originalMessage: string): GrammarCheckErrorData {
    return createGrammarCheckError({
        type: ErrorType.NETWORK_ERROR,
        message: `Network error: ${originalMessage}`,
        userMessage: 'Unable to connect to grammar checking service. Please check your internet connection.',
        retryable: true
    });
}

function createTimeoutError(): GrammarCheckErrorData {
    return createGrammarCheckError({
        type: ErrorType.TIMEOUT_ERROR,
        message: 'Request timed out',
        userMessage: 'The request took too long to complete. Please try again.',
        retryable: true
    });
}

function createApiError(statusCode: number, message: string): GrammarCheckErrorData {
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

    return createGrammarCheckError({
        type: ErrorType.API_ERROR,
        message: `API error ${statusCode}: ${message}`,
        userMessage: userMessages[statusCode] || 'An error occurred while checking grammar. Please try again.',
        statusCode,
        retryable: statusCode >= 500 || statusCode === 429
    });
}

function createParseError(originalMessage: string): GrammarCheckErrorData {
    return createGrammarCheckError({
        type: ErrorType.PARSE_ERROR,
        message: `Failed to parse response: ${originalMessage}`,
        userMessage: 'Received invalid response from grammar checking service. Please try again.',
        retryable: true
    });
}

interface RetryOptions {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
}

const defaultRetryOptions: RetryOptions = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000
};

function getRetryDelay(attempt: number, options: RetryOptions = defaultRetryOptions): number {
    const exponentialDelay = options.baseDelayMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay; // Add 10% jitter
    return Math.min(exponentialDelay + jitter, options.maxDelayMs);
}

function isRetryableStatusCode(statusCode: number): boolean {
    return statusCode >= 500 || statusCode === 429;
}
