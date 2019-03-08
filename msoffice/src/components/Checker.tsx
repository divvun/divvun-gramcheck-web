import * as React from 'react';
import { loadSettings, SELECTED_LANGUAGE_KEY, ignoreIndividualError, getRange, splitInParagraphs, saveSettings, AVAILABLE_LANGUAGES, debounce } from '../utils';
import { GrammarCheckApiResponse, apiRequestGrammarCheck } from '../utils/api';
import { Overlay, Spinner, SpinnerSize, PrimaryButton, Dropdown, IDropdownOption } from 'office-ui-fabric-react';
import GrammarErrorsList from './GrammarErrrorsList';
import ErrorBoundary from './ErrorBoundary';

export interface CheckerProps {
}

interface CheckerState {
    apiResultsByParagraph: GrammarCheckApiResponse[];
    loading: boolean;
    requestsCounter: number;
    selectedLanguage: string | undefined;
}

export default class Checker extends React.Component<CheckerProps, CheckerState> {
    constructor(props: CheckerProps) {
        super(props);

        const savedLanguage = loadSettings(SELECTED_LANGUAGE_KEY);

        this.state = {
            apiResultsByParagraph: [],
            loading: false,
            requestsCounter: 0,
            selectedLanguage: savedLanguage || undefined,
        };
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

    changeLanguage = (option: IDropdownOption): void => {
        this.setState({
            selectedLanguage: option.key.toString(),
        }, () => {
            saveSettings(SELECTED_LANGUAGE_KEY, option.key.toString());
        });
    }

    runGrammarCheckOnWholeText = () => {
        this.setState({
            requestsCounter: this.state.requestsCounter + 1,
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

        return <>
            <div id='toolbar'>
                <Dropdown
                    placeHolder='Select language'
                    ariaLabel='Selecte a language from the list'
                    options={AVAILABLE_LANGUAGES}
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
            </div>
            {loadingOverlay}
        </>;
    }
}
