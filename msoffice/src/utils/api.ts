import { normalizeLineEndings, loadSettings, IGNORED_ERROR_TAGS_KEY, SELECTED_LANGUAGE_KEY, AVAILABLE_LANGUAGES } from '.';

const apiUrl = 'https://api-giellalt.uit.no/';

export interface APIGrammarError {
    error_text: string;
    start_index: number;
    end_index: number;
    error_code: string;
    description: string;
    suggestions: string[];
}

interface ApiRequestOptions {
    method: 'GET' | 'POST',
    url: string,
    payload?: Object,
}
async function apiRequest(options: ApiRequestOptions): Promise<any> {
    const response = await fetch(options.url, {
        method: options.method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: options.payload ? JSON.stringify(options.payload) : null,
    });

    try {
        const parsedResponse = await response.json();
        return parsedResponse;
    } catch (e) {
        return Promise.reject(e);
    }
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
        payload['ignore_tags'] = ignoredErrorTags.split(',');
    }

    return apiRequest({
        url: `${apiUrl}grammar/${language}`,
        method: 'POST',
        payload,
    });
}

export interface GrammarCheckerAvailablePreferences {
    error_tags: { [key: string]: string }
}
export async function apiRequestGrammarCheckerPreferences(): Promise<GrammarCheckerAvailablePreferences> {
    let selectedLanguage = loadSettings(SELECTED_LANGUAGE_KEY);
    if (!selectedLanguage) {
        selectedLanguage = AVAILABLE_LANGUAGES[0].key;
    }

    return apiRequest({
        url: `${apiUrl}preferences/grammar/${selectedLanguage}`,
        method: 'GET',
    });
}
