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

function tagsAnyIgnored_(ignoredTags: string[], tags: string[]) {
    // Current behavior is, if any of the tags in the list is ignored, the entire category is
    for (const tag of tags) {
        if (ignoredTags.indexOf(tag) != -1)
            return true
    }
    return false
}

function showPreferences() {
    const template = HtmlService.createTemplateFromFile('preferences');
    const errorTags = apiRequestGrammarCheckerPreferences().error_tags;
    const ignoredTags = getIgnoredTags();

    // Group tags by their localized name
    const groupedTags = {}
    Object.keys(errorTags).forEach((tag) => {
        const name = errorTags[tag]
        groupedTags[name] = (groupedTags[name] || []).concat([tag])
    })

    template['errorTags'] = Object.keys(groupedTags).map(name => ({
        tag: groupedTags[name].join(","),
        name: name,
        ignored: tagsAnyIgnored_(ignoredTags, groupedTags[name])
    }));

    const ui = template.evaluate();
    DocumentApp.getUi().showModalDialog(ui, "Preferences");
};

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
            contextText: getHighlightError(apiResult.text, e.error_text, e.start_index),
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

function getHighlightError(text: string, errorText: string, startIndex:number): string {
    return clipContextText(text, errorText, startIndex).replace(errorText, `<i>${errorText}</i>`);
}

function clipContextText(paragraph: string, errorText: string, startIndex: number): string {
    if (errorText.indexOf('.') === 0) {
        paragraph = '.' + paragraph;
    }
    if (errorText.lastIndexOf('.') > -1) {
        paragraph += '.';
    }
    const errorTextPos = paragraph.indexOf(errorText, startIndex);
    if (errorTextPos > -1) {
        let cutStartIndex = paragraph.substr(0, errorTextPos - 1).lastIndexOf(' ');
        if (cutStartIndex < 0) {
            cutStartIndex = 0;
        }
        let cutEndIndex = paragraph.indexOf(' ', errorTextPos + errorText.length + 1);
        if (cutEndIndex < 0) {
            cutEndIndex = paragraph.length;
        }
        return paragraph.substr(cutStartIndex, cutEndIndex - cutStartIndex);
    }

    return paragraph;
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
            ignore_tags: getIgnoredTags()
        }
    })
}

interface LanguageOptions {
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

interface GrammarCheckerAvailablePreferences {
    error_tags: { [key: string]: string }
}

function apiRequestGrammarCheckerPreferences(): GrammarCheckerAvailablePreferences {
    let selectedLanguage = loadSettings(SELECTED_LANGUAGE_KEY);
    if (!selectedLanguage) {
        let availableLangs = apiRequestLanguageOptions();
        selectedLanguage = Object.keys(availableLangs.available.grammar)[0] || '<no_lang>';
    }

    return apiRequest({
        url: `${apiUrl}preferences/grammar/${selectedLanguage}`,
        method: 'get',
    });
}

function runCorrection(errorText: string, correction: string, errorIndex: number) {
    Logger.log('Editing: ' + errorText + ', ' + correction);
    const body = DocumentApp.getActiveDocument().getBody();

    let editingRange = body.findText(errorText);
    while (editingRange && editingRange.getStartOffset() < errorIndex) {
        editingRange = body.findText(errorText, editingRange);
    }
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

function highlightError(errorText: string, errorIndex: number) {
    Logger.log('Highlighting: ' + errorText + ' at index ' + errorIndex);
    const doc = DocumentApp.getActiveDocument()
    const body = doc.getBody();

    let editingRange = body.findText(errorText);
    while (editingRange && editingRange.getStartOffset() < errorIndex) {
        editingRange = body.findText(errorText, editingRange);
    }
    if (editingRange) {
        const range = doc.newRange();
        range.addElement(editingRange.getElement().asText(), editingRange.getStartOffset(), editingRange.getEndOffsetInclusive())
        doc.setSelection(range.build())
    } else {
        throw new Error('Could not find context of error. Maybe the text changed.')
    }
}

function clearHighlight() {
    const doc = DocumentApp.getActiveDocument()
    const range = doc.newRange()
    doc.setSelection(range.build())
}

function changeLanguage(key: string) {
    saveSettings(SELECTED_LANGUAGE_KEY, key);
}

function getSelectedLanguage(): string {
    return loadSettings(SELECTED_LANGUAGE_KEY);
}

function getIgnoredTags(): string[] {
    return (loadSettings(IGNORED_ERROR_TAGS_KEY) || "").split(",")
}

function saveIgnoredTags(tags: string[]) {
    saveSettings(IGNORED_ERROR_TAGS_KEY, tags.join(","))
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