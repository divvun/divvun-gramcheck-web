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
            text: normalizeLineEndings(text),
        });

    return response.body.results;
}

export function splitInParagraphs(text: string): string[] {
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return normalizedText.split('\n');
}

function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function getRange(context: Word.RequestContext, paragraph: string, errorText: string): Word.Range {
    const body = context.document.body;
    const paragraphRangeCollection = body.search(paragraph, {
        matchCase: true,
    });
    const paragraphRange = paragraphRangeCollection.getFirst();
    const errorTextRangeCollection = paragraphRange.search(errorText, {
        matchCase: true,
    });

    return errorTextRangeCollection.getFirst();
}
