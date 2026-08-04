import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { createStubRegistry, installStubContext, makeExecutionContext } from './helpers/stub-context.js';

const { registerUtilityMacros } = await import('../src/utility-macros.js');
const { teardownRegistrations } = await import('../src/registration.js');

let registry;

beforeEach(() => {
    teardownRegistrations();
    registry = createStubRegistry();
    installStubContext({ registry });
    registerUtilityMacros();
});

function run(name, args, list = null) {
    const definition = registry.getMacro(name);
    assert.ok(definition, `macro ${name} should be registered`);
    const { context, warnings } = makeExecutionContext({ unnamedArgs: args, list });
    return { result: definition.handler(context), warnings };
}

test('all pack macros land in the registry with enhanced-* categories', () => {
    const expected = [
        'upper', 'lower', 'capitalize', 'replace', 'substring', 'length', 'repeat', 'default',
        'truncate', 'truncatetokens', 'tokencount', 'calc', 'round', 'clamp',
        'join', 'item', 'count', 'listsort', 'jsonget',
    ];
    for (const name of expected) {
        const definition = registry.getMacro(name);
        assert.ok(definition, `${name} missing`);
        assert.match(definition.category, /^enhanced-/, `${name} has category ${definition.category}`);
        assert.ok(registry.hasMacro(`me-${name}`), `${name} lacks its hidden me- alias`);
    }
});

test('text macro handlers', () => {
    assert.equal(run('upper', ['abc']).result, 'ABC');
    assert.equal(run('lower', ['ABC']).result, 'abc');
    assert.equal(run('capitalize', ['ann bell']).result, 'Ann bell');
    assert.equal(run('replace', ['a-b-c', '-', '+']).result, 'a+b+c');
    assert.equal(run('replace', ['a-b', '-', undefined]).result, 'ab');
    assert.equal(run('substring', ['hello world', '0', '5']).result, 'hello');
    assert.equal(run('substring', ['hello world', '-5']).result, 'world');
    assert.equal(run('length', ['hello']).result, '5');
    assert.equal(run('repeat', ['ab', '3']).result, 'ababab');
    assert.equal(run('default', ['', 'fallback']).result, 'fallback');
    assert.equal(run('default', ['real', 'fallback']).result, 'real');
    assert.equal(run('truncate', ['hello world', '8']).result, 'hello w…');
    assert.equal(run('truncatetokens', ['a'.repeat(100), '5']).result.length, 20);
    assert.equal(run('tokencount', ['abcdefgh']).result, '2');
});

test('bad numeric args warn instead of throwing', () => {
    const { result, warnings } = run('substring', ['hello', 'oops']);
    assert.equal(result, 'hello');
    assert.equal(warnings.length, 1);

    const truncate = run('truncate', ['hello', 'nope']);
    assert.equal(truncate.result, 'hello');
    assert.equal(truncate.warnings.length, 1);
});

test('math macro handlers', () => {
    assert.equal(run('calc', ['2 * (3 + 4)']).result, '14');
    assert.equal(run('calc', ['0.1 + 0.2']).result, '0.3');
    assert.equal(run('round', ['3.14159', '2']).result, '3.14');
    assert.equal(run('round', ['3.7']).result, '4');
    assert.equal(run('clamp', ['150', '0', '100']).result, '100');

    const bad = run('calc', ['2 +']);
    assert.equal(bad.result, '2 +', 'malformed expression returned as-is');
    assert.equal(bad.warnings.length, 1);
});

test('list macro handlers', () => {
    assert.equal(run('join', [', '], ['a', 'b', 'c']).result, 'a, b, c');
    assert.equal(run('item', ['1', 'red,green,blue']).result, 'green');
    assert.equal(run('item', ['-1', 'a;b;c', ';']).result, 'c');
    assert.equal(run('count', ['red,green,blue']).result, '3');
    assert.equal(run('count', ['']).result, '0');
    assert.equal(run('listsort', ['banana,apple']).result, 'apple,banana');
    assert.equal(run('listsort', ['b|a', '|', 'desc']).result, 'b|a');
    assert.equal(run('jsonget', ['{"a":{"b":5}}', 'a.b']).result, '5');

    const badJson = run('jsonget', ['nope', 'a']);
    assert.equal(badJson.result, '');
    assert.equal(badJson.warnings.length, 1);
});

test('scalar math macros', () => {
    assert.equal(run('floor', ['3.7']).result, '3');
    assert.equal(run('floor', ['-3.2']).result, '-4');
    assert.equal(run('ceil', ['3.2']).result, '4');
    assert.equal(run('min', ['0', '-5']).result, '-5');
    assert.equal(run('max', ['0', '-5']).result, '0');
    assert.equal(run('mod', ['1450', '1440']).result, '10');
    assert.equal(run('mod', ['-1', '3']).result, '-1', 'JS remainder semantics');

    const byZero = run('mod', ['5', '0']);
    assert.equal(byZero.result, '5', 'passes the value through rather than throwing');
    assert.equal(byZero.warnings.length, 1);

    const bad = run('floor', ['abc']);
    assert.equal(bad.result, 'abc');
    assert.equal(bad.warnings.length, 1);
});

test('split and wrap resolve their own arguments, so {{space}} survives', () => {
    // These are on the lazy path: arguments arrive raw and the handler resolves
    // them. A resolve stub stands in for the engine expanding {{space}}.
    const resolve = (text) => (text === '{{space}}' ? ' ' : text);
    const lazy = (name, args) => {
        const definition = registry.getMacro(name);
        const { context, warnings } = makeExecutionContext({ unnamedArgs: args, resolve });
        return { result: definition.handler(context), warnings };
    };

    assert.equal(lazy('split', ['Selphie Windsong', '{{space}}', '0']).result, 'Selphie');
    assert.equal(lazy('split', ['Selphie Windsong', '{{space}}', '1']).result, 'Windsong');
    assert.equal(lazy('split', ['Ren', '{{space}}', '1']).result, '', 'past the end is empty');
    assert.equal(lazy('split', ['a,b,c', ',', '-1']).result, 'c');
    // An empty separator means a space: the lexer makes a literal one impossible.
    assert.equal(lazy('split', ['Selphie Windsong', '', '1']).result, 'Windsong');

    assert.equal(lazy('wrap', ['{{space}}', '', 'Windsong']).result, ' Windsong');
    assert.equal(lazy('wrap', ['{{space}}', '', '']).result, '', 'nothing at all when the value is empty');
    assert.equal(lazy('wrap', [' (', ')', 'Captain']).result, ' (Captain)');
});
