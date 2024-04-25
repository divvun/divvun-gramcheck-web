import 'whatwg-fetch';
import { APIGrammarError } from './api';

export const IGNORED_ERROR_TAGS_KEY = 'ignoredErrorTags';
export const SELECTED_LANGUAGE_KEY = 'selectedLanguage';
export const IGNORED_ERRORS_KEY = 'ignoredIndividualErrors';

export function clipToErrorContext(text: string, errorText: string, errorOffset: number): string {
    const sentences = text.split('.');

    for (let sentence of sentences) {
        if (errorText.indexOf('.') === 0) {
            sentence = '.' + sentence;
        }
        if (errorText.lastIndexOf('.') > -1) {
            sentence += '.';
        }
        const errorTextPos = sentence.indexOf(errorText, errorOffset);
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
        errorOffset = errorOffset - sentence.length; // One sentece at a time, so the offset is reduced by the length of the sentence
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

export async function getRange(context: Word.RequestContext, paragraphIndex: number, errorText: string, errorOffset: number): Promise<Word.Range> {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load("text");
    await context.sync();
  
    // NOTE: This had to be done because regex splitting is
    // not working ok with some browsers
    // And the reason it should be done like this is the desktop
    // version of Word which unlike the online one
    // cannot search for more than 255 chars at a time
    const paragraph = paragraphs.items[paragraphIndex];
    const chunks = splitStringToChunks(paragraph.text, 255, errorOffset);

    let fullRange: Word.Range | null = null;
    for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];

        const paragraphRangeCollection = paragraph.search(chunk, {
            matchCase: true,
        });

        const paragraphRange = paragraphRangeCollection.getFirstOrNullObject();
        paragraphRange.load('isNullObject');
        await context.sync();

        if (!paragraphRange || paragraphRange.isNullObject) {
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
    foundErrorRange.load('isNullObject');
    await context.sync();

    if (!foundErrorRange || foundErrorRange.isNullObject) {
        return Promise.reject(new Error('The range for the error wasn\'t found'));
    }

    return foundErrorRange;
}

function isInvalidSearchCharacter(char: string): boolean {
    const code = char.charCodeAt(0);
    return (code >= 0 && code <= 0x1F) || code === 0x7f || (code >= 0x80 && code <= 0x9F);
}

function splitStringToChunks(string: string, chunkLength: number, errorOffset: number): string[] {
    const chunks: string[] = [];

    let tempString: string = '';
    let counter: number = 1;
    for (const char of string.substring(errorOffset)) {
        const invalidChar = isInvalidSearchCharacter(char);
        if (counter > chunkLength || (counter > 0 && invalidChar)) {
            chunks.push(tempString);
            tempString = '';
            counter = 1;
        }
        if (!invalidChar) {
            tempString += char;
            counter++;
        }
    }

    chunks.push(tempString);

    return chunks;
}

// NOTE: lazily assisted by https://john-dugan.com/javascript-debounce/
export function debounce(func: Function, wait: number, immediate: boolean = false) {
    let timeout: number | null;

    return function () {
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

export function filterIgnoredErrorTags(grammarErrors: APIGrammarError[]): APIGrammarError[] {
    return grammarErrors.filter((e) => !isErrorTagIgnored(e));
}

export function filterIgnoredIndividualErrors(grammarErrors: APIGrammarError[]): APIGrammarError[] {
    return grammarErrors.filter((e) => !isIndividualErrorIgnored(e));
}

function isErrorTagIgnored(error: APIGrammarError): boolean {
    const savedIgnoredErrorTags = loadIgnoredErrorTags();

    return savedIgnoredErrorTags.indexOf(error.error_code) > -1;
}

function loadIgnoredErrorTags(): string[] {
    let savedIgnoredErrorTags = loadSettings(IGNORED_ERROR_TAGS_KEY);
    if (!savedIgnoredErrorTags) {
        return [];
    }

    let errors: string[] = [];
    try {
        errors = savedIgnoredErrorTags.split(',');
    } catch (e) {
        console.error('Error parsing saved ignored error tags', e);
    } finally {
        return errors;
    }
}

export function ignoreIndividualError(error: APIGrammarError) {
    const savedIgnoredErrors = loadIgnoredIndividualErrors();

    savedIgnoredErrors.push(serializeError(error));

    try {
        saveSettings(IGNORED_ERRORS_KEY, savedIgnoredErrors.join(','));
    } catch (e) {
        console.error('Error saving ignored errors', e);
    }
}

function loadIgnoredIndividualErrors(): string[] {
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

function isIndividualErrorIgnored(error: APIGrammarError): boolean {
    const savedIgnoredErrors = loadIgnoredIndividualErrors();

    return savedIgnoredErrors.indexOf(serializeError(error)) > -1;
}

function serializeError(error: APIGrammarError): string {
    return error.error_code + ':' +
        error.start_index + ':' +
        error.end_index + ':' +
        error.error_text.replace(/[,:+]/g, '');
}
