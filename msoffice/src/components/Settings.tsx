import * as React from 'react';
import { Checkbox, DefaultButton } from 'office-ui-fabric-react';
import { GrammarErrorCategories, loadSettings, saveSettings, IGNORED_ERROR_CATEGORIES_KEY, apiRequestErrorCategories } from '../utils';

export interface SettingsProps {
    onClose: () => void
}

interface SettingsState {
    allErrorCategories: GrammarErrorCategories,
    selectedIgnoredErrorCategories: string[],
}

export default class Settings extends React.Component<SettingsProps, SettingsState> {
    constructor(props: SettingsProps) {
        super(props);
        this.state = {
            allErrorCategories: {},
            selectedIgnoredErrorCategories: [],
        };
    }

    async componentDidMount() {
        this.loadSavedSettings();
        const allErrorCategories = await apiRequestErrorCategories();

        this.setState({
            allErrorCategories,
        });
    }

    loadSavedSettings = () => {
        const rawSettings = loadSettings(IGNORED_ERROR_CATEGORIES_KEY);
        if (!rawSettings) {
            return;
        }

        const ignoredErrorCategories = rawSettings.split(',');
        this.setState({
            selectedIgnoredErrorCategories: ignoredErrorCategories,
        });
    }

    saveSettings = () => {
        const errorCategoriesToSave = this.state.selectedIgnoredErrorCategories.join(',');
        saveSettings(IGNORED_ERROR_CATEGORIES_KEY, errorCategoriesToSave);
    }

    onChangeIgnoredErrorCategories = (key: string, checked: boolean) => {
        let currentSettings = this.state.selectedIgnoredErrorCategories;

        currentSettings = currentSettings.filter((k) => k !== key);
        if (checked) {
            currentSettings.push(key);
        }

        this.setState({
            selectedIgnoredErrorCategories: currentSettings,
        }, () => {
            this.saveSettings();
        });
    }

    close = () => {
        this.props.onClose();
    }

    render() {
        const ignoredCategoriesInput: JSX.Element[] = [];
        for (const categoryName of Object.keys(this.state.allErrorCategories)) {
            const categoryLocalizedName = this.state.allErrorCategories[categoryName];

            ignoredCategoriesInput.push(
                <Checkbox
                    value={categoryName}
                    key={categoryName}
                    label={categoryLocalizedName}
                    ariaLabel={categoryLocalizedName}
                    checked={this.state.selectedIgnoredErrorCategories.indexOf(categoryName) > -1}
                    onChange={(_, checked) => { this.onChangeIgnoredErrorCategories(categoryName, checked); }}
                />
            );
        }

        return (
            <div className='settings-pane'>
                <h2>Settings</h2>
                {ignoredCategoriesInput}
                <DefaultButton onClick={this.close}>Close</DefaultButton>
            </div>
        );
    }
}
