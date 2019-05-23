/**
 * @OnlyCurrentDoc Limits the script to only accessing the current sheet.
 */

const apiUrl = 'https://api-giellalt.uit.no/';

const IGNORED_ERROR_TAGS_KEY = 'ignoredErrorTags';
const SELECTED_LANGUAGE_KEY = 'selectedLanguage';
const IGNORED_ERRORS_KEY = 'ignoredIndividualErrors';

function onOpen(e) {
    DocumentApp.getUi().createAddonMenu()
        .addItem('Grammar check', 'showSidebar')
        .addToUi();
}

function onInstall(e) {
    onOpen(e);
}

function showSidebar() {
    var ui = HtmlService.createTemplateFromFile('sidebar')
        .evaluate()
        .setTitle('Grammar check');
    DocumentApp.getUi().showSidebar(ui);
}

function splitInParagraphs(text: string): string[] {
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return normalizedText.split('\n');
}

function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

interface GrammarCheckError {
    errorText: string;
    startIndex: number;
    endIndex: number;
    errorCode: string;
    errorMessage: string;
    suggestions: string[];
}
interface GrammarCheckResult {
    results: {
        text: string;
        errors: GrammarCheckError[];
    }[];
}

function runGrammarCheckOnWholeText(lang: string) {
    const text = DocumentApp.getActiveDocument().getBody().getText();

    const paragraphs = splitInParagraphs(text);

    let html = '';

    for (const paragraph of paragraphs) {
        html += runGrammarCheck(lang, paragraph);
    }

    return html;
}

function runGrammarCheck(lang: string, text: string) {
    const apiResult = grammarCheckApiRequest(lang, text);

    const resultsTemplate = HtmlService.createTemplateFromFile('results.html');
    resultsTemplate['errors'] = apiResult.errs.map((e) => {
        return {
            contextText: highlightError(apiResult.text, e.error_text),
            errorText: e.error_text,
            reason: e.description,
            startIndex: e.start_index,
            endIndex: e.end_index,
            suggestions: e.suggestions,
        };
    });

    let resultsHtml = resultsTemplate.evaluate().getContent();

    if (!resultsHtml) {
        return 'No grammar mistakes found';
    }

    return resultsHtml;
}

function highlightError(text: string, errorText: string): string {
    return clipContextText(text, errorText).replace(errorText, `<i>${errorText}</i>`);
}

function clipContextText(text: string, errorText: string): string {
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

interface ApiRequestOptions {
    method: 'get' | 'post',
    url: string,
    payload?: Object,
}

function apiRequest(options: ApiRequestOptions) {
    Logger.log("api request " + JSON.stringify(options))
    const goptions: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: options.method,
        muteHttpExceptions: true,
        contentType: 'application/json',
        payload: options.payload ? JSON.stringify(options.payload) : null,
    };
    const response = UrlFetchApp.fetch(options.url, goptions);

    if (response.getResponseCode() !== 200) {
        Logger.log("error " + response.getResponseCode())
        throw Error('Cannot get response from grammar checking API');
    }

    return JSON.parse(response.getContentText());
}

export interface APIGrammarError {
    error_text: string;
    start_index: number;
    end_index: number;
    error_code: string;
    description: string;
    suggestions: string[];
}

interface GrammarCheckApiResponse {
    text: string;
    errs: APIGrammarError[];
}

function grammarCheckApiRequest(lang: string, text: string): GrammarCheckApiResponse {
    return apiRequest({
        method: 'post',
        url: `${apiUrl}grammar/${lang}`,
        payload: {
            text: normalizeLineEndings(text),
        }
    })
}

export interface LanguageOptions {
    available: {
        grammar: { [key: string]: string },
        speller: { [key: string]: string },
    },
}

function apiRequestLanguageOptions(): LanguageOptions {
    return apiRequest({
        url: `${apiUrl}languages`,
        method: 'get',
    });
}

export interface GrammarCheckerAvailablePreferences {
    error_tags: { [key: string]: string }
}

// export function apiRequestGrammarCheckerPreferences(): GrammarCheckerAvailablePreferences {
//     let selectedLanguage = loadSettings(SELECTED_LANGUAGE_KEY);
//     if (!selectedLanguage) {
//         let availableLangs = apiRequestLanguageOptions();
//         selectedLanguage = Object.keys(availableLangs.available.grammar)[0] || '<no_lang>';
//     }

//     return apiRequest({
//         url: `${apiUrl}preferences/grammar/${selectedLanguage}`,
//         method: 'get',
//     });
// }

function runCorrection(errorText: string, correction: string) {
    Logger.log('Editing: ' + errorText + ', ' + correction);
    const body = DocumentApp.getActiveDocument().getBody();

    const editingRange = body.findText(errorText);
    if (editingRange) {
        const startIndex = editingRange.getStartOffset();
        const endIndex = editingRange.getEndOffsetInclusive();
        const text = editingRange.getElement().asText();
        text.deleteText(startIndex, endIndex);
        text.insertText(startIndex, correction);
    } else {
        throw new Error('Could not find context of error. Maybe the text changed.')
    }
}

function changeLanguage(key: string) {
    saveSettings(SELECTED_LANGUAGE_KEY, key);
}

function getSelectedLanguage(): string {
    return loadSettings(SELECTED_LANGUAGE_KEY);
}

function include(filename) {
    return HtmlService.createHtmlOutputFromFile(filename)
        .getContent();
}

function loadSettings(key: string): string | null {
    const userProperties = PropertiesService.getUserProperties();
    const result = userProperties.getProperty(key);
    Logger.log("load " + key + " = " + result);
    return result;
}

function saveSettings(key: string, value: string) {
    const userProperties = PropertiesService.getUserProperties();
    Logger.log("save " + key + " = " + value);
    userProperties.setProperty(key, value);
}