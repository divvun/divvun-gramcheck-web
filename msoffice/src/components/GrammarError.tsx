import * as React from 'react';
import * as worker from '../utils/text.worker';
import Highlighter from 'react-highlighter';
import { DefaultButton, PrimaryButton, Icon } from 'office-ui-fabric-react';

export interface GrammarErrorProps {
    contextText: string;
    errorText: string;
    reason: string;
    lineIndex: number;
    errorIndex: number;
    suggestions: string[];
    onCorrect(lineIndex: number, errorIndex: number, suggestionIndex: number): void;
    onHighlight(lineIndex: number, errorIndex: number, clear: boolean): void;
    onIgnore(lineIndex: number, errorIndex: number): void;
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

    ignore = () => {
        this.props.onIgnore(this.props.lineIndex, this.props.errorIndex);
    }

    render() {
        const suggestions = this.props.suggestions.map((suggestion, i) => {
            return (
                <PrimaryButton
                    key={`suggestion-${i}`}
                    className='suggestion'
                    onClick={this.correct.bind(this, i)}
                >
                    {suggestion}
                </PrimaryButton>
            );
        });

        return (
            <section
                className='grammar-error'
                onMouseEnter={this.highlight.bind(this)}
                onMouseLeave={this.clearHighlight.bind(this)}
            >
                <div className='reason'>
                    <span>{ this.props.reason }</span>
                    <Icon iconName='ChevronDown' className='chevron-down'/>
                </div>
                <Highlighter className='context' search={this.props.errorText}>…{this.state.contextText}…</Highlighter>
                <div className='suggestions'>
                    <div className='suggestions-heading'>
                        { this.props.suggestions.length > 0 ? <span>Suggested corrections</span> : null }
                        <DefaultButton onClick={this.ignore} className='ignoreButton'>Ignore</DefaultButton>
                    </div>
                    <div className='suggestions-list'>
                        {suggestions}
                    </div>
                </div>
            </section>
        );
    }
}
