/**
 * @OnlyCurrentDoc Limits the script to only accessing the current sheet.
 */

const apiUrl = 'https://api.giellalt.org/';
const betaApiUrl = 'https://beta.api.giellalt.org/';

const VERSION = '2026-02-20';

const IGNORED_ERROR_TAGS_KEY = 'ignoredErrorTags';
const SELECTED_LANGUAGE_KEY = 'selectedLanguage';
const IGNORED_ERRORS_KEY = 'ignoredIndividualErrors';
const USE_BETA_API_KEY = 'useBetaApi';

function onOpen(e: GoogleAppsScript.Events.DocsOnOpen) {
    DocumentApp.getUi().createAddonMenu()
        .addItem('Grammar check', 'showSidebar')
        .addToUi();
}

function onInstall(e: GoogleAppsScript.Events.DocsOnOpen) {
    onOpen(e);
}

function showSidebar() {
    const ui = HtmlService.createTemplateFromFile('sidebar')
        .evaluate()
        .setTitle('Grammar check v' + VERSION);
    DocumentApp.getUi().showSidebar(ui);
}

function tagsAnyIgnored_(ignoredTags: string[], tags: string[]) {
    // Current behavior is, if any of the tags in the list is ignored, the entire category is
    for (const tag of tags) {
        if (ignoredTags.includes(tag))
            return true
    }
    return false
}

function showPreferences() {
    const template = HtmlService.createTemplateFromFile('preferences');

    let errorTags: { [key: string]: string };
    try {
        errorTags = apiRequestGrammarCheckerPreferences().error_tags;
    } catch (e: unknown) {
        const err = e as Record<string, unknown>;
        if (err && err.userMessage) {
            throw new Error(err.userMessage as string);
        }
        throw new Error(e instanceof Error ? e.message : 'Failed to load preferences');
    }

    const ignoredTags = getIgnoredTags();

    // Group tags by their localized name
    const groupedTags: Record<string, string[]> = {};
    Object.keys(errorTags).forEach((tag) => {
        const name = errorTags[tag]
        groupedTags[name] = (groupedTags[name] || []).concat([tag])
    })

    template['errorTags'] = Object.keys(groupedTags).map(name => ({
        tag: groupedTags[name].join(","),
        name: name,
        ignored: tagsAnyIgnored_(ignoredTags, groupedTags[name])
    }));

    template['useBetaApi'] = getUseBetaApi();

    const ui = template.evaluate();
    DocumentApp.getUi().showModalDialog(ui, "Preferences");
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

interface GrammarCheckWholeTextResult {
    html: string;
    error: GrammarCheckErrorData | null;
    hasErrors: boolean;
}

function runGrammarCheckOnWholeText(lang: string): GrammarCheckWholeTextResult {
    const paragraphs = DocumentApp.getActiveDocument().getBody().getParagraphs();

    let html = '';
    let lastError: GrammarCheckErrorData | null = null;

    let paragraphIndex = 0;
    for (const paragraph of paragraphs) {
        try {
            html += runGrammarCheck(lang, paragraph.getText(), paragraphIndex++);
        } catch (e: unknown) {
            // Check if it's a structured error
            const err = e as Record<string, unknown>;
            if (err && err.type && err.userMessage) {
                lastError = err as unknown as GrammarCheckErrorData;

                // For non-retryable errors, stop processing
                if (!lastError.retryable) {
                    Logger.log(`Non-retryable error at paragraph ${paragraphIndex}, stopping: ${lastError.message}`);
                    break;
                }

                // For retryable errors, log and continue with remaining paragraphs
                Logger.log(`Retryable error at paragraph ${paragraphIndex}, continuing: ${lastError.message}`);
            } else {
                // Unknown error, wrap it
                const msg = e instanceof Error ? e.message : 'Unknown error';
                lastError = createNetworkError(msg);
                Logger.log(`Unknown error at paragraph ${paragraphIndex}: ${msg}`);
                break;
            }
        }
    }

    if (lastError) {
        return {
            html: html,
            error: lastError,
            hasErrors: html.length > 0
        };
    }

    if (html.length < 1) { // No grammar errors found
        return {
            html: 'No grammar errors found. To review your ignored error types, click the "Preferences" button above.',
            error: null,
            hasErrors: false
        };
    }

    return {
        html: html,
        error: null,
        hasErrors: true
    };
}

function runGrammarCheck(lang: string, paragraph: string, paragraphIndex: number) {
    const apiResult = grammarCheckApiRequest(lang, paragraph);

    const resultsTemplate = HtmlService.createTemplateFromFile('results.html');
    resultsTemplate['paragraphIndex'] = paragraphIndex;
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

    const resultsHtml = resultsTemplate.evaluate().getContent();

    if (resultsTemplate['errors'].length == 0) {
        return '';
    }

    return resultsHtml;
}

function getHighlightError(paragraph: string, errorText: string, startIndex: number): string {
    return clipContextText(paragraph, errorText, startIndex).replace(errorText, `<i>${errorText}</i>`);
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
        let cutStartIndex = paragraph.substring(0, errorTextPos - 1).lastIndexOf(' ');
        if (cutStartIndex < 0) {
            cutStartIndex = 0;
        }
        let cutEndIndex = paragraph.indexOf(' ', errorTextPos + errorText.length + 1);
        if (cutEndIndex < 0) {
            cutEndIndex = paragraph.length;
        }
        return paragraph.substring(cutStartIndex, cutEndIndex);
    }

    return paragraph;
}

interface ApiRequestOptions {
    method: 'get' | 'post',
    url: string,
    payload?: object,
    maxAttempts?: number,
}

function apiRequestWithRetry(options: ApiRequestOptions): unknown {
    const maxAttempts = options.maxAttempts || defaultRetryOptions.maxAttempts;
    let lastError: GrammarCheckErrorData | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            Logger.log(`API request attempt ${attempt}/${maxAttempts}: ${JSON.stringify(options)}`);

            const goptions: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
                method: options.method,
                muteHttpExceptions: true,
                contentType: 'application/json',
                payload: options.payload ? JSON.stringify(options.payload) : undefined,
            };

            const response = UrlFetchApp.fetch(options.url, goptions);
            const statusCode = response.getResponseCode();

            if (statusCode >= 200 && statusCode < 300) {
                try {
                    return JSON.parse(response.getContentText());
                } catch (parseError: unknown) {
                    const msg = parseError instanceof Error ? parseError.message : String(parseError);
                    lastError = createParseError(msg);
                    if (attempt < maxAttempts) {
                        const delay = getRetryDelay(attempt);
                        Logger.log(`Parse error, retrying in ${delay}ms...`);
                        Utilities.sleep(delay);
                        continue;
                    }
                    throw lastError;
                }
            }

            // Handle error status codes
            lastError = createApiError(statusCode, response.getContentText());

            // Only retry on retryable errors (5xx, 429)
            if (isRetryableStatusCode(statusCode) && attempt < maxAttempts) {
                const delay = getRetryDelay(attempt);
                Logger.log(`API error ${statusCode}, retrying in ${delay}ms...`);
                Utilities.sleep(delay);
                continue;
            }

            throw lastError;

        } catch (e: unknown) {
            // If it's already a GrammarCheckErrorData, rethrow
            const err = e as Record<string, unknown>;
            if (err && err.type && err.userMessage) {
                throw e;
            }

            // Network or other error
            const msg = e instanceof Error ? e.message : 'Unknown error';
            lastError = createNetworkError(msg);

            if (attempt < maxAttempts) {
                const delay = getRetryDelay(attempt);
                Logger.log(`Network error, retrying in ${delay}ms...`);
                Utilities.sleep(delay);
                continue;
            }

            throw lastError;
        }
    }

    throw lastError || createNetworkError('Request failed after all retry attempts');
}

// Legacy wrapper for backward compatibility
function apiRequest(options: ApiRequestOptions) {
    return apiRequestWithRetry(options);
}

interface APIGrammarError {
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
    const ignoreTags = getIgnoredTags();
    const payload: { text: string; ignore?: string[] } = {
        text: normalizeLineEndings(text),
    };
    if (ignoreTags.length > 0) {
        payload.ignore = ignoreTags;
    }
    return apiRequest({
        method: 'post',
        url: `${getCurrentApiUrl()}grammar/${lang}`,
        payload
    }) as GrammarCheckApiResponse;
}

interface LanguageOptions {
    available: {
        grammar: { [key: string]: string },
        speller: { [key: string]: string },
    },
}

function apiRequestLanguageOptions(): LanguageOptions {
    return apiRequest({
        url: `${getCurrentApiUrl()}languages`,
        method: 'get',
    }) as LanguageOptions;
}

interface GrammarCheckerAvailablePreferences {
    error_tags: { [key: string]: string }
}

function apiRequestGrammarCheckerPreferences(): GrammarCheckerAvailablePreferences {
    let selectedLanguage = loadSettings(SELECTED_LANGUAGE_KEY);
    if (!selectedLanguage) {
        const availableLangs = apiRequestLanguageOptions();
        selectedLanguage = Object.keys(availableLangs.available.grammar)[0] || '<no_lang>';
    }

    return apiRequest({
        url: `${getCurrentApiUrl()}${getPreferencesEndpoint(selectedLanguage)}`,
        method: 'get',
    }) as GrammarCheckerAvailablePreferences;
}

function runCorrection(errorText: string, correction: string, errorIndex: number, paragraphIndex: number) {
    Logger.log('Editing: ' + errorText + ', ' + correction);
    const body = DocumentApp.getActiveDocument().getBody();
    const paras = body.getParagraphs();
    const paragraph = paras[paragraphIndex];

    let editingRange = paragraph.findText(errorText);
    while (editingRange && editingRange.getStartOffset() < errorIndex) {
        editingRange = paragraph.findText(errorText, editingRange);
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

function highlightError(errorText: string, errorIndex: number, paragraphIndex: number) {
    Logger.log('Highlighting: ' + errorText + ' at index ' + errorIndex + ' in paragraph ' + paragraphIndex);
    const doc = DocumentApp.getActiveDocument()
    const body = doc.getBody();
    const paras = body.getParagraphs();
    const paragraph = paras[paragraphIndex];

    let editingRange = paragraph.findText(errorText);
    while (editingRange && editingRange.getStartOffset() < errorIndex) {
        editingRange = paragraph.findText(errorText, editingRange);
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
    const selection = doc.getSelection();
    if (selection) {
        for (const element of selection.getRangeElements()) {
            const pos = doc.newPosition(element.getElement(), element.getEndOffsetInclusive() + 1);
            doc.setCursor(pos);
            return;
        }
    }
}

function changeLanguage(key: string) {
    saveSettings(SELECTED_LANGUAGE_KEY, key);
}

function getSelectedLanguage(): string | null {
    return loadSettings(SELECTED_LANGUAGE_KEY);
}

function getIgnoredTags(): string[] {
    return (loadSettings(IGNORED_ERROR_TAGS_KEY) || "").split(",")
}

function saveIgnoredTags(tags: string[]) {
    saveSettings(IGNORED_ERROR_TAGS_KEY, tags.join(","))
}

function savePreferences(ignoredTags: string[], useBetaApi: boolean) {
    saveIgnoredTags(ignoredTags);
    setUseBetaApi(useBetaApi);
}

function include(filename: string) {
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

function getUseBetaApi(): boolean {
    const useBeta = loadSettings(USE_BETA_API_KEY);
    return useBeta === 'true';
}

function setUseBetaApi(useBeta: boolean) {
    saveSettings(USE_BETA_API_KEY, useBeta.toString());
}

function getCurrentApiUrl(): string {
    return getUseBetaApi() ? betaApiUrl : apiUrl;
}

function getPreferencesEndpoint(language: string): string {
    return `grammar/${language}/preferences`;
}

function getVersion(): string {
    return VERSION;
}
