import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    CLASS_CHAT,
    CLASS_PERIODIC,
    CLASS_RANDOM,
    CLASS_STABLE,
    CLASS_STATE,
    CLASS_TIME,
    SEVERITY,
    classifyName,
    classifySource,
    scanMacroNames,
} from '../src/auditor/volatility.js';

test('scanMacroNames catches nested macros, flags, and counts occurrences', () => {
    const counts = scanMacroNames('At {{time}}, {{upper::{{time}}}} strikes. {{!roll::d6}} {{? getvar :: x}}');
    assert.equal(counts.get('time'), 2, 'nested occurrence counted too');
    assert.equal(counts.get('upper'), 1);
    assert.equal(counts.get('roll'), 1, 'flag prefix skipped');
    assert.equal(counts.get('getvar'), 1, 'whitespace after flags tolerated');
});

test('scanMacroNames reports variable shorthand under .shorthand', () => {
    const counts = scanMacroNames('Set {{.hp = 5}} and {{$visits++}} but not {{normal}}');
    assert.equal(counts.get('.shorthand'), 2);
    assert.equal(counts.get('normal'), 1);
    assert.equal(scanMacroNames('no macros here').size, 0);
});

test('classifyName knows the core and extension names, including me- aliases', () => {
    assert.equal(classifyName('time').cls, CLASS_TIME);
    assert.equal(classifyName('RANDOM').cls, CLASS_RANDOM);
    assert.equal(classifyName('lastmessage').cls, CLASS_CHAT);
    assert.equal(classifyName('setvar').cls, CLASS_STATE);
    assert.equal(classifyName('timeofday').cls, CLASS_PERIODIC);
    assert.equal(classifyName('freeze').cls, CLASS_STABLE);
    assert.equal(classifyName('pick').cls, CLASS_STABLE);
    assert.equal(classifyName('me-timeofday').cls, CLASS_PERIODIC, 'me- alias resolves');
    assert.equal(classifyName('.shorthand').cls, CLASS_STATE);
    assert.equal(classifyName('somethingunknown'), null);
});

test('classifyName falls back to the registry category for unknown variable macros', () => {
    const deps = { getRegistryCategory: (name) => (name === 'setvarkey2' ? 'variable' : null) };
    assert.equal(classifyName('setvarkey2', deps).cls, CLASS_STATE);
    assert.equal(classifyName('setvarkey2', {}), null);
});

test('custom macros inherit the worst class of their template, transitively', () => {
    const templates = new Map([
        ['outer', 'calls {{inner}} and {{timeofday}}'],
        ['inner', 'uses {{random::a::b}}'],
        ['calm', 'just {{user}} text'],
    ]);
    const deps = { getCustomTemplate: (name) => templates.get(name) ?? null };

    const outer = classifyName('outer', deps);
    assert.equal(outer.cls, CLASS_RANDOM, 'worst class wins through the chain');
    assert.deepEqual(outer.via, ['inner', 'random']);
    assert.equal(classifyName('calm', deps).cls, CLASS_STABLE, 'no volatile references = stable');
});

test('custom-template cycles do not loop', () => {
    const templates = new Map([
        ['a', 'see {{b}}'],
        ['b', 'see {{a}} and {{time}}'],
    ]);
    const deps = { getCustomTemplate: (name) => templates.get(name) ?? null };
    const result = classifyName('a', deps);
    assert.equal(result.cls, CLASS_TIME, 'cycle broken, volatile leaf still found');
});

test('classifySource sorts worst-first and drops unknown names', () => {
    const findings = classifySource('{{timeofday}} {{random::x::y}} {{time}} {{unknownmacro}}');
    assert.deepEqual(findings.map(finding => finding.name), ['random', 'time', 'timeofday']);
    assert.ok(SEVERITY[findings[0].cls] >= SEVERITY[findings[1].cls]);
});
