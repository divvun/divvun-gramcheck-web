import * as React from 'react';
import { Checkbox } from 'office-ui-fabric-react';
import { loadSettings, saveSettings, IGNORED_ERROR_TAGS_KEY } from '../utils';
import { apiRequestGrammarCheckerPreferences, GrammarCheckerAvailablePreferences } from '../utils/api';

export interface SettingsProps {
}

interface SettingsState {
    allAvailableErrorTags: GrammarCheckerAvailablePreferences['error_tags'],
    selectedIgnoredErrorTags: string[],
}

export default class Settings extends React.Component<SettingsProps, SettingsState> {
    constructor(props: SettingsProps) {
        super(props);
        this.state = {
            allAvailableErrorTags: {},
            selectedIgnoredErrorTags: [],
        };
    }

    async componentDidMount() {
        this.loadSavedSettings();
        const availablePreferences = await apiRequestGrammarCheckerPreferences();

        this.setState({
            allAvailableErrorTags: availablePreferences['error_tags'],
        });
    }

    loadSavedSettings = () => {
        const rawSettings = loadSettings(IGNORED_ERROR_TAGS_KEY);
        if (!rawSettings) {
            return;
        }

        const ignoredErrorTags = rawSettings.split(',');
        this.setState({
            selectedIgnoredErrorTags: ignoredErrorTags,
        });
    }

    saveSettings = () => {
        const errorTagsToSave = this.state.selectedIgnoredErrorTags.join(',');
        saveSettings(IGNORED_ERROR_TAGS_KEY, errorTagsToSave);
    }

    onChangeIgnoredErrorTags = (key: string, checked: boolean) => {
        let currentSettings = this.state.selectedIgnoredErrorTags;

        currentSettings = currentSettings.filter((k) => k !== key);
        if (checked) {
            currentSettings.push(key);
        }

        this.setState({
            selectedIgnoredErrorTags: currentSettings,
        }, () => {
            this.saveSettings();
        });
    }

    render() {
        const ignoredErrorTagsCheckboxes: JSX.Element[] = [];
        for (const tagName of Object.keys(this.state.allAvailableErrorTags)) {
            const tagLocalizedName = this.state.allAvailableErrorTags[tagName];

            ignoredErrorTagsCheckboxes.push(
                <Checkbox
                    value={tagName}
                    key={tagName}
                    label={tagLocalizedName}
                    ariaLabel={tagLocalizedName}
                    checked={this.state.selectedIgnoredErrorTags.indexOf(tagName) > -1}
                    onChange={(_, checked) => { this.onChangeIgnoredErrorTags(tagName, checked); }}
                />
            );
        }

        return (
            <div className='settings-pane body'>
                {ignoredErrorTagsCheckboxes}
            </div>
        );
    }
}
