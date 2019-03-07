import * as React from 'react';
import { Dropdown } from 'office-ui-fabric-react/lib/Dropdown';
import { PrimaryButton, IDropdownOption, Spinner, Overlay, SpinnerSize, DefaultButton } from 'office-ui-fabric-react';
import Progress from './Progress';
import { splitInParagraphs, getRange, debounce, saveSettings, SELECTED_LANGUAGE_KEY, loadSettings, AVAILABLE_LANGUAGES, ignore } from '../utils';
import GrammarErrorsList from './GrammarErrrorsList';
import ErrorBoundary from './ErrorBoundary';
import Settings from './Settings';
import { GrammarCheckApiResponse, apiRequestGrammarCheck } from '../utils/api';

export interface AppProps {
    title: string;
    isOfficeInitialized: boolean;
}

export interface AppState {
    selectedLanguage: string | undefined;
    appErrorText: string | null;
    apiResultsByParagraph: GrammarCheckApiResponse[];
    loading: boolean;
    requestsCounter: number;
    settingsScreenShown: boolean;
}

export default class App extends React.Component<AppProps, AppState> {
    constructor(props, context) {
        super(props, context);

        const savedLanguage = loadSettings(SELECTED_LANGUAGE_KEY);

        this.state = {
            selectedLanguage: savedLanguage || undefined,
            appErrorText: null,
            apiResultsByParagraph: [],
            loading: false,
            requestsCounter: 0,
            settingsScreenShown: false,
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
            appErrorText: null,
        });
    }

    showAppError = (text: string) => {
        this.setState({
            appErrorText: text,
        });
    }

    clearAppError = () => {
        this.setState({
            appErrorText: null,
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
            this.showAppError('No language selected');
            return;
        }

        this.startLoading();
        this.clearAppError();

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
                this.showAppError('Could not get grammar check results');
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
                this.clearAppError();
                await context.sync();
            } catch (e) {
                console.error(e.message, e.debugInfo);
                this.showAppError('Cannot highlight error. Maybe the text changed?');
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
                this.showAppError('Cannot correct text. Rerun the check.');
                this.runGrammarCheck(paragraphIndex);
            }
        });
    }

    ignore = (paragraphIndex: number, errorIndex: number) => {
        const error = this.state.apiResultsByParagraph[paragraphIndex].errs[errorIndex];

        ignore(error);

        this.removeGrammarErrror(paragraphIndex, errorIndex);
    }

    showSettings = () => {
        this.setState({
            settingsScreenShown: true,
        });
    }

    hideSettings = () => {
        this.setState({
            settingsScreenShown: false,
        });
    }

    render() {
        const {
            title,
            isOfficeInitialized,
        } = this.props;

        if (!isOfficeInitialized) {
            return (
                <Progress
                    title={title}
                    logo='assets/logo-filled.png'
                    message='Just select a language and run your grammar check'
                />
            );
        }

        if (this.state.settingsScreenShown) {
            return <Settings onClose={this.hideSettings}/>;
        }

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

        return (
            <>
                <div id='toolbar'>
                    <Dropdown
                        placeHolder='Select language'
                        label='Language'
                        options={AVAILABLE_LANGUAGES}
                        selectedKey={this.state.selectedLanguage}
                        onChanged={this.changeLanguage}
                    />
                    <div className='error'>
                        {this.state.appErrorText}
                    </div>
                    <div className='buttons'>
                        <PrimaryButton
                            onClick={this.runGrammarCheckOnWholeText}
                            ariaDescription='Check grammar'
                        >
                            Check grammar
                        </PrimaryButton>
                        <DefaultButton onClick={this.showSettings}>Settings</DefaultButton>
                    </div>
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
            </>
        );
    }
}
