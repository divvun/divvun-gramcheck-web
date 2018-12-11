import * as React from 'react';
import GrammarError from './GrammarError';
import { highlightError, GrammarCheckApiResponse } from '../utils';

export interface GrammarErrorsListProps {
    apiResults: GrammarCheckApiResponse['results'];
    onCorrect(lineIndex: number, errorIndex: number, suggestionIndex: number): void;
    onHighlight(lineIndex: number, errorIndex: number, clear: boolean): void;
}

export interface GrammarErrorsListState {
    error?: string;
}

export default class GrammarErrorsList extends React.Component<GrammarErrorsListProps, GrammarErrorsListState> {
    constructor(props, context) {
        super(props, context);
        this.state = {
            error: undefined,
        };
    }

    componentDidCatch() {
        this.setState({
            error: 'Error displaying results',
        });
    }

    render() {
        if (this.state.error) {
            return <div key='error' className='error'>Error displaying results</div>;
        }

        const results: JSX.Element[] = this.props.apiResults.reduce((html: JSX.Element[], r, lineIndex) => {
            const suggestionsHtml = r.errs.map((e, errorIndex) => {
                return (
                    <GrammarError
                        key={`grammar-error-${lineIndex}-${errorIndex}`}
                        contextText={highlightError(r.text, e[0])}
                        errorText={e[0]}
                        reason={e[4]}
                        lineIndex={lineIndex}
                        errorIndex={errorIndex}
                        suggestions={e[5]}
                        onCorrect={this.props.onCorrect}
                        onHighlight={this.props.onHighlight}
                    />
                );
            });
            return html.concat(suggestionsHtml);
        }, []);

        return (
            <div className='grammar-errors-list'>
                {results}
            </div>
        );
    }
}
