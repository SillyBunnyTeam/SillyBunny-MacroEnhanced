import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pairSpans, runTrace } from '../src/workbench/trace.js';

/** Builds macro infos from a marker list: [name, isClosing, argCount, start, end]. */
function info(name, isClosing, argCount, startOffset, endOffset) {
    return { name, isClosing, argCount, startOffset, endOffset };
}

test('pairSpans: plain macros become one span each', () => {
    const spans = pairSpans([
        info('time', false, 0, 3, 10),
        info('upper', false, 1, 20, 35),
    ], 40);
    assert.deepEqual(spans, [
        { startOffset: 3, endOffset: 10 },
        { startOffset: 20, endOffset: 35 },
    ]);
});

test('pairSpans: a scoped block runs from opener to matching closer, nesting included', () => {
    // {{if a}} {{time}} {{if b}}x{{/if}} {{/if}} {{roll}}
    const spans = pairSpans([
        info('if', false, 1, 0, 7),
        info('time', false, 0, 9, 16),
        info('if', false, 1, 18, 25),
        info('if', true, 0, 27, 33),
        info('if', true, 0, 35, 41),
        info('roll', false, 0, 43, 50),
    ], 60);
    assert.deepEqual(spans, [
        { startOffset: 0, endOffset: 41 },
        { startOffset: 43, endOffset: 50 },
    ]);
});

test('pairSpans: inline {{if cond::content}} (2 args) consumes no closer', () => {
    // {{if a::x}} ... {{if b}}scoped{{/if}} — the inline if must not steal the closer.
    const spans = pairSpans([
        info('if', false, 2, 0, 10),
        info('if', false, 1, 15, 22),
        info('if', true, 0, 30, 36),
    ], 40);
    assert.deepEqual(spans, [
        { startOffset: 0, endOffset: 10 },
        { startOffset: 15, endOffset: 36 },
    ]);
});

test('pairSpans: inline same-name openers inside a block do not distort the depth', () => {
    // {{if a}} {{if b::inline}} {{/if}}
    const spans = pairSpans([
        info('if', false, 1, 0, 7),
        info('if', false, 2, 9, 24),
        info('if', true, 0, 26, 32),
    ], 40);
    assert.deepEqual(spans, [{ startOffset: 0, endOffset: 32 }]);
});

test('pairSpans: stray closers are skipped; unclosed blocks run to the end of the text', () => {
    const stray = pairSpans([
        info('if', true, 0, 0, 6),
        info('time', false, 0, 8, 15),
    ], 20);
    assert.deepEqual(stray, [{ startOffset: 8, endOffset: 15 }]);

    // An opener whose closer never arrives is not scoped at all (no closer exists) -> plain span.
    const noCloser = pairSpans([info('if', false, 1, 0, 7)], 30);
    assert.deepEqual(noCloser, [{ startOffset: 0, endOffset: 7 }]);
});

test('runTrace evaluates spans in document order within one shared session', () => {
    const text = '{{setvar::x::5}} and {{getvar::x}}';
    const extract = () => [
        info('setvar', false, 2, 0, 15),
        info('getvar', false, 1, 21, 33),
    ];
    const state = {};
    const evaluate = (slice) => {
        if (slice.startsWith('{{setvar')) {
            state.x = '5';
            return '';
        }
        return state.x ?? '';
    };
    let clock = 0;
    const rows = runTrace(text, { extract, evaluate, now: () => (clock += 10) });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].text, '{{setvar::x::5}}');
    assert.equal(rows[1].text, '{{getvar::x}}');
    assert.equal(rows[1].output, '5', 'earlier span state visible to later spans');
    assert.equal(rows[0].ms, 10);
    assert.equal(rows[0].error, null);
});

test('runTrace reports per-span errors without aborting the rest', () => {
    const extract = () => [info('boom', false, 0, 0, 7), info('ok', false, 0, 9, 14)];
    const evaluate = (slice) => {
        if (slice.includes('boom')) {
            throw new Error('kaput');
        }
        return 'fine';
    };
    const rows = runTrace('{{boom}} {{ok}}', { extract, evaluate });
    assert.equal(rows[0].error, 'kaput');
    assert.equal(rows[1].output, 'fine');
});
