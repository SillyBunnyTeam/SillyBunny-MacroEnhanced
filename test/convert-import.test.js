import test from 'node:test';
import assert from 'node:assert/strict';
import {
    convertRegexScripts,
    convertWorldBook,
    isRegexBundle,
    isWorldBook,
    rewriteAtShorthand,
    rewriteBangSetvar,
    rewriteMacros,
    rewriteSpaceArgs,
} from '../scripts/convert-import.js';

test('input is recognised by shape, not by any label', () => {
    assert.equal(isWorldBook({ entries: [] }), true);
    assert.equal(isWorldBook({ entries: {} }), false, 'an object map is already native');
    assert.equal(isRegexBundle({ scripts: [] }), true);
    assert.equal(isRegexBundle([]), false, 'a bare array already imports');
});

test('{{@name}} becomes a chat-variable read', () => {
    assert.equal(rewriteAtShorthand('{{@current_location}}'), '{{getchatvar::current_location}}');
    assert.equal(
        rewriteAtShorthand('{{default::{{@day}}::1}}'),
        '{{default::{{getchatvar::day}}::1}}',
    );
    assert.equal(rewriteAtShorthand('{{.local}}'), '{{.local}}', 'dot shorthand is valid and stays');
    assert.equal(rewriteAtShorthand('email@example.com'), 'email@example.com');
});

test('{{!setvar}} collapses to its side effect or a real setvar', () => {
    // A throwaway name exists only to swallow output the setter no longer produces.
    assert.equal(
        rewriteBangSetvar('{{!setvar _dummy {{addchatvar::elapsed_minutes::$<elapsed>}} }}'),
        '{{addchatvar::elapsed_minutes::$<elapsed>}}',
    );
    // A name the content reads back must survive as a variable.
    assert.equal(
        rewriteBangSetvar('{{!setvar last_tick {{default::{{@satdecay_last_tick}}::0}} }}'),
        '{{setvar::last_tick::{{default::{{@satdecay_last_tick}}::0}}}}',
    );
    assert.equal(rewriteBangSetvar('no macros'), 'no macros');
});

test('a lone space argument becomes {{space}}', () => {
    assert.equal(rewriteSpaceArgs('{{split::{{user}}:: ::0}}'), '{{split::{{user}}::{{space}}::0}}');
    assert.equal(rewriteSpaceArgs('{{wrap:: ::::X}}'), '{{wrap::{{space}}::::X}}');
    // Spaces inside ordinary text are not separators and must not move.
    assert.equal(rewriteSpaceArgs('{{replace::a b::a::c}}'), '{{replace::a b::a::c}}');
    assert.equal(rewriteSpaceArgs('plain text with  spaces'), 'plain text with  spaces');
});

test('world book entries become a uid-keyed map with host field names', () => {
    const source = {
        entries: [{
            uid: '53bf1804-370a-4977-906f-4d0c9283e6f8',
            key: ['ZONE_Forest'],
            keysecondary: [],
            content: 'Dense vegetation. {{@current_location}}',
            comment: 'Forest',
            position: 4,
            depth: 1,
            role: 'system',
            order_value: 100,
            disabled: true,
            group_name: 'zones',
            use_probability: true,
            selective_logic: 0,
            scan_depth: 2,
            case_sensitive: false,
            match_whole_words: true,
            prevent_recursion: true,
            sticky: 5,
            priority: 10,
            wi_marker: 'x',
        }],
    };
    const notes = [];
    const { entries } = convertWorldBook(source, { warn: n => notes.push(n) });

    const entry = entries[0];
    assert.equal(entry.uid, 0, 'UUIDs are replaced by the integer uids the host uses');
    assert.deepEqual(entry.key, ['ZONE_Forest'], 'keywords survive — the CharacterBook path drops these');
    assert.equal(entry.order, 100);
    assert.equal(entry.disable, true);
    assert.equal(entry.group, 'zones');
    assert.equal(entry.useProbability, true);
    assert.equal(entry.selectiveLogic, 0);
    assert.equal(entry.scanDepth, 2);
    assert.equal(entry.matchWholeWords, true);
    assert.equal(entry.preventRecursion, true);
    assert.equal(entry.sticky, 5);
    assert.equal(entry.role, 0, 'role is stored as a number');
    assert.equal(entry.content, 'Dense vegetation. {{getchatvar::current_location}}');

    for (const gone of ['order_value', 'disabled', 'group_name', 'priority', 'wi_marker']) {
        assert.equal(Object.hasOwn(entry, gone), false, `${gone} should not survive`);
    }
    assert.ok(notes.some(note => note.includes('priority')), 'drops are reported, not silent');
});

test('regex scripts become a bare array with host field names', () => {
    const source = {
        scripts: [
            {
                name: 'Second', script_id: 'b', find_regex: '<b>(.*?)</b>', replace_string: 'B',
                flags: 'g', placement: ['ai_output'], target: ['display'], sort_order: 50,
                trim_strings: [], run_on_edit: true, disabled: false, folder: 'x',
            },
            {
                name: 'First', script_id: 'a', find_regex: '<a>(?<v>\\d+)</a>',
                replace_string: '{{setchatvar::x::$<v>}} {{split::{{user}}:: ::0}}',
                flags: 'g', placement: ['ai_output'], target: ['response'], sort_order: 10,
                trim_strings: [], run_on_edit: false, disabled: true, min_depth: 1, max_depth: 4,
            },
        ],
    };
    const scripts = convertRegexScripts(source, { warn: () => {} });

    assert.equal(scripts.length, 2);
    assert.equal(scripts[0].scriptName, 'First', 'emitted in sort_order, which the host takes from array order');

    const first = scripts[0];
    // Flags only survive in the /pattern/flags form; a bare pattern loses /g and
    // would rewrite just the first match.
    assert.equal(first.findRegex, '/<a>(?<v>\\d+)</a>/g');
    assert.equal(first.replaceString, '{{setchatvar::x::$<v>}} {{split::{{user}}::{{space}}::0}}');
    assert.deepEqual(first.placement, [2], 'ai_output is placement 2');
    assert.equal(first.markdownOnly, false, '"response" rewrites the stored message');
    assert.equal(first.runOnEdit, false);
    assert.equal(first.disabled, true);
    assert.equal(first.minDepth, 1);
    assert.equal(first.maxDepth, 4);
    assert.deepEqual(first.trimStrings, []);

    assert.equal(scripts[1].markdownOnly, true, '"display" only changes what is shown');
});

test('a script with no recognised placement still fires, with a warning', () => {
    const notes = [];
    const scripts = convertRegexScripts(
        { scripts: [{ name: 'x', find_regex: 'a', replace_string: 'b', placement: ['nonsense'] }] },
        { warn: n => notes.push(n) },
    );
    assert.deepEqual(scripts[0].placement, [2]);
    assert.ok(notes.some(note => note.includes('placement')));
});

test('rewriteMacros applies every rewrite together', () => {
    assert.equal(
        rewriteMacros('{{!setvar _d {{addchatvar::t::{{@n}}}} }}{{split::a:: ::0}}'),
        '{{addchatvar::t::{{getchatvar::n}}}}{{split::a::{{space}}::0}}',
    );
});
