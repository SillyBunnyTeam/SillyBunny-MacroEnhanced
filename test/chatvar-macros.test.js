import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { createStubRegistry, installStubContext, makeExecutionContext } from './helpers/stub-context.js';

const { CATEGORY_CHATVAR, CHATVAR_ALL_MACRO_NAMES, registerChatVarMacros, resetChatVarRecursion } = await import('../src/chatvar-macros.js');
const { getChatState } = await import('../src/chat-state.js');
const { teardownRegistrations } = await import('../src/registration.js');

let registry;
let stub;

beforeEach(() => {
    teardownRegistrations();
    resetChatVarRecursion();
    registry = createStubRegistry();
    stub = installStubContext({ registry });
    registerChatVarMacros();
});

function run(name, args, { env, resolve } = {}) {
    const definition = registry.getMacro(name);
    assert.ok(definition, `macro ${name} should be registered`);
    const { context, warnings } = makeExecutionContext({ unnamedArgs: args, env, resolve });
    return { result: definition.handler(context), warnings };
}

const chatVars = () => getChatState().chatVars;

/**
 * foreachChatVar resolves its own arguments (it is on the lazy path), so a
 * resolve stub has to pass the prefix and alias through untouched and only
 * stand in for the body.
 */
const bodyResolver = (renderBody) => (text) => (text === 'BODY' ? renderBody() : text);

test('every chat-var macro registers with a hidden me- alias', () => {
    for (const name of CHATVAR_ALL_MACRO_NAMES) {
        const definition = registry.getMacro(name);
        assert.ok(definition, `${name} missing`);
        assert.equal(definition.category, CATEGORY_CHATVAR);
        assert.ok(registry.hasMacro(`me-${name}`), `${name} lacks its hidden me- alias`);
    }
});

test('set stores, get reads, and setters write nothing into the prompt', () => {
    assert.equal(run('setchatvar', ['current_location', 'Forest']).result, '');
    assert.equal(chatVars().current_location, 'Forest');
    assert.equal(run('getchatvar', ['current_location']).result, 'Forest');
});

test('get falls back only when the variable was never set', () => {
    assert.equal(run('getchatvar', ['missing']).result, '');
    assert.equal(run('getchatvar', ['missing', '1']).result, '1');
    run('setchatvar', ['day', '']);
    assert.equal(run('getchatvar', ['day', '1']).result, '', 'an empty stored value is still a value');
});

test('has and delete track presence', () => {
    assert.equal(run('haschatvar', ['start_minutes']).result, 'false');
    run('setchatvar', ['start_minutes', '720']);
    assert.equal(run('haschatvar', ['start_minutes']).result, 'true');
    assert.equal(run('deletechatvar', ['start_minutes']).result, '');
    assert.equal(run('haschatvar', ['start_minutes']).result, 'false');
});

test('add creates at zero then accumulates', () => {
    assert.equal(run('addchatvar', ['elapsed_minutes', '15']).result, '');
    assert.equal(chatVars().elapsed_minutes, '15');
    run('addchatvar', ['elapsed_minutes', '20']);
    assert.equal(chatVars().elapsed_minutes, '35');
});

test('keys built from character names with spaces work end to end', () => {
    run('setchatvar', ['satiety_selphie windsong', '80']);
    assert.equal(run('getchatvar', ['satiety_selphie windsong']).result, '80');
    assert.equal(run('haschatvar', ['satiety_selphie windsong']).result, 'true');
});

test('an unusable key warns instead of writing', () => {
    const { warnings } = run('setchatvar', ['', 'x']);
    assert.equal(warnings.length, 1);
    assert.deepEqual(Object.keys(chatVars()), []);
});

test('chat vars are a separate namespace from host local vars', () => {
    // The regression this whole design exists for: content sets a scratch value
    // with {{setvar}} under a prefix a loop iterates. If the two namespaces were
    // shared, "satiety_food_value" would render as a party member.
    stub.localVars.satiety_food_value = '70';
    run('setchatvar', ['satiety_ren', '80']);

    assert.deepEqual(Object.keys(chatVars()), ['satiety_ren']);
    assert.equal(run('getchatvar', ['satiety_food_value']).result, '', 'host local vars are not visible here');
    assert.equal(stub.localVars.satiety_ren, undefined, 'chat vars do not leak into host local vars');
});

test('foreachChatVar repeats the body once per match, in name order', () => {
    run('setchatvar', ['satiety_ren', '80']);
    run('setchatvar', ['satiety_arlo', '55']);
    run('setchatvar', ['current_location', 'Forest']);

    // The body is raw text on the lazy path; resolve stands in for the engine and
    // reads the loop variables back out of the host's local store, like {{.p}} does.
    const resolve = bodyResolver(() => `${stub.localVars.p}=${stub.localVars.p_value}(${stub.localVars.p_key}) `);
    const { result } = run('foreachChatVar', ['satiety_', 'p', 'BODY'], { resolve });
    assert.equal(result, 'arlo=55(satiety_arlo) ren=80(satiety_ren) ');
});

test('foreachChatVar puts the loop variables back exactly as it found them', () => {
    run('setchatvar', ['satiety_ren', '80']);
    stub.localVars.p = 'original';
    // p_key and p_value did not exist before, so they must not exist after.

    run('foreachChatVar', ['satiety_', 'p', 'BODY'], { resolve: bodyResolver(() => '') });

    assert.equal(stub.localVars.p, 'original');
    assert.equal(Object.hasOwn(stub.localVars, 'p_key'), false);
    assert.equal(Object.hasOwn(stub.localVars, 'p_value'), false);
});

test('foreachChatVar produces nothing when no key matches', () => {
    run('setchatvar', ['current_location', 'Forest']);
    const { result } = run('foreachChatVar', ['satiety_', 'p', 'BODY'], { resolve: bodyResolver(() => 'X') });
    assert.equal(result, '');
});

test('foreachChatVar rejects an alias the shorthand lexer would not accept', () => {
    run('setchatvar', ['satiety_ren', '80']);
    const { result, warnings } = run('foreachChatVar', ['satiety_', '_p', 'BODY'], { resolve: bodyResolver(() => 'X') });
    assert.equal(result, '');
    assert.equal(warnings.length, 1);
});

test('foreachChatVar stops a body that loops itself', () => {
    run('setchatvar', ['satiety_ren', '80']);
    let depth = 0;
    const resolve = (text) => {
        if (text !== 'BODY') {
            return text;
        }
        if (depth++ >= 3) {
            return '';
        }
        return run('foreachChatVar', ['satiety_', 'p', 'BODY'], { resolve }).result;
    };
    const { result } = run('foreachChatVar', ['satiety_', 'p', 'BODY'], { resolve });
    assert.equal(result, '');
    assert.ok(depth <= 2, `recursion guard fired (body resolved ${depth} times)`);
});

test('writers honour the Workbench sandbox overlay', () => {
    const sandboxState = { chatVars: { satiety_ren: '10' } };
    const env = { extra: { meSandboxState: sandboxState } };

    run('setchatvar', ['satiety_ren', '99'], { env });
    run('addchatvar', ['elapsed_minutes', '5'], { env });

    assert.equal(sandboxState.chatVars.satiety_ren, '99');
    assert.equal(sandboxState.chatVars.elapsed_minutes, '5');
    assert.deepEqual(chatVars(), {}, 'real chat state untouched');
    assert.equal(run('getchatvar', ['satiety_ren'], { env }).result, '99');
});
