import * as React from 'react';
import { Dropdown } from 'office-ui-fabric-react/lib/Dropdown';
import { PrimaryButton, IDropdownOption, Spinner } from 'office-ui-fabric-react';
import Progress from './Progress';
import { GrammarCheckApiResponse, apiRequest } from '../utils';
import GrammarErrorsList from './GrammarErrrorsList';

export interface AppProps {
    title: string;
    isOfficeInitialized: boolean;
}

export interface AppState {
    selectedLanguage: string | undefined;
    appErrorText: string | null;
    apiResults: GrammarCheckApiResponse['results'];
    loading: boolean;
}

export default class App extends React.Component<AppProps, AppState> {
    constructor(props, context) {
        super(props, context);
        this.state = {
            selectedLanguage: undefined,
            appErrorText: null,
            apiResults: [],
            loading: false,
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

    getGrammarErrorText = (lineIndex: number, errorIndex: number): string => {
        return this.state.apiResults[lineIndex].errs[errorIndex][0];
    }

    getSuggestion = (lineIndex: number, errorIndex: number, suggestionIndex: number): string => {
        return this.state.apiResults[lineIndex].errs[errorIndex][5][suggestionIndex];
    }

    removeGrammarErrror = (lineIndex: number, errorIndex: number) => {
        const newApiResults = this.state.apiResults.concat();
        newApiResults[lineIndex].errs.splice(errorIndex, 1);
        this.setState({
            apiResults: newApiResults,
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
        });
    }

    runGrammarCheck = async () => {
        if (!this.state.selectedLanguage) {
            this.showAppError('No language selected');
            return;
        }

        this.startLoading();
        this.clearAppError();

        Word.run(async (context) => {
            const body = context.document.body;
            context.load(body, 'text');
            try {
                await context.sync();
                const apiResults = await apiRequest(body.text, this.state.selectedLanguage);

                this.setState({
                    apiResults,
                });
            } catch (e) {
                console.error(e);
                this.showAppError('Could not get grammar check results');
            } finally {
                this.stopLoading();
            }
        });
    }

    highlight = (lineIndex: number, errorIndex: number, clear: boolean = false) => {
        Word.run(async (context) => {
            try {
                const errorText = this.getGrammarErrorText(lineIndex, errorIndex);
                const body = context.document.body;
                const rangeCollection = body.search(errorText, {
                    matchCase: true,
                });
                rangeCollection.getFirst().select(clear ? 'Start' : 'Select');
                await context.sync();
                this.clearAppError();
            } catch (e) {
                console.error(e);
                this.showAppError('Cannot highlight error. Maybe the text changed?');
            }
        });
    }

    correct = (lineIndex: number, errorIndex: number, suggestionIndex: number) => {
        Word.run(async (context) => {
            try {
                const errorText = this.getGrammarErrorText(lineIndex, errorIndex);
                const suggestion = this.getSuggestion(lineIndex, errorIndex, suggestionIndex);

                const body = context.document.body;
                const rangeCollection = body.search(errorText, {
                    matchCase: true,
                });
                const range = rangeCollection.getFirst();
                range.insertText(suggestion, 'Replace');
                range.select('End');
                await context.sync();

                this.removeGrammarErrror(lineIndex, errorIndex);
                this.runGrammarCheck();
            } catch (e) {
                console.error(e);
                this.showAppError('Cannot correct text. Rerun the check.');
            }
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

        const loadingIndicator = this.state.loading ? (
            <Spinner
                className='loading-indicator'
                ariaLabel='Running grammar checker'
            />
        ) : null;

        return (
            <>
                <div id='toolbar'>
                    <Dropdown
                        placeHolder='Select language'
                        label='Language'
                        options={[
                            { key: 'se', text: 'North Sámi' },
                            { key: 'sma', text: 'South Sámi' },
                        ]}
                        selectedKey={this.state.selectedLanguage}
                        onChanged={this.changeLanguage}
                    />
                    <div className='error'>
                        {this.state.appErrorText}
                    </div>
                    <div className='buttons'>
                        <PrimaryButton
                            onClick={this.runGrammarCheck}
                            ariaDescription='Check grammar'
                        >
                            Check grammar
                        </PrimaryButton>
                        {loadingIndicator}
                    </div>
                </div>
                <div className='body'>
                    <ErrorBoundary>
                        <GrammarErrorsList
                            apiResults={this.state.apiResultsByParagraph}
                            onCorrect={this.correct}
                            onHighlight={this.highlight}
                        />
                    </ErrorBoundary>
                </div>
            </>
        );
    }
}
