export const MODULE_NAME = 'MacroEnhanced';

const SETTINGS_VERSION = 2;

function defaultSettings() {
    return {
        settingsVersion: SETTINGS_VERSION,
        customMacros: [],
        auditor: { manualCachingAtDepth: null },
    };
}

function migrate(settings) {
    // v1 -> v2: added the Cache Auditor preferences.
    if (!settings.auditor || typeof settings.auditor !== 'object') {
        settings.auditor = { manualCachingAtDepth: null };
    }
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
    if (!settings.auditor || typeof settings.auditor !== 'object') {
        settings.auditor = { manualCachingAtDepth: null };
    }

    return settings;
}

export function saveSettings() {
    SillyTavern.getContext().saveSettingsDebounced();
}
