import test from 'node:test';
import assert from 'node:assert/strict';
import {
    addChatVarValue,
    capChatVarValue,
    chatVarEntries,
    isValidChatVarKey,
    isValidLoopAlias,
    loopVarNames,
    normalizeChatVarKey,
    CHAT_VAR_VALUE_MAX,
} from '../src/chatvar-impl.js';

test('keys allow the spaces that character names bring', () => {
    assert.equal(isValidChatVarKey('satiety_ren'), true);
    assert.equal(isValidChatVarKey('satiety_selphie windsong'), true);
    assert.equal(isValidChatVarKey("satiety_o'brien"), true);
    assert.equal(isValidChatVarKey('current-location.x'), true);
    assert.equal(isValidChatVarKey(''), false);
    assert.equal(isValidChatVarKey(' leading'), true, 'normalised before testing');
    assert.equal(isValidChatVarKey('has\nnewline'), false);
    assert.equal(isValidChatVarKey('a'.repeat(200)), false);
});

test('keys are trimmed, since they arrive from capture groups', () => {
    assert.equal(normalizeChatVarKey('  satiety_ren  '), 'satiety_ren');
    assert.equal(normalizeChatVarKey(null), '');
});

test('entries filter by prefix and come back in a stable order', () => {
    const vars = {
        satiety_ren: '80',
        satiety_arlo: '55',
        current_location: 'Forest',
        satiety_tasugi: '100',
    };
    assert.deepEqual(chatVarEntries(vars, 'satiety_'), [
        { key: 'satiety_arlo', suffix: 'arlo', value: '55' },
        { key: 'satiety_ren', suffix: 'ren', value: '80' },
        { key: 'satiety_tasugi', suffix: 'tasugi', value: '100' },
    ]);
    // Same input, same order -- what keeps a loop from breaking prompt caching.
    assert.deepEqual(chatVarEntries(vars, 'satiety_'), chatVarEntries(vars, 'satiety_'));
    assert.equal(chatVarEntries(vars, 'nothing_').length, 0);
    assert.equal(chatVarEntries(vars, '').length, 4);
    assert.equal(chatVarEntries(null, 'x').length, 0);
});

test('adding is numeric when it can be and text when it cannot', () => {
    assert.equal(addChatVarValue('100', '15'), '115');
    assert.equal(addChatVarValue('', '15'), '15', 'missing starts at zero');
    assert.equal(addChatVarValue(undefined, '7'), '7');
    assert.equal(addChatVarValue('10', '-3'), '7');
    assert.equal(addChatVarValue('abc', 'def'), 'abcdef');
    assert.equal(addChatVarValue('5', 'x'), '5x');
});

test('oversized values are cut and reported', () => {
    const small = capChatVarValue('hello');
    assert.equal(small.truncated, false);
    const big = capChatVarValue('x'.repeat(CHAT_VAR_VALUE_MAX + 10));
    assert.equal(big.truncated, true);
    assert.equal(big.value.length, CHAT_VAR_VALUE_MAX);
});

test('loop aliases must survive the host shorthand lexer', () => {
    assert.equal(isValidLoopAlias('p'), true);
    assert.equal(isValidLoopAlias('sp'), true);
    assert.equal(isValidLoopAlias('member2'), true);
    assert.equal(isValidLoopAlias('_p'), false, 'must start with a letter or {{.p}} stays raw text');
    assert.equal(isValidLoopAlias('2p'), false);
    assert.equal(isValidLoopAlias(''), false);
    assert.deepEqual(loopVarNames('p'), { value: 'p', key: 'p_key', entryValue: 'p_value' });
});
