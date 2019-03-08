import * as React from 'react';
import { DefaultButton } from 'office-ui-fabric-react';

export interface SnackbarProps {
    label: string;
    buttonLabel: string;
    onAction(): void;
}

export default class Snackbar extends React.Component<SnackbarProps> {
    constructor(props: SnackbarProps) {
        super(props);
    }

    render() {
        return (
            <div className='snackbar'>
                <span className='label'>{this.props.label}</span>

                <DefaultButton onClick={this.props.onAction} className='actionButton' checked={true}>
                    {this.props.buttonLabel}
                </DefaultButton>
            </div>
        );
    }
}
