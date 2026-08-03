import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    addMonthsClamped,
    addToDate,
    diffDates,
    formatDate,
    normalizeUnit,
    parseDateInput,
} from '../src/date-impl.js';

test('normalizeUnit: aliases, and the case-sensitive M/m pair', () => {
    assert.equal(normalizeUnit('days'), 'days');
    assert.equal(normalizeUnit('day'), 'days');
    assert.equal(normalizeUnit('d'), 'days');
    assert.equal(normalizeUnit('YEARS'), 'years');
    assert.equal(normalizeUnit('M'), 'months');
    assert.equal(normalizeUnit('m'), 'minutes');
    assert.equal(normalizeUnit('mo'), 'months');
    assert.equal(normalizeUnit('min'), 'minutes');
    assert.equal(normalizeUnit('fortnights'), null);
    assert.equal(normalizeUnit(''), null);
});

test('parseDateInput: empty means now, ISO parses, garbage is null', () => {
    const fixedNow = new Date(2026, 7, 3, 12, 0, 0);
    assert.equal(parseDateInput('', () => fixedNow), fixedNow);
    assert.equal(parseDateInput('  ', () => fixedNow), fixedNow);
    const parsed = parseDateInput('2026-08-03T10:00:00Z');
    assert.equal(parsed.getTime(), Date.parse('2026-08-03T10:00:00Z'));
    assert.equal(parseDateInput('banana'), null);
});

test('addMonthsClamped clamps the day-of-month', () => {
    assert.equal(formatDate(addMonthsClamped(new Date(2026, 0, 31), 1), 'YYYY-MM-DD'), '2026-02-28');
    assert.equal(formatDate(addMonthsClamped(new Date(2024, 0, 31), 1), 'YYYY-MM-DD'), '2024-02-29', 'leap year');
    assert.equal(formatDate(addMonthsClamped(new Date(2026, 2, 15), 2), 'YYYY-MM-DD'), '2026-05-15');
    assert.equal(formatDate(addMonthsClamped(new Date(2026, 2, 31), -1), 'YYYY-MM-DD'), '2026-02-28');
});

test('addToDate covers every unit', () => {
    const base = new Date(2026, 7, 3, 10, 30, 0);
    assert.equal(formatDate(addToDate(base, 1, 'years'), 'YYYY-MM-DD'), '2027-08-03');
    assert.equal(formatDate(addToDate(base, 2, 'months'), 'YYYY-MM-DD'), '2026-10-03');
    assert.equal(formatDate(addToDate(base, 1, 'weeks'), 'YYYY-MM-DD'), '2026-08-10');
    assert.equal(formatDate(addToDate(base, -3, 'days'), 'YYYY-MM-DD'), '2026-07-31');
    assert.equal(formatDate(addToDate(base, 5, 'hours'), 'HH:mm'), '15:30');
    assert.equal(formatDate(addToDate(base, 45, 'minutes'), 'HH:mm'), '11:15');
    assert.equal(formatDate(addToDate(base, 30, 'seconds'), 'HH:mm:ss'), '10:30:30');
});

test('diffDates truncates toward zero and can be negative', () => {
    const jan1 = new Date(2026, 0, 1);
    const aug3 = new Date(2026, 7, 3);
    assert.equal(diffDates(jan1, aug3, 'months'), 7);
    assert.equal(diffDates(aug3, jan1, 'months'), -7);
    assert.equal(diffDates(jan1, aug3, 'days'), 214);
    assert.equal(diffDates(jan1, new Date(2027, 0, 1), 'years'), 1);
    assert.equal(diffDates(jan1, new Date(2026, 11, 31), 'years'), 0, 'almost a year is 0 years');
    assert.equal(diffDates(new Date(2026, 0, 31), new Date(2026, 1, 28), 'months'), 1, 'Feb 28 is Jan 31\'s clamped anniversary — a full month');
    assert.equal(diffDates(new Date(2026, 0, 31), new Date(2026, 1, 27), 'months'), 0, 'one day short of the clamped anniversary');
    assert.equal(diffDates(new Date(2026, 0, 1, 0, 0, 0), new Date(2026, 0, 1, 2, 30, 0), 'hours'), 2);
});

test('formatDate: tokens, 12-hour clock, weekday names, bracketed literals', () => {
    const date = new Date(2026, 7, 3, 14, 5, 9); // a Monday
    assert.equal(formatDate(date, 'YYYY-MM-DD HH:mm:ss'), '2026-08-03 14:05:09');
    assert.equal(formatDate(date, 'dddd, MMMM D'), 'Monday, August 3');
    assert.equal(formatDate(date, 'ddd MMM DD YY'), 'Mon Aug 03 26');
    assert.equal(formatDate(date, 'h:mm A'), '2:05 PM');
    assert.equal(formatDate(new Date(2026, 7, 3, 0, 30), 'h a'), '12 am', 'midnight is 12 am');
    assert.equal(formatDate(date, '[Day] D [of] MMMM'), 'Day 3 of August');
    assert.equal(formatDate(date, ''), '');
});
