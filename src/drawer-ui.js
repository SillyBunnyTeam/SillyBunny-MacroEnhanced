import { getRemaps } from './registration.js';
import { getChatState, touchChatState } from './chat-state.js';
import { renderCustomMacroManager } from './custom/editor-ui.js';
import { openWorkbench } from './workbench/panel.js';
import { truncateText } from './utility-impl.js';
import { button, el } from './dom.js';

const DRAWER_ID = 'me-settings-drawer';

function findHost() {
    return document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
}

/**
 * Mounts the settings drawer. Safe to call repeatedly; re-renders in place.
 *
 * @param {object} state
 * @param {boolean} state.engineAvailable - Whether the experimental engine is on.
 */
export function renderDrawer({ engineAvailable }) {
    const host = findHost();
    if (!host) {
        return;
    }

    let drawer = document.getElementById(DRAWER_ID);
    if (!drawer) {
        drawer = el('div', 'inline-drawer');
        drawer.id = DRAWER_ID;

        const toggle = el('div', 'inline-drawer-toggle inline-drawer-header');
        toggle.appendChild(el('b', undefined, 'Macro Enhanced'));
        toggle.appendChild(el('div', 'inline-drawer-icon fa-solid fa-circle-chevron-down down'));
        drawer.appendChild(toggle);

        const content = el('div', 'inline-drawer-content');
        drawer.appendChild(content);
        host.appendChild(drawer);
    }

    const content = drawer.querySelector('.inline-drawer-content');
    content.innerHTML = '';

    if (!engineAvailable) {
        const notice = el('div', 'me-drawer-notice');
        notice.textContent = 'Macro Enhanced needs the Experimental Macro Engine. Turn it on under User Settings → Experimental Macro Engine, and this extension will activate automatically.';
        content.appendChild(notice);
        return;
    }

    content.appendChild(button('menu_button', 'Open Macro Workbench', () => openWorkbench()));

    content.appendChild(el('div', 'me-drawer-hint', 'All macros from this extension are listed under the "enhanced-…" groups in /help macros.'));

    const remaps = getRemaps();
    if (remaps.size) {
        const warning = el('div', 'me-drawer-warning');
        warning.appendChild(el('b', undefined, 'Renamed due to conflicts: '));
        warning.appendChild(document.createTextNode(
            [...remaps.values()].map(({ requested, actual }) => `{{${requested}}} → {{${actual}}}`).join(', ')));
        content.appendChild(warning);
    }

    content.appendChild(el('div', 'me-drawer-section-title', 'Your custom macros'));
    const managerHost = el('div');
    content.appendChild(managerHost);
    renderCustomMacroManager(managerHost, {
        onTestInWorkbench: (text) => openWorkbench({ initialText: text }),
    });

    renderFrozenValues(content, { engineAvailable });
}

/** Values saved by {{freeze}}/{{sticky}}/{{daily}}/{{rollonce}} in the current chat. */
function renderFrozenValues(content, drawerState) {
    const state = getChatState();
    if (!state) {
        return;
    }
    const kinds = [['freeze', 'frozen'], ['sticky', 'sticky'], ['daily', 'daily'], ['roll', 'rolls']];
    const entries = kinds.flatMap(([label, prop]) =>
        Object.keys(state[prop] ?? {}).map(key => ({ label, prop, key })));
    if (!entries.length) {
        return;
    }

    content.appendChild(el('div', 'me-drawer-section-title', 'Frozen chat values'));
    const table = el('table', 'me-frozen-table');
    for (const { label, prop, key } of entries) {
        const row = el('tr');
        row.appendChild(el('td', 'me-frozen-kind', label));
        row.appendChild(el('td', 'me-frozen-key', key));
        row.appendChild(el('td', 'me-frozen-value', truncateText(String(state[prop][key]?.value ?? ''), 60)));
        const actions = el('td', 'me-frozen-actions');
        actions.appendChild(button('menu_button me-custom-button', 'Delete', () => {
            delete state[prop][key];
            touchChatState();
            renderDrawer(drawerState);
        }));
        row.appendChild(actions);
        table.appendChild(row);
    }
    content.appendChild(table);
    content.appendChild(el('div', 'me-drawer-hint',
        'Saved by {{freeze}}, {{sticky}}, {{daily}} and {{rollonce}} in this chat. Deleting one makes the macro re-evaluate next time.'));
}

export function removeDrawer() {
    document.getElementById(DRAWER_ID)?.remove();
}
