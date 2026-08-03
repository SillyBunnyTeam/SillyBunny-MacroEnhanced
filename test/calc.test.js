import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CalcError, evaluateExpression } from '../src/utility-impl.js';

test('basic arithmetic and precedence', () => {
    assert.equal(evaluateExpression('2 + 3 * 4'), 14);
    assert.equal(evaluateExpression('(2 + 3) * 4'), 20);
    assert.equal(evaluateExpression('10 - 4 - 3'), 3);
    assert.equal(evaluateExpression('20 / 4 / 5'), 1);
    assert.equal(evaluateExpression('7 % 3'), 1);
});

test('exponent is right-associative and binds tighter than unary minus application', () => {
    assert.equal(evaluateExpression('2 ^ 3 ^ 2'), 512);
    assert.equal(evaluateExpression('2 ^ 10'), 1024);
});

test('unary minus and plus', () => {
    assert.equal(evaluateExpression('-5 + 3'), -2);
    assert.equal(evaluateExpression('--5'), 5);
    assert.equal(evaluateExpression('4 * -2'), -8);
    assert.equal(evaluateExpression('+3'), 3);
});

test('functions', () => {
    assert.equal(evaluateExpression('min(3, 1, 2)'), 1);
    assert.equal(evaluateExpression('max(3, 1, 2)'), 3);
    assert.equal(evaluateExpression('round(2.567, 2)'), 2.57);
    assert.equal(evaluateExpression('round(2.5)'), 3);
    assert.equal(evaluateExpression('floor(2.9)'), 2);
    assert.equal(evaluateExpression('ceil(2.1)'), 3);
    assert.equal(evaluateExpression('abs(-4)'), 4);
    assert.equal(evaluateExpression('sqrt(16)'), 4);
    assert.equal(evaluateExpression('pow(2, 8)'), 256);
    assert.equal(evaluateExpression('MAX(1, 2)'), 2, 'function names are case-insensitive');
});

test('constants', () => {
    assert.ok(Math.abs(evaluateExpression('pi') - Math.PI) < 1e-12);
    assert.ok(Math.abs(evaluateExpression('e') - Math.E) < 1e-12);
    assert.equal(evaluateExpression('round(pi, 2)'), 3.14);
});

test('scientific notation and decimals', () => {
    assert.equal(evaluateExpression('1e3'), 1000);
    assert.equal(evaluateExpression('.5 + .5'), 1);
});

test('malformed input throws CalcError, never anything else', () => {
    const bad = ['', '2 +', '(2', '2 & 3', 'foo', 'foo(1)', 'min()', 'round(1, 2, 3)', '1 2', '2 ** 3', '"str"'];
    for (const expression of bad) {
        assert.throws(() => evaluateExpression(expression), CalcError, `expected CalcError for: ${expression}`);
    }
});

test('division and modulo by zero throw CalcError', () => {
    assert.throws(() => evaluateExpression('1 / 0'), CalcError);
    assert.throws(() => evaluateExpression('1 % 0'), CalcError);
});
