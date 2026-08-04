#!/usr/bin/env node
/**
 * Converts world books and regex-script bundles exported by other chat apps into
 * the shapes SillyBunny actually imports.
 *
 *   node scripts/convert-import.js <file>… [--out <dir>]
 *
 * Two things are wrong with such exports, and neither can be fixed from inside an
 * extension, which is why this is a script rather than a feature:
 *
 * 1. Shape. A world book whose `entries` is an ARRAY is not read as a world book
 *    at all — SillyBunny's importer falls through to its CharacterBook branch,
 *    which looks for `keys`/`secondary_keys` and finds `key`/`keysecondary`. The
 *    import then reports success having silently dropped every keyword. A regex
 *    bundle wrapped in `{version, scripts: […]}` fails outright, because the
 *    importer takes a bare array.
 *
 * 2. Macro spellings the host's grammar cannot express. `{{@name}}` never lexes
 *    (`@` is not one of the host's sigils, which are ! ? ~ # / and >), and
 *    `{{!setvar name value}}` cannot work either: `!` is parsed but documented as
 *    not implemented, and arguments separated by spaces arrive as ONE argument.
 *    A lone space argument is also impossible — the lexer skips whitespace
 *    between separators — so `:: ::` is rewritten to use {{space}}.
 *
 * Everything else is left byte-for-byte alone.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

// ---------- macro rewrites -------------------------------------------------

/** `{{@foo}}` -> `{{getchatvar::foo}}`. */
export function rewriteAtShorthand(text) {
    return String(text ?? '').replace(/\{\{@([\w.:-]+)\}\}/g, '{{getchatvar::$1}}');
}

/**
 * `{{!setvar name value}}` -> the value's own macros, or a proper {{setvar}}.
 *
 * The form exists only to run a side effect and swallow whatever it printed.
 * Since every setter here already returns nothing, a wrapper whose variable is
 * never read collapses to just its value.
 */
export function rewriteBangSetvar(text) {
    const source = String(text ?? '');
    let out = '';
    let i = 0;
    while (i < source.length) {
        const open = source.indexOf('{{!setvar ', i);
        if (open === -1) {
            out += source.slice(i);
            break;
        }
        const end = findMacroEnd(source, open);
        if (end === -1) {
            out += source.slice(i);
            break;
        }
        out += source.slice(i, open);
        const inner = source.slice(open + '{{!setvar '.length, end - 2).trim();
        const space = inner.search(/\s/);
        const name = space === -1 ? inner : inner.slice(0, space);
        const value = space === -1 ? '' : inner.slice(space + 1).trim();
        // `_dummy` is the throwaway name the pattern uses when it only wants the
        // side effect; anything else is a variable the content really reads back.
        out += name.startsWith('_') ? value : `{{setvar::${name}::${value}}}`;
        i = end;
    }
    return out;
}

/** Index just past the `}}` closing the macro that opens at `start`, or -1. */
export function findMacroEnd(text, start) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        if (text.startsWith('{{', i)) {
            depth++;
            i++;
        } else if (text.startsWith('}}', i)) {
            depth--;
            i++;
            if (depth === 0) {
                return i + 1;
            }
        }
    }
    return -1;
}

/**
 * A single-space argument (`::` space `::`) becomes `{{space}}`.
 *
 * The lexer discards whitespace between argument separators, so the space never
 * reaches the macro. {{split}} and {{wrap}} resolve their own arguments, which
 * lets an explicit {{space}} through where a literal one cannot survive.
 */
export function rewriteSpaceArgs(text) {
    return String(text ?? '').replace(/::[ \t]+(?=::|\}\})/g, '::{{space}}');
}

export function rewriteMacros(text) {
    return rewriteSpaceArgs(rewriteBangSetvar(rewriteAtShorthand(text)));
}

// ---------- world book -----------------------------------------------------

/** Fields with no counterpart in SillyBunny's world info. */
const WORLD_DROPPED = ['priority', 'exclude_greeting', 'wi_marker', 'wi_marker_side'];

const ROLE_NUMBERS = { system: 0, user: 1, assistant: 2 };

/** snake_case source field -> camelCase native field. Others keep their name. */
const WORLD_RENAMES = {
    order_value: 'order',
    disabled: 'disable',
    group_name: 'group',
    group_override: 'groupOverride',
    group_weight: 'groupWeight',
    use_probability: 'useProbability',
    use_group_scoring: 'useGroupScoring',
    selective_logic: 'selectiveLogic',
    scan_depth: 'scanDepth',
    case_sensitive: 'caseSensitive',
    match_whole_words: 'matchWholeWords',
    automation_id: 'automationId',
    outlet_name: 'outletName',
    exclude_recursion: 'excludeRecursion',
    prevent_recursion: 'preventRecursion',
    delay_until_recursion: 'delayUntilRecursion',
};

export function isWorldBook(data) {
    return !!data && Array.isArray(data.entries);
}

export function convertWorldBook(data, { warn = () => {} } = {}) {
    const entries = {};
    data.entries.forEach((source, index) => {
        const entry = {
            uid: index,
            displayIndex: index,
            addMemo: true,
        };
        for (const [key, value] of Object.entries(source)) {
            if (key === 'uid' || WORLD_DROPPED.includes(key)) {
                continue;
            }
            const name = WORLD_RENAMES[key] ?? key;
            entry[name] = value;
        }
        // The host stores role as a number, and only for at-depth entries.
        if (typeof entry.role === 'string') {
            const mapped = ROLE_NUMBERS[entry.role.toLowerCase()];
            entry.role = mapped === undefined ? null : mapped;
        }
        entry.content = rewriteMacros(entry.content ?? '');
        entries[index] = entry;
    });

    for (const field of WORLD_DROPPED) {
        const count = data.entries.filter(entry => entry[field] !== undefined && entry[field] !== null).length;
        if (count) {
            warn(`dropped "${field}" from ${count} entr${count === 1 ? 'y' : 'ies'} — SillyBunny has no equivalent`);
        }
    }
    // uid is reassigned, but the source uids were UUIDs the host cannot use.
    warn(`converted ${data.entries.length} entries; uids renumbered 0-${data.entries.length - 1}`);

    return { entries };
}

// ---------- regex scripts --------------------------------------------------

/** Source placement names -> the host's numeric placement enum. */
const PLACEMENTS = { user_input: 1, ai_output: 2, slash_command: 3, world_info: 5, reasoning: 6 };

/** Fields the host's regex feature has no counterpart for. */
const REGEX_DROPPED = ['actions', 'scope', 'scope_id', 'folder', 'metadata', 'substitute_macros', 'sort_order', 'description'];

export function isRegexBundle(data) {
    return !!data && Array.isArray(data.scripts);
}

export function convertRegexScripts(data, { warn = () => {} } = {}) {
    const scripts = [...data.scripts]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((source) => {
            const targets = Array.isArray(source.target) ? source.target : [];
            const placement = (Array.isArray(source.placement) ? source.placement : [])
                .map(name => PLACEMENTS[String(name).toLowerCase()])
                .filter(value => value !== undefined);
            if (!placement.length) {
                warn(`"${source.name}": no usable placement, defaulting to AI output`);
                placement.push(PLACEMENTS.ai_output);
            }

            // Flags only survive inside the /pattern/flags form: a bare pattern
            // compiles without /g, which would replace just the first match.
            const flags = String(source.flags ?? '').replace(/[^gmisuxXUAJ]/g, '');
            const findRegex = flags
                ? `/${source.find_regex}/${flags}`
                : String(source.find_regex ?? '');

            return {
                id: source.script_id ?? undefined,
                scriptName: source.name ?? 'Unnamed script',
                findRegex,
                replaceString: rewriteMacros(source.replace_string ?? ''),
                trimStrings: Array.isArray(source.trim_strings) ? source.trim_strings : [],
                placement,
                disabled: !!source.disabled,
                // "display" edits only what is shown; "response" rewrites the
                // stored message, which is the host's no-flags default.
                markdownOnly: targets.includes('display'),
                promptOnly: false,
                runOnEdit: source.run_on_edit !== false,
                substituteRegex: 0,
                minDepth: source.min_depth ?? null,
                maxDepth: source.max_depth ?? null,
            };
        });

    const dropped = REGEX_DROPPED.filter(field => data.scripts.some(script => script[field] !== undefined
        && script[field] !== null
        && !(Array.isArray(script[field]) && !script[field].length)
        && !(typeof script[field] === 'object' && !Array.isArray(script[field]) && !Object.keys(script[field]).length)));
    if (dropped.length) {
        warn(`dropped fields with no equivalent: ${dropped.join(', ')}`);
    }
    warn('sort_order is gone; scripts are emitted in that order instead, which is what the host uses');
    warn('scope is chosen in the import dialog, not in the file');

    return scripts;
}

// ---------- driver ---------------------------------------------------------

function convertFile(path, outDir) {
    // Exports are frequently written with a BOM, which JSON.parse rejects.
    const raw = readFileSync(path, 'utf8').replace(/^﻿/, '');
    const data = JSON.parse(raw);
    const notes = [];
    const warn = (message) => notes.push(message);

    let converted;
    let suffix = '';
    if (isWorldBook(data)) {
        converted = convertWorldBook(data, { warn });
    } else if (isRegexBundle(data)) {
        converted = convertRegexScripts(data, { warn });
        suffix = '';
    } else {
        throw new Error('not a world book (array "entries") or a regex bundle (array "scripts")');
    }

    // The world's name comes from the filename on import, so it is preserved.
    const name = `${basename(path, extname(path))}${suffix}.json`;
    const target = join(outDir ?? dirname(path), name);
    if (!existsSync(dirname(target))) {
        mkdirSync(dirname(target), { recursive: true });
    }
    writeFileSync(target, `${JSON.stringify(converted, null, 4)}\n`, 'utf8');
    return { target, notes };
}

function main(argv) {
    const args = [...argv];
    let outDir = null;
    const outIndex = args.indexOf('--out');
    if (outIndex !== -1) {
        outDir = args[outIndex + 1];
        args.splice(outIndex, 2);
    }
    if (!args.length) {
        console.error('usage: node scripts/convert-import.js <file>… [--out <dir>]');
        return 1;
    }

    let failed = 0;
    for (const path of args) {
        try {
            const { target, notes } = convertFile(path, outDir);
            console.log(`${basename(path)} -> ${target}`);
            for (const note of notes) {
                console.log(`    note: ${note}`);
            }
        } catch (error) {
            console.error(`${basename(path)}: ${error.message}`);
            failed++;
        }
    }
    return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
    process.exit(main(process.argv.slice(2)));
}
