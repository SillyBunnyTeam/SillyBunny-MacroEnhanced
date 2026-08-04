export const MODULE_NAME = 'MacroEnhanced';

const SETTINGS_VERSION = 3;

function defaultSettings() {
    return {
        settingsVersion: SETTINGS_VERSION,
        customMacros: [],
        auditor: { manualCachingAtDepth: null },
        compatExpressions: false,
    };
}

function migrate(settings) {
    // v1 -> v2: added the Cache Auditor preferences.
    if (!settings.auditor || typeof settings.auditor !== 'object') {
        settings.auditor = { manualCachingAtDepth: null };
    }
    // v2 -> v3: added compat mode. Off for existing installs -- it changes what
    // {{if}} means, so it is never turned on behind someone's back.
    if (typeof settings.compatExpressions !== 'boolean') {
        settings.compatExpressions = false;
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
    if (typeof settings.compatExpressions !== 'boolean') {
        settings.compatExpressions = false;
    }

    return settings;
}

export function saveSettings() {
    SillyTavern.getContext().saveSettingsDebounced();
}
