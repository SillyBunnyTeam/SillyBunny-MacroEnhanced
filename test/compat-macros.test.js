import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { createStubRegistry, installStubContext, makeExecutionContext } from './helpers/stub-context.js';

const {
    disableCompatMode,
    enableCompatMode,
    isCompatActive,
    registerCompatMacros,
    resetCompatState,
    syncCompatMode,
} = await import('../src/compat-macros.js');
const { registerLogicMacros } = await import('../src/logic-macros.js');
const { teardownRegistrations } = await import('../src/registration.js');

let registry;
let engine;

/** Stand-in for the host engine's pre/post-processor hooks. */
function createStubEngine() {
    const preProcessors = [];
    return {
        preProcessors,
        evaluate: (text) => preProcessors.reduce((acc, { handler }) => handler(acc), text),
        addPreProcessor: (handler, options = {}) => {
            preProcessors.push({ handler, ...options });
        },
        removePreProcessor: (handler) => {
            const index = preProcessors.findIndex(p => p.handler === handler);
            if (index !== -1) {
                preProcessors.splice(index, 1);
            }
        },
    };
}

beforeEach(() => {
    teardownRegistrations();
    resetCompatState();
    registry = createStubRegistry();
    engine = createStubEngine();
    installStubContext({ registry, engine });
    registerCompatMacros();
    registerLogicMacros();
});

function run(name, args, list = null) {
    const definition = registry.getMacro(name);
    assert.ok(definition, `macro ${name} should be registered`);
    const { context, warnings } = makeExecutionContext({ unnamedArgs: args, list });
    return { result: definition.handler(context), warnings };
}

test('{{expr}} works out a condition regardless of the setting', () => {
    assert.equal(isCompatActive(), false);
    assert.equal(run('expr', ['0 > 0']).result, 'false');
    assert.equal(run('expr', ['1 > 0']).result, 'true');
    assert.equal(run('expr', ['Forest']).result, 'true', 'no operator falls back to truthiness');
    assert.equal(run('expr', ['']).result, 'false');
});

test('{{expr}} reassembles a condition the engine split on ::', () => {
    // list: true, so `a::b` arrives as separate arguments.
    assert.equal(run('expr', ['{{lower::x}} == "y"'], []).result, 'false');
    assert.equal(run('expr', ['a'], ['b == a::b']).result, 'true');
});

test('a malformed condition warns and counts as false rather than throwing', () => {
    const { result, warnings } = run('expr', ['a == ']);
    assert.equal(result, 'false');
    assert.equal(warnings.length, 1);
});

test('the host engine is untouched until compat mode is switched on', () => {
    assert.equal(engine.preProcessors.length, 0);
    assert.equal(engine.evaluate('{{if::1 > 0}}x{{/if}}'), '{{if::1 > 0}}x{{/if}}');

    // {{if}} itself is never re-registered -- that is the whole point of using a
    // pre-processor, since re-registering would mark the host's macro as ours and
    // the extension-disable sweep would then remove it outright.
    assert.equal(registry.hasMacro('if'), false);
});

test('turning it on rewrites infix conditions, turning it off restores exactly', () => {
    const before = engine.evaluate('{{if::1 > 0}}x{{/if}}');

    assert.equal(enableCompatMode(), true);
    assert.equal(isCompatActive(), true);
    assert.equal(engine.preProcessors.length, 1);
    assert.equal(engine.evaluate('{{if::1 > 0}}x{{/if}}'), '{{if::{{expr::1 > 0}}}}x{{/if}}');

    disableCompatMode();
    assert.equal(isCompatActive(), false);
    assert.equal(engine.preProcessors.length, 0);
    assert.equal(engine.evaluate('{{if::1 > 0}}x{{/if}}'), before, 'byte-for-byte back to stock');
});

test('enabling twice installs only one pre-processor', () => {
    enableCompatMode();
    enableCompatMode();
    assert.equal(engine.preProcessors.length, 1);
    disableCompatMode();
    assert.equal(engine.preProcessors.length, 0);
});

test('plain conditions are left alone even while compat mode is on', () => {
    enableCompatMode();
    for (const text of ['{{if::{{getchatvar::loc}}}}x{{/if}}', '{{if !personality}}x{{/if}}']) {
        assert.equal(engine.evaluate(text), text);
    }
});

test('and/or only read arguments as expressions while compat mode is on', () => {
    // "ren == user" is a non-empty string, so plain truthiness calls it true.
    assert.equal(run('or', ['false', 'ren == "user"']).result, 'true');
    assert.equal(run('and', ['true', '1 == 2']).result, 'true');

    enableCompatMode();
    assert.equal(run('or', ['false', 'ren == "user"']).result, 'false');
    assert.equal(run('and', ['true', '1 == 2']).result, 'false');
    assert.equal(run('and', ['true', '2 == 2']).result, 'true');
    // Ordinary truthy values still work the same way.
    assert.equal(run('or', ['', 'Forest']).result, 'true');
    assert.equal(run('and', ['', 'Forest']).result, 'false');
});

test('syncCompatMode follows the saved setting in both directions', () => {
    assert.equal(syncCompatMode(true), true);
    assert.equal(engine.preProcessors.length, 1);
    assert.equal(syncCompatMode(false), false);
    assert.equal(engine.preProcessors.length, 0);
});

test('compat mode declines gracefully when the host has no pre-processor hook', () => {
    resetCompatState();
    teardownRegistrations();
    installStubContext({ registry: createStubRegistry(), engine: { evaluate: (text) => text } });
    registerCompatMacros();
    assert.equal(enableCompatMode(), false);
    assert.equal(isCompatActive(), false);
});
