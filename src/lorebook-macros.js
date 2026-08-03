import { safeRegister } from './registration.js';
import {
    findEntry,
    getActiveEntries,
    getEnabledEntries,
    getSearchOrder,
    isBookCached,
    warmBook,
} from './lorebook-cache.js';

export const CATEGORY_LOREBOOK = 'enhanced-lorebook';

/** Guards {{lore}} against entries that (directly or via nesting) include themselves. */
const inFlight = new Set();

function entryTitle(entry) {
    const comment = String(entry.comment ?? '').trim();
    if (comment) {
        return comment;
    }
    const firstKey = Array.isArray(entry.key) ? entry.key[0] : undefined;
    return firstKey ? String(firstKey) : String(entry.uid);
}

function lookup(entryName, bookName, warn) {
    const ctx = SillyTavern.getContext();
    const { entry, book, missing } = findEntry(ctx, entryName, bookName || undefined);
    if (!entry) {
        if (missing.length) {
            warn(`Lorebook${missing.length > 1 ? 's' : ''} ${missing.map(name => `"${name}"`).join(', ')} not loaded yet — try again in a moment.`);
        } else {
            warn(`No lorebook entry named "${entryName}" found${bookName ? ` in "${bookName}"` : ''}.`);
        }
        return null;
    }
    return { entry, book };
}

export function registerLorebookMacros() {
    safeRegister('lore', {
        aliases: [{ alias: 'wi', visible: false }],
        category: CATEGORY_LOREBOOK,
        unnamedArgs: [
            { name: 'entry', description: 'The entry title (its memo/comment) or uid.' },
            { name: 'book', optional: true, description: 'A specific lorebook name. Without it, the chat, character and global books are searched in that order.' },
        ],
        description: 'Inserts the content of a lorebook entry. Macros inside the entry are expanded too.',
        exampleUsage: ['{{lore::Backstory}}', '{{lore::Kingdom::My World}}'],
        handler: ({ unnamedArgs: [entryName, bookName], resolve, warn }) => {
            const found = lookup(entryName, bookName, warn);
            if (!found) {
                return '';
            }
            const guardKey = `${found.book}::${found.entry.uid}`;
            if (inFlight.has(guardKey)) {
                warn(`Lorebook entry "${entryName}" includes itself; returning its raw content.`);
                return String(found.entry.content ?? '');
            }
            inFlight.add(guardKey);
            try {
                return resolve(String(found.entry.content ?? ''));
            } finally {
                inFlight.delete(guardKey);
            }
        },
    });

    safeRegister('lorekeys', {
        category: CATEGORY_LOREBOOK,
        unnamedArgs: [
            { name: 'entry', description: 'The entry title (its memo/comment) or uid.' },
            { name: 'book', optional: true, description: 'A specific lorebook name.' },
        ],
        description: 'Lists the trigger keywords of a lorebook entry, comma separated.',
        exampleUsage: ['{{lorekeys::Backstory}}'],
        handler: ({ unnamedArgs: [entryName, bookName], warn }) => {
            const found = lookup(entryName, bookName, warn);
            if (!found) {
                return '';
            }
            return (found.entry.key ?? []).join(', ');
        },
    });

    safeRegister('loreexists', {
        category: CATEGORY_LOREBOOK,
        unnamedArgs: [
            { name: 'entry', description: 'The entry title (its memo/comment) or uid.' },
            { name: 'book', optional: true, description: 'A specific lorebook name.' },
        ],
        description: 'Checks whether a lorebook entry exists. Returns "true" or "false".',
        exampleUsage: ['{{if {{loreexists::Backstory}}}}...{{/if}}'],
        handler: ({ unnamedArgs: [entryName, bookName], warn }) => {
            const ctx = SillyTavern.getContext();
            const { entry, missing } = findEntry(ctx, entryName, bookName || undefined);
            if (!entry && missing.length) {
                warn(`Lorebook${missing.length > 1 ? 's' : ''} ${missing.map(name => `"${name}"`).join(', ')} not loaded yet — "false" may be wrong until then.`);
            }
            return entry ? 'true' : 'false';
        },
    });

    safeRegister('lorecount', {
        category: CATEGORY_LOREBOOK,
        unnamedArgs: [
            { name: 'scope', optional: true, defaultValue: 'active', description: '"active" (triggered last generation), "bound" (enabled entries in the books bound to this chat) or "all".' },
        ],
        description: 'Counts lorebook entries.',
        returnType: 'integer',
        exampleUsage: ['{{lorecount}}', '{{lorecount::bound}}'],
        handler: ({ unnamedArgs: [scope], warn }) => {
            const ctx = SillyTavern.getContext();
            const mode = String(scope || 'active').toLowerCase();
            if (mode === 'active') {
                return String(getActiveEntries().length);
            }
            if (mode === 'bound') {
                return String(getEnabledEntries(getSearchOrder(ctx)).length);
            }
            if (mode === 'all') {
                const names = ctx.getWorldInfoNames?.() ?? [];
                const uncached = names.filter(name => !isBookCached(name));
                uncached.forEach(name => warmBook(ctx, name));
                if (uncached.length) {
                    warn(`${uncached.length} lorebook(s) not loaded yet; the count only covers loaded books.`);
                }
                return String(getEnabledEntries(names).length);
            }
            warn(`Unknown scope "${scope}" — use active, bound or all.`);
            return '';
        },
    });

    safeRegister('loreactive', {
        category: CATEGORY_LOREBOOK,
        unnamedArgs: [
            { name: 'separator', optional: true, defaultValue: ', ', description: 'Placed between the entry titles.' },
        ],
        description: 'Lists the titles of the lorebook entries that triggered during the last generation.',
        exampleUsage: ['{{loreactive}}'],
        handler: ({ unnamedArgs: [separator] }) => {
            const sep = separator === undefined || separator === '' ? ', ' : separator;
            return getActiveEntries().map(entryTitle).join(sep);
        },
    });

    safeRegister('lorebooks', {
        category: CATEGORY_LOREBOOK,
        unnamedArgs: [
            { name: 'separator', optional: true, defaultValue: ', ', description: 'Placed between the book names.' },
        ],
        description: 'Lists the lorebooks bound to this chat (chat book, character books, global books).',
        exampleUsage: ['{{lorebooks}}'],
        handler: ({ unnamedArgs: [separator] }) => {
            const ctx = SillyTavern.getContext();
            const sep = separator === undefined || separator === '' ? ', ' : separator;
            return getSearchOrder(ctx).join(sep);
        },
    });
}
