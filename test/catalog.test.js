import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { createStubRegistry, installStubContext } from './helpers/stub-context.js';

const { safeRegister, safeUnregister, teardownRegistrations } = await import('../src/registration.js');
const { getMacroCatalog, getMacroDoc, macroSignature, recordCommand, clearCommandDocs, getCommandDocs } =
    await import('../src/catalog.js');
const { registerUtilityMacros } = await import('../src/utility-macros.js');
const { registerLogicMacros } = await import('../src/logic-macros.js');
const { registerDateMacros } = await import('../src/date-macros.js');
const { registerStateMacros } = await import('../src/state-macros.js');
const { registerLorebookMacros } = await import('../src/lorebook-macros.js');

let registry;

beforeEach(() => {
    teardownRegistrations();
    clearCommandDocs();
    registry = createStubRegistry();
    installStubContext({ registry });
});

test('captures the documentation the registry would otherwise drop', () => {
    safeRegister('demo', {
        category: 'enhanced-text',
        description: 'Does a thing.',
        returns: 'the thing',
        returnType: 'integer',
        unnamedArgs: [{ name: 'text', description: 'The source.' }],
        exampleUsage: ['{{demo::abc}}'],
        handler: () => '',
    });

    const doc = getMacroDoc('demo');
    assert.equal(doc.name, 'demo');
    assert.equal(doc.description, 'Does a thing.');
    // The stub registry (like the real one) stores neither of these.
    assert.equal(doc.returns, 'the thing');
    assert.deepEqual(doc.exampleUsage, ['{{demo::abc}}']);
    assert.equal(doc.renamed, false);
    assert.ok(!('handler' in doc), 'the catalogue is data only');
});

test('records the name actually registered when a collision forces a rename', () => {
    registry.setSource('core');
    registry.registerMacro('count', { handler: () => '' });
    registry.setSource('MacroEnhanced');

    safeRegister('count', { category: 'enhanced-list', description: 'Counts.', handler: () => '' });

    assert.equal(getMacroDoc('count'), undefined, 'the core macro is not ours to document');
    const doc = getMacroDoc('me-count');
    assert.equal(doc.requested, 'count');
    assert.equal(doc.renamed, true);
});

test('hidden me- aliases stay out of the reference', () => {
    safeRegister('capitalize', {
        category: 'enhanced-text',
        description: 'Capitalizes.',
        aliases: [{ alias: 'cap', visible: false }],
        handler: () => '',
    });
    assert.deepEqual(getMacroDoc('capitalize').aliases, []);

    safeRegister('lore', {
        category: 'enhanced-lorebook',
        description: 'Inserts an entry.',
        aliases: [{ alias: 'wi', visible: true }],
        handler: () => '',
    });
    assert.deepEqual(getMacroDoc('lore').aliases, ['wi']);
});

test('unregistering drops the entry, teardown empties the catalogue', () => {
    safeRegister('one', { category: 'enhanced-text', description: 'One.', handler: () => '' });
    safeRegister('two', { category: 'enhanced-text', description: 'Two.', handler: () => '' });
    assert.equal(getMacroCatalog().length, 2);

    safeUnregister('one');
    assert.equal(getMacroDoc('one'), undefined);
    assert.equal(getMacroCatalog().length, 1);

    teardownRegistrations();
    assert.deepEqual(getMacroCatalog(), []);
});

test('signatures mark optional arguments and open-ended lists', () => {
    assert.equal(macroSignature({ name: 'upper', unnamedArgs: [{ name: 'text' }] }), '{{upper::text}}');
    assert.equal(
        macroSignature({ name: 'truncate', unnamedArgs: [{ name: 'text' }, { name: 'max' }, { name: 'ellipsis', optional: true }] }),
        '{{truncate::text::max::[ellipsis]}}');
    assert.equal(
        macroSignature({ name: 'join', unnamedArgs: [{ name: 'separator' }], list: true }),
        '{{join::separator::…}}');
    assert.equal(macroSignature({ name: 'timeofday', unnamedArgs: [] }), '{{timeofday}}');
});

test('slash command documentation is captured with its arguments', () => {
    recordCommand({
        name: 'me-eval',
        helpString: 'Evaluates text. Example: <code>/me-eval {{calc::2^10}}</code>',
        returns: 'the text with all macros resolved',
        namedArgumentList: [{ name: 'sandbox', description: 'Keep changes fake.', isRequired: false, defaultValue: 'true', enumList: ['true', 'false'] }],
        unnamedArgumentList: [{ description: 'The text.', isRequired: true, enumList: [] }],
    });

    const [doc] = getCommandDocs();
    assert.equal(doc.name, 'me-eval');
    assert.equal(doc.returns, 'the text with all macros resolved');
    assert.deepEqual(doc.args.map(arg => [arg.name, arg.named, arg.required]), [
        ['sandbox', true, false],
        ['', false, true],
    ]);
    assert.deepEqual(doc.args[0].enums, ['true', 'false']);
});

// ---- the documentation contract -------------------------------------------
// The reference is only as good as the metadata behind it, and nothing else in
// the suite checks that metadata exists. This is what stops an undocumented
// macro shipping.

test('every built-in macro is fully documented', () => {
    registerUtilityMacros();
    registerLogicMacros();
    registerDateMacros();
    registerStateMacros();
    registerLorebookMacros();

    const catalog = getMacroCatalog();
    assert.ok(catalog.length >= 70, `expected the full macro set, got ${catalog.length}`);

    for (const entry of catalog) {
        const where = `{{${entry.name}}}`;
        assert.match(entry.category, /^enhanced-/, `${where} has category ${entry.category}`);
        assert.ok(entry.description?.trim(), `${where} needs a description`);
        assert.ok(entry.description.trim().endsWith('.'), `${where} description should be a sentence`);
        assert.ok(entry.returns?.trim(), `${where} needs a "returns" line`);
        assert.ok(entry.exampleUsage.length, `${where} needs at least one example`);
        for (const example of entry.exampleUsage) {
            assert.match(example, /^\{\{/, `${where} example should be a macro call: ${example}`);
        }
        for (const arg of entry.unnamedArgs) {
            assert.ok(arg.name?.trim(), `${where} has an unnamed argument`);
            assert.ok(arg.description?.trim(), `${where} argument "${arg.name}" needs a description`);
        }
    }
});
