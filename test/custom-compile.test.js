import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { installStubContext, makeExecutionContext } from './helpers/stub-context.js';

const { compileDef, resetRecursionState, MAX_DEPTH, CATEGORY_CUSTOM } = await import('../src/custom/compile.js');

beforeEach(() => {
    installStubContext({});
    resetRecursionState();
});

function makeCapturingEngine() {
    const calls = [];
    return {
        calls,
        engine: {
            evaluate(template, env, options) {
                calls.push({ template, env, options });
                return `evaluated:${template}`;
            },
        },
    };
}

test('compiles metadata: category, args, exampleUsage with required args only', () => {
    const { engine } = makeCapturingEngine();
    const options = compileDef({
        name: 'greet',
        description: 'Says hi',
        template: 'Hello {{who}}',
        args: [{ name: 'who' }, { name: 'tone', optional: true, defaultValue: 'warm' }],
    }, { engine });

    assert.equal(options.category, CATEGORY_CUSTOM);
    assert.equal(options.description, 'Says hi');
    assert.deepEqual(options.exampleUsage, ['{{greet::who}}']);
    assert.equal(options.unnamedArgs.length, 2);
    assert.equal(options.unnamedArgs[1].optional, true);
    assert.equal(options.unnamedArgs[1].defaultValue, 'warm');
});

test('handler binds args as {{name}} and {{argN}} into a NEW env object', () => {
    const { engine, calls } = makeCapturingEngine();
    const options = compileDef({
        name: 'greet',
        template: 'Hello {{who}} ({{arg1}})',
        args: [{ name: 'Who' }],
    }, { engine });

    const { context } = makeExecutionContext({ unnamedArgs: ['Ann'], env: { dynamicMacros: { existing: 'kept' } } });
    const frozenEnv = Object.freeze(context.env);
    context.env = frozenEnv;

    const result = options.handler(context);
    assert.equal(result, 'evaluated:Hello {{who}} ({{arg1}})');
    assert.equal(calls.length, 1);

    const passedEnv = calls[0].env;
    assert.notEqual(passedEnv, frozenEnv, 'handler must not reuse the frozen env');
    assert.equal(passedEnv.dynamicMacros.who, 'Ann', 'arg names are lowercased');
    assert.equal(passedEnv.dynamicMacros.arg1, 'Ann');
    assert.equal(passedEnv.dynamicMacros.existing, 'kept', 'existing dynamic macros preserved');
    assert.equal(calls[0].options.contextOffset, context.globalOffset);
});

test('missing optional args fall back to their defaults', () => {
    const { engine, calls } = makeCapturingEngine();
    const options = compileDef({
        name: 'greet',
        template: 'x',
        args: [{ name: 'who' }, { name: 'tone', optional: true, defaultValue: 'warm' }],
    }, { engine });

    options.handler(makeExecutionContext({ unnamedArgs: ['Ann'] }).context);
    assert.equal(calls[0].env.dynamicMacros.tone, 'warm');
    assert.equal(calls[0].env.dynamicMacros.arg2, 'warm');
});

test('direct self-reference is blocked', () => {
    const options = compileDef({ name: 'loop', template: '{{loop}}', args: [] }, {
        engine: {
            evaluate() {
                // Simulate the engine re-entering the same macro.
                return options.handler(makeExecutionContext({}).context);
            },
        },
    });

    const { context, warnings } = makeExecutionContext({});
    const result = options.handler(context);
    assert.equal(result, '');
    assert.equal(warnings.length, 0, 'inner context got the warning');
});

test('mutual recursion (A -> B -> A) is blocked', () => {
    let optionsA;
    let optionsB;
    const engineA = { evaluate: () => optionsB.handler(makeExecutionContext({}).context) };
    const engineB = { evaluate: () => optionsA.handler(makeExecutionContext({}).context) };
    optionsA = compileDef({ name: 'aaa', template: '{{bbb}}', args: [] }, { engine: engineA });
    optionsB = compileDef({ name: 'bbb', template: '{{aaa}}', args: [] }, { engine: engineB });

    const result = optionsA.handler(makeExecutionContext({}).context);
    assert.equal(result, '');
});

test('depth cap stops runaway nesting chains', () => {
    const defs = [];
    const engines = [];
    for (let i = 0; i < MAX_DEPTH + 5; i++) {
        const index = i;
        engines.push({
            evaluate: () => (defs[index + 1] ? defs[index + 1].handler(makeExecutionContext({}).context) : 'leaf'),
        });
    }
    for (let i = 0; i < MAX_DEPTH + 5; i++) {
        defs.push(compileDef({ name: `chain${i}`, template: 'x', args: [] }, { engine: engines[i] }));
    }

    const result = defs[0].handler(makeExecutionContext({}).context);
    assert.equal(result, '', 'chain past the depth cap collapses to empty rather than recursing forever');
});
