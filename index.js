import { isEngineAvailable } from './src/engine-gate.js';
import { getSettings } from './src/settings.js';
import { teardownRegistrations } from './src/registration.js';
import { registerUtilityMacros } from './src/utility-macros.js';
import { registerLorebookMacros } from './src/lorebook-macros.js';
import { clearCache, prewarm, indexBook, setActiveEntries } from './src/lorebook-cache.js';
import { syncRegistrations, teardownCustomRegistrations } from './src/custom/registrar.js';
import { registerCommands, setCommandsActive } from './src/commands.js';
import { removeDrawer, renderDrawer } from './src/drawer-ui.js';
import { closeWorkbench } from './src/workbench/panel.js';

const subscriptions = [];
let initialized = false;
let macrosRegistered = false;

function subscribe(eventType, handler) {
    if (!eventType) {
        return;
    }
    const { eventSource } = SillyTavern.getContext();
    eventSource.on(eventType, handler);
    subscriptions.push({ eventType, handler });
}

function activateMacros() {
    if (macrosRegistered || !isEngineAvailable()) {
        return;
    }
    macrosRegistered = true;
    registerUtilityMacros();
    registerLorebookMacros();
    syncRegistrations();
    const ctx = SillyTavern.getContext();
    prewarm(ctx);
}

export function init() {
    if (initialized) {
        setCommandsActive(true);
        activateMacros();
        registerCommands();
        renderDrawer({ engineAvailable: isEngineAvailable() });
        return;
    }

    initialized = true;
    setCommandsActive(true);
    const ctx = SillyTavern.getContext();
    const events = ctx.eventTypes;

    getSettings();
    activateMacros();
    registerCommands();
    renderDrawer({ engineAvailable: isEngineAvailable() });

    subscribe(events.APP_READY, () => {
        if (!initialized) {
            return;
        }
        activateMacros();
        registerCommands();
        renderDrawer({ engineAvailable: isEngineAvailable() });
        if (macrosRegistered) {
            prewarm(SillyTavern.getContext());
        }
    });

    // Hot-activate when the experimental engine flag is switched on after boot.
    subscribe(events.SETTINGS_UPDATED, () => {
        if (!initialized) {
            return;
        }
        const available = isEngineAvailable();
        if (available && !macrosRegistered) {
            activateMacros();
            renderDrawer({ engineAvailable: true });
        } else if (!available && macrosRegistered) {
            renderDrawer({ engineAvailable: false });
        }
    });

    subscribe(events.CHAT_CHANGED, () => {
        if (!initialized || !macrosRegistered) {
            return;
        }
        closeWorkbench();
        const liveCtx = SillyTavern.getContext();
        prewarm(liveCtx);
        // Character-scoped custom macros follow the chat.
        syncRegistrations();
        renderDrawer({ engineAvailable: true });
    });

    subscribe(events.WORLDINFO_SETTINGS_UPDATED, () => {
        if (initialized && macrosRegistered) {
            prewarm(SillyTavern.getContext());
        }
    });

    subscribe(events.WORLDINFO_UPDATED, (name, data) => {
        if (initialized && macrosRegistered && name && data) {
            indexBook(name, data);
        }
    });

    subscribe(events.WORLD_INFO_ACTIVATED, (entries) => {
        if (initialized && macrosRegistered) {
            setActiveEntries(entries);
        }
    });
}

export function deactivate() {
    if (!initialized) {
        return;
    }
    initialized = false;

    setCommandsActive(false);
    closeWorkbench();
    teardownCustomRegistrations();
    teardownRegistrations();
    macrosRegistered = false;
    clearCache();
    removeDrawer();

    const { eventSource } = SillyTavern.getContext();
    while (subscriptions.length) {
        const { eventType, handler } = subscriptions.pop();
        eventSource.removeListener(eventType, handler);
    }
}
