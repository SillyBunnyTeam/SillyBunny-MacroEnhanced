import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { installStubContext } from './helpers/stub-context.js';

const cache = await import('../src/lorebook-cache.js');

function makeBook(entries) {
    const keyed = {};
    entries.forEach((entry, index) => {
        keyed[index] = { uid: index, key: [], keysecondary: [], comment: '', content: '', disable: false, ...entry };
    });
    return { entries: keyed };
}

let ctx;

beforeEach(() => {
    cache.clearCache();
    ({ ctx } = installStubContext({}));
});

test('computePrewarmNames unions chat, global, character and charLore books', () => {
    ctx.chatMetadata['world_info'] = 'ChatBook';
    ctx.worldInfoSettings.globalSelect = ['GlobalA', 'GlobalB'];
    ctx.characterId = 0;
    ctx.characters[0] = { avatar: 'ann.png', data: { extensions: { world: 'AnnBook' } } };
    ctx.worldInfoSettings.charLore = [
        { name: 'ann', extraBooks: ['AnnExtra'] },
        { name: 'bob', extraBooks: ['BobExtra'] },
    ];

    const names = cache.computePrewarmNames(ctx);
    assert.deepEqual(names.sort(), ['AnnBook', 'AnnExtra', 'ChatBook', 'GlobalA', 'GlobalB']);
});

test('getSearchOrder puts chat book first, then character, then global', () => {
    ctx.chatMetadata['world_info'] = 'ChatBook';
    ctx.worldInfoSettings.globalSelect = ['GlobalA'];
    ctx.characterId = 0;
    ctx.characters[0] = { avatar: 'ann.png', data: { extensions: { world: 'AnnBook' } } };

    assert.deepEqual(cache.getSearchOrder(ctx), ['ChatBook', 'AnnBook', 'GlobalA']);
});

test('findEntry matches by comment title case-insensitively, then by uid', () => {
    cache.indexBook('Book', makeBook([
        { uid: 0, comment: 'Backstory', content: 'origin tale' },
        { uid: 1, comment: '', content: 'untitled' },
    ]));
    ctx.chatMetadata['world_info'] = 'Book';

    assert.equal(cache.findEntry(ctx, 'backstory').entry.content, 'origin tale');
    assert.equal(cache.findEntry(ctx, 'BACKSTORY').entry.content, 'origin tale');
    assert.equal(cache.findEntry(ctx, '1').entry.content, 'untitled');
    assert.equal(cache.findEntry(ctx, 'nope').entry, null);
});

test('findEntry search precedence: chat book wins over global', () => {
    cache.indexBook('ChatBook', makeBook([{ uid: 0, comment: 'Same', content: 'from chat' }]));
    cache.indexBook('GlobalA', makeBook([{ uid: 0, comment: 'Same', content: 'from global' }]));
    ctx.chatMetadata['world_info'] = 'ChatBook';
    ctx.worldInfoSettings.globalSelect = ['GlobalA'];

    const { entry, book } = cache.findEntry(ctx, 'Same');
    assert.equal(entry.content, 'from chat');
    assert.equal(book, 'ChatBook');
});

test('findEntry reports missing (uncached) books and triggers a background load', async () => {
    let loaded = [];
    ctx.chatMetadata['world_info'] = 'LazyBook';
    ctx.loadWorldInfo = async (name) => {
        loaded.push(name);
        return makeBook([{ uid: 0, comment: 'Entry', content: 'lazy content' }]);
    };

    const miss = cache.findEntry(ctx, 'Entry');
    assert.equal(miss.entry, null);
    assert.deepEqual(miss.missing, ['LazyBook']);

    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(loaded, ['LazyBook']);
    assert.equal(cache.findEntry(ctx, 'Entry').entry.content, 'lazy content', 'hit after async load');
});

test('WORLDINFO_UPDATED payload replaces book without refetch', () => {
    cache.indexBook('Book', makeBook([{ uid: 0, comment: 'Old', content: 'old' }]));
    cache.indexBook('Book', makeBook([{ uid: 0, comment: 'New', content: 'new' }]));
    ctx.chatMetadata['world_info'] = 'Book';

    assert.equal(cache.findEntry(ctx, 'Old').entry, null);
    assert.equal(cache.findEntry(ctx, 'New').entry.content, 'new');
});

test('getEnabledEntries skips disabled entries and uncached books', () => {
    cache.indexBook('Book', makeBook([
        { uid: 0, comment: 'On', disable: false },
        { uid: 1, comment: 'Off', disable: true },
    ]));

    const enabled = cache.getEnabledEntries(['Book', 'NotCached']);
    assert.equal(enabled.length, 1);
    assert.equal(enabled[0].entry.comment, 'On');
});

test('active entries snapshot', () => {
    assert.equal(cache.getActiveEntries().length, 0);
    cache.setActiveEntries([{ uid: 1 }, { uid: 2 }]);
    assert.equal(cache.getActiveEntries().length, 2);
    cache.setActiveEntries(null);
    assert.equal(cache.getActiveEntries().length, 0);
});
