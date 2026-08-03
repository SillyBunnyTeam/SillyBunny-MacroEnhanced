import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    capitalizeText,
    clampNumber,
    defaultText,
    estimateTokens,
    formatNumber,
    itemAt,
    jsonGet,
    JsonPathError,
    repeatText,
    replaceText,
    sortList,
    splitList,
    substringText,
    truncateText,
    truncateTokensText,
} from '../src/utility-impl.js';

test('capitalizeText uppercases only the first letter', () => {
    assert.equal(capitalizeText('hello world'), 'Hello world');
    assert.equal(capitalizeText(''), '');
    assert.equal(capitalizeText('a'), 'A');
});

test('replaceText replaces every occurrence, plain text only', () => {
    assert.equal(replaceText('the cat sat on the cat', 'cat', 'dog'), 'the dog sat on the dog');
    assert.equal(replaceText('a.b.c', '.', '-'), 'a-b-c');
    assert.equal(replaceText('abc', '', 'x'), 'abc');
    assert.equal(replaceText('aaa', 'a', ''), '');
});

test('substringText supports negative indices and open end', () => {
    assert.equal(substringText('hello world', 0, 5), 'hello');
    assert.equal(substringText('hello world', -5), 'world');
    assert.equal(substringText('hello world', 6, undefined), 'world');
    assert.equal(substringText('abc', 0, -1), 'ab');
});

test('repeatText clamps the count', () => {
    assert.deepEqual(repeatText('ab', 3), { result: 'ababab', clamped: false });
    assert.equal(repeatText('a', 5000).result.length, 1000);
    assert.equal(repeatText('a', 5000).clamped, true);
    assert.deepEqual(repeatText('a', -2), { result: '', clamped: false });
});

test('defaultText falls back on empty or whitespace', () => {
    assert.equal(defaultText('value', 'fallback'), 'value');
    assert.equal(defaultText('', 'fallback'), 'fallback');
    assert.equal(defaultText('   ', 'fallback'), 'fallback');
    assert.equal(defaultText(undefined, 'fallback'), 'fallback');
});

test('truncateText keeps total length within max including the ellipsis', () => {
    assert.equal(truncateText('hello world', 20), 'hello world');
    assert.equal(truncateText('hello world', 8), 'hello w…');
    assert.equal(truncateText('hello world', 8).length, 8);
    assert.equal(truncateText('hello world', 8, '...'), 'hello...');
    assert.equal(truncateText('hello', 0), '');
    // ellipsis longer than max: hard cut, no ellipsis
    assert.equal(truncateText('hello world', 2, '...'), 'he');
});

test('token estimation is ~4 chars per token', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens('abcd'), 1);
    assert.equal(estimateTokens('abcde'), 2);
    assert.equal(truncateTokensText('a'.repeat(100), 5).length, 20);
});

test('formatNumber avoids float noise', () => {
    assert.equal(formatNumber(0.1 + 0.2), '0.3');
    assert.equal(formatNumber(42), '42');
    assert.equal(formatNumber(2.5), '2.5');
});

test('clampNumber limits to range and tolerates swapped bounds', () => {
    assert.equal(clampNumber(5, 0, 10), 5);
    assert.equal(clampNumber(-1, 0, 10), 0);
    assert.equal(clampNumber(11, 0, 10), 10);
    assert.equal(clampNumber(11, 10, 0), 10);
});

test('splitList trims items and treats blank input as empty', () => {
    assert.deepEqual(splitList('a, b , c'), ['a', 'b', 'c']);
    assert.deepEqual(splitList(''), []);
    assert.deepEqual(splitList('   '), []);
    assert.deepEqual(splitList('a;b', ';'), ['a', 'b']);
    assert.deepEqual(splitList('single'), ['single']);
});

test('itemAt picks by index including negatives', () => {
    assert.equal(itemAt(0, 'red,green,blue'), 'red');
    assert.equal(itemAt(-1, 'red,green,blue'), 'blue');
    assert.equal(itemAt(5, 'red,green,blue'), '');
    assert.equal(itemAt(1, 'a;b;c', ';'), 'b');
});

test('sortList sorts naturally, asc and desc', () => {
    assert.deepEqual(sortList('banana,apple,cherry'), ['apple', 'banana', 'cherry']);
    assert.deepEqual(sortList('item10,item2,item1'), ['item1', 'item2', 'item10']);
    assert.deepEqual(sortList('b,a,c', ',', 'desc'), ['c', 'b', 'a']);
});

test('jsonGet reads dot and bracket paths', () => {
    const json = JSON.stringify({ user: { name: 'Ann' }, items: [{ id: 7 }, { id: 8 }] });
    assert.equal(jsonGet(json, 'user.name'), 'Ann');
    assert.equal(jsonGet(json, 'items[0].id'), '7');
    assert.equal(jsonGet(json, 'items[-1].id'), '8');
    assert.equal(jsonGet(json, 'items'), '[{"id":7},{"id":8}]');
    assert.equal(jsonGet(json, 'missing.path'), '');
    assert.equal(jsonGet('"scalar"', ''), 'scalar');
});

test('jsonGet throws JsonPathError on malformed input', () => {
    assert.throws(() => jsonGet('not json', 'a'), JsonPathError);
    assert.throws(() => jsonGet('{}', 'a[unclosed'), JsonPathError);
});
