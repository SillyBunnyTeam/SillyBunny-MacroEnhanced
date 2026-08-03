import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { createStubRegistry, installStubContext } from './helpers/stub-context.js';

const store = await import('../src/custom/store.js');

let registry;
let ctx;

beforeEach(() => {
    registry = createStubRegistry();
    ({ ctx } = installStubContext({ registry }));
});

test('validateDef accepts a sound definition', () => {
    const def = store.createDef({ name: 'greet', template: 'Hello {{who}}', args: [{ name: 'who' }] });
    assert.deepEqual(store.validateDef(def, { registry }), []);
});

test('validateDef rejects bad names, empty templates and reserved names', () => {
    assert.ok(store.validateDef(store.createDef({ name: '', template: 'x' }), {}).length);
    assert.ok(store.validateDef(store.createDef({ name: '1abc', template: 'x' }), {}).length);
    assert.ok(store.validateDef(store.createDef({ name: 'has space', template: 'x' }), {}).length);
    assert.ok(store.validateDef(store.createDef({ name: 'ok', template: '' }), {}).length);
    assert.ok(store.validateDef(store.createDef({ name: 'setvarkey', template: 'x' }), {})
        .some(problem => problem.includes('reserved')));
});

test('validateDef refuses names owned by other sources', () => {
    registry.setSource('core');
    registry.registerMacro('roll', { handler: () => '' });

    assert.ok(store.validateDef(store.createDef({ name: 'roll', template: 'x' }), { registry })
        .some(problem => problem.includes('already exists')));
});

test('validateDef refuses our own built-in names but allows known custom defs', () => {
    registry.setSource('MacroEnhanced');
    registry.registerMacro('upper', { handler: () => '' });
    registry.registerMacro('mine', { handler: () => '' });

    // "upper" is ours in the registry but NOT a custom def -> it is a built-in; refuse.
    assert.ok(store.validateDef(store.createDef({ name: 'upper', template: 'x' }), { registry, customNames: ['mine'] })
        .some(problem => problem.includes('built-in')));
    // "mine" is ours AND a known custom def (edit / char-overrides-global) -> fine.
    assert.deepEqual(store.validateDef(store.createDef({ name: 'mine', template: 'x' }), { registry, customNames: ['mine'] }), []);
    // Without customNames, an entry we own counts as built-in.
    assert.ok(store.validateDef(store.createDef({ name: 'mine', template: 'x' }), { registry })
        .some(problem => problem.includes('built-in')));
});

test('validateDef refuses the me- fallback prefix', () => {
    assert.ok(store.validateDef(store.createDef({ name: 'me-upper', template: 'x' }), {})
        .some(problem => problem.includes('me-')));
    assert.ok(store.validateDef(store.createDef({ name: 'ME-thing', template: 'x' }), {})
        .some(problem => problem.includes('me-')));
});

test('validateDef enforces sibling uniqueness and arg rules', () => {
    const sibling = store.createDef({ name: 'greet', template: 'x' });
    const def = store.createDef({ name: 'GREET', template: 'x' });
    assert.ok(store.validateDef(def, { siblings: [sibling] }).some(problem => problem.includes('already have')));

    const dupArgs = store.createDef({ name: 'ok', template: 'x', args: [{ name: 'a' }, { name: 'A' }] });
    assert.ok(store.validateDef(dupArgs, {}).some(problem => problem.includes('Duplicate')));

    const gap = store.createDef({ name: 'ok', template: 'x', args: [{ name: 'a', optional: true }, { name: 'b' }] });
    assert.ok(store.validateDef(gap, {}).some(problem => problem.includes('Optional arguments')));
});

test('getEffectiveDefs: character defs override same-named globals; disabled defs drop out', async () => {
    store.saveGlobalDefs([
        store.createDef({ name: 'greet', template: 'global greet' }),
        store.createDef({ name: 'other', template: 'global other' }),
        store.createDef({ name: 'off', template: 'x', enabled: false }),
    ]);
    ctx.characterId = 0;
    ctx.characters[0] = { data: { extensions: {} } };
    await store.saveCharacterDefs([store.createDef({ name: 'GREET', template: 'char greet' })]);

    const effective = store.getEffectiveDefs();
    assert.equal(effective.length, 2);
    const greet = effective.find(({ def }) => def.name.toLowerCase() === 'greet');
    assert.equal(greet.scope, store.SCOPE_CHARACTER);
    assert.equal(greet.def.template, 'char greet');
    assert.equal(effective.find(({ def }) => def.name === 'other').scope, store.SCOPE_GLOBAL);
});

test('getEffectiveDefs: chat defs beat character AND global for the same name', async () => {
    store.saveGlobalDefs([store.createDef({ name: 'greet', template: 'global greet' })]);
    ctx.characterId = 0;
    ctx.characters[0] = { data: { extensions: {} } };
    await store.saveCharacterDefs([store.createDef({ name: 'greet', template: 'char greet' })]);
    store.saveChatDefs([
        store.createDef({ name: 'Greet', template: 'chat greet' }),
        store.createDef({ name: 'chatonly', template: 'only here' }),
    ]);

    const effective = store.getEffectiveDefs();
    assert.equal(effective.length, 2);
    const greet = effective.find(({ def }) => def.name.toLowerCase() === 'greet');
    assert.equal(greet.scope, store.SCOPE_CHAT);
    assert.equal(greet.def.template, 'chat greet');
    assert.equal(effective.find(({ def }) => def.name === 'chatonly').scope, store.SCOPE_CHAT);
});

test('chat defs live in chat metadata and follow the chat', () => {
    store.saveChatDefs([store.createDef({ name: 'here', template: 'x' })]);
    assert.equal(ctx.chatMetadata.MacroEnhanced.customMacros.length, 1, 'stored in the chat state');
    assert.equal(store.getChatDefs().length, 1);
    assert.ok(store.getAllCustomNames().includes('here'));

    // A chat switch reassigns the metadata object; the defs must follow it.
    ctx.chatMetadata = { variables: {} };
    assert.deepEqual(store.getChatDefs(), [], 'fresh chat, no defs');
});

test('saveChatDefs queues a background metadata save', () => {
    let saves = 0;
    ({ ctx } = installStubContext({ registry, ctx: { saveMetadataDebounced: () => saves++ } }));
    store.saveChatDefs([store.createDef({ name: 'x', template: 'y' })]);
    assert.equal(saves, 1);
});

test('saveCharacterDefs requires a selected character; saveChatDefs requires a chat', async () => {
    ctx.characterId = undefined;
    await assert.rejects(() => store.saveCharacterDefs([]));

    ({ ctx } = installStubContext({ registry, ctx: { chatId: undefined } }));
    assert.throws(() => store.saveChatDefs([]), /No chat is loaded/);
});
