import { Checkbox } from 'office-ui-fabric-react';
import * as React from 'react';
import { getUseBetaApi, IGNORED_ERROR_TAGS_KEY, loadSettings, saveSettings, setUseBetaApi } from '../utils';
import { apiRequestGrammarCheckerPreferences, GrammarCheckerAvailablePreferences } from '../utils/api';
import { GrammarCheckError } from '../utils/errors';
import ErrorMessage from './ErrorMessage';

export interface SettingsProps {
}

type ErrorTags = GrammarCheckerAvailablePreferences['error_tags'];
interface SettingsState {
    allAvailableErrorTags: ErrorTags,
    selectedIgnoredErrorTags: string[],
    useBetaApi: boolean,
    errorTagsError: GrammarCheckError | null,
}

export default class Settings extends React.Component<SettingsProps, SettingsState> {
    constructor(props: SettingsProps) {
        super(props);
        this.state = {
            allAvailableErrorTags: {},
            selectedIgnoredErrorTags: [],
            useBetaApi: getUseBetaApi(),
            errorTagsError: null,
        };
    }

    componentDidMount() {
        this.loadSavedSettings();
        this.loadErrorTags();
    }

    loadErrorTags = async () => {
        try {
            const availablePreferences = await apiRequestGrammarCheckerPreferences();

            this.setState({
                allAvailableErrorTags: this.groupSettingsByLocalizedName(availablePreferences['error_tags']),
                errorTagsError: null,
            });
        } catch (e) {
            // Without this the list silently stays empty — which is exactly what
            // happens when the saved language isn't served by the selected API.
            const error = e instanceof GrammarCheckError ? e : GrammarCheckError.networkError(e as Error);
            console.error('Failed to load error tags:', error);
            this.setState({
                allAvailableErrorTags: {},
                errorTagsError: error,
            });
        }
    }

    groupSettingsByLocalizedName(settings: ErrorTags): ErrorTags {
        let nameGrouped: {[key: string]: string[]} = {};
        Object.keys(settings).forEach((errorTag) => {
            const name = settings[errorTag];
            if (nameGrouped[name]) {
                nameGrouped[name].push(errorTag);
            } else {
                nameGrouped[name] = [errorTag];
            }
        });

        let tagGrouped: ErrorTags = {};
        Object.keys(nameGrouped).forEach((name) => {
            const tags = nameGrouped[name].join(',');
            tagGrouped[tags] = name;
        });

        return tagGrouped;
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
        const ungrouppedKeys = key.split(',');
        let currentSettings = this.state.selectedIgnoredErrorTags;

        currentSettings = currentSettings.filter((k) => ungrouppedKeys.indexOf(k) < 0);
        if (!checked) {
            currentSettings = currentSettings.concat(ungrouppedKeys);
        }

        this.setState({
            selectedIgnoredErrorTags: currentSettings,
        }, () => {
            this.saveSettings();
        });
    }

    isSelected(grouppedTag: string): boolean {
        const grouppedTagsArray = grouppedTag.split(',');

        let result = false;

        for (const tagName of grouppedTagsArray) {
            if (this.state.selectedIgnoredErrorTags.indexOf(tagName) > -1) {
                result = true;
                break;
            }
        }

        return !result;
    }

    onChangeBetaApi = (checked: boolean) => {
        this.setState({
            useBetaApi: checked,
        }, () => {
            setUseBetaApi(checked);
            // The two APIs serve different languages and different error tags.
            this.loadErrorTags();
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
                    checked={this.isSelected(tagName)}
                    className='grammar-tag-checkbox'
                    onChange={(_, checked) => { this.onChangeIgnoredErrorTags(tagName, checked); }}
                />
            );
        }

        return (
            <div className='settings-pane body'>
                <h2>Error types</h2>
                <p>Select the types of errors the grammar checker should warn you about.</p>
                <ErrorMessage error={this.state.errorTagsError} onRetry={this.loadErrorTags} />
                {ignoredErrorTagsCheckboxes}

                <h2>API Settings</h2>
                <Checkbox
                    label="Use Beta API"
                    checked={this.state.useBetaApi}
                    onChange={(_, checked) => { this.onChangeBetaApi(checked); }}
                />
            </div>
        );
    }
}
