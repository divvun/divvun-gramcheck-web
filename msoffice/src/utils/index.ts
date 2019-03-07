import 'whatwg-fetch';
import { APIGrammarError } from './api';

export const IGNORED_ERROR_TAGS_KEY = 'ignoredErrorTags';
export const SELECTED_LANGUAGE_KEY = 'selectedLanguage';
export const IGNORED_ERRORS_KEY = 'ignoredIndividualErrors';

export const AVAILABLE_LANGUAGES = [
    { key: 'se', text: 'North Sámi' },
    { key: 'sma', text: 'South Sámi' },
];

export function clipToErrorContext(text: string, errorText: string): string {
    const sentences = text.split('.');

    for (let sentence of sentences) {
        if (errorText.indexOf('.') === 0) {
            sentence = '.' + sentence;
        }
        if (errorText.lastIndexOf('.') > -1) {
            sentence += '.';
        }
        const errorTextPos = sentence.indexOf(errorText);
        if (errorTextPos > -1) {
            let cutStartIndex = sentence.substr(0, errorTextPos - 1).lastIndexOf(' ');
            if (cutStartIndex < 0) {
                cutStartIndex = 0;
            }
            let cutEndIndex = sentence.indexOf(' ', errorTextPos + errorText.length + 1);
            if (cutEndIndex < 0) {
                cutEndIndex = sentence.length;
            }
            return sentence.substr(cutStartIndex, cutEndIndex - cutStartIndex);
        }
    }

    return text;
}

export function splitInParagraphs(text: string): string[] {
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return normalizedText.split('\n');
}

export function normalizeLineEndings(text: string): string {
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

// NOTE: lazily assisted by https://john-dugan.com/javascript-debounce/
export function debounce(func: Function, wait: number, immediate: boolean = false) {
    let timeout: number | null;

    return function() {
        const context = this;
        const args = arguments;

        const later = () => {
            timeout = null;
            if (!immediate) {
                func.apply(context, args);
            }
        };

        const callNow = immediate && !timeout;

        window.clearTimeout(timeout);

        timeout = window.setTimeout(later, wait || 200);
        if (callNow) {
            func.apply(context, args);
        }
    };
}

export function loadSettings(key: string): string | null {
    return localStorage.getItem(key);
}

export function saveSettings(key: string, value: string) {
    localStorage.setItem(key, value);
}

export function filterIgnored(grammarErrors: APIGrammarError[]): APIGrammarError[] {
    return grammarErrors.filter((e) => !isIgnored(e));
}

export function ignore(error: APIGrammarError) {
    const savedIgnoredErrors = loadIgnored();

    savedIgnoredErrors.push(serializeError(error));

    try {
        saveSettings(IGNORED_ERRORS_KEY, savedIgnoredErrors.join(','));
    } catch (e) {
        console.error('Error saving ignored errors', e);
    }
}

function loadIgnored(): string[] {
    let savedIgnoredErrors = loadSettings(IGNORED_ERRORS_KEY);
    if (!savedIgnoredErrors) {
        return [];
    }

    let errors: string[] = [];
    try {
        errors = savedIgnoredErrors.split(',');
    } catch (e) {
        console.error('Error parsing saved ignored errors', e);
    } finally {
        return errors;
    }
}

function isIgnored(error: APIGrammarError): boolean {
    const savedIgnoredErrors = loadIgnored();

    return savedIgnoredErrors.indexOf(serializeError(error)) > -1;
}

function serializeError(error: APIGrammarError): string {
    return error.error_code + ':' +
        error.start_index + ':' +
        error.end_index + ':' +
        error.error_text.replace(/[,:+]/g, '');
}
