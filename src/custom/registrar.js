import { safeRegister, safeUnregister } from '../registration.js';
import { compileDef } from './compile.js';
import { getEffectiveDefs } from './store.js';

/** @type {Map<string, string>} registered custom macro name (lower) -> fingerprint */
const registered = new Map();

function fingerprint(def, scope) {
    return JSON.stringify([scope, def.id, def.name, def.description, def.template, def.args]);
}

/**
 * Brings the engine registry in line with the stored definitions. Called on init,
 * after every editor save, and on CHAT_CHANGED (character defs follow the chat).
 */
export function syncRegistrations() {
    const ctx = SillyTavern.getContext();
    const engine = ctx.macros?.engine;
    if (!engine) {
        return;
    }

    const desired = new Map();
    for (const { def, scope } of getEffectiveDefs()) {
        desired.set(def.name.toLowerCase(), { def, scope });
    }

    for (const [nameKey] of [...registered]) {
        const want = desired.get(nameKey);
        if (!want || fingerprint(want.def, want.scope) !== registered.get(nameKey)) {
            safeUnregister(nameKey);
            registered.delete(nameKey);
        }
    }

    for (const [nameKey, { def, scope }] of desired) {
        if (registered.has(nameKey)) {
            continue;
        }
        const actualName = safeRegister(def.name, compileDef(def, { engine }));
        if (actualName) {
            registered.set(nameKey, fingerprint(def, scope));
        }
    }
}

export function teardownCustomRegistrations() {
    for (const nameKey of registered.keys()) {
        safeUnregister(nameKey);
    }
    registered.clear();
}

/** Currently live custom macro names (for the drawer and /me-macros). */
export function getRegisteredCustomNames() {
    return [...registered.keys()];
}
