import * as React from 'react';

export interface GrammarErrorProps {
    contextText: string;
    errorText: string;
    reason: string;
    lineIndex: number;
    errorIndex: number;
    suggestions: string[];
    onCorrect(lineIndex: number, errorIndex: number, suggestionIndex: number): void;
    onHighlight(lineIndex: number, errorIndex: number, clear: boolean): void;
}

export default class GrammarError extends React.Component<GrammarErrorProps> {
    render() {
        const suggestions = this.props.suggestions.map((suggestion, i) => {
            return (
                <div
                    key={`suggestion-${i}`}
                    className='suggestion'
                    onClick={this.props.onCorrect.bind(this, this.props.lineIndex, this.props.errorIndex, i)}
                >
                    { suggestion }
                </div>
            );
        });

        return (
            <section
                className='grammar-error'
                onMouseOver={this.props.onHighlight.bind(this, this.props.lineIndex, this.props.errorIndex, false)}
                onMouseLeave={this.props.onHighlight.bind(this, this.props.lineIndex, this.props.errorIndex, true)}
            >
                <div className='reason'>{ this.props.reason }</div>
                <div className='context' dangerouslySetInnerHTML={{ __html: this.props.contextText }}/>
                <div className='suggestions-heading'>{ this.props.suggestions.length > 0 ? 'Suggested corrections' : '' }</div>
                <div className='suggestions-list'>
                    {suggestions}
                </div>
            </section>
        );
    }
}
