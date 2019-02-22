/**
 * @OnlyCurrentDoc Limits the script to only accessing the current sheet.
 */

const apiUrl = 'https://divvun-api.brendan.so/grammar/';

function onOpen(e) {
    DocumentApp.getUi().createAddonMenu()
        .addItem('Grammar check', 'showSidebar')
        .addToUi();
}

function onInstall(e) {
    onOpen(e);
}

function showSidebar() {
    var ui = HtmlService.createHtmlOutputFromFile('sidebar')
      .setTitle('Grammar check');
    DocumentApp.getUi().showSidebar(ui);
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
function runGrammarCheck(lang: string) {
    const text = DocumentApp.getActiveDocument().getBody().getText();

    const apiResult = grammarCheckApiRequest(lang, text);
    
    let resultsHtml = apiResult.results.reduce((html, r) => {
        const resultsTemplate = HtmlService.createTemplateFromFile('results.html');
        resultsTemplate['errors'] = r.errs.map((e) => {
            return {
                contextText: highlightError(r.text, e[0]),
                errorText: e[0],
                reason: e[4],
                startIndex: e[2],
                endIndex: e[3],
                suggestions: e[5],
            };
        });

        if (resultsTemplate['errors'].length === 0) {
            return html;
        }

        return html + resultsTemplate.evaluate().getContent();
    }, '');

    if (!resultsHtml) {
        return 'No grammar mistakes found';
    }

    return resultsHtml;
}

function highlightError(text: string, errorText: string): string {
    return text.replace(errorText, `<i>${errorText}</i>`);
}

function clipContextText(text: string, errorText: string): string {
    let contextSentence = text;
    text.split('.').forEach((sentence) => {
        if (sentence.indexOf(errorText) > -1) {
            contextSentence = sentence;
        }
    });

    return contextSentence;
}

type APIGrammarError = [string, number, number, string, string, string[]];
interface GrammarCheckApiResponse {
    results: {
        text: string;
        errs: APIGrammarError[];
    }[];
}
function grammarCheckApiRequest(lang: string, text: string): GrammarCheckApiResponse {
    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'post',
        muteHttpExceptions: true,
        contentType: 'application/json',
        payload: JSON.stringify({
            text,
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
