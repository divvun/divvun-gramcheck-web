import * as React from 'react';
import { loadSettings, SELECTED_LANGUAGE_KEY, ignoreIndividualError, filterIgnoredIndividualErrors, getRange, saveSettings, debounce, getUseBetaApi } from '../utils';
import { GrammarCheckApiResponse, apiRequestGrammarCheck, APIGrammarError, apiRequestLanguageOptions } from '../utils/api';
import { GrammarCheckError } from '../utils/errors';
import {
    supportsCritiques,
    supportsCritiquePopups,
    insertAnnotationsForParagraph,
    removeAllAnnotations,
    removeAnnotationsForParagraph,
    getAllAnnotationMetas,
    handlePopupAccept,
    rejectAnnotation,
    registerAnnotationEvents,
    AnnotationMeta,
} from '../utils/annotations';
import { Overlay, Spinner, SpinnerSize, PrimaryButton, Dropdown, IDropdownOption } from 'office-ui-fabric-react';
import GrammarErrorsList from './GrammarErrrorsList';
import ErrorBoundary from './ErrorBoundary';
import Snackbar from './Snackbar';
import ErrorMessage from './ErrorMessage';

const SNACKBAR_DISAPPEAR_AFTER_MS = 7000;

export interface CheckerProps {
}

interface CheckerState {
    apiResultsByParagraph: GrammarCheckApiResponse[];
    lastCorrectedError: {
        error: APIGrammarError;
        selectedSuggestion: string;
        paragraphIndex: number;
        errorIndex: number;
        errorOffset: number;
    } | null;
    loading: boolean;
    requestsCounter: number;
    selectedLanguage: string | undefined;
    availableLanguages: {
        key: string,
        text: string,
    }[];
    currentError: GrammarCheckError | null;
    // Set when the saved language preference isn't served by the current API
    // (beta and production offer different grammar checkers).
    unavailableLanguage: string | null;
    isOnline: boolean;
    hasCritiqueSupport: boolean;
    hasPopupSupport: boolean;
    activeAnnotationId: string | null;
}

export default class Checker extends React.Component<CheckerProps, CheckerState> {
    private cleanupEvents: (() => void) | null = null;

    constructor(props: CheckerProps) {
        super(props);

        const savedLanguage = loadSettings(SELECTED_LANGUAGE_KEY);
        const hasCritiques = supportsCritiques();
        const hasPopups = hasCritiques && supportsCritiquePopups();

        this.state = {
            apiResultsByParagraph: [],
            lastCorrectedError: null,
            loading: false,
            requestsCounter: 0,
            selectedLanguage: savedLanguage || undefined,
            availableLanguages: [],
            currentError: null,
            unavailableLanguage: null,
            isOnline: navigator.onLine,
            hasCritiqueSupport: hasCritiques,
            hasPopupSupport: hasPopups,
            activeAnnotationId: null,
        };
    }

    async componentWillMount() {
        try {
            const languageOptions = await apiRequestLanguageOptions();
            const availableLanguages = Object.keys(languageOptions.available.grammar).map((k) => {
                return {
                    key: k,
                    text: languageOptions.available.grammar[k],
                };
            });

            const savedLanguage = this.state.selectedLanguage;
            const preferredLanguage = savedLanguage && savedLanguage !== 'undefined' ? savedLanguage : null;

            let selectedLanguage = preferredLanguage;
            let unavailableLanguage: string | null = null;

            if (!selectedLanguage || availableLanguages.findIndex((l) => l.key === selectedLanguage) < 0) {
                // Deliberately not persisted: beta and production serve different
                // languages, so falling back here must not destroy the preference.
                unavailableLanguage = preferredLanguage;
                selectedLanguage = availableLanguages.length > 0 ? availableLanguages[0].key : undefined;
            }

            this.setState({
                availableLanguages,
                selectedLanguage,
                unavailableLanguage,
                currentError: null,
            });
        } catch (error) {
            const grammarError = error instanceof GrammarCheckError ? error : GrammarCheckError.networkError(error as Error);
            this.setState({
                currentError: grammarError,
                availableLanguages: [],
            });
            console.error('Failed to load language options:', grammarError);
        }
    }

    componentDidMount() {
        window.addEventListener('online', this.handleOnline);
        window.addEventListener('offline', this.handleOffline);

        // Register annotation event handlers if Critique API is available
        if (this.state.hasCritiqueSupport) {
            this.cleanupEvents = registerAnnotationEvents({
                onAnnotationClicked: this.handleAnnotationClicked,
                onAnnotationPopupAction: this.state.hasPopupSupport
                    ? this.handleAnnotationPopupAction
                    : undefined,
                onAnnotationRemoved: this.handleAnnotationsRemoved,
            });
        }
    }

    componentWillUnmount() {
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);

        if (this.cleanupEvents) {
            this.cleanupEvents();
            this.cleanupEvents = null;
        }
    }

    // ── Annotation event handlers ────────────────────────────────────

    handleAnnotationClicked = (annotationId: string, meta: AnnotationMeta | undefined) => {
        if (meta) {
            this.setState({ activeAnnotationId: annotationId });
            // Scroll the corresponding error into view in the sidebar
            const errorElement = document.querySelector(
                `[data-annotation-id="${annotationId}"]`
            );
            if (errorElement) {
                errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                errorElement.classList.add('annotation-highlight');
                setTimeout(() => errorElement.classList.remove('annotation-highlight'), 2000);
            }
        }
    }

    handleAnnotationPopupAction = (annotationId: string, action: string, meta: AnnotationMeta | undefined) => {
        if (!meta) return;

        if (action === 'Accept') {
            // Word has already applied the replacement. Update our state.
            handlePopupAccept(annotationId);
            this.removeGrammarErrror(meta.paragraphIndex, meta.errorIndex);
            // Re-check this paragraph to pick up new errors
            this.runGrammarCheck(meta.paragraphIndex);
        } else if (action === 'Reject') {
            // User dismissed the suggestion from popup
            rejectAnnotation(annotationId);
        }
    }

    handleAnnotationsRemoved = (_annotationIds: string[]) => {
        // Annotations auto-removed when user edits annotated text.
        // We could re-check affected paragraphs here, but for now just
        // let the user re-run the check manually.
        this.forceUpdate();
    }

    // ── Network status ───────────────────────────────────────────────

    handleOnline = () => {
        this.setState({
            isOnline: true,
            currentError: this.state.currentError && this.state.currentError.type === 'OFFLINE_ERROR' ? null : this.state.currentError
        });
    }

    handleOffline = () => {
        this.setState({
            isOnline: false,
            currentError: GrammarCheckError.offlineError()
        });
    }

    handleRetry = () => {
        this.setState({ currentError: null });

        if (this.state.apiResultsByParagraph.length > 0) {
            this.runGrammarCheck(-1);
        } else {
            this.componentWillMount();
        }
    }

    handleDismissError = () => {
        this.setState({ currentError: null });
    }

    // ── Loading state ────────────────────────────────────────────────

    startLoading = () => {
        this.setState({ loading: true });
    }

    stopLoading = () => {
        this.setState({ loading: false });
    }

    // ── Data accessors ───────────────────────────────────────────────

    getLineText = (lineIndex: number): string => {
        return this.state.apiResultsByParagraph[lineIndex].text;
    }

    getGrammarErrorText = (lineIndex: number, errorIndex: number): string => {
        return this.state.apiResultsByParagraph[lineIndex].errs[errorIndex].error_text;
    }

    getGrammarErrorOffset = (lineIndex: number, errorIndex: number): number => {
        return this.state.apiResultsByParagraph[lineIndex].errs[errorIndex].start_index;
    }

    getSuggestion = (lineIndex: number, errorIndex: number, suggestionIndex: number): string => {
        return this.state.apiResultsByParagraph[lineIndex].errs[errorIndex].suggestions[suggestionIndex];
    }

    removeGrammarErrror = (lineIndex: number, errorIndex: number) => {
        const newApiResults = this.state.apiResultsByParagraph.concat();
        newApiResults[lineIndex].errs.splice(errorIndex, 1);
        this.setState({
            apiResultsByParagraph: newApiResults,
        });
    }

    insertGrammarErrror = (lineIndex: number, errorIndex: number, error: APIGrammarError) => {
        const newResults = this.state.apiResultsByParagraph.concat();
        newResults[lineIndex].errs.splice(errorIndex, 0, error);
        this.setState({
            apiResultsByParagraph: newResults,
        });
    }

    // ── Language ──────────────────────────────────────────────────────

    changeLanguage = (option: IDropdownOption): void => {
        this.setState({
            selectedLanguage: option.key.toString(),
            unavailableLanguage: null,
            apiResultsByParagraph: [],
        }, () => {
            saveSettings(SELECTED_LANGUAGE_KEY, option.key.toString());
        });

        // Clear annotations when switching language
        if (this.state.hasCritiqueSupport) {
            Word.run(async (context) => {
                await removeAllAnnotations(context);
            });
        }
    }

    // ── Grammar check ────────────────────────────────────────────────

    runGrammarCheckOnWholeText = () => {
        this.setState({
            requestsCounter: this.state.requestsCounter + 1,
            apiResultsByParagraph: [],
        });
        this.runGrammarCheck(-1);
    }

    runGrammarCheck = async (selectedParagraphIndex: number = -1) => {
        if (!this.state.selectedLanguage) {
            return;
        }

        this.startLoading();

        Word.run(async (context) => {
            const body = context.document.body;
            try {
                context.load(body.paragraphs);
                await context.sync();
                const paragraphCollection = body.paragraphs.load({
                    text: true,
                });
                const paragraphs = paragraphCollection.items.map((p) => p.text);
                const language = this.state.selectedLanguage;

                let paragraphIndex = 0;
                let textEndIndex = paragraphs.length;
                if (selectedParagraphIndex > -1) {
                    paragraphIndex = selectedParagraphIndex;
                    textEndIndex = paragraphIndex + 1;
                }

                let apiResultsByParagraph = this.state.apiResultsByParagraph.concat([]);

                this.setState({ currentError: null });

                // Clear existing annotations for paragraphs we're about to re-check
                if (this.state.hasCritiqueSupport) {
                    if (selectedParagraphIndex === -1) {
                        await removeAllAnnotations(context);
                    } else {
                        await removeAnnotationsForParagraph(context, selectedParagraphIndex);
                    }
                }

                for (; paragraphIndex < textEndIndex; paragraphIndex++) {
                    const paragraph = paragraphs[paragraphIndex];

                    try {
                        const paragraphResults = await apiRequestGrammarCheck(paragraph, language);
                        if (paragraphResults) {
                            paragraphResults.errs = filterIgnoredIndividualErrors(paragraphResults.errs);
                            apiResultsByParagraph[paragraphIndex] = paragraphResults;

                            // Insert critique annotations for this paragraph
                            if (this.state.hasCritiqueSupport && paragraphResults.errs.length > 0) {
                                try {
                                    await insertAnnotationsForParagraph(
                                        context,
                                        paragraphIndex,
                                        paragraphResults.errs,
                                    );
                                } catch (annotErr) {
                                    console.warn('Failed to insert annotations for paragraph', paragraphIndex, annotErr);
                                    // Non-fatal — sidebar still works
                                }
                            }
                        } else if (apiResultsByParagraph.length > paragraphIndex) {
                            apiResultsByParagraph = apiResultsByParagraph.splice(paragraphIndex, 1);
                        }
                    } catch (error) {
                        const grammarError = error instanceof GrammarCheckError ? error : GrammarCheckError.networkError(error as Error);
                        this.setState({ currentError: grammarError });
                        console.error(`Grammar check failed for paragraph ${paragraphIndex}:`, grammarError);

                        if (!grammarError.retryable) {
                            break;
                        }
                    }
                }

                this.setState({
                    apiResultsByParagraph: apiResultsByParagraph,
                });
            } catch (e) {
                const error = e instanceof GrammarCheckError ? e : GrammarCheckError.networkError(e as Error);
                this.setState({ currentError: error });
                console.error('Grammar check failed:', e.message, e.debugInfo);
            } finally {
                this.stopLoading();
            }
        });
    }

    // ── Highlight / Select ───────────────────────────────────────────

    highlight = debounce((lineIndex: number, errorIndex: number, clear: boolean = false) => {
        Word.run(async (context) => {
            try {
                const errorText = this.getGrammarErrorText(lineIndex, errorIndex);
                const errorOffset = this.getGrammarErrorOffset(lineIndex, errorIndex);
                const errorRange = await getRange(context, lineIndex, errorText, errorOffset);

                errorRange.select(clear ? 'Start' : 'Select');
                await context.sync();
            } catch (e) {
                console.error(e.message, e.debugInfo);
            }
        });
    }, 150);

    // ── Correct ──────────────────────────────────────────────────────

    correct = (paragraphIndex: number, errorIndex: number, suggestionIndex: number) => {
        Word.run(async (context) => {
            try {
                const errorText = this.getGrammarErrorText(paragraphIndex, errorIndex);
                const errorOffset = this.getGrammarErrorOffset(paragraphIndex, errorIndex);
                const errorRange = await getRange(context, paragraphIndex, errorText, errorOffset);

                const suggestion = this.getSuggestion(paragraphIndex, errorIndex, suggestionIndex);

                errorRange.insertText(suggestion, 'Replace');
                errorRange.select('End');

                const lastCorrectedError = {
                    error: this.state.apiResultsByParagraph[paragraphIndex].errs[errorIndex],
                    selectedSuggestion: suggestion,
                    paragraphIndex,
                    errorIndex,
                    errorOffset,
                };

                this.setState({
                    lastCorrectedError,
                }, () => {
                    setTimeout(this.clearLastCorrectedError, SNACKBAR_DISAPPEAR_AFTER_MS);
                });

                this.removeGrammarErrror(paragraphIndex, errorIndex);

                await context.sync();
                this.runGrammarCheck(paragraphIndex);
            } catch (e) {
                console.error(e.message, e.debugInfo);
                this.runGrammarCheck(paragraphIndex);
            }
        });
    }

    // ── Ignore ───────────────────────────────────────────────────────

    ignore = (paragraphIndex: number, errorIndex: number) => {
        const error = this.state.apiResultsByParagraph[paragraphIndex].errs[errorIndex];

        ignoreIndividualError(error);

        // Remove the annotation for this error if Critique API is available
        if (this.state.hasCritiqueSupport) {
            const allMetas = getAllAnnotationMetas();
            const meta = allMetas.find(
                (m) => m.paragraphIndex === paragraphIndex && m.errorIndex === errorIndex,
            );
            if (meta && meta.annotationId) {
                rejectAnnotation(meta.annotationId);
            }
        }

        this.removeGrammarErrror(paragraphIndex, errorIndex);
    }

    // ── Undo ─────────────────────────────────────────────────────────

    clearLastCorrectedError = () => {
        this.setState({ lastCorrectedError: null });
    }

    undo = () => {
        Word.run(async (context) => {
            try {
                const correctedError = this.state.lastCorrectedError;
                
                const errorText = correctedError.selectedSuggestion;
                const errorOffset = correctedError.errorOffset;
                const errorRange = await getRange(context, correctedError.paragraphIndex, errorText, errorOffset);

                errorRange.insertText(correctedError.error.error_text, 'Replace');
                errorRange.select('End');

                this.clearLastCorrectedError();

                this.insertGrammarErrror(correctedError.paragraphIndex, correctedError.errorIndex, correctedError.error);

                await context.sync();
                this.runGrammarCheck(correctedError.paragraphIndex);
            } catch (e) {
                console.error(e.message, e.debugInfo);
            }
        });
    }

    // ── Render ────────────────────────────────────────────────────────

    render() {
        const loadingOverlay = this.state.loading ? (
            <Overlay className='loading-overlay'>
                <Spinner
                    size={SpinnerSize.large}
                    label='Running grammar checker...'
                    ariaLive='assertive'
                    className='loading-indicator'
                    ariaLabel='Running grammar checker...'
                />
            </Overlay>
        ) : null;

        let snackbar = null;
        if (this.state.lastCorrectedError) {
            snackbar = <Snackbar label='Correction implemented' onAction={this.undo} buttonLabel='Undo' />;
        }

        const critiqueStatusText = this.state.hasCritiqueSupport
            ? (this.state.hasPopupSupport
                ? 'Inline annotations with popups enabled'
                : 'Inline annotations enabled')
            : null;

        return <>
            {/* Network Status Indicator */}
            {!this.state.isOnline && (
                <div className="network-status offline">
                    <span className="network-icon">&#x1F50C;</span>
                    You are currently offline
                </div>
            )}

            <div id='toolbar'>
                <Dropdown
                    placeHolder='Select language'
                    ariaLabel='Select a language from the list'
                    options={this.state.availableLanguages}
                    selectedKey={this.state.selectedLanguage}
                    onChanged={this.changeLanguage}
                    className='select-language'
                />
                <PrimaryButton
                    onClick={this.runGrammarCheckOnWholeText}
                    ariaDescription='Check grammar'
                    disabled={!this.state.isOnline || !this.state.selectedLanguage}
                >
                    Check
                </PrimaryButton>
            </div>
            <div className='body'>
                {/* Critique API status indicator */}
                {critiqueStatusText && this.state.apiResultsByParagraph.length > 0 && (
                    <div className="critique-status">
                        <span className="critique-status-dot"></span>
                        {critiqueStatusText}
                    </div>
                )}

                {this.state.unavailableLanguage && (
                    <div className='language-unavailable'>
                        <strong>{this.state.unavailableLanguage}</strong> is not available on the{' '}
                        {getUseBetaApi() ? 'beta' : 'production'} API, so another language has been
                        selected. Your preference is kept and will be restored when it is available
                        again.
                    </div>
                )}

                {/* Error Message */}
                <ErrorMessage
                    error={this.state.currentError}
                    onRetry={this.handleRetry}
                    onDismiss={this.handleDismissError}
                />

                <ErrorBoundary key={this.state.requestsCounter}>
                    {this.state.apiResultsByParagraph.length == 0 ? (<>
                        <p>The Divvun Grammar Checker for Word adds support for grammar checking of a number of Sami languages developed by the Divvun Group of the University of Troms&oslash;.</p>
                        <p>Select a language in the language selector and click 'Check' to grammar check the text of your Document</p>
                    </>) : null}
                    <GrammarErrorsList
                        apiResults={this.state.apiResultsByParagraph}
                        onCorrect={this.correct}
                        onHighlight={this.highlight}
                        onIgnore={this.ignore}
                    />
                </ErrorBoundary>
                {snackbar}
            </div>
            {loadingOverlay}
        </>;
    }
}
