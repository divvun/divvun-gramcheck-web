import * as React from 'react';

export interface ErrorBoundaryProps {
    children?: JSX.Element | JSX.Element[];
}

export interface ErrorBoundaryState {
    error: string | null;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props) {
        super(props);
        this.state = {
            error: null,
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
        return this.props.children;
    }
}
