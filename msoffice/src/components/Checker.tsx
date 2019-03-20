import * as React from 'react';
import { loadSettings, SELECTED_LANGUAGE_KEY, ignoreIndividualError, getRange, splitInParagraphs, saveSettings, debounce } from '../utils';
import { GrammarCheckApiResponse, apiRequestGrammarCheck, APIGrammarError, apiRequestLanguageOptions } from '../utils/api';
import { Overlay, Spinner, SpinnerSize, PrimaryButton, Dropdown, IDropdownOption } from 'office-ui-fabric-react';
import GrammarErrorsList from './GrammarErrrorsList';
import ErrorBoundary from './ErrorBoundary';
import Snackbar from './Snackbar';

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
    } | null;
    loading: boolean;
    requestsCounter: number;
    selectedLanguage: string | undefined;
    availableLanguages: {
        key: string,
        text: string,
    }[];
}

export default class Checker extends React.Component<CheckerProps, CheckerState> {
    constructor(props: CheckerProps) {
        super(props);

        const savedLanguage = loadSettings(SELECTED_LANGUAGE_KEY);

        this.state = {
            apiResultsByParagraph: [],
            lastCorrectedError: null,
            loading: false,
            requestsCounter: 0,
            selectedLanguage: savedLanguage || undefined,
            availableLanguages: [],
        };
    }

    async componentWillMount() {
        const languageOptions = await apiRequestLanguageOptions();
        const availableLanguages = Object.keys(languageOptions.available.grammar).map((k) => {
            return {
                key: k,
                text: languageOptions.available.grammar[k],
            };
        });
        this.setState({
            availableLanguages,
        });
    }

    startLoading = () => {
        this.setState({
            loading: true,
        });
    }

    stopLoading = () => {
        this.setState({
            loading: false,
        });
    }

    getLineText = (lineIndex: number): string => {
        return this.state.apiResultsByParagraph[lineIndex].text;
    }

    getGrammarErrorText = (lineIndex: number, errorIndex: number): string => {
        return this.state.apiResultsByParagraph[lineIndex].errs[errorIndex].error_text;
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

    changeLanguage = (option: IDropdownOption): void => {
        this.setState({
            selectedLanguage: option.key.toString(),
            // reset results if you switch language
            apiResultsByParagraph: [],
        }, () => {
            saveSettings(SELECTED_LANGUAGE_KEY, option.key.toString());
        });
    }

    runGrammarCheckOnWholeText = () => {
        this.setState({
            requestsCounter: this.state.requestsCounter + 1,
            // reset results if you rerun on whole text
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
                context.load(body);
                await context.sync();
                const paragraphs = splitInParagraphs(body.text);
                const language = this.state.selectedLanguage;

                let paragraphIndex = 0;
                let textEndIndex = paragraphs.length;
                if (selectedParagraphIndex > -1) {
                    paragraphIndex = selectedParagraphIndex;
                    textEndIndex = paragraphIndex + 1;
                }

                let apiResultsByParagraph = this.state.apiResultsByParagraph.concat([]);

                for (; paragraphIndex < textEndIndex; paragraphIndex++) {
                    const paragraph = paragraphs[paragraphIndex];
                    const paragraphResults = await apiRequestGrammarCheck(paragraph, language);

                    if (paragraphResults) {
                        apiResultsByParagraph[paragraphIndex] = paragraphResults;
                    } else if (apiResultsByParagraph.length > paragraphIndex) {
                        apiResultsByParagraph = apiResultsByParagraph.splice(paragraphIndex, 1);
                    }
                }

                this.setState({
                    apiResultsByParagraph: apiResultsByParagraph,
                });
            } catch (e) {
                console.error(e.message, e.debugInfo);
            } finally {
                this.stopLoading();
            }
        });
    }

    highlight = debounce((lineIndex: number, errorIndex: number, clear: boolean = false) => {
        Word.run(async (context) => {
            try {
                const errorText = this.getGrammarErrorText(lineIndex, errorIndex);
                const paragraphText = this.getLineText(lineIndex);
                const errorRange = await getRange(context, paragraphText, errorText);
                console.log(errorText, paragraphText, errorRange);

                errorRange.select(clear ? 'Start' : 'Select');
                await context.sync();
            } catch (e) {
                console.error(e.message, e.debugInfo);
            }
        });
    }, 150);

    correct = (paragraphIndex: number, errorIndex: number, suggestionIndex: number) => {
        Word.run(async (context) => {
            try {
                const errorText = this.getGrammarErrorText(paragraphIndex, errorIndex);
                const paragraphText = this.getLineText(paragraphIndex);
                const errorRange = await getRange(context, paragraphText, errorText);

                const suggestion = this.getSuggestion(paragraphIndex, errorIndex, suggestionIndex);

                errorRange.insertText(suggestion, 'Replace');
                errorRange.select('End');

                const lastCorrectedError = {
                    error: this.state.apiResultsByParagraph[paragraphIndex].errs[errorIndex],
                    selectedSuggestion: suggestion,
                    paragraphIndex,
                    errorIndex,
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

    ignore = (paragraphIndex: number, errorIndex: number) => {
        const error = this.state.apiResultsByParagraph[paragraphIndex].errs[errorIndex];

        ignoreIndividualError(error);

        this.removeGrammarErrror(paragraphIndex, errorIndex);
    }

    clearLastCorrectedError = () => {
        this.setState({
            lastCorrectedError: null,
        });
    }

    undo = () => {
        Word.run(async (context) => {
            try {
                const correctedError = this.state.lastCorrectedError;

                const errorText = correctedError.selectedSuggestion;
                const paragraphText = this.getLineText(correctedError.paragraphIndex);
                const errorRange = await getRange(context, paragraphText, errorText);

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
            snackbar = <Snackbar label='Correction implemented' onAction={this.undo} buttonLabel='Undo'/>;
        }

        return <>
            <div id='toolbar'>
                <Dropdown
                    placeHolder='Select language'
                    ariaLabel='Selecte a language from the list'
                    options={this.state.availableLanguages}
                    selectedKey={this.state.selectedLanguage}
                    onChanged={this.changeLanguage}
                    className='select-language'
                />
                <PrimaryButton
                        onClick={this.runGrammarCheckOnWholeText}
                        ariaDescription='Check grammar'
                    >
                    Check
                </PrimaryButton>
            </div>
            <div className='body'>
                <ErrorBoundary key={this.state.requestsCounter}>
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
