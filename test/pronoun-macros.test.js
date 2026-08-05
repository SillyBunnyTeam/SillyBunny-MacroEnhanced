import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { createStubRegistry, installStubContext, makeExecutionContext } from './helpers/stub-context.js';

const {
    CATEGORY_PRONOUN,
    PRONOUN_STATEFUL_MACRO_NAMES,
    SUBJECTS,
    getCharacterSpec,
    registerPronounMacros,
    resolveSet,
    saveCharacterSpec,
    savePersonaSpec,
} = await import('../src/pronoun-macros.js');
const { teardownRegistrations } = await import('../src/registration.js');
const { getSettings } = await import('../src/settings.js');
const { getChatState } = await import('../src/chat-state.js');

let registry;
let ctx;

/** A stub with one character selected, so the char* macros have something to read. */
function install(overrides = {}) {
    teardownRegistrations();
    registry = createStubRegistry();
    ({ ctx } = installStubContext({
        registry,
        ctx: {
            characters: [{ name: 'Robin', data: { extensions: {} } }],
            characterId: 0,
            ...overrides,
        },
    }));
    registerPronounMacros();
}

beforeEach(() => install());

function run(name, args = [], { raw = name, env } = {}) {
    const definition = registry.getMacro(name);
    assert.ok(definition, `macro ${name} should be registered`);
    const { context, warnings } = makeExecutionContext({ unnamedArgs: args, raw, env });
    return { result: definition.handler(context), warnings };
}

// ---- registration ----------------------------------------------------------

test('all sixteen pronoun macros land in the registry under enhanced-pronoun', () => {
    const names = [];
    for (const prefix of ['', 'char']) {
        names.push(...['sub', 'obj', 'poss', 'poss_p', 'ref', 'pronouns', 'pverb'].map(n => `${prefix}${n}`));
        names.push(`set${prefix}pronouns`);
    }
    assert.equal(names.length, 16);
    for (const name of names) {
        const definition = registry.getMacro(name);
        assert.ok(definition, `${name} should be registered`);
        assert.equal(definition.category, CATEGORY_PRONOUN);
        // Every macro also gets its collision-proof alias.
        assert.ok(registry.hasMacro(`me-${name}`), `me-${name} should exist`);
    }
});

test('the stateful list names macros that actually write chat state', () => {
    for (const name of PRONOUN_STATEFUL_MACRO_NAMES) {
        assert.ok(registry.hasMacro(name), `${name} should be registered`);
    }
});

// ---- defaults and resolution order ----------------------------------------

test('nothing set means they/them, for the persona and the character alike', () => {
    assert.equal(run('sub').result, 'they');
    assert.equal(run('obj').result, 'them');
    assert.equal(run('poss').result, 'their');
    assert.equal(run('poss_p').result, 'theirs');
    assert.equal(run('ref').result, 'themself');
    assert.equal(run('charsub').result, 'they');
    assert.equal(run('charpronouns').result, 'they/them');
});

test('the persona setting is keyed by the active persona', () => {
    savePersonaSpec('she/her');
    assert.equal(run('sub').result, 'she');
    assert.equal(getSettings().pronouns.personas['stub-persona.png'], 'she/her');

    // Switching persona switches the pronouns, without touching the chat.
    ctx.userAvatar = 'other-persona.png';
    assert.equal(run('sub').result, 'they');
});

test('the character reads its own card, independently of the persona', async () => {
    savePersonaSpec('she/her');
    await saveCharacterSpec('he/him');
    assert.equal(run('sub').result, 'she');
    assert.equal(run('charsub').result, 'he');
    assert.equal(run('charposs').result, 'his');
});

test('a chat override beats the saved setting until it is cleared', () => {
    savePersonaSpec('she/her');
    assert.equal(run('sub').result, 'she');

    assert.equal(run('setpronouns', ['he/him']).result, '');
    assert.equal(run('sub').result, 'he');
    assert.equal(getChatState().pronouns.user, 'he/him');

    // An empty spec clears the override rather than setting a blank one.
    run('setpronouns', ['']);
    assert.equal(run('sub').result, 'she');
});

test('the two subjects override independently', () => {
    run('setpronouns', ['she/her']);
    run('setcharpronouns', ['it/its']);
    assert.equal(run('sub').result, 'she');
    assert.equal(run('charsub').result, 'it');
});

test('the character falls back to the default when no character is selected', () => {
    install({ characters: [], characterId: undefined });
    assert.equal(run('charsub').result, 'they');
    assert.equal(getCharacterSpec(), '');
});

// ---- capitalization --------------------------------------------------------

test('the invoked spelling decides the capitalization', () => {
    savePersonaSpec('she/her');
    assert.equal(run('sub', [], { raw: 'sub' }).result, 'she');
    assert.equal(run('sub', [], { raw: 'Sub' }).result, 'She');
    assert.equal(run('ref', [], { raw: 'Ref' }).result, 'Herself');
    // A camelCase spelling is mid-sentence, so it stays lowercase.
    assert.equal(run('charsub', [], { raw: 'charSub' }).result, 'they');
    assert.equal(run('charsub', [], { raw: 'Charsub' }).result, 'They');
});

test('a leading flag does not defeat the capitalization check', () => {
    savePersonaSpec('she/her');
    assert.equal(run('sub', [], { raw: '#Sub' }).result, 'She');
});

// ---- verb agreement --------------------------------------------------------

test('pverb picks the form that agrees', () => {
    savePersonaSpec('she/her');
    assert.equal(run('pverb', ['is', 'are']).result, 'is');
    assert.equal(run('pverb', ['has', 'have']).result, 'has');

    savePersonaSpec('they/them');
    assert.equal(run('pverb', ['is', 'are']).result, 'are');

    savePersonaSpec('xe/xem/xyr/xyrs/xemself');
    assert.equal(run('pverb', ['is', 'are']).result, 'is');
    savePersonaSpec('xe/xem/xyr/xyrs/xemself/plural');
    assert.equal(run('pverb', ['is', 'are']).result, 'are');
});

test('pverb capitalizes like the pronoun macros do', () => {
    assert.equal(run('pverb', ['is', 'are'], { raw: 'Pverb::is::are' }).result, 'Are');
});

// ---- bad input -------------------------------------------------------------

test('a stored spec that cannot be parsed warns and falls back', () => {
    getSettings().pronouns.personas['stub-persona.png'] = 'ze/zir';
    const { result, warnings } = run('sub');
    assert.equal(result, 'they');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /not a pronoun set/);
});

test('setpronouns rejects a bad spec instead of storing it', () => {
    savePersonaSpec('she/her');
    const { result, warnings } = run('setpronouns', ['ze/zir']);
    assert.equal(result, '');
    assert.equal(warnings.length, 1);
    assert.equal(run('sub').result, 'she');
    assert.equal(getChatState().pronouns.user, '');
});

test('setpronouns warns rather than throwing when there is no chat', () => {
    install({ chatId: undefined, chatMetadata: undefined });
    const { result, warnings } = run('setpronouns', ['she/her']);
    assert.equal(result, '');
    assert.match(warnings[0], /no chat is loaded/);
});

// ---- storage safety --------------------------------------------------------

test('saving character pronouns leaves the rest of the card field intact', async () => {
    const existing = [{ name: 'greet', enabled: true, body: 'hi' }];
    ctx.characters[0].data.extensions.MacroEnhanced = { customMacros: existing };

    await saveCharacterSpec('she/her');

    const field = ctx.characters[0].data.extensions.MacroEnhanced;
    assert.deepEqual(field.customMacros, existing, 'custom macros must survive a pronoun save');
    assert.equal(field.pronouns, 'she/her');
});

test('saving character pronouns without a character selected throws', async () => {
    install({ characters: [], characterId: undefined });
    await assert.rejects(() => saveCharacterSpec('she/her'), /No character selected/);
});

// ---- the Workbench sandbox -------------------------------------------------

test('setpronouns writes to the sandbox overlay, never the real chat', () => {
    savePersonaSpec('she/her');
    const sandbox = { pronouns: { user: '', char: '' } };
    const env = { extra: { meSandboxState: sandbox } };

    run('setpronouns', ['he/him'], { env });
    assert.equal(sandbox.pronouns.user, 'he/him');
    assert.equal(getChatState().pronouns.user, '', 'the real chat must be untouched');

    // And the reader sees the overlay while it is in play.
    assert.equal(run('sub', [], { env }).result, 'he');
    assert.equal(run('sub').result, 'she');
});

// ---- the exported resolver -------------------------------------------------

test('resolveSet is usable without an execution context, for the settings UI', () => {
    savePersonaSpec('he/him');
    assert.equal(resolveSet(SUBJECTS.user).sub, 'he');
    assert.equal(resolveSet(SUBJECTS.char).sub, 'they');
});
