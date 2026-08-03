export const MODULE_NAME = 'MacroEnhanced';

const SETTINGS_VERSION = 1;

function defaultSettings() {
    return {
        settingsVersion: SETTINGS_VERSION,
        enabled: true,
        customMacros: [],
    };
}

function migrate(settings) {
    // v1 is the first schema; future migrations chain here.
    settings.settingsVersion = SETTINGS_VERSION;
    return settings;
}

export function getSettings() {
    const ctx = SillyTavern.getContext();
    const container = ctx.extensionSettings;

    if (!container[MODULE_NAME] || typeof container[MODULE_NAME] !== 'object') {
        container[MODULE_NAME] = defaultSettings();
    }

    const settings = container[MODULE_NAME];

    if (settings.settingsVersion !== SETTINGS_VERSION) {
        migrate(settings);
    }
    if (!Array.isArray(settings.customMacros)) {
        settings.customMacros = [];
    }
    if (typeof settings.enabled !== 'boolean') {
        settings.enabled = true;
    }

    return settings;
}

export function saveSettings() {
    SillyTavern.getContext().saveSettingsDebounced();
}
