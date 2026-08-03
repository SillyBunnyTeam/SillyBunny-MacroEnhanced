import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    dayStamp,
    daysBetween,
    fnv1a,
    isValidStateKey,
    mulberry32,
    parseDiceFormula,
    parseTimestamp,
    pickIndex,
    rollDice,
    seasonOf,
    stickyNeedsRefresh,
    timeOfDay,
} from '../src/state-impl.js';

test('state keys: word chars, dots, colons, hyphens; must not be empty or silly', () => {
    for (const good of ['a', 'A1', 'scene.opening', 'npc:mood', 'roll-1', '_x', 'k'.repeat(64)]) {
        assert.ok(isValidStateKey(good), `"${good}" should be valid`);
    }
    for (const bad of ['', ' ', '.leading', 'has space', 'k'.repeat(65), 'emoji💥', null, undefined]) {
        assert.ok(!isValidStateKey(bad), `"${bad}" should be invalid`);
    }
});

test('fnv1a is deterministic and spreads inputs', () => {
    assert.equal(fnv1a('hello'), fnv1a('hello'));
    assert.notEqual(fnv1a('hello'), fnv1a('hellp'));
    assert.equal(fnv1a(''), 0x811c9dc5, 'empty string returns the offset basis');
    assert.ok(Number.isInteger(fnv1a('anything')) && fnv1a('anything') >= 0);
});

test('mulberry32 is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, [c(), c(), c()]);
    for (const value of seqA) {
        assert.ok(value >= 0 && value < 1);
    }
});

test('parseDiceFormula accepts NdM, dM, modifiers and plain sides', () => {
    assert.deepEqual(parseDiceFormula('2d6'), { count: 2, sides: 6, modifier: 0 });
    assert.deepEqual(parseDiceFormula('d20'), { count: 1, sides: 20, modifier: 0 });
    assert.deepEqual(parseDiceFormula('3D6+2'), { count: 3, sides: 6, modifier: 2 });
    assert.deepEqual(parseDiceFormula('1d10-1'), { count: 1, sides: 10, modifier: -1 });
    assert.deepEqual(parseDiceFormula(' 20 '), { count: 1, sides: 20, modifier: 0 });
    for (const bad of ['', '0d6', '2d0', 'd', '2x6', '2d6+', '1d6*2', 'abc', '2d6+2d6']) {
        assert.equal(parseDiceFormula(bad), null, `"${bad}" should not parse`);
    }
});

test('rollDice stays within bounds and honours the modifier', () => {
    const formula = { count: 3, sides: 6, modifier: 2 };
    for (let i = 0; i < 50; i++) {
        const total = rollDice(formula);
        assert.ok(total >= 5 && total <= 20, `roll ${total} out of range`);
    }
    assert.equal(rollDice({ count: 2, sides: 4, modifier: 0 }, () => 0), 2, 'floor of the range');
    assert.equal(rollDice({ count: 2, sides: 4, modifier: 0 }, () => 0.999), 8, 'ceiling of the range');
});

test('timeOfDay buckets the hours', () => {
    assert.equal(timeOfDay(5), 'morning');
    assert.equal(timeOfDay(11), 'morning');
    assert.equal(timeOfDay(12), 'afternoon');
    assert.equal(timeOfDay(16), 'afternoon');
    assert.equal(timeOfDay(17), 'evening');
    assert.equal(timeOfDay(21), 'evening');
    assert.equal(timeOfDay(22), 'night');
    assert.equal(timeOfDay(4), 'night');
    assert.equal(timeOfDay(0), 'night');
});

test('seasonOf maps months and flips for the southern hemisphere', () => {
    assert.equal(seasonOf(0), 'winter');
    assert.equal(seasonOf(3), 'spring');
    assert.equal(seasonOf(7), 'summer');
    assert.equal(seasonOf(10), 'autumn');
    assert.equal(seasonOf(11), 'winter');
    assert.equal(seasonOf(0, 'south'), 'summer');
    assert.equal(seasonOf(3, 'SOUTH'), 'autumn');
    assert.equal(seasonOf(7, 'south'), 'winter');
});

test('dayStamp is a zero-padded local YYYY-MM-DD', () => {
    assert.equal(dayStamp(new Date(2026, 0, 5)), '2026-01-05');
    assert.equal(dayStamp(new Date(2026, 11, 31)), '2026-12-31');
});

test('stickyNeedsRefresh: missing entries refresh, otherwise the window decides', () => {
    assert.ok(stickyNeedsRefresh(undefined, 5, 3));
    assert.ok(stickyNeedsRefresh({ value: 'x' }, 5, 3), 'entry without atUserCount refreshes');
    assert.ok(!stickyNeedsRefresh({ value: 'x', atUserCount: 4 }, 5, 3), '1 of 3 messages elapsed');
    assert.ok(!stickyNeedsRefresh({ value: 'x', atUserCount: 3 }, 5, 3), '2 of 3 messages elapsed');
    assert.ok(stickyNeedsRefresh({ value: 'x', atUserCount: 2 }, 5, 3), 'exactly 3 elapsed refreshes');
    assert.ok(stickyNeedsRefresh({ value: 'x', atUserCount: 0 }, 5, 3));
});

test('pickIndex is deterministic, in range, and -1 for empty lists', () => {
    assert.equal(pickIndex('seed', 0), -1);
    const index = pickIndex('chat123:weather', 5);
    assert.equal(index, pickIndex('chat123:weather', 5));
    assert.ok(index >= 0 && index < 5);
});

test('parseTimestamp: numbers, numeric strings, ISO, and humanized am/pm dates', () => {
    assert.equal(parseTimestamp(1719000000000), 1719000000000);
    assert.equal(parseTimestamp('1719000000000'), 1719000000000);
    assert.ok(Number.isFinite(parseTimestamp('2026-08-03T10:00:00Z')));
    assert.ok(Number.isFinite(parseTimestamp('June 19, 2023 2:20pm')), 'host humanized format');
    assert.ok(Number.isNaN(parseTimestamp('not a date')));
    assert.ok(Number.isNaN(parseTimestamp('')));
    assert.ok(Number.isNaN(parseTimestamp(undefined)));
});

test('daysBetween floors to whole days and never goes negative', () => {
    const DAY = 86400000;
    assert.equal(daysBetween(0, 3 * DAY), 3);
    assert.equal(daysBetween(0, 3 * DAY - 1), 2);
    assert.equal(daysBetween(5 * DAY, 0), 0, 'future start clamps to 0');
});
