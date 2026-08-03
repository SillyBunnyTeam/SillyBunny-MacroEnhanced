import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { installStubContext, makeExecutionContext } from './helpers/stub-context.js';

const {
    SHADOWED_GLOBAL,
    SHADOWED_LOCAL,
    createSandbox,
    createSandboxStore,
    findUnshadowedVariableMacros,
    flattenChatState,
    getShadowedNames,
} = await import('../src/workbench/sandbox.js');
const { emptyState } = await import('../src/chat-state.js');
const { STATEFUL_MACRO_NAMES, registerStateMacros } = await import('../src/state-macros.js');
const { teardownRegistrations } = await import('../src/registration.js');

beforeEach(() => {
    installStubContext({});
});

function call(override, args) {
    const { context } = makeExecutionContext({ unnamedArgs: args });
    return override.handler(context);
}

test('shadow list covers every variable macro and alias the fork ships', () => {
    // Executable checklist against public/scripts/macros/definitions/variable-macros.js.
    const expected = [
        'setvar', 'addvar', 'incvar', 'decvar', 'getvar', 'hasvar', 'varexists', 'deletevar', 'flushvar',
        'setglobalvar', 'addglobalvar', 'incglobalvar', 'decglobalvar', 'getglobalvar', 'hasglobalvar',
        'globalvarexists', 'deleteglobalvar', 'flushglobalvar',
    ];
    const shadowed = new Set(getShadowedNames());
    for (const name of expected) {
        assert.ok(shadowed.has(name), `variable macro "${name}" must be shadowed`);
    }
    assert.equal(shadowed.size, expected.length, 'no stale entries in the shadow list either');
});

test('copy-on-write store: reads fall through, writes stay in the overlay', () => {
    const real = { hp: '50', name: 'Ann' };
    const store = createSandboxStore(() => real);

    assert.equal(store.get('hp'), '50');
    store.set('hp', '99');
    assert.equal(store.get('hp'), '99');
    assert.equal(real.hp, '50', 'real store untouched');

    store.del('name');
    assert.equal(store.get('name'), undefined);
    assert.equal(store.has('name'), false);
    assert.equal(real.name, 'Ann');

    assert.equal(store.inc('hp'), 100);
    assert.equal(store.dec('counter'), -1, 'missing vars start from 0');
    store.add('hp', '5');
    assert.equal(store.get('hp'), '105');
    store.add('name', 'ie');
    assert.equal(store.get('name'), 'ie', 'add on deleted var starts fresh');

    const changes = store.changes();
    assert.deepEqual(changes.get('hp'), { before: '50', after: '105' });
    assert.deepEqual(changes.get('name'), { before: 'Ann', after: 'ie' });

    store.reset();
    assert.equal(store.get('hp'), '50');
    assert.equal(store.changes().size, 0);
});

test('changes() reports deletes and omits no-op writes', () => {
    const real = { a: '1' };
    const store = createSandboxStore(() => real);
    store.set('a', '1');
    assert.equal(store.changes().size, 0, 'same-value write is not a change');
    store.del('a');
    assert.deepEqual(store.changes().get('a'), { before: '1', after: undefined });
});

test('changes() compares by string value: numbers in the real store are not false positives', () => {
    const real = { hp: 5, label: 7 };
    const store = createSandboxStore(() => real);
    store.set('hp', '5');
    assert.equal(store.changes().size, 0, 'number 5 set to "5" is not a change');
    store.set('label', '8');
    assert.deepEqual(store.changes().get('label'), { before: 7, after: '8' });
});

test('dynamicMacros overrides read and write only the sandbox', () => {
    const localReal = { mood: 'calm' };
    const globalReal = { visits: '3' };
    const sandbox = createSandbox({ getLocalStore: () => localReal, getGlobalStore: () => globalReal });
    const overrides = sandbox.dynamicMacros;

    assert.equal(call(overrides.getvar, ['mood']), 'calm');
    call(overrides.setvar, ['mood', 'wild']);
    assert.equal(call(overrides.getvar, ['mood']), 'wild');
    assert.equal(localReal.mood, 'calm');

    assert.equal(call(overrides.incglobalvar, ['visits']), '4');
    assert.equal(globalReal.visits, '3');

    assert.equal(call(overrides.hasvar, ['mood']), 'true');
    assert.equal(call(overrides.varexists, ['mood']), 'true', 'aliases are shadowed too');
    call(overrides.deletevar, ['mood']);
    assert.equal(call(overrides.flushglobalvar, ['visits']), '');
    assert.equal(call(overrides.hasvar, ['mood']), 'false');
    assert.equal(call(overrides.hasglobalvar, ['visits']), 'false');
    assert.equal(localReal.mood, 'calm');
    assert.equal(globalReal.visits, '3');
});

test('every shadowed name has an override with a handler', () => {
    const sandbox = createSandbox({ getLocalStore: () => ({}), getGlobalStore: () => ({}) });
    for (const name of getShadowedNames()) {
        assert.equal(typeof sandbox.dynamicMacros[name]?.handler, 'function', `override missing for ${name}`);
    }
});

test('run() restores shorthand writes in place and records them as pending', () => {
    const localReal = { x: '1' };
    const globalReal = {};
    const sandbox = createSandbox({ getLocalStore: () => localReal, getGlobalStore: () => globalReal });

    const result = sandbox.run((input) => {
        // Simulate what {{.x = 42}}{{$new ||= hi}} does: direct writes to the real stores.
        localReal.x = '42';
        globalReal.new = 'hi';
        return `${input}:done`;
    }, 'text');

    assert.equal(result, 'text:done');
    assert.equal(localReal.x, '1', 'shorthand local write reverted');
    assert.equal(globalReal.new, undefined, 'shorthand global write reverted');

    const pending = sandbox.pendingChanges();
    assert.deepEqual(pending.local.get('x'), { before: '1', after: '42' });
    assert.deepEqual(pending.global.get('new'), { before: undefined, after: 'hi' });
});

test('run() restores even when evaluation throws', () => {
    const localReal = { x: '1' };
    const sandbox = createSandbox({ getLocalStore: () => localReal, getGlobalStore: () => ({}) });

    assert.throws(() => sandbox.run(() => {
        localReal.x = 'corrupt';
        throw new Error('boom');
    }, 'text'));
    assert.equal(localReal.x, '1');
});

test('pendingChanges merges overlay writes with shorthand diffs; reset clears both', () => {
    const localReal = { x: '1' };
    const sandbox = createSandbox({ getLocalStore: () => localReal, getGlobalStore: () => ({}) });

    call(sandbox.dynamicMacros.setvar, ['y', '5']);
    sandbox.run(() => {
        localReal.x = '9';
        return '';
    }, '');

    const pending = sandbox.pendingChanges();
    assert.deepEqual(pending.local.get('y'), { before: undefined, after: '5' });
    assert.deepEqual(pending.local.get('x'), { before: '1', after: '9' });

    sandbox.reset();
    const cleared = sandbox.pendingChanges();
    assert.equal(cleared.local.size, 0);
    assert.equal(cleared.global.size, 0);
});

test('findUnshadowedVariableMacros flags variable-category macros outside the shadow list', () => {
    const { registry } = installStubContext({});
    registry.registerMacro('setvarkey', { category: 'variable', handler: () => '' });
    registry.registerMacro('upper', { category: 'enhanced-text', handler: () => '' });
    registry.registerMacro('setvar', { category: 'variable', handler: () => '' });

    assert.deepEqual(findUnshadowedVariableMacros(registry), ['setvarkey']);
});

test('local and global shadow sets do not overlap', () => {
    const local = new Set(Object.values(SHADOWED_LOCAL).flat());
    for (const name of Object.values(SHADOWED_GLOBAL).flat()) {
        assert.ok(!local.has(name), `${name} appears in both local and global shadow sets`);
    }
});

// ---- Layer C: chat-state overlay ----

function makeChatState() {
    const state = emptyState();
    state.frozen.weather = { value: 'stormy', frozenAt: 1 };
    state.counters.userMessages = 4;
    return state;
}

test('chatState overlay is an independent clone of the real state', () => {
    const real = makeChatState();
    const sandbox = createSandbox({
        getLocalStore: () => ({}), getGlobalStore: () => ({}), getChatState: () => real,
    });

    assert.deepEqual(sandbox.chatState.frozen, real.frozen);
    sandbox.chatState.frozen.newkey = { value: 'sandboxed', frozenAt: 2 };
    sandbox.chatState.counters.userMessages = 99;
    assert.ok(!real.frozen.newkey, 'real state untouched');
    assert.equal(real.counters.userMessages, 4);

    const pending = sandbox.pendingChanges();
    assert.deepEqual(pending.chat.get('frozen:newkey'), { before: undefined, after: 'sandboxed' });
    assert.deepEqual(pending.chat.get('counter:userMessages'), { before: '4', after: '99' });
});

test('createSandbox without a chat falls back to an empty state overlay', () => {
    const sandbox = createSandbox({ getLocalStore: () => ({}), getGlobalStore: () => ({}) });
    assert.deepEqual(sandbox.chatState.frozen, {});
    assert.equal(sandbox.pendingChanges().chat.size, 0);
});

test('run() restores real chat-state writes (Layer C backstop) and records them', () => {
    const real = makeChatState();
    const sandbox = createSandbox({
        getLocalStore: () => ({}), getGlobalStore: () => ({}), getChatState: () => real,
    });

    sandbox.run(() => {
        // Simulate an undisciplined stateful handler writing the REAL state.
        real.frozen.leak = { value: 'oops', frozenAt: 3 };
        real.counters.swipes = 42;
        return '';
    }, '');

    assert.ok(!real.frozen.leak, 'leaked write restored');
    assert.equal(real.counters.swipes, 0);
    const pending = sandbox.pendingChanges();
    assert.deepEqual(pending.chat.get('frozen:leak'), { before: undefined, after: 'oops' });
});

test('reset() re-clones the chat-state overlay in place', () => {
    const real = makeChatState();
    const sandbox = createSandbox({
        getLocalStore: () => ({}), getGlobalStore: () => ({}), getChatState: () => real,
    });
    const overlayRef = sandbox.chatState;
    overlayRef.frozen.newkey = { value: 'sandboxed', frozenAt: 2 };

    sandbox.reset();
    assert.equal(sandbox.chatState, overlayRef, 'same object identity (panel holds a reference)');
    assert.ok(!overlayRef.frozen.newkey);
    assert.equal(sandbox.pendingChanges().chat.size, 0);
});

test('flattenChatState covers every value kind and skips firstSeenAt', () => {
    const state = emptyState();
    state.frozen.a = { value: '1' };
    state.sticky.b = { value: '2', atUserCount: 0 };
    state.daily.c = { value: '3', day: '2026-01-01' };
    state.rolls.d = { value: '4', formula: 'd6' };
    const flat = flattenChatState(state);
    assert.equal(flat['frozen:a'], '1');
    assert.equal(flat['sticky:b'], '2');
    assert.equal(flat['daily:c'], '3');
    assert.equal(flat['rolls:d'], '4');
    assert.equal(flat['counter:userMessages'], '0');
    assert.ok(!('counter:firstSeenAt' in flat), 'creation stamp is not a diffable value');
});

test('every STATEFUL_MACRO_NAMES entry is a registered enhanced-state macro', () => {
    teardownRegistrations();
    const { registry } = installStubContext({});
    registerStateMacros();
    for (const name of STATEFUL_MACRO_NAMES) {
        const definition = registry.getMacro(name);
        assert.ok(definition, `${name} not registered`);
        assert.equal(definition.category, 'enhanced-state');
    }
});
