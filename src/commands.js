import { getRegisteredNames } from './registration.js';
import { findEntry } from './lorebook-cache.js';
import { SCOPE_CHARACTER, SCOPE_GLOBAL, createDef, getCharacterDefs, getGlobalDefs, saveCharacterDefs, saveGlobalDefs, validateDef } from './custom/store.js';
import { getRegisteredCustomNames, syncRegistrations } from './custom/registrar.js';
import { createSandbox } from './workbench/sandbox.js';
import { openWorkbench } from './workbench/panel.js';

let commandsRegistered = false;
let extensionActive = true;
let registeredParser = null;
const registeredCommandNames = new Set();

export function setCommandsActive(value) {
    extensionActive = !!value;
}

const INACTIVE = 'Macro Enhanced is inactive.';

function evaluateWithEngine(text, dynamicMacros = {}) {
    const ctx = SillyTavern.getContext();
    const env = ctx.macros.envBuilder.buildFromRawEnv({
        content: text,
        replaceCharacterCard: true,
        dynamicMacros,
        postProcessFn: (x) => x,
    });
    return ctx.macros.engine.evaluate(text, env);
}

/**
 * Registers the slash commands. Retried from lifecycle events; a failed attempt
 * does not consume the flag (PromptTags pattern).
 */
export function registerCommands() {
    let ctx;
    try {
        ctx = SillyTavern.getContext();
    } catch {
        return false;
    }

    const { SlashCommandParser, SlashCommand, SlashCommandArgument, SlashCommandNamedArgument, ARGUMENT_TYPE } = ctx;
    if (!SlashCommandParser || !SlashCommand || !SlashCommandArgument || !SlashCommandNamedArgument || !ARGUMENT_TYPE) {
        console.warn('[Macro Enhanced] Slash command API unavailable; commands not registered.');
        return false;
    }

    if (registeredParser !== SlashCommandParser) {
        registeredParser = SlashCommandParser;
        registeredCommandNames.clear();
        commandsRegistered = false;
    }
    if (commandsRegistered) {
        return true;
    }

    const registerCommand = (command) => {
        if (registeredCommandNames.has(command.name)) {
            return;
        }
        SlashCommandParser.addCommandObject(command);
        registeredCommandNames.add(command.name);
    };

    try {
        registerCommand(SlashCommand.fromProps({
            name: 'me-workbench',
            callback: () => {
                if (!extensionActive) {
                    return INACTIVE;
                }
                openWorkbench();
                return '';
            },
            helpString: 'Opens the Macro Workbench: a sandboxed playground to preview macro text without changing real variables.',
        }));

        registerCommand(SlashCommand.fromProps({
            name: 'me-eval',
            callback: (named, unnamed) => {
                if (!extensionActive) {
                    return INACTIVE;
                }
                const text = String(unnamed ?? '');
                if (!text) {
                    return '';
                }
                const sandboxed = String(named?.sandbox ?? 'true').toLowerCase() !== 'false';
                if (!sandboxed) {
                    return evaluateWithEngine(text);
                }
                const liveCtx = SillyTavern.getContext();
                const sandbox = createSandbox({
                    getLocalStore: () => liveCtx.chatMetadata?.variables ?? {},
                    getGlobalStore: () => liveCtx.extensionSettings?.variables?.global ?? {},
                });
                return sandbox.run((input, dynamicMacros) => evaluateWithEngine(input, dynamicMacros), text);
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'sandbox',
                    description: 'Set to false to let variable changes apply for real.',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    defaultValue: 'true',
                    isRequired: false,
                }),
            ],
            unnamedArgumentList: [
                new SlashCommandArgument('the text to evaluate', [ARGUMENT_TYPE.STRING], true, false),
            ],
            returns: 'the text with all macros resolved',
            helpString: 'Evaluates text through the macro engine. Sandboxed by default: variable macros do not change real variables. Example: <code>/me-eval {{calc::2^10}}</code>',
        }));

        registerCommand(SlashCommand.fromProps({
            name: 'me-lore',
            callback: (named, unnamed) => {
                if (!extensionActive) {
                    return INACTIVE;
                }
                const liveCtx = SillyTavern.getContext();
                const entryName = String(unnamed ?? '').trim();
                if (!entryName) {
                    return 'Usage: /me-lore [book=name] entry title';
                }
                const bookName = named?.book ? String(named.book) : undefined;
                const { entry, missing } = findEntry(liveCtx, entryName, bookName);
                if (!entry) {
                    return missing.length
                        ? `Lorebook(s) still loading: ${missing.join(', ')} — try again.`
                        : `No entry named "${entryName}" found.`;
                }
                return String(entry.content ?? '');
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'book',
                    description: 'A specific lorebook name.',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                }),
            ],
            unnamedArgumentList: [
                new SlashCommandArgument('entry title or uid', [ARGUMENT_TYPE.STRING], true, false),
            ],
            returns: 'the raw content of the lorebook entry',
            helpString: 'Returns a lorebook entry\'s content. Example: <code>/me-lore Backstory</code>',
        }));

        registerCommand(SlashCommand.fromProps({
            name: 'me-define',
            callback: async (named, unnamed) => {
                if (!extensionActive) {
                    return INACTIVE;
                }
                const liveCtx = SillyTavern.getContext();
                const name = String(named?.name ?? '').trim();
                const template = String(unnamed ?? '');
                if (!name || !template) {
                    return 'Usage: /me-define name=mymacro [args=a,b] [scope=global|character] the template text';
                }
                const scope = String(named?.scope ?? SCOPE_GLOBAL).toLowerCase() === SCOPE_CHARACTER ? SCOPE_CHARACTER : SCOPE_GLOBAL;
                const args = String(named?.args ?? '').split(',').map(part => part.trim()).filter(Boolean)
                    .map(argName => ({ name: argName, optional: false }));

                const defs = scope === SCOPE_CHARACTER ? getCharacterDefs() : getGlobalDefs();
                const existing = defs.find(def => def.name.toLowerCase() === name.toLowerCase());
                const def = createDef({ ...(existing ?? {}), name, template, args });

                const siblings = defs.filter(other => other.id !== def.id);
                const errors = validateDef(def, { siblings, registry: liveCtx.macros?.registry })
                    .filter(problem => !(existing && problem.includes('already exists')));
                if (errors.length) {
                    return errors.join(' ');
                }

                const nextDefs = [...siblings, def];
                if (scope === SCOPE_CHARACTER) {
                    if (liveCtx.characterId === undefined || liveCtx.characterId === null) {
                        return 'Open a character chat first to save a character-scoped macro.';
                    }
                    await saveCharacterDefs(nextDefs);
                } else {
                    saveGlobalDefs(nextDefs);
                }
                syncRegistrations();
                return `Macro {{${name}}} ${existing ? 'updated' : 'created'} (${scope}).`;
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'name',
                    description: 'The macro name (used as {{name}}).',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'args',
                    description: 'Comma-separated argument names.',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'scope',
                    description: 'global (default) or character.',
                    typeList: [ARGUMENT_TYPE.STRING],
                    defaultValue: SCOPE_GLOBAL,
                    enumList: [SCOPE_GLOBAL, SCOPE_CHARACTER],
                    isRequired: false,
                }),
            ],
            unnamedArgumentList: [
                new SlashCommandArgument('the template the macro expands to', [ARGUMENT_TYPE.STRING], true, false),
            ],
            returns: 'a confirmation message',
            helpString: 'Creates or updates a custom macro. Example: <code>/me-define name=greet args=who Hello {{who}}, it is {{time}}!</code>',
        }));

        registerCommand(SlashCommand.fromProps({
            name: 'me-undefine',
            callback: async (_named, unnamed) => {
                if (!extensionActive) {
                    return INACTIVE;
                }
                const name = String(unnamed ?? '').trim().toLowerCase();
                if (!name) {
                    return 'Usage: /me-undefine name';
                }
                const globals = getGlobalDefs();
                const characterDefs = getCharacterDefs();
                let removed = false;
                if (globals.some(def => def.name.toLowerCase() === name)) {
                    saveGlobalDefs(globals.filter(def => def.name.toLowerCase() !== name));
                    removed = true;
                }
                if (characterDefs.some(def => def.name.toLowerCase() === name)) {
                    await saveCharacterDefs(characterDefs.filter(def => def.name.toLowerCase() !== name));
                    removed = true;
                }
                syncRegistrations();
                return removed ? `Macro {{${name}}} removed.` : `No custom macro named {{${name}}}.`;
            },
            unnamedArgumentList: [
                new SlashCommandArgument('the macro name to remove', [ARGUMENT_TYPE.STRING], true, false),
            ],
            returns: 'a confirmation message',
            helpString: 'Removes a custom macro (from both scopes if present).',
        }));

        registerCommand(SlashCommand.fromProps({
            name: 'me-macros',
            callback: () => {
                if (!extensionActive) {
                    return INACTIVE;
                }
                const names = getRegisteredNames().sort();
                const custom = getRegisteredCustomNames().sort();
                return [
                    `Registered (${names.length}): ${names.map(name => `{{${name}}}`).join(', ')}`,
                    custom.length ? `Custom (${custom.length}): ${custom.map(name => `{{${name}}}`).join(', ')}` : '',
                ].filter(Boolean).join('\n');
            },
            returns: 'the names of all macros this extension registered',
            helpString: 'Lists every macro Macro Enhanced has registered (debug aid).',
        }));

        commandsRegistered = true;
        return true;
    } catch (error) {
        console.error('[Macro Enhanced] Failed to register slash commands.', error);
        return false;
    }
}
