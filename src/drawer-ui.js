import { getRemaps } from './registration.js';
import { getSettings, saveSettings } from './settings.js';
import { syncCompatMode } from './compat-macros.js';
import { getChatState, touchChatState } from './chat-state.js';
import { renderPronounSettings } from './pronoun-ui.js';
import { renderCustomMacroManager } from './custom/editor-ui.js';
import { renderTemplateGallery } from './custom/gallery-ui.js';
import { openWorkbench } from './workbench/panel.js';
import { truncateText } from './utility-impl.js';
import { button, el, helpButton } from './dom.js';

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

    const actions = el('div', 'me-drawer-actions');
    actions.appendChild(button('menu_button', 'Open Macro Workbench', () => openWorkbench()));
    actions.appendChild(button('menu_button', 'Macro reference', () => openWorkbench({ tab: 'Reference' })));
    content.appendChild(actions);

    content.appendChild(el('div', 'me-drawer-hint',
        'The reference lists every macro and slash command with its arguments and examples, plus short guides. They also appear in /help macros.'));

    const remaps = getRemaps();
    if (remaps.size) {
        const warning = el('div', 'me-drawer-warning');
        warning.appendChild(el('b', undefined, 'Renamed due to conflicts: '));
        warning.appendChild(document.createTextNode(
            [...remaps.values()].map(({ requested, actual }) => `{{${requested}}} → {{${actual}}}`).join(', ')));
        content.appendChild(warning);
    }

    renderCompatToggle(content, { engineAvailable });

    content.appendChild(sectionTitle('Pronouns', 'Pronouns', 'pronouns'));
    const pronounHost = el('div');
    content.appendChild(pronounHost);
    renderPronounSettings(pronounHost, () => renderDrawer({ engineAvailable }));

    content.appendChild(sectionTitle('Your custom macros', 'Writing your own macros', 'custom-macros'));
    const managerHost = el('div');
    content.appendChild(managerHost);
    const manager = renderCustomMacroManager(managerHost, {
        onTestInWorkbench: (text) => openWorkbench({ initialText: text }),
    });

    content.appendChild(sectionTitle('Template gallery', 'Template gallery and sharing', 'packs-and-gallery'));
    const galleryHost = el('div');
    content.appendChild(galleryHost);
    renderTemplateGallery(galleryHost, {
        onInstalled: () => manager.refreshList(),
    });

    renderFrozenValues(content, { engineAvailable });
}

/**
 * The compat-mode switch. Off by default, because it changes what {{if}} means
 * for every prompt in the app.
 */
function renderCompatToggle(content, drawerState) {
    content.appendChild(sectionTitle('Conditions in {{if}}', 'Conditions written the ordinary way', 'conditions'));

    const settings = getSettings();
    const label = el('label', 'checkbox_label me-compat-toggle');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!settings.compatExpressions;
    box.addEventListener('change', () => {
        settings.compatExpressions = box.checked;
        saveSettings();
        const active = syncCompatMode(box.checked);
        if (box.checked && !active) {
            // Only reachable if the host has no pre-processor hook; say so rather
            // than leaving a ticked box that does nothing.
            box.checked = false;
            settings.compatExpressions = false;
            saveSettings();
        }
        renderDrawer(drawerState);
    });
    label.appendChild(box);
    label.appendChild(el('span', undefined, 'Work out comparisons in {{if}} conditions'));
    content.appendChild(label);

    content.appendChild(el('div', 'me-drawer-hint', settings.compatExpressions
        ? 'On. {{if::{{.hp}} > 0}} compares the two values. Conditions without a comparison behave exactly as they always did.'
        : 'Off. {{if}} only checks whether its condition is non-empty, so {{if::{{.hp}} > 0}} is always true — the text "0 > 0" is not empty. Turn this on if you use content written that way.'));
}

/** A section heading with a "?" that opens the matching guide in the reference. */
function sectionTitle(text, topicTitle, topicId) {
    const title = el('div', 'me-drawer-section-title', text);
    title.appendChild(helpButton(topicTitle, () => openWorkbench({ tab: 'Reference', topic: topicId })));
    return title;
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

    content.appendChild(sectionTitle('Frozen chat values', 'Why prompt caching matters', 'prompt-caching'));

    // Say so rather than vanishing: an empty section reads as "nothing stored",
    // a missing one reads as a bug.
    if (!entries.length) {
        content.appendChild(el('div', 'me-drawer-hint',
            'Nothing stored in this chat yet. {{freeze}}, {{sticky}}, {{daily}} and {{rollonce}} save their values here the first time they run.'));
        return;
    }

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
