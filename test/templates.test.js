import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { createStubRegistry, installStubContext } from './helpers/stub-context.js';

const { TEMPLATE_PACKS } = await import('../src/templates/index.js');
const { createDef, validateDef } = await import('../src/custom/store.js');
const { scanMacroNames } = await import('../src/auditor/volatility.js');
const { registerUtilityMacros } = await import('../src/utility-macros.js');
const { registerStateMacros } = await import('../src/state-macros.js');
const { registerLogicMacros } = await import('../src/logic-macros.js');
const { registerDateMacros } = await import('../src/date-macros.js');
const { registerLorebookMacros } = await import('../src/lorebook-macros.js');
const { teardownRegistrations } = await import('../src/registration.js');

/** Core macros our templates may reference (the host provides these). */
const CORE_NAMES = new Set([
    'char', 'user', 'persona', 'group', 'random', 'roll', 'pick', 'if', 'else',
    'getvar', 'setvar', 'addvar', 'incvar', 'decvar', 'getglobalvar', 'setglobalvar',
]);

let registry;

beforeEach(() => {
    teardownRegistrations();
    registry = createStubRegistry();
    installStubContext({ registry });
    registerUtilityMacros();
    registerStateMacros();
    registerLogicMacros();
    registerDateMacros();
    registerLorebookMacros();
});

test('the gallery ships exactly the four planned packs, each with metadata', () => {
    assert.equal(TEMPLATE_PACKS.length, 4);
    for (const pack of TEMPLATE_PACKS) {
        assert.ok(pack.id && pack.name && pack.description, `${pack.id} needs id/name/description`);
        assert.ok(Array.isArray(pack.macros) && pack.macros.length, `${pack.id} has macros`);
    }
});

test('every shipped template passes structural validation', () => {
    for (const pack of TEMPLATE_PACKS) {
        for (const macro of pack.macros) {
            const def = createDef(macro);
            const errors = validateDef(def, {});
            assert.deepEqual(errors, [], `${pack.id}/${macro.name}: ${errors.join(' ')}`);
            assert.ok(macro.description, `${pack.id}/${macro.name} needs a description`);
        }
    }
});

test('every macro referenced in a template exists: ours, core, a pack sibling, or an argument', () => {
    for (const pack of TEMPLATE_PACKS) {
        const siblingNames = new Set(pack.macros.map(macro => macro.name.toLowerCase()));
        for (const macro of pack.macros) {
            const argNames = new Set((macro.args ?? []).map(arg => arg.name.toLowerCase()));
            for (const name of scanMacroNames(macro.template).keys()) {
                const known = registry.hasMacro(name)
                    || CORE_NAMES.has(name)
                    || siblingNames.has(name)
                    || argNames.has(name);
                assert.ok(known, `${pack.id}/${macro.name} references unknown macro {{${name}}}`);
            }
        }
    }
});

test('pack macro names never collide with our built-in registrations', () => {
    for (const pack of TEMPLATE_PACKS) {
        for (const macro of pack.macros) {
            assert.ok(!registry.hasMacro(macro.name),
                `${pack.id}/${macro.name} would shadow a built-in Macro Enhanced macro`);
        }
    }
});
