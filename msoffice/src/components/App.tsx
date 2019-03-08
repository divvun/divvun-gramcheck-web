import * as React from 'react';
import Progress from './Progress';
import Settings from './Settings';
import Tabs, { TabItem } from './Tabs';
import Checker from './Checker';

export interface AppProps {
    title: string;
    isOfficeInitialized: boolean;
}

export interface AppState {
    selectedTab: string;
}

const availableTabs: TabItem[] = [
    {
        name: 'list',
        label: 'List'
    },
    {
        name: 'details',
        label: 'Details',
    },
    {
        name: 'settings',
        label: 'Settings',
    },
];

export default class App extends React.Component<AppProps, AppState> {
    constructor(props, context) {
        super(props, context);

        this.state = {
            selectedTab: availableTabs[0].name,
        };
    }

    switchTab = (tabName: string) => {
        this.setState({
            selectedTab: tabName,
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

        let tabContents = null;

        if (this.state.selectedTab === 'settings') {
            tabContents = <Settings/>;
        }

        if (this.state.selectedTab === 'list') {
            tabContents = <Checker/>;
        }

        return (
            <>
                {tabContents}
                <Tabs tabs={availableTabs} selectedTabName={this.state.selectedTab} onChangeTab={this.switchTab}/>
            </>
        );
    }
}
