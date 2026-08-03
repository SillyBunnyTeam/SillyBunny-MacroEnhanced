import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { installStubContext } from './helpers/stub-context.js';

const { PACK_FORMAT, PACK_VERSION, exportPack, parsePack } = await import('../src/custom/pack.js');

beforeEach(() => {
    installStubContext({});
});

const sampleDefs = [
    {
        id: 'x1', enabled: true, name: 'greet', description: 'Says hi',
        template: 'Hello {{who}}!',
        args: [{ name: 'who', optional: true, defaultValue: 'you', description: 'Whom to greet' }],
    },
    { id: 'x2', enabled: false, name: 'plain', description: '', template: 'text', args: [] },
];

test('export -> parse round-trips the shareable fields and drops local ones', () => {
    const pack = exportPack(sampleDefs, { exportedAt: '2026-08-03T00:00:00Z' });
    assert.equal(pack.format, PACK_FORMAT);
    assert.equal(pack.version, PACK_VERSION);
    assert.equal(pack.exportedAt, '2026-08-03T00:00:00Z');
    assert.ok(!('id' in pack.macros[0]) && !('enabled' in pack.macros[0]));

    const { macros, problems } = parsePack(JSON.stringify(pack));
    assert.deepEqual(problems, []);
    assert.equal(macros.length, 2);
    assert.equal(macros[0].name, 'greet');
    assert.equal(macros[0].template, 'Hello {{who}}!');
    assert.deepEqual(macros[0].args, [{ name: 'who', optional: true, defaultValue: 'you', description: 'Whom to greet' }]);
    assert.ok(!('id' in macros[0]), 'partials are id-less — createDef assigns fresh ids');
});

test('parsePack rejects non-JSON, wrong format, wrong version, missing list', () => {
    assert.ok(parsePack('{{{').problems[0].includes('not a valid JSON'));
    assert.ok(parsePack('{"format":"other"}').problems[0].includes('not a Macro Enhanced pack'));
    assert.ok(parsePack(JSON.stringify({ format: PACK_FORMAT, version: 99, macros: [] })).problems[0].includes('version'));
    assert.ok(parsePack(JSON.stringify({ format: PACK_FORMAT, version: PACK_VERSION })).problems[0].includes('no macro list'));
});

test('parsePack skips invalid definitions with per-macro problems, keeps the rest', () => {
    const pack = {
        format: PACK_FORMAT,
        version: PACK_VERSION,
        macros: [
            { name: 'good', template: 'fine', args: [] },
            { name: '1bad', template: 'x', args: [] },
            { name: 'empty', template: '', args: [] },
            { name: 'gap', template: 'x', args: [{ name: 'a', optional: true }, { name: 'b' }] },
            { name: 'me-nope', template: 'x', args: [] },
            { name: 'good', template: 'duplicate', args: [] },
        ],
    };
    const { macros, problems } = parsePack(JSON.stringify(pack));
    assert.deepEqual(macros.map(macro => macro.name), ['good']);
    assert.equal(problems.length, 5);
    assert.ok(problems.some(problem => problem.includes('"1bad"')));
    assert.ok(problems.some(problem => problem.includes('appears twice')));
});

test('parsePack tolerates malformed arg entries by coercion', () => {
    const pack = {
        format: PACK_FORMAT, version: PACK_VERSION,
        macros: [{ name: 'ok', template: 'x', args: [{ name: 'a', optional: 1, defaultValue: 5 }] }],
    };
    const { macros, problems } = parsePack(JSON.stringify(pack));
    assert.deepEqual(problems, []);
    assert.deepEqual(macros[0].args, [{ name: 'a', optional: true, defaultValue: '5' }]);
});
