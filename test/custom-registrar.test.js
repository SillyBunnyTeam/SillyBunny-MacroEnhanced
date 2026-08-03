import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { createStubRegistry, installStubContext } from './helpers/stub-context.js';

const { getRegisteredCustomNames, syncRegistrations, teardownCustomRegistrations } = await import('../src/custom/registrar.js');
const { teardownRegistrations } = await import('../src/registration.js');
const store = await import('../src/custom/store.js');

let registry;
let ctx;

beforeEach(() => {
    teardownCustomRegistrations();
    teardownRegistrations();
    registry = createStubRegistry();
    ({ ctx } = installStubContext({ registry }));
});

test('chat-scoped defs register, and drop again after a chat switch re-sync', () => {
    store.saveChatDefs([store.createDef({ name: 'scenegreet', template: 'chat template' })]);
    syncRegistrations();
    assert.ok(registry.hasMacro('scenegreet'), 'registered from the chat scope');
    assert.ok(getRegisteredCustomNames().includes('scenegreet'));

    // CHAT_CHANGED: the host reassigns chat metadata; the new chat has no defs.
    ctx.chatMetadata = { variables: {} };
    syncRegistrations();
    assert.ok(!registry.hasMacro('scenegreet'), 'unregistered after the switch');
    assert.ok(!getRegisteredCustomNames().includes('scenegreet'));
});

test('a chat def overrides a same-named global def and yields back when removed', () => {
    store.saveGlobalDefs([store.createDef({ name: 'greet', template: 'global template' })]);
    store.saveChatDefs([store.createDef({ name: 'greet', template: 'chat template' })]);
    syncRegistrations();
    assert.ok(registry.hasMacro('greet'));
    assert.equal(getRegisteredCustomNames().length, 1, 'one registration for the shared name');

    store.saveChatDefs([]);
    syncRegistrations();
    assert.ok(registry.hasMacro('greet'), 'global def takes over after the chat def is gone');
});

test('editing a chat def changes its fingerprint and re-registers it', () => {
    const def = store.createDef({ name: 'mood', template: 'v1' });
    store.saveChatDefs([def]);
    syncRegistrations();
    const before = registry.getMacro('mood');

    store.saveChatDefs([{ ...def, template: 'v2' }]);
    syncRegistrations();
    const after = registry.getMacro('mood');
    assert.ok(after, 'still registered');
    assert.notEqual(after, before, 'a fresh registration replaced the stale one');
});
