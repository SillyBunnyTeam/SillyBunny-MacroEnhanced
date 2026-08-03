import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { createStubRegistry, installStubContext } from './helpers/stub-context.js';

const { safeRegister, safeUnregister, teardownRegistrations, getRegisteredNames, getRemaps } =
    await import('../src/registration.js');

let registry;

beforeEach(() => {
    teardownRegistrations();
    registry = createStubRegistry();
    installStubContext({ registry });
});

test('registers under the plain name with a hidden me- alias', () => {
    const actual = safeRegister('upper', { handler: () => '' });
    assert.equal(actual, 'upper');
    assert.ok(registry.hasMacro('upper'));
    assert.ok(registry.hasMacro('me-upper'));
    assert.equal(registry.getMacro('me-upper').aliasOf, 'upper');
});

test('falls back to me- prefix when another source owns the name', () => {
    registry.setSource('core');
    registry.registerMacro('count', { handler: () => 'core' });
    registry.setSource('MacroEnhanced');

    const actual = safeRegister('count', { handler: () => 'mine' });
    assert.equal(actual, 'me-count');
    assert.equal(registry.getMacro('count').source.name, 'core', 'core macro untouched');
    assert.ok(registry.hasMacro('me-count'));
    assert.deepEqual([...getRemaps().values()], [{ requested: 'count', actual: 'me-count' }]);
});

test('skips entirely when both plain and fallback names are taken by others', () => {
    registry.setSource('core');
    registry.registerMacro('item', { handler: () => '' });
    registry.registerMacro('me-item', { handler: () => '' });
    registry.setSource('MacroEnhanced');

    assert.equal(safeRegister('item', { handler: () => '' }), null);
    assert.equal(registry.getMacro('item').source.name, 'core');
});

test('reserved upstream names always go to the fallback', () => {
    const actual = safeRegister('setvarkey', { handler: () => '' });
    assert.equal(actual, 'me-setvarkey');
    assert.ok(!registry.hasMacro('setvarkey'));
});

test('never clobbers an alias owned by another source', () => {
    registry.setSource('other-ext');
    registry.registerMacro('me-upper', { handler: () => '' });
    registry.setSource('MacroEnhanced');

    const actual = safeRegister('upper', { handler: () => '' });
    assert.equal(actual, 'upper');
    assert.equal(registry.getMacro('me-upper').source.name, 'other-ext', 'foreign alias untouched');
});

test('teardown removes everything we registered, and only that', () => {
    registry.setSource('core');
    registry.registerMacro('roll', { handler: () => '' });
    registry.setSource('MacroEnhanced');

    safeRegister('upper', { handler: () => '' });
    safeRegister('calc', { aliases: [{ alias: 'math', visible: false }], handler: () => '' });
    assert.ok(getRegisteredNames().length >= 4);

    teardownRegistrations();
    assert.equal(getRegisteredNames().length, 0);
    for (const name of ['upper', 'me-upper', 'calc', 'me-calc', 'math']) {
        assert.ok(!registry.hasMacro(name), `${name} should be gone`);
    }
    assert.ok(registry.hasMacro('roll'), 'foreign macro survives teardown');
});

test('safeUnregister removes one macro with its fallback alias and remap', () => {
    safeRegister('upper', { handler: () => '' });
    safeRegister('lower', { handler: () => '' });

    safeUnregister('upper');
    assert.ok(!registry.hasMacro('upper'));
    assert.ok(!registry.hasMacro('me-upper'));
    assert.ok(registry.hasMacro('lower'));

    // remapped case
    registry.setSource('core');
    registry.registerMacro('count', { handler: () => '' });
    registry.setSource('MacroEnhanced');
    safeRegister('count', { handler: () => '' });
    assert.ok(registry.hasMacro('me-count'));
    safeUnregister('count');
    assert.ok(!registry.hasMacro('me-count'));
    assert.equal(getRemaps().size, 0);
    assert.ok(registry.hasMacro('count'), 'core macro untouched');
});
