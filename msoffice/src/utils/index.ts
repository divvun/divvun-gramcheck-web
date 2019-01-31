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

export async function getRange(context: Word.RequestContext, paragraph: string, errorText: string): Promise<Word.Range> {
    const body = context.document.body;
    context.load(body);
    await context.sync();

    // NOTE: This had to be done because regex splitting is
    // not working ok with some browsers
    // And the reason it should be done like this is the desktop
    // version of Word which unlike the online one
    // cannot search for more than 255 chars at a time
    const chunks = splitStringToChunks(paragraph, 255);

    let fullRange: Word.Range | null = null;
    for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        const paragraphRangeCollection = body.search(chunk, {
            matchCase: true,
        });

        const paragraphRange = paragraphRangeCollection.getFirstOrNullObject();
        if (!paragraphRange) {
            return Promise.reject(new Error('Could not find range for chunk: ' + chunk));
        }

        if (!fullRange) {
            fullRange = paragraphRange;
        } else {
            fullRange = fullRange.expandTo(paragraphRange);
        }
    }

    if (!fullRange) {
        return Promise.reject(new Error('Context parargaph not found'));
    }

    const errorTextRangeCollection = fullRange.search(errorText, {
        matchCase: true,
    });

    const foundErrorRange = errorTextRangeCollection.getFirstOrNullObject();
    if (!foundErrorRange) {
        return Promise.reject(new Error('The range for the error wasn\'t found'));
    }

    return foundErrorRange;
}

function splitStringToChunks(string: string, chunkLength: number): string[] {
    const chunks: string[] = [];

    let tempString: string = '';
    let counter: number = 1;
    for (const char of string) {
        if (counter > chunkLength) {
            chunks.push(tempString);
            tempString = '';
            counter = 1;
        }
        tempString += char;
        counter++;
    }

    chunks.push(tempString);

    return chunks;
}
