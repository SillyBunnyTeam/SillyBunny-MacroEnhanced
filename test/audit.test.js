import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { createStubRegistry, installStubContext } from './helpers/stub-context.js';

const { formatAuditReport, runAudit } = await import('../src/auditor/audit.js');
const { collectSources } = await import('../src/auditor/sources.js');
const { clearCache, indexBook } = await import('../src/lorebook-cache.js');

let ctx;

function stubConfig(overrides = {}) {
    return async () => ({
        source: 'server',
        cachingAtDepth: 2,
        enableSystemPromptCache: false,
        extendedTTL: false,
        lastModifiedMs: null,
        ...overrides,
    });
}

beforeEach(() => {
    clearCache();
    ({ ctx } = installStubContext({ registry: createStubRegistry() }));
    ctx.mainApi = 'openai';
    ctx.chatCompletionSettings = { prompts: [] };
    ctx.worldInfoSettings = { globalSelect: [], charLore: [] };
    ctx.powerUserSettings.persona_description = '';
});

test('collectSources enumerates presets, card, persona, lore and recent chat', () => {
    ctx.chatCompletionSettings.prompts = [
        { identifier: 'main', name: 'Main', content: 'Be {{char}}.' },
        { identifier: 'chatHistory', name: 'Chat History', marker: true },
    ];
    ctx.characterId = 0;
    ctx.characters[0] = {
        description: 'A {{time}} wanderer.',
        personality: '',
        data: { system_prompt: 'Always {{random::a::b}}.', extensions: { depth_prompt: { prompt: 'Deep note' } } },
    };
    ctx.powerUserSettings.persona_description = 'I am {{user}}.';
    ctx.worldInfoSettings.globalSelect = ['Book'];
    indexBook('Book', { entries: { 1: { uid: 1, comment: 'Entry', content: 'Lore text', disable: false } } });
    ctx.chat = [
        { mes: 'hello', is_user: true },
        { mes: 'hi {{lastMessage}}', is_user: false },
        { mes: 'system', is_system: true },
    ];

    const { sources, notes } = collectSources();
    const kinds = sources.map(source => source.kind);
    assert.deepEqual([...new Set(kinds)], ['preset', 'card', 'persona', 'lore', 'chat']);
    assert.equal(sources.filter(source => source.kind === 'preset').length, 1, 'marker prompts skipped');
    assert.equal(sources.filter(source => source.kind === 'card').length, 3, 'empty card fields skipped');
    assert.equal(sources.filter(source => source.kind === 'chat').length, 2, 'system messages skipped');
    assert.equal(notes.length, 0);
});

test('collectSources notes non-chat-completion APIs and missing characters', () => {
    ctx.mainApi = 'textgenerationwebui';
    const { notes } = collectSources();
    assert.ok(notes.some(note => note.includes('Preset prompts were skipped')));
    assert.ok(notes.some(note => note.includes('No character')));
});

test('runAudit: static findings get depth-aware verdicts', async () => {
    ctx.chatCompletionSettings.prompts = [{ identifier: 'main', name: 'Main', content: 'Now: {{time}} {{timeofday}}' }];
    ctx.chat = [
        { mes: 'deep AI {{random::a::b}}', is_user: false },
        { mes: 'user says {{roll::d6}}', is_user: true },
        { mes: 'fresh AI {{lastMessage}}', is_user: false },
    ];
    // Depths: [2, 1, 0] with cachingAtDepth 2.
    const report = await runAudit({ resolveConfig: stubConfig() });

    const preset = report.findings.find(finding => finding.name === 'time');
    assert.equal(preset.verdict, 'costly', 'system-side volatile always costs while caching is on');
    const periodic = report.findings.find(finding => finding.name === 'timeofday');
    assert.equal(periodic.verdict, 'friendly');
    assert.equal(report.findings.find(finding => finding.name === 'random').verdict, 'costly', 'depth 2 >= cachingAtDepth 2');
    assert.equal(report.findings.find(finding => finding.name === 'roll').verdict, 'baked', 'user message');
    assert.equal(report.findings.find(finding => finding.name === 'lastmessage').verdict, 'harmless', 'depth 0');
});

test('runAudit: no caching configured downgrades verdicts to no-caching', async () => {
    ctx.chatCompletionSettings.prompts = [{ identifier: 'main', name: 'Main', content: '{{time}}' }];
    const report = await runAudit({ resolveConfig: stubConfig({ source: 'none', cachingAtDepth: null }) });
    assert.equal(report.findings.find(finding => finding.name === 'time').verdict, 'no-caching');
});

test('runAudit: the empirical pass catches unknown volatiles and skips known-stable text', async () => {
    ctx.chatCompletionSettings.prompts = [
        { identifier: 'a', name: 'Sneaky', content: 'plain text, nothing classified' },
        { identifier: 'b', name: 'Calm', content: 'also plain' },
    ];
    let calls = 0;
    const sandboxEvaluate = (text) => {
        if (text.startsWith('plain')) {
            return `changed-${++calls}`;
        }
        return text;
    };
    const report = await runAudit({ resolveConfig: stubConfig(), sandboxEvaluate });
    const empiric = report.findings.filter(finding => finding.empiric);
    assert.equal(empiric.length, 1, 'only the actually-changing source flagged');
    assert.equal(empiric[0].sourceLabel, 'Preset prompt: Sneaky');
    assert.equal(empiric[0].verdict, 'costly');
});

test('runAudit: a throwing source is noted, not fatal', async () => {
    ctx.chatCompletionSettings.prompts = [{ identifier: 'a', name: 'Broken', content: '{{time}} explosive' }];
    const sandboxEvaluate = () => {
        throw new Error('engine exploded');
    };
    const report = await runAudit({ resolveConfig: stubConfig(), sandboxEvaluate });
    assert.ok(report.notes.some(note => note.includes('engine exploded')));
    assert.ok(report.findings.some(finding => finding.name === 'time'), 'static findings survive');
});

test('runAudit classifies custom macros through their templates', async () => {
    ctx.extensionSettings.MacroEnhanced = {
        settingsVersion: 2,
        auditor: { manualCachingAtDepth: null },
        customMacros: [{ id: '1', name: 'flavor', description: '', template: 'a {{random::x::y}} thing', args: [], enabled: true }],
    };
    ctx.chatCompletionSettings.prompts = [{ identifier: 'a', name: 'Main', content: 'Use {{flavor}} here' }];
    const report = await runAudit({ resolveConfig: stubConfig() });
    const finding = report.findings.find(entry => entry.name === 'flavor');
    assert.ok(finding, 'custom macro classified');
    assert.equal(finding.cls, 'random');
    assert.ok(finding.why.includes('via {{random}}'));
});

test('formatAuditReport renders config, problems and notes', async () => {
    ctx.chatCompletionSettings.prompts = [{ identifier: 'a', name: 'Main', content: '{{time}} and {{timeofday}}' }];
    const report = await runAudit({ resolveConfig: stubConfig({ enableSystemPromptCache: true }) });
    const text = formatAuditReport(report);
    assert.ok(text.includes('caching depth: 2 (server)'));
    assert.ok(text.includes('system-prompt cache: on'));
    assert.ok(text.includes('{{time}}'));
    assert.ok(text.includes('cache-friendly-by-design'));

    const clean = formatAuditReport({ config: { source: 'none', cachingAtDepth: null, enableSystemPromptCache: null }, notes: [], findings: [] });
    assert.ok(clean.includes('No cache-breaking macros found'));
});
