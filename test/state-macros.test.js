import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { createStubRegistry, installStubContext, makeExecutionContext } from './helpers/stub-context.js';

const { CATEGORY_STATE, STATEFUL_MACRO_NAMES, registerStateMacros, resetStateRecursion } = await import('../src/state-macros.js');
const { emptyState, getChatState } = await import('../src/chat-state.js');
const { teardownRegistrations } = await import('../src/registration.js');

let registry;
let stub;

beforeEach(() => {
    teardownRegistrations();
    resetStateRecursion();
    registry = createStubRegistry();
    stub = installStubContext({ registry });
    registerStateMacros();
});

function run(name, args, { env, resolve } = {}) {
    const definition = registry.getMacro(name);
    assert.ok(definition, `macro ${name} should be registered`);
    const { context, warnings } = makeExecutionContext({ unnamedArgs: args, env, resolve });
    return { result: definition.handler(context), warnings, context };
}

test('all state macros land in the registry under enhanced-state with me- aliases', () => {
    const expected = [
        'freeze', 'sticky', 'daily', 'rollonce', 'listpick',
        'timeofday', 'season', 'chatdays',
        'usermsgcount', 'charmsgcount', 'swipecount', 'gencount',
    ];
    for (const name of expected) {
        const definition = registry.getMacro(name);
        assert.ok(definition, `${name} missing`);
        assert.equal(definition.category, CATEGORY_STATE);
        assert.ok(registry.hasMacro(`me-${name}`), `${name} lacks its hidden me- alias`);
    }
    for (const name of STATEFUL_MACRO_NAMES) {
        assert.ok(expected.includes(name), `stateful name ${name} is a registered state macro`);
    }
});

test('freeze resolves its content exactly once and returns the stored value after', () => {
    let resolutions = 0;
    const resolve = (text) => (text === 'CONTENT' ? `v${++resolutions}` : text);

    const first = run('freeze', ['mykey', 'CONTENT'], { resolve });
    assert.equal(first.result, 'v1');
    assert.equal(first.warnings.length, 0);
    assert.equal(stub.ctx.chatMetadata.MacroEnhanced.frozen.mykey.value, 'v1');

    const second = run('freeze', ['mykey', 'CONTENT'], { resolve });
    assert.equal(second.result, 'v1', 'stored value returned');
    assert.equal(resolutions, 1, 'content was NOT re-resolved — the cache win');
});

test('freeze with an invalid key or no chat still resolves, but persists nothing', () => {
    const resolve = (text) => (text === 'CONTENT' ? 'resolved' : text);
    const badKey = run('freeze', ['no spaces allowed', 'CONTENT'], { resolve });
    assert.equal(badKey.result, 'resolved');
    assert.equal(badKey.warnings.length, 1);
    assert.ok(!stub.ctx.chatMetadata.MacroEnhanced?.frozen?.['no spaces allowed']);

    installStubContext({ ctx: { chatId: undefined } });
    const noChat = run('freeze', ['mykey', 'CONTENT'], { resolve });
    assert.equal(noChat.result, 'resolved');
    assert.equal(noChat.warnings.length, 1);
});

test('freeze stops self-reference instead of looping', () => {
    const definition = registry.getMacro('freeze');
    // Simulate {{freeze::k::...{{freeze::k::...}}...}}: resolving the outer content
    // re-enters the handler with the same key.
    const innerWarnings = [];
    const resolve = (text) => {
        if (text !== 'OUTER') {
            return text;
        }
        const { context, warnings } = makeExecutionContext({ unnamedArgs: ['k', 'inner'] });
        const innerResult = definition.handler(context);
        innerWarnings.push(...warnings);
        return `outer(${innerResult})`;
    };
    const outer = run('freeze', ['k', 'OUTER'], { resolve });
    assert.equal(outer.result, 'outer()', 'inner self-reference collapsed to empty');
    assert.equal(innerWarnings.length, 1, 'the inner expansion warned');
    assert.equal(stub.ctx.chatMetadata.MacroEnhanced.frozen.k.value, 'outer()', 'outer result stored');
});

test('sticky refreshes only after N user messages', () => {
    let resolutions = 0;
    const resolve = (text) => (text === 'CONTENT' ? `v${++resolutions}` : text);
    const state = getChatState();

    state.counters.userMessages = 0;
    assert.equal(run('sticky', ['2', 'mood', 'CONTENT'], { resolve }).result, 'v1');
    state.counters.userMessages = 1;
    assert.equal(run('sticky', ['2', 'mood', 'CONTENT'], { resolve }).result, 'v1', 'within the window');
    state.counters.userMessages = 2;
    assert.equal(run('sticky', ['2', 'mood', 'CONTENT'], { resolve }).result, 'v2', 'window elapsed');
    assert.equal(resolutions, 2);

    const bad = run('sticky', ['zero?', 'mood', 'CONTENT'], { resolve });
    assert.equal(bad.warnings.length, 1, 'non-numeric period warns');
    assert.equal(bad.result, 'v3', 'still resolves as a passthrough');
});

test('daily stores per-calendar-day and reuses the value within the same day', () => {
    let resolutions = 0;
    const resolve = (text) => (text === 'CONTENT' ? `v${++resolutions}` : text);

    assert.equal(run('daily', ['forecast', 'CONTENT'], { resolve }).result, 'v1');
    assert.equal(run('daily', ['forecast', 'CONTENT'], { resolve }).result, 'v1', 'same day');
    assert.equal(resolutions, 1);

    const state = getChatState();
    state.daily.forecast.day = '1999-01-01';
    assert.equal(run('daily', ['forecast', 'CONTENT'], { resolve }).result, 'v2', 'stale day refreshes');
});

test('rollonce rolls once, keeps the total, and re-rolls when the formula changes', () => {
    const first = run('rollonce', ['str', '3d6']);
    const total = Number(first.result);
    assert.ok(total >= 3 && total <= 18);
    assert.equal(run('rollonce', ['str', '3d6']).result, first.result, 'stable on re-evaluation');

    const changed = run('rollonce', ['str', '1d4+10']);
    assert.equal(changed.warnings.length, 1, 'formula change warns');
    const newTotal = Number(changed.result);
    assert.ok(newTotal >= 11 && newTotal <= 14);

    const bad = run('rollonce', ['str', 'banana']);
    assert.equal(bad.result, '');
    assert.equal(bad.warnings.length, 1);
});

test('listpick is deterministic per chat seed and key', () => {
    stub.ctx.chatMetadata.chat_id_hash = 12345;
    const first = run('listpick', ['weather', 'sunny, rainy, misty']);
    assert.ok(['sunny', 'rainy', 'misty'].includes(first.result));
    assert.equal(run('listpick', ['weather', 'sunny, rainy, misty']).result, first.result);

    const empty = run('listpick', ['weather', '']);
    assert.equal(empty.result, '');
    assert.equal(empty.warnings.length, 1);
});

test('coarse time macros return their buckets', () => {
    assert.ok(['morning', 'afternoon', 'evening', 'night'].includes(run('timeofday', []).result));
    assert.ok(['spring', 'summer', 'autumn', 'winter'].includes(run('season', ['']).result));
    assert.ok(['spring', 'summer', 'autumn', 'winter'].includes(run('season', ['south']).result));
});

test('chatdays counts whole days from the first message send_date', () => {
    stub.ctx.chat.push({ send_date: Date.now() - 3 * 86400000 - 60000 });
    assert.equal(run('chatdays', []).result, '3');
});

test('chatdays falls back to firstSeenAt, then warns without any chat', () => {
    getChatState();
    assert.equal(run('chatdays', []).result, '0', 'firstSeenAt fallback (just created)');

    installStubContext({ ctx: { chatId: undefined } });
    const noChat = run('chatdays', []);
    assert.equal(noChat.result, '');
    assert.equal(noChat.warnings.length, 1);
});

test('counter macros read event-maintained counters', () => {
    const state = getChatState();
    state.counters.userMessages = 7;
    state.counters.charMessages = 6;
    state.counters.swipes = 2;
    state.counters.generations = 9;
    assert.equal(run('usermsgcount', []).result, '7');
    assert.equal(run('charmsgcount', []).result, '6');
    assert.equal(run('swipecount', []).result, '2');
    assert.equal(run('gencount', []).result, '9');

    installStubContext({ ctx: { chatId: undefined } });
    const noChat = run('usermsgcount', []);
    assert.equal(noChat.result, '0');
    assert.equal(noChat.warnings.length, 1);
});

test('every stateful macro honours the sandbox overlay and skips persistence', () => {
    let saves = 0;
    stub = installStubContext({ registry, ctx: { saveMetadataDebounced: () => saves++ } });
    const sandboxState = emptyState();
    sandboxState.counters.userMessages = 5;
    const env = { extra: { meSandboxState: sandboxState } };

    const contentAs = (value) => (text) => (text === 'CONTENT' ? value : text);
    run('freeze', ['fk', 'CONTENT'], { env, resolve: contentAs('frozen!') });
    run('sticky', ['3', 'sk', 'CONTENT'], { env, resolve: contentAs('sticky!') });
    run('daily', ['dk', 'CONTENT'], { env, resolve: contentAs('daily!') });
    run('rollonce', ['rk', 'd6'], { env });

    assert.equal(sandboxState.frozen.fk.value, 'frozen!');
    assert.equal(sandboxState.sticky.sk.value, 'sticky!');
    assert.equal(sandboxState.sticky.sk.atUserCount, 5, 'sticky reads sandbox counters');
    assert.equal(sandboxState.daily.dk.value, 'daily!');
    assert.ok(sandboxState.rolls.rk);

    assert.ok(!stub.ctx.chatMetadata.MacroEnhanced, 'real chat state never created');
    assert.equal(saves, 0, 'no metadata saves while sandboxed');
});
