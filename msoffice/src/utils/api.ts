import { normalizeLineEndings } from '.';

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
    return apiRequest({
        url: `${apiUrl}${language}`,
        method: 'POST',
        payload: {
            text: normalizeLineEndings(text),
        },
    });
}

export interface GrammarErrorCategories {
    [key: string]: string
}
export async function apiRequestErrorCategories(): Promise<GrammarErrorCategories> {
    // TODO: use api request to fetch the category list
    return {
        'test1': 'Some name (test 1)',
        'test2': 'Some name (test 2)',
    };
}
