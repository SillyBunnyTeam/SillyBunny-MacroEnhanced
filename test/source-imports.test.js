import assert from 'node:assert/strict';
import { test } from 'node:test';

import { installStubContext } from './helpers/stub-context.js';

installStubContext({});

// Guards the extension's import discipline: every src module must load under a bare
// stubbed context (i.e. no deep imports into SillyBunny internals, no top-level
// getContext() calls with missing surface, no DOM access at import time).
const MODULES = [
    '../src/settings.js',
    '../src/engine-gate.js',
    '../src/registration.js',
    '../src/chat-state.js',
    '../src/state-impl.js',
    '../src/state-macros.js',
    '../src/utility-impl.js',
    '../src/utility-macros.js',
    '../src/lorebook-cache.js',
    '../src/lorebook-macros.js',
    '../src/custom/store.js',
    '../src/custom/compile.js',
    '../src/custom/registrar.js',
    '../src/workbench/sandbox.js',
];

for (const modulePath of MODULES) {
    test(`imports cleanly: ${modulePath}`, async () => {
        const module = await import(modulePath);
        assert.ok(module && typeof module === 'object');
    });
}

// The UI modules touch `document` at call time but must still IMPORT cleanly.
const UI_MODULES = [
    '../src/dom.js',
    '../src/custom/editor-ui.js',
    '../src/workbench/inspector.js',
    '../src/workbench/panel.js',
    '../src/drawer-ui.js',
    '../src/commands.js',
    '../index.js',
];

for (const modulePath of UI_MODULES) {
    test(`imports cleanly (UI): ${modulePath}`, async () => {
        const module = await import(modulePath);
        assert.ok(module && typeof module === 'object');
    });
}
