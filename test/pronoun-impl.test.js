import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_SPEC, PRESETS, defaultPronounSet, parsePronounSet, previewSentence } from '../src/pronoun-impl.js';

test('every preset parses to its five forms', () => {
    for (const [spec, forms] of Object.entries(PRESETS)) {
        const set = parsePronounSet(spec);
        assert.deepEqual([set.sub, set.obj, set.poss, set.poss_p, set.ref], forms, spec);
        assert.equal(set.short, spec);
    }
});

test('only they takes plural verbs by default', () => {
    assert.equal(parsePronounSet('they/them').plural, true);
    assert.equal(parsePronounSet('she/her').plural, false);
    assert.equal(parsePronounSet('he/him').plural, false);
    assert.equal(parsePronounSet('it/its').plural, false);
    // Neo-pronouns take singular verbs: "xe is", not "xe are".
    assert.equal(parsePronounSet('xe/xem/xyr/xyrs/xemself').plural, false);
});

test('a full five-part spec is taken verbatim', () => {
    const set = parsePronounSet('xe/xem/xyr/xyrs/xemself');
    assert.deepEqual([set.sub, set.obj, set.poss, set.poss_p, set.ref], ['xe', 'xem', 'xyr', 'xyrs', 'xemself']);
    assert.equal(set.spec, 'xe/xem/xyr/xyrs/xemself');
});

// This is what {{pronouns}} returns, so someone can paste it straight back into
// the settings box. "it/its" is the trap: its subject and object are both "it".
test('the short form always parses back to the same set', () => {
    for (const spec of [...Object.keys(PRESETS), 'xe/xem/xyr/xyrs/xemself', 'ae/aer/aer/aers/aerself/plural']) {
        const set = parsePronounSet(spec);
        assert.deepEqual(parsePronounSet(set.short), set, `${spec} -> ${set.short}`);
    }
});

test('a sixth part overrides verb agreement in both directions', () => {
    assert.equal(parsePronounSet('xe/xem/xyr/xyrs/xemself/plural').plural, true);
    assert.equal(parsePronounSet('they/them/their/theirs/themself/singular').plural, false);
});

test('specs are case- and whitespace-insensitive', () => {
    const set = parsePronounSet('  She / Her  ');
    assert.equal(set.sub, 'she');
    assert.equal(set.short, 'she/her');
});

test('an empty spec means unset, which is they/them', () => {
    for (const empty of ['', '   ', null, undefined, '///']) {
        assert.equal(parsePronounSet(empty).short, DEFAULT_SPEC, JSON.stringify(empty));
    }
});

test('unparseable specs return null so the caller can warn', () => {
    // Two parts that name no preset: the other three forms are not derivable.
    assert.equal(parsePronounSet('ze/zir'), null);
    assert.equal(parsePronounSet('nonsense'), null);
    // Too few forms to be a full spec, too many to be a preset.
    assert.equal(parsePronounSet('a/b/c'), null);
    assert.equal(parsePronounSet('a/b/c/d'), null);
    // A seventh part, and a sixth that is not a plurality word.
    assert.equal(parsePronounSet('a/b/c/d/e/f'), null);
    assert.equal(parsePronounSet('a/b/c/d/e/plural/x'), null);
});

test('defaultPronounSet matches parsing the default spec', () => {
    assert.deepEqual(defaultPronounSet(), parsePronounSet(DEFAULT_SPEC));
});

test('the preview sentence uses every form', () => {
    const sentence = previewSentence(parsePronounSet('she/her'));
    for (const word of ['she', 'her', 'hers', 'herself']) {
        assert.ok(sentence.includes(word), `preview should contain "${word}": ${sentence}`);
    }
    assert.ok(previewSentence(parsePronounSet('they/them')).includes('they have'));
    assert.ok(previewSentence(parsePronounSet('she/her')).includes('she has'));
});
