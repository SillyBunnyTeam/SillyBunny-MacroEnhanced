import { getRemaps } from './registration.js';
import { renderCustomMacroManager } from './custom/editor-ui.js';
import { openWorkbench } from './workbench/panel.js';
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
}

export function removeDrawer() {
    document.getElementById(DRAWER_ID)?.remove();
}
