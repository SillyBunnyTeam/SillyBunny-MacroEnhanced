import {
    SCOPE_CHARACTER,
    SCOPE_GLOBAL,
    createDef,
    getCharacterDefs,
    getGlobalDefs,
    saveCharacterDefs,
    saveGlobalDefs,
    validateDef,
} from './store.js';
import { syncRegistrations } from './registrar.js';

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

function scopeLabel(scope) {
    return scope === SCOPE_CHARACTER ? 'Character' : 'Global';
}

async function persist(scope, defs) {
    if (scope === SCOPE_CHARACTER) {
        await saveCharacterDefs(defs);
    } else {
        saveGlobalDefs(defs);
    }
    syncRegistrations();
}

function defsForScope(scope) {
    return scope === SCOPE_CHARACTER ? getCharacterDefs() : getGlobalDefs();
}

/**
 * Renders the custom-macro manager into the settings drawer.
 *
 * @param {HTMLElement} container
 * @param {object} [hooks]
 * @param {(text: string) => void} [hooks.onTestInWorkbench] - Opens the Workbench pre-filled.
 */
export function renderCustomMacroManager(container, { onTestInWorkbench } = {}) {
    container.innerHTML = '';

    const list = el('div', 'me-custom-list');
    const editorHost = el('div', 'me-custom-editor-host');

    const refreshList = () => {
        list.innerHTML = '';
        const groups = [
            { scope: SCOPE_GLOBAL, defs: getGlobalDefs() },
            { scope: SCOPE_CHARACTER, defs: getCharacterDefs() },
        ];
        let any = false;
        for (const { scope, defs } of groups) {
            for (const def of defs) {
                any = true;
                list.appendChild(renderRow(def, scope));
            }
        }
        if (!any) {
            list.appendChild(el('div', 'me-custom-empty', 'No custom macros yet. Click "New macro" to create one.'));
        }
    };

    const renderRow = (def, scope) => {
        const row = el('div', 'me-custom-row');

        const enabled = document.createElement('input');
        enabled.type = 'checkbox';
        enabled.checked = def.enabled !== false;
        enabled.title = 'Enabled';
        enabled.addEventListener('change', async () => {
            def.enabled = enabled.checked;
            await persist(scope, defsForScope(scope));
        });
        row.appendChild(enabled);

        row.appendChild(el('span', 'me-custom-name', `{{${def.name}}}`));
        row.appendChild(el('span', 'me-custom-scope', scopeLabel(scope)));
        if (def.description) {
            row.appendChild(el('span', 'me-custom-desc', def.description));
        }

        const editButton = el('div', 'menu_button me-custom-button', 'Edit');
        editButton.addEventListener('click', () => openEditor(def, scope));
        row.appendChild(editButton);

        const deleteButton = el('div', 'menu_button me-custom-button', 'Delete');
        deleteButton.addEventListener('click', async () => {
            const ctx = SillyTavern.getContext();
            const confirmed = await ctx.Popup.show?.confirm?.('Delete custom macro', `Delete {{${def.name}}}?`)
                ?? globalThis.confirm(`Delete {{${def.name}}}?`);
            if (!confirmed) {
                return;
            }
            await persist(scope, defsForScope(scope).filter(other => other.id !== def.id));
            refreshList();
        });
        row.appendChild(deleteButton);

        return row;
    };

    const openEditor = (existingDef, existingScope) => {
        editorHost.innerHTML = '';
        const def = createDef(existingDef ? structuredClone(existingDef) : {});
        let scope = existingScope ?? SCOPE_GLOBAL;

        const form = el('div', 'me-custom-editor');
        form.appendChild(el('div', 'me-custom-editor-title', existingDef ? `Edit {{${def.name}}}` : 'New macro'));

        const nameInput = document.createElement('input');
        nameInput.className = 'text_pole';
        nameInput.placeholder = 'Name — you will type {{name}} in prompts';
        nameInput.value = def.name;
        form.appendChild(nameInput);

        const descInput = document.createElement('input');
        descInput.className = 'text_pole';
        descInput.placeholder = 'Description (shown in the macro help browser)';
        descInput.value = def.description;
        form.appendChild(descInput);

        const templateInput = document.createElement('textarea');
        templateInput.className = 'text_pole me-custom-template';
        templateInput.rows = 4;
        templateInput.placeholder = 'What the macro expands to. Other macros work here, e.g.:\nMy {{mood}} greeting for {{user}}';
        templateInput.value = def.template;
        form.appendChild(templateInput);

        form.appendChild(el('div', 'me-custom-hint',
            'Arguments: add names below, then use {{argname}} (or {{arg1}}, {{arg2}}, …) inside the template. Callers pass them as {{yourmacro::value1::value2}}.'));

        const argsHost = el('div', 'me-custom-args');
        const renderArgs = () => {
            argsHost.innerHTML = '';
            def.args.forEach((arg, index) => {
                const argRow = el('div', 'me-custom-arg-row');

                const argName = document.createElement('input');
                argName.className = 'text_pole';
                argName.placeholder = 'argument name';
                argName.value = arg.name ?? '';
                argName.addEventListener('input', () => { arg.name = argName.value; });
                argRow.appendChild(argName);

                const optional = document.createElement('input');
                optional.type = 'checkbox';
                optional.checked = !!arg.optional;
                optional.title = 'Optional';
                optional.addEventListener('change', () => { arg.optional = optional.checked; });
                argRow.appendChild(optional);
                argRow.appendChild(el('span', 'me-custom-arg-label', 'optional'));

                const defaultValue = document.createElement('input');
                defaultValue.className = 'text_pole';
                defaultValue.placeholder = 'default (if optional)';
                defaultValue.value = arg.defaultValue ?? '';
                defaultValue.addEventListener('input', () => { arg.defaultValue = defaultValue.value; });
                argRow.appendChild(defaultValue);

                const removeArg = el('div', 'menu_button me-custom-button', '×');
                removeArg.title = 'Remove argument';
                removeArg.addEventListener('click', () => {
                    def.args.splice(index, 1);
                    renderArgs();
                });
                argRow.appendChild(removeArg);

                argsHost.appendChild(argRow);
            });

            const addArg = el('div', 'menu_button me-custom-button', '+ Add argument');
            addArg.addEventListener('click', () => {
                def.args.push({ name: '', optional: false, defaultValue: '' });
                renderArgs();
            });
            argsHost.appendChild(addArg);
        };
        renderArgs();
        form.appendChild(argsHost);

        const scopeRow = el('div', 'me-custom-scope-row');
        scopeRow.appendChild(el('span', undefined, 'Saved for: '));
        const scopeSelect = document.createElement('select');
        scopeSelect.className = 'text_pole';
        for (const value of [SCOPE_GLOBAL, SCOPE_CHARACTER]) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value === SCOPE_GLOBAL ? 'Everywhere (global)' : 'Current character only';
            scopeSelect.appendChild(option);
        }
        scopeSelect.value = scope;
        scopeSelect.addEventListener('change', () => { scope = scopeSelect.value; });
        scopeRow.appendChild(scopeSelect);
        form.appendChild(scopeRow);

        const problems = el('div', 'me-custom-problems');
        form.appendChild(problems);

        const buttons = el('div', 'me-custom-editor-buttons');
        const saveButton = el('div', 'menu_button', 'Save');
        saveButton.addEventListener('click', async () => {
            def.name = nameInput.value.trim();
            def.description = descInput.value.trim();
            def.template = templateInput.value;
            def.args = def.args.filter(arg => String(arg.name ?? '').trim());

            const ctx = SillyTavern.getContext();
            if (scope === SCOPE_CHARACTER && (ctx.characterId === undefined || ctx.characterId === null)) {
                problems.textContent = 'Open a character chat first to save a character-scoped macro.';
                return;
            }

            const siblings = defsForScope(scope).filter(other => other.id !== def.id);
            const errors = validateDef(def, { siblings, registry: ctx.macros?.registry });
            // When editing an existing macro of ours, its own live registration is fine.
            const filteredErrors = existingDef && existingDef.name === def.name
                ? errors.filter(problem => !problem.includes('already exists'))
                : errors;
            if (filteredErrors.length) {
                problems.textContent = filteredErrors.join(' ');
                return;
            }

            const scopeDefs = defsForScope(scope).filter(other => other.id !== def.id);
            scopeDefs.push(def);

            // Moving between scopes removes the def from its previous home.
            if (existingDef && existingScope && existingScope !== scope) {
                await persist(existingScope, defsForScope(existingScope).filter(other => other.id !== def.id));
            }
            await persist(scope, scopeDefs);

            editorHost.innerHTML = '';
            refreshList();
        });
        buttons.appendChild(saveButton);

        if (typeof onTestInWorkbench === 'function') {
            const testButton = el('div', 'menu_button', 'Test in Workbench');
            testButton.addEventListener('click', () => {
                const requiredArgs = (def.args ?? []).filter(arg => !arg.optional);
                onTestInWorkbench(`{{${nameInput.value.trim() || def.name}${requiredArgs.map(arg => `::${arg.name}`).join('')}}}`);
            });
            buttons.appendChild(testButton);
        }

        const cancelButton = el('div', 'menu_button', 'Cancel');
        cancelButton.addEventListener('click', () => {
            editorHost.innerHTML = '';
        });
        buttons.appendChild(cancelButton);

        form.appendChild(buttons);
        editorHost.appendChild(form);
        nameInput.focus();
    };

    const newButton = el('div', 'menu_button', 'New macro');
    newButton.addEventListener('click', () => openEditor(null, SCOPE_GLOBAL));

    container.appendChild(newButton);
    container.appendChild(list);
    container.appendChild(editorHost);
    refreshList();

    return { refreshList };
}
