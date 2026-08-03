import { safeRegister } from './registration.js';
import {
    CHARS_PER_TOKEN,
    CalcError,
    JsonPathError,
    REPEAT_MAX,
    capitalizeText,
    clampNumber,
    defaultText,
    estimateTokens,
    evaluateExpression,
    formatNumber,
    itemAt,
    jsonGet,
    repeatText,
    replaceText,
    roundTo,
    sortList,
    splitList,
    substringText,
    truncateText,
    truncateTokensText,
} from './utility-impl.js';

export const CATEGORY_TEXT = 'enhanced-text';
export const CATEGORY_MATH = 'enhanced-math';
export const CATEGORY_LIST = 'enhanced-list';

function parseInteger(value, { warn, name, fallback = null }) {
    const n = Number.parseInt(String(value).trim(), 10);
    if (Number.isNaN(n)) {
        warn(`Argument "${name}" is not a whole number: "${value}"`);
        return fallback;
    }
    return n;
}

function parseNumber(value, { warn, name, fallback = null }) {
    const n = Number.parseFloat(String(value).trim());
    if (Number.isNaN(n)) {
        warn(`Argument "${name}" is not a number: "${value}"`);
        return fallback;
    }
    return n;
}

export function registerUtilityMacros() {
    // ---- text ----

    safeRegister('upper', {
        category: CATEGORY_TEXT,
        unnamedArgs: [{ name: 'text', description: 'The text to convert to uppercase.' }],
        description: 'Converts text to uppercase.',
        exampleUsage: ['{{upper::hello}}'],
        handler: ({ unnamedArgs: [text] }) => String(text).toUpperCase(),
    });

    safeRegister('lower', {
        category: CATEGORY_TEXT,
        unnamedArgs: [{ name: 'text', description: 'The text to convert to lowercase.' }],
        description: 'Converts text to lowercase.',
        exampleUsage: ['{{lower::HELLO}}'],
        handler: ({ unnamedArgs: [text] }) => String(text).toLowerCase(),
    });

    safeRegister('capitalize', {
        aliases: [{ alias: 'cap', visible: false }],
        category: CATEGORY_TEXT,
        unnamedArgs: [{ name: 'text', description: 'The text to capitalize.' }],
        description: 'Capitalizes the first letter of the text.',
        exampleUsage: ['{{capitalize::hello world}}'],
        handler: ({ unnamedArgs: [text] }) => capitalizeText(text),
    });

    safeRegister('replace', {
        category: CATEGORY_TEXT,
        unnamedArgs: [
            { name: 'text', description: 'The text to search in.' },
            { name: 'search', description: 'The exact text to find. Every occurrence is replaced.' },
            { name: 'replacement', optional: true, defaultValue: '', description: 'The replacement text. Leave out to delete the matches.' },
        ],
        description: 'Replaces every occurrence of a plain-text search string. Note: a literal "::" cannot appear in arguments.',
        exampleUsage: ['{{replace::the cat sat::cat::dog}}'],
        handler: ({ unnamedArgs: [text, search, replacement] }) => replaceText(text, search, replacement),
    });

    safeRegister('substring', {
        aliases: [{ alias: 'substr', visible: false }],
        category: CATEGORY_TEXT,
        unnamedArgs: [
            { name: 'text', description: 'The source text.' },
            { name: 'start', type: 'integer', description: 'Start position (0-based). Negative counts from the end.' },
            { name: 'end', type: 'integer', optional: true, description: 'End position (exclusive). Negative counts from the end. Omit for "until the end".' },
        ],
        description: 'Extracts part of the text by character positions.',
        exampleUsage: ['{{substring::hello world::0::5}}', '{{substring::hello world::-5}}'],
        handler: ({ unnamedArgs: [text, start, end], warn }) => {
            const from = parseInteger(start, { warn, name: 'start', fallback: 0 });
            const to = end === undefined || end === '' ? undefined : parseInteger(end, { warn, name: 'end', fallback: undefined });
            return substringText(text, from, to);
        },
    });

    safeRegister('length', {
        category: CATEGORY_TEXT,
        unnamedArgs: [{ name: 'text', description: 'The text to measure.' }],
        description: 'Returns the number of characters in the text.',
        returnType: 'integer',
        exampleUsage: ['{{length::hello}}'],
        handler: ({ unnamedArgs: [text] }) => String(String(text).length),
    });

    safeRegister('repeat', {
        category: CATEGORY_TEXT,
        unnamedArgs: [
            { name: 'text', description: 'The text to repeat.' },
            { name: 'count', type: 'integer', description: `How many times to repeat (max ${REPEAT_MAX}).` },
        ],
        description: 'Repeats the text a number of times.',
        exampleUsage: ['{{repeat::na::4}}'],
        handler: ({ unnamedArgs: [text, count], warn }) => {
            const n = parseInteger(count, { warn, name: 'count', fallback: 0 });
            const { result, clamped } = repeatText(text, n ?? 0);
            if (clamped) {
                warn(`Repeat count clamped to ${REPEAT_MAX}.`);
            }
            return result;
        },
    });

    safeRegister('default', {
        category: CATEGORY_TEXT,
        unnamedArgs: [
            { name: 'value', description: 'The value to check.' },
            { name: 'fallback', description: 'What to use when the value is empty.' },
        ],
        description: 'Returns the value, or the fallback when the value is empty or only whitespace. Handy around {{getvar}} for unset variables.',
        exampleUsage: ['{{default::{{getvar::mood}}::neutral}}'],
        handler: ({ unnamedArgs: [value, fallback] }) => defaultText(value, fallback),
    });

    safeRegister('truncate', {
        category: CATEGORY_TEXT,
        unnamedArgs: [
            { name: 'text', description: 'The text to shorten.' },
            { name: 'max', type: 'integer', description: 'Maximum length in characters, including the ellipsis.' },
            { name: 'ellipsis', optional: true, defaultValue: '…', description: 'Appended when the text is shortened.' },
        ],
        description: 'Shortens text to a maximum number of characters.',
        exampleUsage: ['{{truncate::{{charDescription}}::300}}'],
        handler: ({ unnamedArgs: [text, max, ellipsis], warn }) => {
            const n = parseInteger(max, { warn, name: 'max' });
            if (n === null) {
                return String(text);
            }
            return truncateText(text, n, ellipsis === undefined || ellipsis === '' ? '…' : ellipsis);
        },
    });

    safeRegister('truncatetokens', {
        category: CATEGORY_TEXT,
        unnamedArgs: [
            { name: 'text', description: 'The text to shorten.' },
            { name: 'maxTokens', type: 'integer', description: 'Rough maximum length in tokens.' },
            { name: 'ellipsis', optional: true, defaultValue: '…', description: 'Appended when the text is shortened.' },
        ],
        description: `Shortens text to a rough token budget. This is an ESTIMATE (about ${CHARS_PER_TOKEN} characters per token) and can be off by 20% or more — use it for budgeting, not exact limits.`,
        exampleUsage: ['{{truncatetokens::{{lore::Backstory}}::150}}'],
        handler: ({ unnamedArgs: [text, maxTokens, ellipsis], warn }) => {
            const n = parseInteger(maxTokens, { warn, name: 'maxTokens' });
            if (n === null) {
                return String(text);
            }
            return truncateTokensText(text, n, ellipsis === undefined || ellipsis === '' ? '…' : ellipsis);
        },
    });

    safeRegister('tokencount', {
        category: CATEGORY_TEXT,
        unnamedArgs: [{ name: 'text', description: 'The text to estimate.' }],
        description: `Estimates the token count of the text (about ${CHARS_PER_TOKEN} characters per token). This is an estimate, not an exact count.`,
        returnType: 'integer',
        exampleUsage: ['{{tokencount::{{charDescription}}}}'],
        handler: ({ unnamedArgs: [text] }) => String(estimateTokens(text)),
    });

    // ---- math ----

    safeRegister('calc', {
        aliases: [{ alias: 'math', visible: false }],
        category: CATEGORY_MATH,
        unnamedArgs: [{ name: 'expression', description: 'The expression to compute, e.g. "2 * (3 + 4)".' }],
        description: 'Computes an arithmetic expression. Supports + - * / % ^, parentheses, min, max, round, floor, ceil, abs, sqrt, pow, pi and e.',
        returnType: 'number',
        exampleUsage: ['{{calc::2 * (3 + 4)}}', '{{calc::max({{getvar::hp}}, 0)}}'],
        handler: ({ unnamedArgs: [expression], warn }) => {
            try {
                return formatNumber(evaluateExpression(expression));
            } catch (error) {
                if (error instanceof CalcError) {
                    warn(`Could not compute "${expression}": ${error.message}`);
                    return String(expression);
                }
                throw error;
            }
        },
    });

    safeRegister('round', {
        category: CATEGORY_MATH,
        unnamedArgs: [
            { name: 'value', type: 'number', description: 'The number to round.' },
            { name: 'decimals', type: 'integer', optional: true, defaultValue: '0', description: 'Decimal places to keep.' },
        ],
        description: 'Rounds a number to the given number of decimal places.',
        returnType: 'number',
        exampleUsage: ['{{round::3.14159::2}}'],
        handler: ({ unnamedArgs: [value, decimals], warn }) => {
            const n = parseNumber(value, { warn, name: 'value' });
            if (n === null) {
                return String(value);
            }
            const d = decimals === undefined || decimals === '' ? 0 : parseInteger(decimals, { warn, name: 'decimals', fallback: 0 });
            return formatNumber(roundTo(n, d ?? 0));
        },
    });

    safeRegister('clamp', {
        category: CATEGORY_MATH,
        unnamedArgs: [
            { name: 'value', type: 'number', description: 'The number to clamp.' },
            { name: 'min', type: 'number', description: 'Lowest allowed value.' },
            { name: 'max', type: 'number', description: 'Highest allowed value.' },
        ],
        description: 'Limits a number to a range.',
        returnType: 'number',
        exampleUsage: ['{{clamp::{{getvar::hp}}::0::100}}'],
        handler: ({ unnamedArgs: [value, min, max], warn }) => {
            const n = parseNumber(value, { warn, name: 'value' });
            const lo = parseNumber(min, { warn, name: 'min' });
            const hi = parseNumber(max, { warn, name: 'max' });
            if (n === null || lo === null || hi === null) {
                return String(value);
            }
            return formatNumber(clampNumber(n, lo, hi));
        },
    });

    // ---- lists ----

    safeRegister('join', {
        category: CATEGORY_LIST,
        unnamedArgs: [{ name: 'separator', description: 'Placed between the items.' }],
        list: { min: 1 },
        description: 'Joins the remaining arguments into one string.',
        exampleUsage: ['{{join::, ::sword::shield::potion}}'],
        handler: ({ unnamedArgs: [separator], list }) => (list ?? []).join(String(separator)),
    });

    safeRegister('item', {
        category: CATEGORY_LIST,
        unnamedArgs: [
            { name: 'index', type: 'integer', description: 'Position of the item (0 is first; negative counts from the end).' },
            { name: 'list', description: 'The list as one string.' },
            { name: 'separator', optional: true, defaultValue: ',', description: 'What separates the items.' },
        ],
        description: 'Picks one item out of a separated list.',
        exampleUsage: ['{{item::0::red,green,blue}}', '{{item::-1::a;b;c::;}}'],
        handler: ({ unnamedArgs: [index, list, separator], warn }) => {
            const i = parseInteger(index, { warn, name: 'index' });
            if (i === null) {
                return '';
            }
            return itemAt(i, list, separator === undefined || separator === '' ? ',' : separator);
        },
    });

    safeRegister('count', {
        category: CATEGORY_LIST,
        unnamedArgs: [
            { name: 'list', description: 'The list as one string.' },
            { name: 'separator', optional: true, defaultValue: ',', description: 'What separates the items.' },
        ],
        description: 'Counts the items in a separated list.',
        returnType: 'integer',
        exampleUsage: ['{{count::red,green,blue}}'],
        handler: ({ unnamedArgs: [list, separator] }) => String(splitList(list, separator === undefined || separator === '' ? ',' : separator).length),
    });

    safeRegister('listsort', {
        category: CATEGORY_LIST,
        unnamedArgs: [
            { name: 'list', description: 'The list as one string.' },
            { name: 'separator', optional: true, defaultValue: ',', description: 'What separates the items.' },
            { name: 'order', optional: true, defaultValue: 'asc', description: '"asc" or "desc".' },
        ],
        description: 'Sorts a separated list alphabetically (numbers sort naturally).',
        exampleUsage: ['{{listsort::banana,apple,cherry}}'],
        handler: ({ unnamedArgs: [list, separator, order] }) => {
            const sep = separator === undefined || separator === '' ? ',' : separator;
            return sortList(list, sep, order || 'asc').join(sep);
        },
    });

    safeRegister('jsonget', {
        category: CATEGORY_LIST,
        unnamedArgs: [
            { name: 'json', description: 'The JSON text.' },
            { name: 'path', description: 'The path to read, e.g. "user.name" or "items[0].id".' },
        ],
        description: 'Reads a value out of JSON text by path.',
        exampleUsage: ['{{jsonget::{{getvar::inventory}}::items[0].name}}'],
        handler: ({ unnamedArgs: [json, path], warn }) => {
            try {
                return jsonGet(json, path);
            } catch (error) {
                if (error instanceof JsonPathError) {
                    warn(`jsonget failed: ${error.message}`);
                    return '';
                }
                throw error;
            }
        },
    });
}
