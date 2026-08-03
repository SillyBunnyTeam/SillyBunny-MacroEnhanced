import { createSandbox, findUnshadowedVariableMacros } from './sandbox.js';
import { renderInspector } from './inspector.js';

const EVAL_DEBOUNCE_MS = 300;

let openPopup = null;

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

function evaluateSandboxed(ctx, sandbox, input) {
    return sandbox.run((text, dynamicMacros) => {
        const env = ctx.macros.envBuilder.buildFromRawEnv({
            content: text,
            replaceCharacterCard: true,
            dynamicMacros,
            postProcessFn: (x) => x,
        });
        return ctx.macros.engine.evaluate(text, env);
    }, input);
}

export function isWorkbenchOpen() {
    return !!openPopup;
}

export function closeWorkbench() {
    if (openPopup) {
        const popup = openPopup;
        openPopup = null;
        popup.completeCancelled?.();
    }
}

/**
 * Opens the Workbench popup. Evaluation is sandboxed: variable macros write to a
 * throwaway copy, and shorthand writes are reverted after each evaluation.
 *
 * @param {object} [options]
 * @param {string} [options.initialText] - Pre-filled playground text.
 */
export async function openWorkbench({ initialText = '' } = {}) {
    const ctx = SillyTavern.getContext();
    if (openPopup) {
        return;
    }

    const sandbox = createSandbox({
        getLocalStore: () => {
            const meta = SillyTavern.getContext().chatMetadata;
            if (meta && !meta.variables) {
                meta.variables = {};
            }
            return meta?.variables ?? {};
        },
        getGlobalStore: () => {
            const settings = SillyTavern.getContext().extensionSettings;
            if (settings && !settings.variables) {
                settings.variables = { global: {} };
            }
            if (settings?.variables && !settings.variables.global) {
                settings.variables.global = {};
            }
            return settings?.variables?.global ?? {};
        },
    });
    const unshadowed = findUnshadowedVariableMacros(ctx.macros?.registry);

    const root = el('div', 'me-workbench');
    root.appendChild(el('h3', 'me-workbench-heading', 'Macro Workbench'));

    const columns = el('div', 'me-workbench-columns');
    const left = el('div', 'me-workbench-left');
    const right = el('div', 'me-workbench-right');
    columns.appendChild(left);
    columns.appendChild(right);
    root.appendChild(columns);

    const input = document.createElement('textarea');
    input.className = 'text_pole me-workbench-input';
    input.rows = 8;
    input.placeholder = 'Type text with macros, e.g. {{upper::{{char}}}} rolled {{roll::d20}}';
    input.value = initialText;
    left.appendChild(input);

    const outputLabel = el('div', 'me-workbench-label', 'Result');
    const evalMeta = el('span', 'me-workbench-meta', '');
    outputLabel.appendChild(evalMeta);
    left.appendChild(outputLabel);

    const output = el('pre', 'me-workbench-output', '');
    left.appendChild(output);

    const buttonRow = el('div', 'me-workbench-buttons');
    const copyButton = el('div', 'menu_button', 'Copy result');
    copyButton.addEventListener('click', () => {
        navigator.clipboard?.writeText(output.textContent ?? '').catch(() => {});
    });
    const resetButton = el('div', 'menu_button', 'Reset sandbox');
    buttonRow.appendChild(copyButton);
    buttonRow.appendChild(resetButton);
    left.appendChild(buttonRow);

    const inspectorContainer = el('div', 'me-workbench-inspector');
    right.appendChild(inspectorContainer);

    root.appendChild(el('div', 'me-workbench-footnote',
        'Sandboxed — nothing is saved. Variable macros write to a throwaway copy; {{.var}} shorthand changes are reverted after each preview.'));

    const refreshInspector = () => {
        const liveCtx = SillyTavern.getContext();
        renderInspector(inspectorContainer, {
            localVars: liveCtx.chatMetadata?.variables ?? {},
            globalVars: liveCtx.extensionSettings?.variables?.global ?? {},
            pending: sandbox.pendingChanges(),
            unshadowed,
        });
    };

    const evaluateNow = () => {
        const text = input.value;
        if (!text) {
            output.textContent = '';
            evalMeta.textContent = '';
            refreshInspector();
            return;
        }
        const liveCtx = SillyTavern.getContext();
        const started = performance.now();
        try {
            output.textContent = evaluateSandboxed(liveCtx, sandbox, text);
            evalMeta.textContent = ` ${(performance.now() - started).toFixed(1)} ms`;
        } catch (error) {
            output.textContent = `Evaluation failed: ${error?.message ?? error}`;
            evalMeta.textContent = '';
        }
        refreshInspector();
    };

    let debounceTimer = null;
    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(evaluateNow, EVAL_DEBOUNCE_MS);
    });

    resetButton.addEventListener('click', () => {
        sandbox.reset();
        evaluateNow();
    });

    refreshInspector();
    if (initialText) {
        evaluateNow();
    }

    const popup = new ctx.Popup(root, ctx.POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: 'Close',
    });
    openPopup = popup;
    input.focus();

    try {
        await popup.show();
    } finally {
        clearTimeout(debounceTimer);
        openPopup = null;
    }
}
