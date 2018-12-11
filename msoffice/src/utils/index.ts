import * as request from 'superagent';

const apiUrl = 'https://divvun-api.brendan.so/grammar/';

export function highlightError(text: string, errorText: string): string {
    return text.replace(errorText, `<i>${errorText}</i>`);
}

export type APIGrammarError = [string, number, number, string, string, string[]];
export interface GrammarCheckApiResponse {
    results: {
        text: string;
        errs: APIGrammarError[];
    }[];
}

export async function apiRequest(text: string, language: string): Promise<GrammarCheckApiResponse['results']>  {
    const response = await request
        .post(`${apiUrl}${language}`)
        .set('Content-Type', 'application/json')
        .send({
            text: text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
        });

    return response.body.results;
}
