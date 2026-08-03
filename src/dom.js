/**
 * Tiny DOM helpers shared by the UI modules. No SillyBunny imports.
 */

export function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

/**
 * A host-idiom `div.menu_button` that is also keyboard-accessible: focusable,
 * announced as a button, and activatable with Enter/Space.
 *
 * @param {string} className
 * @param {string} text
 * @param {(event: Event) => void} onActivate
 */
export function button(className, text, onActivate) {
    const node = el('div', className, text);
    node.setAttribute('role', 'button');
    node.tabIndex = 0;
    node.addEventListener('click', onActivate);
    node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onActivate(event);
        }
    });
    return node;
}
