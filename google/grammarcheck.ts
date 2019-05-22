/**
 * @OnlyCurrentDoc Limits the script to only accessing the current sheet.
 */

const apiUrl = 'https://api-giellalt.uit.no/grammar/';

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
    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'post',
        muteHttpExceptions: true,
        contentType: 'application/json',
        payload: JSON.stringify({
            text: normalizeLineEndings(text),
        }),
    };
    const response = UrlFetchApp.fetch(`${apiUrl}${lang}`, options);

    if (response.getResponseCode() !== 200) {
        throw Error('Cannot get response from grammar checking API');
    }

    return JSON.parse(response.getContentText());
}

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

function include(filename) {
    return HtmlService.createHtmlOutputFromFile(filename)
        .getContent();
}
