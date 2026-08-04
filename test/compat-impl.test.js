import test from 'node:test';
import assert from 'node:assert/strict';
import { findMacroEnd, rewriteIfConditions } from '../src/compat-impl.js';

const rewrite = (text) => rewriteIfConditions(text, 'expr');

test('findMacroEnd counts nested braces', () => {
    assert.equal(findMacroEnd('{{a}}', 0), 5);
    assert.equal(findMacroEnd('{{a::{{b}}}}', 0), 12);
    assert.equal(findMacroEnd('{{a::{{b}}', 0), -1);
});

test('wraps only conditions that contain an operator', () => {
    assert.equal(rewrite('{{if::{{.hp}} > 0}}x{{/if}}'), '{{if::{{expr::{{.hp}} > 0}}}}x{{/if}}');
    assert.equal(rewrite('{{if::{{.a}} != {{.b}}}}x{{/if}}'), '{{if::{{expr::{{.a}} != {{.b}}}}}}x{{/if}}');
});

test('leaves plain conditions exactly as they were', () => {
    for (const text of [
        '{{if::{{getchatvar::current_location}}}} | loc{{/if}}',
        '{{if::{{haschatvar::x}}}}yes{{else}}no{{/if}}',
        '{{if !personality}}none{{/if}}',
        '{{if description}}# Desc{{/if}}',
        '{{if::{{gt::{{.hp}}::0}}}}alive{{/if}}',
        'no macros here at all',
    ]) {
        assert.equal(rewrite(text), text, text);
    }
});

test('does not touch other macros that contain operators', () => {
    const text = '{{calc::{{.a}} % 60}} and {{setvar::x::a > b}}';
    assert.equal(rewrite(text), text);
});

test('handles both the space-separated and inline forms', () => {
    assert.equal(rewrite('{{if {{.hp}} > 0}}x{{/if}}'), '{{if {{expr::{{.hp}} > 0}}}}x{{/if}}');
    // Inline form: only the condition argument is wrapped, the content is left alone.
    assert.equal(
        rewrite('{{if::{{.hp}} > 0::still up}}'),
        '{{if::{{expr::{{.hp}} > 0}}::still up}}',
    );
});

test('rewrites every if in a document, including nested bodies', () => {
    const text = '{{if::{{.a}} > 1}}A{{if::{{.b}} < 2}}B{{/if}}{{/if}}';
    assert.equal(
        rewrite(text),
        '{{if::{{expr::{{.a}} > 1}}}}A{{if::{{expr::{{.b}} < 2}}}}B{{/if}}{{/if}}',
    );
});

test('finds conditions nested inside another macro argument', () => {
    assert.equal(
        rewrite('{{setvar::flag::{{if::{{.a}} == 1}}yes{{/if}}}}'),
        '{{setvar::flag::{{if::{{expr::{{.a}} == 1}}}}yes{{/if}}}}',
    );
});

test('uses the remapped macro name when {{expr}} collided', () => {
    assert.equal(
        rewriteIfConditions('{{if::1 > 0}}x{{/if}}', 'me-expr'),
        '{{if::{{me-expr::1 > 0}}}}x{{/if}}',
    );
});

test('unbalanced braces are left alone rather than mangled', () => {
    const text = '{{if::{{.a}} > 0}}fine{{/if}} and {{broken::';
    assert.equal(rewrite(text), '{{if::{{expr::{{.a}} > 0}}}}fine{{/if}} and {{broken::');
});

test('a quoted operator does not make a plain condition look infix', () => {
    const text = '{{if::{{getchatvar::motto}}}}has motto{{/if}}';
    assert.equal(rewrite(text), text);
});

// ---- OR decomposition -------------------------------------------------------
// `|` starts an output filter inside a macro argument, so a condition containing
// `||` cannot be lexed at all. The pre-processor runs before lexing, so it can
// take the `||` out and express OR through the {{or}} macro's `::` separators.

const names = { expr: 'expr', or: 'or', and: 'and', not: 'not' };
const build = (text) => rewriteIfConditions(text, names);

test('|| becomes {{or}}, whose arguments are separated by ::', () => {
    assert.equal(
        build('{{if::a == 1 || b == 2}}x{{/if}}'),
        '{{if::{{or::{{expr::a == 1}}::{{expr::b == 2}}}}}}x{{/if}}',
    );
    assert.equal(
        build('{{if::a || b || c}}x{{/if}}'),
        '{{if::{{or::{{expr::a}}::{{expr::b}}::{{expr::c}}}}}}x{{/if}}',
    );
    assert.equal(build('{{if::a == 1 || b == 2}}x{{/if}}').includes('|'), false, 'no pipe survives');
});

test('&& becomes {{and}} so precedence survives alongside ||', () => {
    assert.equal(
        build('{{if::a == 1 && b == 2}}x{{/if}}'),
        '{{if::{{and::{{expr::a == 1}}::{{expr::b == 2}}}}}}x{{/if}}',
    );
    // || is looser, so it splits first and && ends up nested inside it.
    assert.equal(
        build('{{if::a || b && c}}x{{/if}}'),
        '{{if::{{or::{{expr::a}}::{{and::{{expr::b}}::{{expr::c}}}}}}}}x{{/if}}',
    );
});

test('|| inside brackets is decomposed too', () => {
    assert.equal(
        build('{{if::(a || b) && c}}x{{/if}}'),
        '{{if::{{and::{{or::{{expr::a}}::{{expr::b}}}}::{{expr::c}}}}}}x{{/if}}',
    );
    assert.equal(build('{{if::(a || b) && c}}x{{/if}}').includes('|'), false);
});

test('a pipe that cannot be removed leaves the condition untouched', () => {
    const skipped = [];
    // A top-level single pipe is a filter, not an OR, and must not be mangled.
    const text = '{{if::a|upper == b}}x{{/if}}';
    assert.equal(rewriteIfConditions(text, names, c => skipped.push(c)), text);
    assert.equal(skipped.length, 1);
});

test('a pipe inside quotes is refused, because the lexer does not honour quotes', () => {
    // Args.Quote is just a token; it does not open a string, so `|` would still
    // start an output filter and break the macro. Better to leave it be.
    const skipped = [];
    const text = '{{if::{{.motto}} == "a || b"}}x{{/if}}';
    assert.equal(rewriteIfConditions(text, names, c => skipped.push(c)), text);
    assert.equal(skipped.length, 1);
});

test('a leading ! wraps in {{not}}', () => {
    assert.equal(build('{{if::!a == b}}x{{/if}}'), '{{if::{{not::{{expr::a == b}}}}}}x{{/if}}');
});

test('the eat condition from the imported content, end to end', () => {
    const condition = '{{blank::$<target>}} || {{lower::$<target>}} == "user" || {{lower::$<target>}} == {{lower::{{split::{{user}}::{{space}}::0}}}}';
    const out = build(`{{if::${condition}}}A{{else}}B{{/if}}`);
    assert.equal(out.includes('||'), false, 'the unlexable operator is gone');
    assert.ok(out.startsWith('{{if::{{or::{{expr::{{blank::$<target>}}}}::'), out);
});
