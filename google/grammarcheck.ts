/**
 * @OnlyCurrentDoc Limits the script to only accessing the current sheet.
 */

const apiUrl = 'https://api.giellalt.org/';
const betaApiUrl = 'https://beta.api.giellalt.org/';

const VERSION = '2026-02-20';

const IGNORED_ERROR_TAGS_KEY = 'ignoredErrorTags';
const SELECTED_LANGUAGE_KEY = 'selectedLanguage';
const USE_BETA_API_KEY = 'useBetaApi';

// ── GAS event handlers ───────────────────────────────────────────────

function onOpen(e: GoogleAppsScript.Events.DocsOnOpen) {
    DocumentApp.getUi().createAddonMenu()
        .addItem('Grammar check', 'showSidebar')
        .addToUi();
}

function onInstall(e: GoogleAppsScript.Events.DocsOnOpen) {
    onOpen(e);
}

// ── UI entry points ──────────────────────────────────────────────────

function showSidebar() {
    const ui = HtmlService.createTemplateFromFile('sidebar')
        .evaluate()
        .setTitle('Grammar check v' + VERSION);
    DocumentApp.getUi().showSidebar(ui);
}

function showPreferences() {
    const ui = HtmlService.createTemplateFromFile('preferences')
        .evaluate();
    DocumentApp.getUi().showModalDialog(ui, "Preferences");
}

// ── Init data (single GAS round-trip for sidebar startup) ────────────

interface InitData {
    selectedLanguage: string | null;
    useBetaApi: boolean;
    ignoredTags: string[];
}

function getInitData(): InitData {
    return {
        selectedLanguage: loadSettings(SELECTED_LANGUAGE_KEY),
        useBetaApi: getUseBetaApi(),
        ignoredTags: getIgnoredTags(),
    };
}

// ── Document access (must stay server-side — uses DocumentApp) ───────

function getParagraphs(): string[] {
    const paragraphs = DocumentApp.getActiveDocument().getBody().getParagraphs();
    return paragraphs.map(p => p.getText());
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

// ── Settings (PropertiesService — must stay server-side) ─────────────

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

// ── Template helpers ─────────────────────────────────────────────────

function include(filename: string) {
    return HtmlService.createHtmlOutputFromFile(filename)
        .getContent();
}

function getVersion(): string {
    return VERSION;
}

function getApiUrl(): string {
    return apiUrl;
}

function getBetaApiUrl(): string {
    return betaApiUrl;
}

// ── Background highlighting ──────────────────────────────────────────

/**
 * Error position data sent from the client-side after grammar check.
 */
interface ErrorPosition {
    paragraphIndex: number;
    startOffset: number;
    endOffsetInclusive: number;
    errorCode: string;
    errorText: string;
}

/** Light red background for grammar errors */
const ERROR_HIGHLIGHT_COLOR = '#fce8e6';

/**
 * Apply background highlighting to error positions in the document.
 * Called from sidebar after grammar check completes.
 * Also creates named ranges for each error for robust position tracking.
 *
 * @param errors - array of error positions from the grammar check
 * @returns array of named range IDs created (one per error)
 */
function applyErrorMarkers(errors: ErrorPosition[]): string[] {
    const doc = DocumentApp.getActiveDocument();
    const body = doc.getBody();
    const paras = body.getParagraphs();
    const rangeIds: string[] = [];

    for (const err of errors) {
        const paragraph = paras[err.paragraphIndex];
        if (!paragraph) {
            rangeIds.push('');
            continue;
        }

        const text = paragraph.editAsText();
        const paraLength = text.getText().length;

        // Clamp offsets to paragraph bounds
        const start = Math.max(0, err.startOffset);
        const end = Math.min(err.endOffsetInclusive, paraLength - 1);

        if (start > end || start >= paraLength) {
            rangeIds.push('');
            continue;
        }

        // Apply background highlight
        text.setBackgroundColor(start, end, ERROR_HIGHLIGHT_COLOR);

        // Create a named range for position tracking
        // Name format: gramcheck_{paragraphIndex}_{startOffset}_{errorCode}
        const rangeName = 'gramcheck_' + err.paragraphIndex + '_' + start + '_' + err.errorCode;
        const range = doc.newRange()
            .addElement(text, start, end)
            .build();
        const namedRange = doc.addNamedRange(rangeName, range);
        rangeIds.push(namedRange.getId());
    }

    return rangeIds;
}

/**
 * Clear all grammar-check highlights and named ranges from the document.
 * Called before a new grammar check or when sidebar closes.
 */
function clearAllErrorMarkers() {
    const doc = DocumentApp.getActiveDocument();
    const body = doc.getBody();

    // Remove all gramcheck_ named ranges and restore background colors
    const namedRanges = doc.getNamedRanges();
    for (const nr of namedRanges) {
        if (nr.getName().startsWith('gramcheck_')) {
            // Restore background to null (transparent) for the range elements
            const rangeElements = nr.getRange().getRangeElements();
            for (const re of rangeElements) {
                const element = re.getElement();
                if (element.getType() === DocumentApp.ElementType.TEXT) {
                    const text = element.asText();
                    const start = re.isPartial() ? re.getStartOffset() : 0;
                    const end = re.isPartial() ? re.getEndOffsetInclusive() : text.getText().length - 1;
                    if (start <= end && end >= 0) {
                        text.setBackgroundColor(start, end, null as unknown as string);
                    }
                }
            }
            nr.remove();
        }
    }
}

/**
 * Clear error markers for a specific paragraph only.
 * Used when re-checking a single paragraph after a correction.
 */
function clearParagraphErrorMarkers(paragraphIndex: number) {
    const doc = DocumentApp.getActiveDocument();
    const prefix = 'gramcheck_' + paragraphIndex + '_';

    const namedRanges = doc.getNamedRanges();
    for (const nr of namedRanges) {
        if (nr.getName().startsWith(prefix)) {
            const rangeElements = nr.getRange().getRangeElements();
            for (const re of rangeElements) {
                const element = re.getElement();
                if (element.getType() === DocumentApp.ElementType.TEXT) {
                    const text = element.asText();
                    const start = re.isPartial() ? re.getStartOffset() : 0;
                    const end = re.isPartial() ? re.getEndOffsetInclusive() : text.getText().length - 1;
                    if (start <= end && end >= 0) {
                        text.setBackgroundColor(start, end, null as unknown as string);
                    }
                }
            }
            nr.remove();
        }
    }
}

/**
 * Get current positions of all gramcheck named ranges.
 * Named ranges auto-adjust as user edits, so this returns
 * up-to-date positions even after edits.
 *
 * @returns array of {rangeId, paragraphIndex, startOffset, endOffsetInclusive}
 */
function getErrorRangePositions(): Array<{
    rangeId: string;
    name: string;
    startOffset: number;
    endOffsetInclusive: number;
}> {
    const doc = DocumentApp.getActiveDocument();
    const results: Array<{
        rangeId: string;
        name: string;
        startOffset: number;
        endOffsetInclusive: number;
    }> = [];

    const namedRanges = doc.getNamedRanges();
    for (const nr of namedRanges) {
        if (nr.getName().startsWith('gramcheck_')) {
            const rangeElements = nr.getRange().getRangeElements();
            if (rangeElements.length > 0) {
                const re = rangeElements[0];
                results.push({
                    rangeId: nr.getId(),
                    name: nr.getName(),
                    startOffset: re.isPartial() ? re.getStartOffset() : 0,
                    endOffsetInclusive: re.isPartial() ? re.getEndOffsetInclusive() : -1,
                });
            }
        }
    }

    return results;
}

/**
 * Remove a single error marker by its named range ID.
 * Clears the background highlight and removes the named range.
 */
function removeErrorMarker(rangeId: string) {
    const doc = DocumentApp.getActiveDocument();
    const namedRange = doc.getNamedRangeById(rangeId);
    if (!namedRange) return;

    const rangeElements = namedRange.getRange().getRangeElements();
    for (const re of rangeElements) {
        const element = re.getElement();
        if (element.getType() === DocumentApp.ElementType.TEXT) {
            const text = element.asText();
            const start = re.isPartial() ? re.getStartOffset() : 0;
            const end = re.isPartial() ? re.getEndOffsetInclusive() : text.getText().length - 1;
            if (start <= end && end >= 0) {
    text.setBackgroundColor(start, end, null as unknown as string);
            }
        }
    }
    namedRange.remove();
}

/**
 * Apply a correction using a named range ID for precise positioning.
 * The named range tracks the error position even after user edits.
 *
 * @param rangeId - named range ID for the error
 * @param correction - replacement text
 */
function runCorrectionByRange(rangeId: string, correction: string) {
    const doc = DocumentApp.getActiveDocument();
    const namedRange = doc.getNamedRangeById(rangeId);
    if (!namedRange) {
        throw new Error('Error marker not found. The text may have changed.');
    }

    const rangeElements = namedRange.getRange().getRangeElements();
    if (rangeElements.length === 0) {
        throw new Error('Error marker is empty. The text may have changed.');
    }

    const re = rangeElements[0];
    const element = re.getElement();
    if (element.getType() !== DocumentApp.ElementType.TEXT) {
        throw new Error('Error marker does not point to text.');
    }

    const text = element.asText();
    const start = re.isPartial() ? re.getStartOffset() : 0;
    const end = re.isPartial() ? re.getEndOffsetInclusive() : text.getText().length - 1;

    // Clear highlight, remove range, then apply correction
    text.setBackgroundColor(start, end, null as unknown as string);
    namedRange.remove();

    text.deleteText(start, end);
    text.insertText(start, correction);
}

/**
 * Highlight an error using its named range ID (select it in the document).
 */
function highlightErrorByRange(rangeId: string) {
    const doc = DocumentApp.getActiveDocument();
    const namedRange = doc.getNamedRangeById(rangeId);
    if (!namedRange) return;

    const rangeElements = namedRange.getRange().getRangeElements();
    if (rangeElements.length === 0) return;

    const re = rangeElements[0];
    const range = doc.newRange();
    range.addElement(
        re.getElement().asText(),
        re.isPartial() ? re.getStartOffset() : 0,
        re.isPartial() ? re.getEndOffsetInclusive() : re.getElement().asText().getText().length - 1
    );
    doc.setSelection(range.build());
}
