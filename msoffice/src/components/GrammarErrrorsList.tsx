import * as React from 'react';
import GrammarError from './GrammarError';
import { GrammarCheckApiResponse } from '../utils/api';

export interface GrammarErrorsListProps {
    apiResults: GrammarCheckApiResponse[];
    onCorrect(lineIndex: number, errorIndex: number, suggestionIndex: number): void;
    onHighlight(lineIndex: number, errorIndex: number, clear: boolean): void;
    onIgnore(lineIndex: number, errorIndex: number): void;
}

export default class GrammarErrorsList extends React.Component<GrammarErrorsListProps, {}> {
    constructor(props: GrammarErrorsListProps) {
        super(props);
    }

    render() {
        if (!this.props.apiResults) {
            return null;
        }

        const results: JSX.Element[] = this.props.apiResults.reduce((html: JSX.Element[], r, lineIndex) => {
            const suggestionsHtml = r.errs.map((e, errorIndex) => {
                return (
                    <GrammarError
                        key={`grammar-error-${lineIndex}-${errorIndex}`}
                        contextText={r.text}
                        errorText={e.error_text}
                        reason={e.description}
                        lineIndex={lineIndex}
                        errorIndex={errorIndex}
                        suggestions={e.suggestions}
                        onCorrect={this.props.onCorrect}
                        onHighlight={this.props.onHighlight}
                        onIgnore={this.props.onIgnore}
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
