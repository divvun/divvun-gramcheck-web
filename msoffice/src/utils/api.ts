import { normalizeLineEndings, loadSettings, IGNORED_ERROR_CATEGORIES_KEY } from '.';

const apiUrl = 'https://api-giellalt.uit.no/grammar/';

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
    payload: Object,
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

    const ignoredCategories = loadSettings(IGNORED_ERROR_CATEGORIES_KEY);
    if (ignoredCategories) {
        payload['ignore_tags'] = ignoredCategories.split(',');
    }

    return apiRequest({
        url: `${apiUrl}${language}`,
        method: 'POST',
        payload,
    });
}

export interface GrammarCheckerAvailablePreferences {
    error_tags: { [key: string]: string }
}
export async function apiRequestGrammarCheckerPreferences(): Promise<GrammarCheckerAvailablePreferences> {
    // TODO: use api request to fetch the category list
    return {
        error_tags: {
            'test1': 'Some name (test 1)',
            'test2': 'Some name (test 2)',
        },
    };
}
