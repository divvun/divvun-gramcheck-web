import * as React from 'react';

export interface TabItem {
    name: string;
    label: string;
}

export interface TabsProps {
    onChangeTab(name: string): void;
    selectedTabName: string;
    tabs: TabItem[];
}

export interface TabsState {
}

export default class Tabs extends React.Component<TabsProps, TabsState> {
    constructor(props: TabsProps) {
        super(props);
        this.state = {};
    }

    changeTab = (name: string) => {
        this.props.onChangeTab(name);
    }

    render() {
        const tabs: JSX.Element[] = [];

        for (let index = 0; index < this.props.tabs.length; index++) {
            const tab = this.props.tabs[index];
            const classes = 'tab' + (this.props.selectedTabName === tab.name ? ' selected' : '');
            tabs.push(
                <div
                    key={`tab-${index}`}
                    className={classes}
                    onClick={this.changeTab.bind(this, tab.name)}>
                        {tab.label}
                </div>
            );
        }

        return (
            <div id='tabs'>
                {tabs}
            </div>
        );
    }
}
