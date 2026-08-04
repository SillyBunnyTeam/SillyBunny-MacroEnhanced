import test from 'node:test';
import assert from 'node:assert/strict';
import { ExprError, evaluateCondition, hasExpressionOperator } from '../src/expr-impl.js';

test('detects operators only outside quotes and nested macros', () => {
    assert.equal(hasExpressionOperator('{{.hp}} > 0'), true);
    assert.equal(hasExpressionOperator('a != b'), true);
    assert.equal(hasExpressionOperator('a || b'), true);
    // A whole condition that is just one nested macro has no operator of its own.
    assert.equal(hasExpressionOperator('{{gt::a::b}}'), false);
    assert.equal(hasExpressionOperator('{{getchatvar::current_location}}'), false);
    // Operators belonging to an inner macro's arguments do not count.
    assert.equal(hasExpressionOperator('{{calc::1 > 0}}'), false);
    // Quoted operators are literal text.
    assert.equal(hasExpressionOperator('name == "a > b"'), true);
    assert.equal(hasExpressionOperator('"a > b"'), false);
    // A single pipe is the host's output filter, not our OR.
    assert.equal(hasExpressionOperator('{{foo}}|upper'), false);
});

test('comparisons are numeric first, then text', () => {
    assert.equal(evaluateCondition('0 > 0'), false);
    assert.equal(evaluateCondition('1 > 0'), true);
    assert.equal(evaluateCondition('5 == 5.0'), true);
    assert.equal(evaluateCondition('10 > 9'), true, 'numbers must not compare as strings');
    assert.equal(evaluateCondition('abc == abc'), true);
    assert.equal(evaluateCondition('abc != abd'), true);
    assert.equal(evaluateCondition('12 >= 12'), true);
    assert.equal(evaluateCondition('11 <= 2'), false);
});

test('operands may contain spaces and quotes', () => {
    assert.equal(evaluateCondition('selphie windsong == "selphie windsong"'), true);
    assert.equal(evaluateCondition('tasugi == "user"'), false);
    assert.equal(evaluateCondition('  ren  ==  ren  '), true);
    assert.equal(evaluateCondition('"" == ""'), true, 'an explicitly empty operand survives');
});

test('precedence runs comparisons before && before ||', () => {
    // Were || to bind tighter, this would come out true.
    assert.equal(evaluateCondition('false || 1 == 2'), false);
    assert.equal(evaluateCondition('true || 1 == 2'), true);
    assert.equal(evaluateCondition('1 == 1 && 2 == 2'), true);
    assert.equal(evaluateCondition('1 == 1 && 2 == 3'), false);
    assert.equal(evaluateCondition('0 > 1 || 2 > 1 && 3 > 2'), true);
    assert.equal(evaluateCondition('(1 == 2 || 3 == 3) && 4 == 4'), true);
});

test('bare operands fall back to host truthiness', () => {
    assert.equal(evaluateCondition('Forest'), true);
    assert.equal(evaluateCondition(''), false);
    assert.equal(evaluateCondition('false'), false);
    assert.equal(evaluateCondition('off'), false);
    assert.equal(evaluateCondition('0'), false);
    assert.equal(evaluateCondition('!false'), true);
    assert.equal(evaluateCondition('!Forest'), false);
});

test('the exact conditions from the imported content', () => {
    // Satiety decay gate: the reason this whole layer exists.
    assert.equal(evaluateCondition('0 > 0'), false);
    assert.equal(evaluateCondition('3 > 0'), true);
    // Skip-self guard inside the party loop.
    assert.equal(evaluateCondition('satiety_ren != satiety_ren'), false);
    assert.equal(evaluateCondition('satiety_ren != satiety_tasugi'), true);
    // First-turn branch.
    assert.equal(evaluateCondition('true == true'), true);
    assert.equal(evaluateCondition('false == true'), false);
    // Eat-target resolution.
    assert.equal(evaluateCondition('false || tasugi == "user" || tasugi == tasugi'), true);
    assert.equal(evaluateCondition('false || ren == "user" || ren == tasugi'), false);
});

test('malformed conditions raise ExprError rather than guessing', () => {
    assert.throws(() => evaluateCondition('a == '), ExprError);
    assert.throws(() => evaluateCondition('(a == b'), ExprError);
    assert.throws(() => evaluateCondition('a == "b'), ExprError);
    assert.throws(() => evaluateCondition('=='), ExprError);
});
