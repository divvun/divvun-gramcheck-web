import * as React from 'react';
import { MessageBar, MessageBarType, DefaultButton, Icon } from 'office-ui-fabric-react';
import { GrammarCheckError, ErrorType } from '../utils/errors';

export interface ErrorMessageProps {
    error: GrammarCheckError | null;
    onRetry?: () => void;
    onDismiss?: () => void;
    className?: string;
}

export default class ErrorMessage extends React.Component<ErrorMessageProps> {
    getMessageBarType(errorType: ErrorType): MessageBarType {
        switch (errorType) {
            case ErrorType.OFFLINE_ERROR:
                return MessageBarType.severeWarning;
            case ErrorType.TIMEOUT_ERROR:
            case ErrorType.NETWORK_ERROR:
                return MessageBarType.warning;
            case ErrorType.API_ERROR:
                return MessageBarType.error;
            case ErrorType.PARSE_ERROR:
                return MessageBarType.error;
            default:
                return MessageBarType.error;
        }
    }

    getIconName(errorType: ErrorType): string {
        switch (errorType) {
            case ErrorType.OFFLINE_ERROR:
                return 'CloudOffline';
            case ErrorType.TIMEOUT_ERROR:
                return 'Clock';
            case ErrorType.NETWORK_ERROR:
                return 'PlugDisconnected';
            case ErrorType.API_ERROR:
                return 'Error';
            case ErrorType.PARSE_ERROR:
                return 'Warning';
            default:
                return 'Error';
        }
    }

    render() {
        const { error, onRetry, onDismiss, className } = this.props;

        if (!error) {
            return null;
        }

        const messageBarType = this.getMessageBarType(error.type);
        const iconName = this.getIconName(error.type);

        return (
            <div className={`error-message-container ${className || ''}`}>
                <MessageBar
                    messageBarType={messageBarType}
                    onDismiss={onDismiss}
                    dismissButtonAriaLabel="Dismiss"
                    isMultiline={false}
                    actions={
                        <div className="error-actions">
                            {error.retryable && onRetry && (
                                <DefaultButton
                                    text="Retry"
                                    onClick={onRetry}
                                    iconProps={{ iconName: 'Refresh' }}
                                    styles={{
                                        root: { marginLeft: 8, minHeight: 24 },
                                        label: { fontSize: 12 }
                                    }}
                                />
                            )}
                        </div>
                    }
                >
                    <div className="error-content">
                        <Icon iconName={iconName} className="error-icon" />
                        <span className="error-text">{error.userMessage}</span>
                        {error.statusCode && (
                            <span className="error-code">(Error {error.statusCode})</span>
                        )}
                    </div>
                </MessageBar>
            </div>
        );
    }
}