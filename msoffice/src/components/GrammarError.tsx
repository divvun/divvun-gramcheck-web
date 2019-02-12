import * as React from 'react';
import * as worker from '../utils/text.worker';
import Highlighter from 'react-highlighter';

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

interface GrammarErrorState {
    contextText: string;
}

export default class GrammarError extends React.Component<GrammarErrorProps, GrammarErrorState> {

    constructor(props: GrammarErrorProps) {
        super(props);
        this.state = {
            contextText: this.props.contextText,
        };
        this.extractContextWorker = (worker as any)() as typeof worker;
    }

    extractContextWorker = undefined;

    componentDidMount() {
        this.extractContextWorker.extractContext(this.props.contextText, this.props.errorText).then((result) => {
            if (this.state.contextText !== result) {
                this.setState({
                    contextText: result,
                });
            }
        }).catch((e) => {
            console.error('Worker crashed', e);
        });
    }

    componentWillUnmount() {
        this.extractContextWorker.terminate();
    }

    highlight = (e: React.MouseEvent<HTMLElement>) => {
        e.stopPropagation();
        this.props.onHighlight(this.props.lineIndex, this.props.errorIndex, false);
    }

    clearHighlight = (e: React.MouseEvent<HTMLElement>) => {
        e.stopPropagation();
        this.props.onHighlight(this.props.lineIndex, this.props.errorIndex, true);
    }

    correct = (i: number) => {
        this.props.onCorrect(this.props.lineIndex, this.props.errorIndex, i);
    }

    render() {
        const suggestions = this.props.suggestions.map((suggestion, i) => {
            return (
                <div
                    key={`suggestion-${i}`}
                    className='suggestion'
                    onClick={this.correct.bind(this, i)}
                >
                    { suggestion }
                </div>
            );
        });

        return (
            <section
                className='grammar-error'
                onMouseEnter={this.highlight.bind(this)}
                onMouseLeave={this.clearHighlight.bind(this)}
            >
                <div className='reason'>{ this.props.reason }</div>
                <Highlighter className='context' search={this.props.errorText}>{this.state.contextText}</Highlighter>
                <div className='suggestions-heading'>{ this.props.suggestions.length > 0 ? 'Suggested corrections' : '' }</div>
                <div className='suggestions-list'>
                    {suggestions}
                </div>
            </section>
        );
    }
}
