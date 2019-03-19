import { normalizeLineEndings, loadSettings, IGNORED_ERROR_TAGS_KEY, SELECTED_LANGUAGE_KEY, AVAILABLE_LANGUAGES, filterIgnoredIndividualErrors as filterIgnoredIndividualErrors, filterIgnoredErrorTags } from '.';

const apiUrl = 'https://api-giellalt.uit.no/';

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

    try {
        const result = await apiRequest({
            url: `${apiUrl}grammar/${language}`,
            method: 'POST',
            payload,
        }) as GrammarCheckApiResponse;

        result.errs = filterIgnoredIndividualErrors(result.errs);
        result.errs = filterIgnoredErrorTags(result.errs);

        return result;
    } catch (e) {
        console.error('Failed to get grammar check API response', e);
        return Promise.reject();
    }
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

export interface LanguageOptions {
    available: {
        grammar: {[key: string]: string},
        speller: {[key: string]: string},
    },
}

export async function apiRequestLanguageOptions(): Promise<LanguageOptions> {
    return apiRequest({
        url: `${apiUrl}languages`,
        method: 'GET',
    });
}
