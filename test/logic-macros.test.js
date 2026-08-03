import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { createStubRegistry, installStubContext, makeExecutionContext } from './helpers/stub-context.js';

const { CATEGORY_LOGIC, registerLogicMacros } = await import('../src/logic-macros.js');
const { registerDateMacros } = await import('../src/date-macros.js');
const { isFalsyText } = await import('../src/logic-impl.js');
const { teardownRegistrations } = await import('../src/registration.js');

let registry;
let stub;

beforeEach(() => {
    teardownRegistrations();
    registry = createStubRegistry();
    stub = installStubContext({ registry });
    registerLogicMacros();
    registerDateMacros();
});

function run(name, args, { list = null, resolve } = {}) {
    const definition = registry.getMacro(name);
    assert.ok(definition, `macro ${name} should be registered`);
    const { context, warnings } = makeExecutionContext({ unnamedArgs: args, list, resolve });
    return { result: definition.handler(context), warnings };
}

test('all toolkit macros land in the registry with me- aliases', () => {
    const expected = [
        'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'and', 'or', 'not', 'isempty', 'switch',
        'sum', 'avg', 'listmin', 'listmax',
        'listunique', 'listreverse', 'listslice', 'listcontains', 'listshuffle',
        'padstart', 'padend', 'titlecase', 'wordcount', 'regexreplace',
        'jsonkeys', 'jsonlength', 'jsonset',
        'dateadd', 'datediff', 'dateformat',
    ];
    for (const name of expected) {
        const definition = registry.getMacro(name);
        assert.ok(definition, `${name} missing`);
        assert.match(definition.category, /^enhanced-/, `${name} has category ${definition.category}`);
        assert.ok(registry.hasMacro(`me-${name}`), `${name} lacks its hidden me- alias`);
    }
    assert.equal(registry.getMacro('eq').category, CATEGORY_LOGIC);
});

test('comparison matrix returns strings that compose with {{if}} truthiness', () => {
    assert.equal(run('eq', ['5', '5.0']).result, 'true');
    assert.equal(run('eq', ['a', 'b']).result, 'false');
    assert.equal(run('neq', ['a', 'b']).result, 'true');
    assert.equal(run('gt', ['10', '2']).result, 'true');
    assert.equal(run('gt', ['2', '10']).result, 'false');
    assert.equal(run('gte', ['5', '5']).result, 'true');
    assert.equal(run('lt', ['-1', '0']).result, 'true');
    assert.equal(run('lte', ['5', '4']).result, 'false');

    // The whole point: a false comparison must be falsy to core {{if}}.
    assert.ok(isFalsyText(run('eq', ['a', 'b']).result));
    assert.ok(!isFalsyText(run('eq', ['a', 'a']).result));
});

test('and/or/not/isempty follow engine truthiness', () => {
    assert.equal(run('and', ['true', '1'], { list: ['yes'] }).result, 'true');
    assert.equal(run('and', ['true', 'false']).result, 'false');
    assert.equal(run('or', ['false', '0'], { list: ['nope'] }).result, 'true', '"nope" is truthy text');
    assert.equal(run('or', ['false', '0']).result, 'false');
    assert.equal(run('not', ['false']).result, 'true');
    assert.equal(run('not', ['anything']).result, 'false');
    assert.equal(run('isempty', ['  ']).result, 'true');
    assert.equal(run('isempty', ['x']).result, 'false');
});

test('switch resolves lazily: only the winning branch is evaluated', () => {
    const resolved = [];
    const resolve = (text) => {
        resolved.push(text);
        return text.replace('RAW:', '');
    };
    const { result, warnings } = run('switch', ['RAW:happy'], {
        list: ['happy=RAW:She beams.', 'sad=RAW:She sighs.', 'default=RAW:She waits.'],
        resolve,
    });
    assert.equal(result, 'She beams.');
    assert.equal(warnings.length, 0);
    assert.ok(resolved.includes('happy'), 'branch keys are resolved');
    assert.ok(resolved.includes('RAW:She beams.'), 'winning branch resolved');
    assert.ok(!resolved.includes('RAW:She sighs.'), 'losing branch NOT resolved');
    assert.ok(!resolved.includes('RAW:She waits.'), 'default NOT resolved on a match');
});

test('switch falls back to default, skips malformed branches, matches numerically', () => {
    const fallthrough = run('switch', ['unknown'], {
        list: ['a=first', 'default=fallback', 'broken branch'],
    });
    assert.equal(fallthrough.result, 'fallback');
    assert.equal(fallthrough.warnings.length, 1, 'malformed branch warned');

    assert.equal(run('switch', ['5'], { list: ['5.0=numeric match'] }).result, 'numeric match');
    assert.equal(run('switch', ['x'], { list: ['a=first'] }).result, '', 'no match, no default');
    assert.equal(run('switch', ['x'], { list: ['a=b=c', 'x=eq=uals'] }).result, 'eq=uals', 'split on first = only');
});

test('list math: sum, avg, listmin, listmax', () => {
    assert.equal(run('sum', ['3, 4, 5']).result, '12');
    assert.equal(run('sum', ['0.1, 0.2']).result, '0.3', 'no float noise');
    const withSkip = run('sum', ['3, cat, 4']);
    assert.equal(withSkip.result, '7');
    assert.equal(withSkip.warnings.length, 1);
    assert.equal(run('avg', ['3, 4, 5']).result, '4');
    const avgEmpty = run('avg', ['cat, dog']);
    assert.equal(avgEmpty.result, '');
    assert.equal(avgEmpty.warnings.length, 2, 'skipped items + nothing to average');
    assert.equal(run('listmin', ['3, 11, 7']).result, '3');
    assert.equal(run('listmax', ['3, 11, 7']).result, '11');
    assert.equal(run('listmax', ['b|a|c', '|']).result, 'c');
    assert.equal(run('listmin', ['']).warnings.length, 1);
});

test('list ops: unique, reverse, slice, contains, shuffle', () => {
    assert.equal(run('listunique', ['a, b, a, c']).result, 'a,b,c');
    assert.equal(run('listreverse', ['a, b, c']).result, 'c,b,a');
    assert.equal(run('listslice', ['a, b, c, d', '1', '3']).result, 'b,c');
    assert.equal(run('listslice', ['a, b, c', '-1']).result, 'c');
    assert.equal(run('listcontains', ['sword, shield', 'shield']).result, 'true');
    assert.equal(run('listcontains', ['1, 2', '2.0']).result, 'true');
    assert.equal(run('listcontains', ['a, b', 'c']).result, 'false');
    const seeded = run('listshuffle', ['a, b, c, d, e', 'seed']);
    assert.equal(run('listshuffle', ['a, b, c, d, e', 'seed']).result, seeded.result, 'seeded shuffle is stable');
});

test('text ops: pad, titlecase, wordcount, regexreplace', () => {
    assert.equal(run('padstart', ['7', '4', '0']).result, '0007');
    assert.equal(run('padend', ['7', '4', '0']).result, '7000');
    assert.equal(run('padstart', ['7', 'x']).warnings.length, 1);
    assert.equal(run('titlecase', ['the winter market']).result, 'The Winter Market');
    assert.equal(run('wordcount', ['one two three']).result, '3');
    assert.equal(run('regexreplace', ['a1b2', '[0-9]', '#']).result, 'a#b#');
    const badPattern = run('regexreplace', ['text', '(unclosed', '#']);
    assert.equal(badPattern.result, 'text', 'original text on error');
    assert.equal(badPattern.warnings.length, 1);
});

test('json macros: keys, length, and jsonset writing through the variables API', () => {
    assert.equal(run('jsonkeys', ['{"a":1,"b":2}']).result, 'a, b');
    assert.equal(run('jsonkeys', ['{"a":{"x":1}}', 'a']).result, 'x');
    assert.equal(run('jsonkeys', ['[1,2]']).warnings.length, 1, 'arrays have no keys');
    assert.equal(run('jsonlength', ['[1,2,3]']).result, '3');
    assert.equal(run('jsonlength', ['{"a":1,"b":2}']).result, '2');
    assert.equal(run('jsonlength', ['{"s":"abcd"}', 's']).result, '4');
    assert.equal(run('jsonlength', ['nope']).warnings.length, 1);

    assert.equal(run('jsonset', ['inv', 'weapons[0]', 'sword']).result, '');
    assert.equal(stub.localVars.inv, '{"weapons":["sword"]}');
    run('jsonset', ['inv', 'weapons[1]', 'axe']);
    assert.equal(stub.localVars.inv, '{"weapons":["sword","axe"]}');
    run('jsonset', ['ginv', 'gold', '10', 'global']);
    assert.equal(stub.globalVars.ginv, '{"gold":"10"}');
    assert.equal(run('jsonset', ['inv', 'a.b', 'x', 'nowhere']).warnings.length, 1, 'bad scope warns');
    assert.equal(run('jsonset', ['', 'a', 'x']).warnings.length, 1, 'missing name warns');
});

test('date macros: dateadd, datediff, dateformat', () => {
    assert.equal(run('dateadd', ['2026-08-03', '3', 'days']).result, '2026-08-06');
    assert.equal(run('dateadd', ['2026-01-31', '1', 'M']).result, '2026-02-28');
    assert.equal(run('dateadd', ['2026-08-03', '-1', 'weeks']).result, '2026-07-27');
    assert.equal(run('dateadd', ['2026-08-03', '2', 'months', 'MMMM D']).result, 'October 3');
    assert.equal(run('dateadd', ['banana', '1', 'days']).warnings.length, 1);
    assert.equal(run('dateadd', ['2026-08-03', 'x', 'days']).warnings.length, 1);
    assert.equal(run('dateadd', ['2026-08-03', '1', 'fortnights']).warnings.length, 1);

    assert.equal(run('datediff', ['2026-01-01', '2026-08-03', 'months']).result, '7');
    assert.equal(run('datediff', ['2026-08-03', '2026-01-01', 'months']).result, '-7');
    assert.equal(run('datediff', ['2026-08-01', '2026-08-03']).result, '2', 'default unit is days');
    assert.equal(run('datediff', ['nope', '2026-01-01']).warnings.length, 1);

    assert.equal(run('dateformat', ['2026-08-03', 'dddd']).result, 'Monday');
    assert.equal(run('dateformat', ['2026-08-03']).result, '2026-08-03');
    assert.equal(run('dateformat', ['gibberish']).warnings.length, 1);
});
