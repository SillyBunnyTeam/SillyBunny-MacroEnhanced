import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { createStubRegistry, installStubContext, makeExecutionContext } from './helpers/stub-context.js';

const { registerLorebookMacros } = await import('../src/lorebook-macros.js');
const { clearCache, indexBook, setActiveEntries } = await import('../src/lorebook-cache.js');
const { teardownRegistrations } = await import('../src/registration.js');

let registry;
let stub;

function seedBook() {
    indexBook('TestBook', {
        entries: {
            1: { uid: 1, comment: 'Backstory', key: ['past', 'history'], keysecondary: ['secret'], content: 'The old tale.', position: 0, depth: 4, order: 100, probability: 100, constant: false, disable: false },
            2: { uid: 2, comment: 'Kingdom', key: ['realm'], content: 'A wide realm.', probability: 50, constant: true, disable: false },
            3: { uid: 3, comment: 'Hidden', key: ['x'], content: 'Disabled lore.', disable: true },
        },
    });
}

beforeEach(() => {
    teardownRegistrations();
    clearCache();
    registry = createStubRegistry();
    stub = installStubContext({ registry });
    stub.ctx.worldInfoSettings = { globalSelect: ['TestBook'], charLore: [] };
    registerLorebookMacros();
    seedBook();
});

function run(name, args, { resolve } = {}) {
    const definition = registry.getMacro(name);
    assert.ok(definition, `macro ${name} should be registered`);
    const { context, warnings } = makeExecutionContext({ unnamedArgs: args, resolve });
    return { result: definition.handler(context), warnings };
}

test('the new lorebook macros are registered under enhanced-lorebook', () => {
    for (const name of ['loreentries', 'lorefield', 'loretokens', 'lorepick']) {
        const definition = registry.getMacro(name);
        assert.ok(definition, `${name} missing`);
        assert.equal(definition.category, 'enhanced-lorebook');
        assert.ok(registry.hasMacro(`me-${name}`), `${name} lacks its hidden me- alias`);
    }
});

test('loreentries lists enabled entry titles, from one book or the whole search order', () => {
    assert.equal(run('loreentries', ['TestBook']).result, 'Backstory, Kingdom', 'disabled entries omitted');
    assert.equal(run('loreentries', ['']).result, 'Backstory, Kingdom', 'default = search order');
    assert.equal(run('loreentries', ['TestBook', ' | ']).result, 'Backstory | Kingdom');

    const missing = run('loreentries', ['NoSuchBook']);
    assert.equal(missing.result, '');
    assert.equal(missing.warnings.length, 1, 'uncached book warns');
});

test('lorefield reads whitelisted fields and refuses unknown ones', () => {
    assert.equal(run('lorefield', ['Backstory', 'keys']).result, 'past, history');
    assert.equal(run('lorefield', ['Backstory', 'secondarykeys']).result, 'secret');
    assert.equal(run('lorefield', ['Backstory', 'depth']).result, '4');
    assert.equal(run('lorefield', ['Backstory', 'probability']).result, '100');
    assert.equal(run('lorefield', ['Kingdom', 'constant']).result, 'true');
    assert.equal(run('lorefield', ['Hidden', 'enabled']).result, 'false');
    assert.equal(run('lorefield', ['Backstory', 'content']).result, 'The old tale.');
    assert.equal(run('lorefield', ['backstory', 'title']).result, 'Backstory', 'title lookup is case-insensitive');

    const unknownField = run('lorefield', ['Backstory', 'flavor']);
    assert.equal(unknownField.result, '');
    assert.equal(unknownField.warnings.length, 1);

    const unknownEntry = run('lorefield', ['Nobody', 'keys']);
    assert.equal(unknownEntry.result, '');
    assert.equal(unknownEntry.warnings.length, 1);
});

test('loretokens estimates active and bound content', () => {
    setActiveEntries([{ content: 'a'.repeat(40) }]);
    assert.equal(run('loretokens', []).result, '10', '40 chars / 4 per token');
    // bound: "The old tale." + "\n" + "A wide realm." = 27 chars -> ceil 27/4 = 7
    assert.equal(run('loretokens', ['bound']).result, '7');
    assert.equal(run('loretokens', ['nonsense']).warnings.length, 1);
    setActiveEntries([]);
    assert.equal(run('loretokens', []).result, '0');
});

test('lorepick picks deterministically among enabled entries and resolves the content', () => {
    stub.ctx.chatMetadata.chat_id_hash = 777;
    let resolved = null;
    const resolve = (text) => {
        resolved = text;
        return `resolved(${text})`;
    };
    const first = run('lorepick', ['TestBook'], { resolve });
    assert.ok(['The old tale.', 'A wide realm.'].includes(resolved), 'never the disabled entry');
    assert.equal(first.result, `resolved(${resolved})`);
    assert.equal(run('lorepick', ['TestBook'], { resolve }).result, first.result, 'stable per chat and key');

    const empty = run('lorepick', ['NoSuchBook']);
    assert.equal(empty.result, '');
    assert.ok(empty.warnings.length >= 1);
});
