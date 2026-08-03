import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    RegexError,
    boolString,
    compareValues,
    countWords,
    isFalsyText,
    jsonSetValue,
    jsonValueAt,
    listContains,
    padText,
    regexReplaceText,
    shuffleList,
    sliceList,
    splitSwitchPair,
    sumList,
    titleCaseText,
    uniqueList,
} from '../src/logic-impl.js';
import { JsonPathError } from '../src/utility-impl.js';

test('truthiness mirrors the engine: "", "false", "off", "0" are falsy; whitespace is truthy', () => {
    // Parity table with the fork's {{if}}: condition === '' || isFalseBoolean(condition).
    for (const falsy of ['', 'false', 'FALSE', ' false ', 'off', 'Off', '0', ' 0 ']) {
        assert.ok(isFalsyText(falsy), `"${falsy}" should be falsy`);
    }
    for (const truthy of [' ', 'true', 'on', '1', 'anything', '00', 'no', 'null']) {
        assert.ok(!isFalsyText(truthy), `"${truthy}" should be truthy`);
    }
    assert.equal(boolString(true), 'true');
    assert.equal(boolString(false), 'false');
});

test('compareValues: numeric-first, then trimmed string comparison', () => {
    assert.equal(compareValues('5', '5.0'), 0, 'numeric equality');
    assert.equal(compareValues('2', '10'), -1, 'numeric, not lexicographic');
    assert.equal(compareValues('-1', '1'), -1);
    assert.equal(compareValues(' 5 ', '5'), 0, 'whitespace trimmed');
    assert.equal(compareValues('abc', 'abc'), 0);
    assert.equal(compareValues('abc', 'abd'), -1);
    assert.equal(compareValues('5px', '5'), 1, '"5px" is not numeric — string compare');
    assert.equal(compareValues('', ''), 0);
    assert.equal(compareValues('apple', 'Banana'), -1, 'locale-aware ordering');
});

test('splitSwitchPair splits on the first "=" only', () => {
    assert.deepEqual(splitSwitchPair('happy=She smiles.'), { rawKey: 'happy', rawResult: 'She smiles.' });
    assert.deepEqual(splitSwitchPair('a=b=c'), { rawKey: 'a', rawResult: 'b=c' });
    assert.deepEqual(splitSwitchPair('=empty key'), { rawKey: '', rawResult: 'empty key' });
    assert.equal(splitSwitchPair('no separator'), null);
});

test('sumList adds numerics and reports what it skipped', () => {
    assert.deepEqual(sumList(['3', '4', '5']), { total: 12, used: 3, skipped: [] });
    const mixed = sumList(['3', 'cat', '4']);
    assert.equal(mixed.total, 7);
    assert.deepEqual(mixed.skipped, ['cat']);
    assert.deepEqual(sumList([]), { total: 0, used: 0, skipped: [] });
});

test('uniqueList keeps first occurrences; sliceList follows JS slice semantics', () => {
    assert.deepEqual(uniqueList(['a', 'b', 'a', 'c', 'b']), ['a', 'b', 'c']);
    assert.deepEqual(sliceList(['a', 'b', 'c', 'd'], 1, 3), ['b', 'c']);
    assert.deepEqual(sliceList(['a', 'b', 'c'], -1), ['c']);
    assert.deepEqual(sliceList(['a', 'b', 'c'], 0, -1), ['a', 'b']);
});

test('listContains matches numerically when possible', () => {
    assert.ok(listContains(['1', '2', '3'], '2.0'));
    assert.ok(listContains(['sword', 'shield'], 'shield'));
    assert.ok(!listContains(['sword', 'shield'], 'Shield'), 'case-sensitive for text');
});

test('shuffleList: seeded is deterministic, and the items are preserved', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const one = shuffleList(items, 'seed1');
    const two = shuffleList(items, 'seed1');
    assert.deepEqual(one, two, 'same seed, same order');
    assert.deepEqual([...one].sort(), [...items].sort(), 'same items');
    assert.deepEqual(items, ['a', 'b', 'c', 'd', 'e', 'f'], 'input untouched');
    const unseeded = shuffleList(items);
    assert.deepEqual([...unseeded].sort(), [...items].sort());
});

test('padText clamps to PAD_MAX and defaults the filler', () => {
    assert.equal(padText('7', 4, '0'), '0007');
    assert.equal(padText('7', 4, '0', 'end'), '7000');
    assert.equal(padText('hi', 4), '  hi');
    assert.equal(padText('hi', 9999).length, 500, 'clamped');
    assert.equal(padText('hi', 4, ''), '  hi', 'empty filler falls back to space');
});

test('titleCaseText and countWords', () => {
    assert.equal(titleCaseText('the winter market'), 'The Winter Market');
    assert.equal(titleCaseText('already Up'), 'Already Up');
    assert.equal(countWords('how many words is this'), 5);
    assert.equal(countWords('  '), 0);
    assert.equal(countWords(''), 0);
});

test('regexReplaceText replaces with groups and enforces every guard', () => {
    assert.equal(regexReplaceText('a1b22c', '[0-9]+', '#'), 'a#b#c');
    assert.equal(regexReplaceText('john smith', '(\\w+) (\\w+)', '$2 $1'), 'smith john');
    assert.equal(regexReplaceText('AAA', 'a', 'x', 'gi'), 'xxx');
    assert.equal(regexReplaceText('ab', '(a)', '$12'), '$12b', '$10+ style references become literal text');

    assert.throws(() => regexReplaceText('x', 'a'.repeat(201), ''), RegexError, 'pattern too long');
    assert.throws(() => regexReplaceText('x'.repeat(100001), 'a', ''), RegexError, 'input too long');
    assert.throws(() => regexReplaceText('x', 'a', '', 'gy'), RegexError, 'bad flag');
    assert.throws(() => regexReplaceText('x', '(unclosed', ''), RegexError, 'bad pattern');
});

test('regexReplaceText neutralizes named-group references in the replacement', () => {
    assert.equal(regexReplaceText('ab', '(?<first>a)', '$<first>x'), '$<first>xb');
});

test('jsonValueAt walks paths and returns raw values', () => {
    assert.equal(jsonValueAt('{"a":{"b":5}}', 'a.b'), 5);
    assert.deepEqual(jsonValueAt('{"a":[1,2]}', 'a'), [1, 2]);
    assert.equal(jsonValueAt('{"a":1}', 'missing'), undefined);
    assert.throws(() => jsonValueAt('nope', 'a'), JsonPathError);
});

test('jsonSetValue creates intermediate objects and arrays', () => {
    assert.equal(jsonSetValue('', 'a.b', 'x'), '{"a":{"b":"x"}}');
    assert.equal(jsonSetValue('{}', 'items[0]', 'sword'), '{"items":["sword"]}');
    assert.equal(jsonSetValue('{"a":{"b":"old"}}', 'a.b', 'new'), '{"a":{"b":"new"}}');
    assert.equal(jsonSetValue('{"a":"scalar"}', 'a.b', 'x'), '{"a":{"b":"x"}}', 'scalar replaced by object');
    assert.equal(jsonSetValue('not json', 'k', 'v'), '{"k":"v"}', 'invalid input starts fresh');
    assert.equal(jsonSetValue('{"list":["a","b"]}', 'list[-1]', 'c'), '{"list":["a","c"]}', 'negative index from the end');
});

test('jsonSetValue rejects empty and over-deep paths', () => {
    assert.throws(() => jsonSetValue('{}', '', 'v'), JsonPathError);
    const deepPath = Array.from({ length: 17 }, (_, i) => `k${i}`).join('.');
    assert.throws(() => jsonSetValue('{}', deepPath, 'v'), JsonPathError);
});
