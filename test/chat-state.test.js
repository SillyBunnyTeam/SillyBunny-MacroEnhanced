import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { installStubContext } from './helpers/stub-context.js';

const {
    CHAT_STATE_VERSION,
    emptyState,
    getChatState,
    recordCharMessage,
    recordGeneration,
    recordSwipe,
    recordUserMessage,
} = await import('../src/chat-state.js');

beforeEach(() => {
    installStubContext({});
});

test('getChatState lazily creates a namespaced, versioned state inside chat metadata', () => {
    const { ctx } = installStubContext({});
    const state = getChatState();
    assert.ok(state);
    assert.equal(ctx.chatMetadata.MacroEnhanced, state, 'stored under our namespace');
    assert.equal(state.version, CHAT_STATE_VERSION);
    assert.deepEqual(state.frozen, {});
    assert.deepEqual(state.sticky, {});
    assert.deepEqual(state.daily, {});
    assert.deepEqual(state.rolls, {});
    assert.deepEqual(state.customMacros, []);
    assert.equal(state.counters.userMessages, 0);
    assert.ok(Number.isFinite(state.counters.firstSeenAt), 'firstSeenAt stamped on creation');
    assert.ok(ctx.chatMetadata.variables, 'core keys untouched');
});

test('getChatState returns null when no chat is loaded, without creating anything', () => {
    const { ctx: noId } = installStubContext({ ctx: { chatId: undefined } });
    assert.equal(getChatState(), null);
    assert.ok(!noId.chatMetadata.MacroEnhanced, 'nothing written without a chat');

    installStubContext({ ctx: { chatMetadata: null } });
    assert.equal(getChatState(), null);
});

test('getChatState repairs corrupted shapes and migrates old versions', () => {
    const { ctx } = installStubContext({});
    ctx.chatMetadata.MacroEnhanced = {
        version: 0,
        frozen: 'nope',
        sticky: [1, 2],
        counters: { userMessages: 'many' },
        customMacros: 'nope',
    };
    const state = getChatState();
    assert.equal(state.version, CHAT_STATE_VERSION, 'migrated');
    assert.deepEqual(state.frozen, {});
    assert.deepEqual(state.sticky, {});
    assert.deepEqual(state.daily, {});
    assert.deepEqual(state.rolls, {});
    assert.equal(state.counters.userMessages, 0, 'non-numeric counter reset');
    assert.ok(Number.isFinite(state.counters.firstSeenAt));
    assert.deepEqual(state.customMacros, []);
});

test('counter mutators bump their counter and queue a metadata save', () => {
    let saves = 0;
    installStubContext({ ctx: { saveMetadataDebounced: () => saves++ } });

    recordUserMessage();
    recordUserMessage();
    recordCharMessage();
    recordSwipe();
    recordGeneration();

    const state = getChatState();
    assert.equal(state.counters.userMessages, 2);
    assert.equal(state.counters.charMessages, 1);
    assert.equal(state.counters.swipes, 1);
    assert.equal(state.counters.generations, 1);
    assert.equal(saves, 5, 'every bump queues a save');
});

test('counter mutators are no-ops when no chat is loaded', () => {
    let saves = 0;
    const { ctx } = installStubContext({ ctx: { chatId: null, saveMetadataDebounced: () => saves++ } });
    recordUserMessage();
    recordSwipe();
    assert.equal(saves, 0);
    assert.ok(!ctx.chatMetadata.MacroEnhanced);
});

test('emptyState returns fresh objects each call', () => {
    const a = emptyState();
    const b = emptyState();
    assert.notEqual(a, b);
    assert.notEqual(a.frozen, b.frozen);
    a.frozen.x = { value: '1' };
    assert.deepEqual(b.frozen, {});
});
