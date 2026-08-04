/**
 * Regenerates the README's macro tables from the macros themselves.
 *
 * The tables used to be a third hand-maintained copy of the descriptions that
 * already live in the code and now also render in the Reference tab. This
 * script makes the code the only copy.
 *
 *   npm run docs         rewrite README.md
 *   npm run docs:check   exit non-zero if it would change (used by the tests)
 *
 * Only the marked block is touched; every hand-written section around it is
 * left exactly as it is.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createStubRegistry, installStubContext } from '../test/helpers/stub-context.js';

const README = join(dirname(dirname(fileURLToPath(import.meta.url))), 'README.md');
const START = '<!-- macros:start -->';
const END = '<!-- macros:end -->';

const SECTIONS = [
    { category: 'enhanced-text', title: 'Text' },
    { category: 'enhanced-math', title: 'Math' },
    { category: 'enhanced-list', title: 'Lists and JSON' },
    { category: 'enhanced-logic', title: 'Logic' },
    { category: 'enhanced-compat', title: 'Conditions' },
    { category: 'enhanced-chatvar', title: 'Chat variables' },
    { category: 'enhanced-date', title: 'Dates' },
    { category: 'enhanced-state', title: 'Cache-friendly state' },
    { category: 'enhanced-lorebook', title: 'Lorebook' },
];

/** Escapes the characters that would break a markdown table cell. */
function cell(text) {
    return String(text ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

async function buildCatalog() {
    installStubContext({ registry: createStubRegistry() });
    const { getMacroCatalog, macroSignature } = await import('../src/catalog.js');
    const { registerUtilityMacros } = await import('../src/utility-macros.js');
    const { registerCompatMacros } = await import('../src/compat-macros.js');
    const { registerLogicMacros } = await import('../src/logic-macros.js');
    const { registerChatVarMacros } = await import('../src/chatvar-macros.js');
    const { registerDateMacros } = await import('../src/date-macros.js');
    const { registerStateMacros } = await import('../src/state-macros.js');
    const { registerLorebookMacros } = await import('../src/lorebook-macros.js');

    registerUtilityMacros();
    registerCompatMacros();
    registerLogicMacros();
    registerChatVarMacros();
    registerDateMacros();
    registerStateMacros();
    registerLorebookMacros();

    return { catalog: getMacroCatalog(), macroSignature };
}

function renderTables({ catalog, macroSignature }) {
    const lines = [START, ''];
    lines.push(`*Generated from the macro definitions by \`npm run docs\` — ${catalog.length} macros. Edit the descriptions in \`src/*-macros.js\`, not this table.*`);

    for (const { category, title } of SECTIONS) {
        const macros = catalog.filter(entry => entry.category === category);
        if (!macros.length) {
            continue;
        }
        lines.push('', `### ${title}`, '', '| Macro | What it does | Returns |', '|---|---|---|');
        for (const entry of macros) {
            const alias = entry.aliases.length ? ` (alias \`{{${entry.aliases.join('}}`, `{{')}}}\`)` : '';
            lines.push(`| \`${macroSignature(entry)}\`${alias} | ${cell(entry.description)} | ${cell(entry.returns)} |`);
        }
    }

    lines.push('',
        'Optional arguments are shown in `[brackets]`; `…` means the macro takes any number of further values. '
        + 'Worked examples for every macro are in the Workbench\'s Reference tab.',
        '', END);
    return lines.join('\n');
}

function splice(readme, block) {
    const from = readme.indexOf(START);
    const to = readme.indexOf(END);
    if (from === -1 || to === -1) {
        throw new Error(`README.md is missing the ${START} / ${END} markers.`);
    }
    return readme.slice(0, from) + block + readme.slice(to + END.length);
}

const check = process.argv.includes('--check');
const current = readFileSync(README, 'utf8');
const next = splice(current, renderTables(await buildCatalog()));

if (current === next) {
    console.log('README.md is up to date.');
} else if (check) {
    console.error('README.md is out of date: a macro description changed. Run `npm run docs`.');
    process.exit(1);
} else {
    writeFileSync(README, next);
    console.log('README.md updated.');
}
