/**
 * Minimal stand-in for SillyTavern.getContext() so src modules can run under
 * `node --test`. Install with installStubContext() before importing src modules.
 */

export function createStubRegistry({ defaultSource = 'MacroEnhanced' } = {}) {
    const macros = new Map();
    let sourceForNextRegistration = defaultSource;

    return {
        setSource(name) {
            sourceForNextRegistration = name;
        },
        registerMacro(name, options) {
            const definition = {
                name,
                category: options.category ?? 'uncategorized',
                description: options.description ?? '',
                unnamedArgs: options.unnamedArgs ?? 0,
                list: options.list ?? null,
                aliases: options.aliases ?? [],
                handler: options.handler,
                source: { name: sourceForNextRegistration, isExtension: true, isThirdParty: true },
                aliasOf: null,
            };
            macros.set(name.toLowerCase(), definition);
            for (const { alias, visible } of definition.aliases) {
                macros.set(alias.toLowerCase(), { ...definition, name: alias, aliasOf: name, aliasVisible: visible ?? true });
            }
            return definition;
        },
        unregisterMacro(name) {
            return macros.delete(String(name).toLowerCase());
        },
        hasMacro(name) {
            return macros.has(String(name).toLowerCase());
        },
        getMacro(name) {
            return macros.get(String(name).toLowerCase()) ?? null;
        },
        getAllMacros() {
            return [...macros.values()];
        },
        _map: macros,
    };
}

export function installStubContext(overrides = {}) {
    const registry = overrides.registry ?? createStubRegistry();
    const localVars = overrides.localVars ?? {};
    const globalVars = overrides.globalVars ?? {};
    let uuidCounter = 0;

    const makeVarApi = (store) => ({
        get: (name) => store[name],
        set: (name, value) => { store[name] = String(value); },
        add: (name, value) => {
            const a = Number.parseFloat(String(store[name] ?? ''));
            const b = Number.parseFloat(String(value));
            store[name] = !Number.isNaN(a) && !Number.isNaN(b) ? String(a + b) : String(store[name] ?? '') + String(value);
        },
        inc: (name) => { store[name] = String((Number.parseFloat(store[name] ?? '0') || 0) + 1); return Number(store[name]); },
        dec: (name) => { store[name] = String((Number.parseFloat(store[name] ?? '0') || 0) - 1); return Number(store[name]); },
        has: (name) => Object.hasOwn(store, name),
        del: (name) => { delete store[name]; },
    });

    const ctx = {
        extensionSettings: { variables: { global: globalVars } },
        chatMetadata: { variables: localVars },
        chat: [],
        chatId: 'stub-chat',
        characters: [],
        characterId: undefined,
        getRequestHeaders: () => ({}),
        variables: { local: makeVarApi(localVars), global: makeVarApi(globalVars) },
        saveSettingsDebounced: () => {},
        saveMetadataDebounced: () => {},
        writeExtensionField: async (characterId, key, value) => {
            const character = ctx.characters[characterId];
            if (!character) {
                throw new Error(`No character at index ${characterId}`);
            }
            character.data ??= {};
            character.data.extensions ??= {};
            character.data.extensions[key] = value;
        },
        uuidv4: () => `uuid-${++uuidCounter}`,
        eventSource: { on: () => {}, removeListener: () => {} },
        eventTypes: new Proxy({}, { get: (_target, prop) => String(prop) }),
        loadWorldInfo: async () => null,
        getWorldInfoNames: () => [],
        worldInfoSettings: { globalSelect: [], charLore: [] },
        powerUserSettings: { experimental_macro_engine: true },
        macros: {
            registry,
            engine: overrides.engine ?? { evaluate: (text) => text },
            envBuilder: { buildFromRawEnv: (raw) => ({ ...raw, dynamicMacros: raw.dynamicMacros ?? {} }) },
            register: (name, options) => registry.registerMacro(name, options),
        },
        ...overrides.ctx,
    };

    globalThis.SillyTavern = { getContext: () => ctx };
    return { ctx, registry, localVars, globalVars };
}

/** Fake MacroExecutionContext for calling handlers directly. */
export function makeExecutionContext({ unnamedArgs = [], list = null, env = {}, resolve } = {}) {
    const warnings = [];
    return {
        context: {
            name: 'test',
            args: unnamedArgs,
            unnamedArgs,
            list,
            namedArgs: null,
            flags: {},
            isScoped: false,
            raw: '',
            rawOriginal: '',
            rawArgs: unnamedArgs,
            env: { dynamicMacros: {}, ...env },
            cstNode: null,
            range: { startOffset: 0, endOffset: 0 },
            globalOffset: 0,
            normalize: (value) => value === undefined || value === null ? '' : String(value),
            trimContent: (content) => String(content).trim(),
            resolve: resolve ?? ((text) => text),
            warn: (message) => warnings.push(message),
        },
        warnings,
    };
}
