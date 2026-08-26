import { IGNORED_ERROR_TAGS_KEY, SELECTED_LANGUAGE_KEY, getUseBetaApi, loadSettings, normalizeLineEndings } from '.';
import { GrammarCheckError, RetryOptions, defaultRetryOptions, getRetryDelay } from './errors';

const apiUrl = 'https://api.giellalt.org/';
const betaApiUrl = 'https://beta.api.giellalt.org/';

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

export interface APIGrammarError {
    error_text: string;
    start_index: number;
    end_index: number;
    error_code: string;
    title: string;
    description: string;
    suggestions: string[];
}

interface ApiRequestOptions {
    method: 'GET' | 'POST',
    url: string,
    payload?: Object,
    timeout?: number,
    language?: string,
}

async function apiRequest(options: ApiRequestOptions): Promise<any> {
    // Check if we're online
    if (!navigator.onLine) {
        throw GrammarCheckError.offlineError();
    }

    const controller = new AbortController();
    const timeout = options.timeout || DEFAULT_TIMEOUT_MS;

    // Set up timeout
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeout);

    const headers = {
        'Content-Type': 'application/json'
    }

    if (options.language) {
        headers['Accept-Language'] = options.language;
    }

    try {
        const response = await fetch(options.url, {
            method: options.method,
            headers,
            body: options.payload ? JSON.stringify(options.payload) : null,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Check if request was successful
        if (!response.ok) {
            let errorMessage = response.statusText || 'Unknown error';

            // Try to get error message from response body
            try {
                const errorBody = await response.text();
                if (errorBody) {
                    const errorData = JSON.parse(errorBody);
                    errorMessage = errorData.message || errorData.error || errorMessage;
                }
            } catch {
                // Use status text if we can't parse error body
            }

            throw GrammarCheckError.apiError(response.status, errorMessage);
        }

        // Parse successful response
        try {
            const parsedResponse = await response.json();
            return parsedResponse;
        } catch (parseError) {
            throw GrammarCheckError.parseError(parseError as Error);
        }

    } catch (error) {
        clearTimeout(timeoutId);

        // Handle abort (timeout)
        if (error.name === 'AbortError') {
            throw GrammarCheckError.timeoutError();
        }

        // Handle network errors
        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw GrammarCheckError.networkError(error);
        }

        // Re-throw our custom errors
        if (error instanceof GrammarCheckError) {
            throw error;
        }

        // Handle other errors
        throw GrammarCheckError.networkError(error as Error);
    }
}

async function sleep(ms: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function apiRequestWithRetry(options: ApiRequestOptions, retryOptions: RetryOptions = defaultRetryOptions): Promise<any> {
    let lastError: GrammarCheckError;

    for (let attempt = 1; attempt <= retryOptions.maxAttempts; attempt++) {
        try {
            return await apiRequest(options);
        } catch (error) {
            lastError = error instanceof GrammarCheckError ? error : GrammarCheckError.networkError(error as Error);

            // Don't retry if error is not retryable or this is the last attempt
            if (!lastError.retryable || attempt === retryOptions.maxAttempts) {
                throw lastError;
            }

            // Wait before retry with exponential backoff
            const delay = getRetryDelay(attempt, retryOptions);
            console.log(`API request failed (attempt ${attempt}/${retryOptions.maxAttempts}). Retrying in ${delay}ms...`, lastError.message);
            await sleep(delay);
        }
    }

    throw lastError!;
}

export interface GrammarCheckApiResponse {
    text: string;
    errs: APIGrammarError[];
}

export async function apiRequestGrammarCheck(text: string, language: string): Promise<GrammarCheckApiResponse>  {
    let payload = {
        text: normalizeLineEndings(text),
    };

    const ignoredErrorTags = loadSettings(IGNORED_ERROR_TAGS_KEY);
    if (ignoredErrorTags) {
        payload['ignore'] = ignoredErrorTags.split(',');
    }

    const result = await apiRequestWithRetry({
        url: `${getCurrentApiUrl()}grammar/${language}`,
        method: 'POST',
        payload,
        language,
    }) as GrammarCheckApiResponse;

    return result;
}

export interface GrammarCheckerAvailablePreferences {
    error_tags: { [key: string]: string }
}

/**
 * Resolve the language to actually talk to the current API with.
 *
 * The saved preference is only usable if the *current* API serves it — beta and
 * production do not offer the same set of grammar checkers. When the preference
 * is not on offer we fall back to the first available language, but we never
 * persist that fallback: the user's real choice has to survive toggling the beta
 * API off again.
 */
export async function resolveEffectiveLanguage(): Promise<string | null> {
    const availableLangs = await apiRequestLanguageOptions();
    const grammarLanguages = Object.keys(availableLangs.available.grammar);

    const selectedLanguage = loadSettings(SELECTED_LANGUAGE_KEY);
    if (selectedLanguage && grammarLanguages.indexOf(selectedLanguage) > -1) {
        return selectedLanguage;
    }

    return grammarLanguages[0] || null;
}

export async function apiRequestGrammarCheckerPreferences(): Promise<GrammarCheckerAvailablePreferences> {
    const selectedLanguage = await resolveEffectiveLanguage();
    if (!selectedLanguage) {
        return { error_tags: {} };
    }

    return await apiRequestWithRetry({
        url: `${getCurrentApiUrl()}${getPreferencesEndpoint(selectedLanguage)}`,
        method: 'GET',
        language: selectedLanguage,
    });
}

export interface LanguageOptions {
    available: {
        grammar: {[key: string]: string},
        speller: {[key: string]: string},
    },
}

export async function apiRequestLanguageOptions(): Promise<LanguageOptions> {
    return await apiRequestWithRetry({
        url: `${getCurrentApiUrl()}languages`,
        method: 'GET',
    });
}

function getCurrentApiUrl(): string {
    return getUseBetaApi() ? betaApiUrl : apiUrl;
}

function getPreferencesEndpoint(language: string): string {
    return `grammar/${language}/preferences`
}
