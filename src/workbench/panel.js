import { isEngineAvailable } from '../engine-gate.js';
import { button, el } from '../dom.js';
import { createSandbox, findUnshadowedVariableMacros } from './sandbox.js';
import { renderInspector } from './inspector.js';

const EVAL_DEBOUNCE_MS = 300;
const ENGINE_OFF_NOTICE = 'The Macro Workbench needs the Experimental Macro Engine. Turn it on under User Settings → Experimental Macro Engine.';

let openPopup = null;

async function copyToClipboard(text) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Insecure origin or permission denied — try the legacy path.
    }
    try {
        const scratch = document.createElement('textarea');
        scratch.value = text;
        scratch.style.position = 'fixed';
        scratch.style.opacity = '0';
        document.body.appendChild(scratch);
        scratch.select();
        const ok = document.execCommand('copy');
        scratch.remove();
        return ok;
    } catch {
        return false;
    }
}

function flashButtonText(node, text, revertMs = 1500) {
    if (node.dataset.flashTimer) {
        clearTimeout(Number(node.dataset.flashTimer));
    } else {
        node.dataset.originalText = node.textContent;
    }
    node.textContent = text;
    node.dataset.flashTimer = String(setTimeout(() => {
        node.textContent = node.dataset.originalText ?? text;
        delete node.dataset.flashTimer;
        delete node.dataset.originalText;
    }, revertMs));
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
    if (!isEngineAvailable()) {
        await ctx.Popup?.show?.text?.('Macro Workbench', ENGINE_OFF_NOTICE);
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
    const copyButton = button('menu_button', 'Copy result', async () => {
        const ok = await copyToClipboard(output.textContent ?? '');
        flashButtonText(copyButton, ok ? 'Copied ✓' : 'Copy failed');
    });
    const resetButton = button('menu_button', 'Reset sandbox', () => {
        sandbox.reset();
        evaluateNow();
    });
    buttonRow.appendChild(copyButton);
    buttonRow.appendChild(resetButton);
    left.appendChild(buttonRow);

    const inspectorContainer = el('div', 'me-workbench-inspector');
    right.appendChild(inspectorContainer);

    root.appendChild(el('div', 'me-workbench-footnote',
        'Sandboxed — nothing is saved. Variable macros write to a throwaway copy; {{.var}} shorthand changes are reverted after each preview. Ctrl+Enter evaluates immediately.'));

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
    input.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            clearTimeout(debounceTimer);
            evaluateNow();
        }
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
