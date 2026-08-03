import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { installStubContext } from './helpers/stub-context.js';

const { computeMessageDepths, messageVerdict, resolveCachingConfig } = await import('../src/auditor/depth.js');

beforeEach(() => {
    installStubContext({});
});

const user = { isUser: true };
const ai = { isUser: false };

test('computeMessageDepths counts role switches from the end of the chat', () => {
    // Chronological: ai greeting, user, ai, user, ai
    assert.deepEqual(computeMessageDepths([ai, user, ai, user, ai]), [4, 3, 2, 1, 0]);
    // Consecutive same-role messages share a depth (one role block).
    assert.deepEqual(computeMessageDepths([user, user, ai, ai, user]), [2, 2, 1, 1, 0]);
    assert.deepEqual(computeMessageDepths([ai]), [0]);
    assert.deepEqual(computeMessageDepths([]), []);
});

test('messageVerdict: at or above the caching depth costs money', () => {
    assert.equal(messageVerdict(5, 2), 'costly');
    assert.equal(messageVerdict(2, 2), 'costly', 'the breakpoint message itself is cached');
    assert.equal(messageVerdict(1, 2), 'harmless');
    assert.equal(messageVerdict(0, 2), 'harmless');
    assert.equal(messageVerdict(5, null), 'no-caching');
    assert.equal(messageVerdict(5, -1), 'no-caching');
});

test('resolveCachingConfig prefers server values and normalizes the depth', async () => {
    const config = await resolveCachingConfig({
        fetchConfig: async () => ({
            ok: true,
            claude: { cachingAtDepth: 2, enableSystemPromptCache: true, extendedTTL: true },
            lastModifiedMs: 123,
        }),
    });
    assert.equal(config.source, 'server');
    assert.equal(config.cachingAtDepth, 2);
    assert.equal(config.enableSystemPromptCache, true);
    assert.equal(config.extendedTTL, true);
    assert.equal(config.lastModifiedMs, 123);

    const disabled = await resolveCachingConfig({
        fetchConfig: async () => ({ ok: true, claude: { cachingAtDepth: -1 }, lastModifiedMs: null }),
    });
    assert.equal(disabled.cachingAtDepth, null, '-1 means off');
});

test('resolveCachingConfig falls back to the manual setting, then to none', async () => {
    const { ctx } = installStubContext({});
    ctx.extensionSettings.MacroEnhanced = { settingsVersion: 2, customMacros: [], auditor: { manualCachingAtDepth: 3 } };
    const manual = await resolveCachingConfig({ fetchConfig: async () => ({ ok: false, status: 403 }) });
    assert.equal(manual.source, 'manual');
    assert.equal(manual.cachingAtDepth, 3);

    ctx.extensionSettings.MacroEnhanced.auditor.manualCachingAtDepth = null;
    const none = await resolveCachingConfig({ fetchConfig: async () => ({ ok: false, status: 403 }) });
    assert.equal(none.source, 'none');
    assert.equal(none.cachingAtDepth, null);
});
