# Macro Enhanced

A SillyBunny extension that adds four things to the experimental macro engine:

1. Utility macros for text, math and lists.
2. Lorebook macros that pull World Info content into a prompt.
3. Custom macros you define yourself, no coding needed.
4. A sandboxed Macro Workbench for previewing macro text.

Requires the Experimental Macro Engine (User Settings, on by default). If it's off, the extension stays inactive and says so in its settings panel. Turning the engine on activates it right away.

All macros appear in `/help macros` and in autocomplete, grouped under the `enhanced-` categories.

## Utility macros

Text:

| Macro | What it does |
|---|---|
| `{{upper::text}}` / `{{lower::text}}` | Uppercase / lowercase |
| `{{capitalize::text}}` | Capitalizes the first letter |
| `{{replace::text::search::replacement}}` | Replaces every occurrence (plain text, replacement optional) |
| `{{substring::text::start::end}}` | Cuts by character position, negatives count from the end |
| `{{length::text}}` | Character count |
| `{{repeat::text::count}}` | Repeats text (capped at 1000) |
| `{{default::value::fallback}}` | Uses the fallback when the value is empty, useful with `{{getvar}}` |
| `{{truncate::text::max::ellipsis}}` | Shortens to a character limit |
| `{{truncatetokens::text::maxTokens}}` | Shortens to a rough token budget (about 4 characters per token) |
| `{{tokencount::text}}` | Rough token estimate |

Math:

| Macro | What it does |
|---|---|
| `{{calc::2 * (3 + 4)}}` | Arithmetic: `+ - * / % ^`, parentheses, `min`, `max`, `round`, `floor`, `ceil`, `abs`, `sqrt`, `pow`, `pi`, `e` |
| `{{round::value::decimals}}` | Rounds a number |
| `{{clamp::value::min::max}}` | Keeps a number inside a range |

Lists:

| Macro | What it does |
|---|---|
| `{{join::, ::a::b::c}}` | Joins arguments with a separator |
| `{{item::index::list::separator}}` | Picks one item (0-based, negatives from the end, separator defaults to `,`) |
| `{{count::list::separator}}` | Counts items |
| `{{listsort::list::separator::order}}` | Sorts naturally (`item2` before `item10`), `desc` reverses |
| `{{jsonget::json::path}}` | Reads a value from JSON, e.g. `items[0].name` |

Macros can be nested: `{{calc::max({{getvar::hp}}, 0)}}`.

## Lorebook macros

| Macro | What it does |
|---|---|
| `{{lore::Entry}}` (alias `{{wi::…}}`) | Inserts an entry's content by its title (memo) or uid, macros inside it expand too |
| `{{lorekeys::Entry}}` | The entry's trigger keywords |
| `{{loreexists::Entry}}` | `true`/`false`, for use with `{{if}}` |
| `{{lorecount::scope}}` | Entry count: `active` (triggered last generation), `bound`, or `all` |
| `{{loreactive}}` | Titles of the entries that triggered last generation |
| `{{lorebooks}}` | The books bound to this chat |

Without an explicit book, entries are searched in order: chat lorebook, then character books, then global books. Add a book name as a second argument to target one: `{{lore::Kingdom::My World}}`.

Books load in the background, so right after opening a chat the first use of a book can come back empty. It works from the next evaluation on.

## Custom macros

Open Extensions → Macro Enhanced → Your custom macros. A macro is a name plus a template, the text it expands to. Templates can use other macros. Arguments are optional: an argument named `who` is available in the template as `{{who}}` (or `{{arg1}}`, `{{arg2}}` by position), and callers pass values with `{{yourmacro::value1::value2}}`. Optional arguments can have defaults.

Macros are saved globally or for the current character only. Character macros win when names clash and travel with the chat. Names are checked as you type; you can't use a name that belongs to another extension, one of this extension's built-ins, or the reserved `me-` prefix.

"Test in Workbench" saves the macro first (with the same checks as Save), then opens it in the Workbench.

From scripts: `/me-define name=greet args=who Hello {{who}}!` and `/me-undefine greet`.

Macros that include themselves are stopped with a console warning instead of looping forever.

## Macro Workbench

Open it from the settings panel or with `/me-workbench`. Type on the left, the evaluated result appears on the right, along with every chat and global variable and a list of pending changes the text would have made (`hp: 50 → 35`).

Nothing is saved. Variable macros write to a throwaway copy, and shorthand writes (`{{.x = 5}}`, `{{$y++}}`) are reverted after each preview. One caveat: shorthand writes touch the real value for a split second, so another extension reacting to variable changes instantly could notice. "Reset sandbox" discards all pending changes.

Results update as you type. Ctrl+Enter evaluates immediately.

## Slash commands

| Command | What it does |
|---|---|
| `/me-workbench` | Opens the Workbench |
| `/me-eval text` | Evaluates text through the engine (sandboxed, add `sandbox=false` to apply variable changes for real). Pipeable. |
| `/me-lore entry` | Returns a lorebook entry's raw content (`book=` to target a book). Pipeable. |
| `/me-define` / `/me-undefine` | Create / remove custom macros from scripts |
| `/me-macros` | Lists everything this extension registered |

## Good to know

- If a future SillyBunny update ships a macro with the same name as one of ours, this extension steps aside and renames its own to `{{me-name}}` (noted in the settings panel). Every macro also has a hidden `{{me-…}}` alias from day one, so prompts using those keep working after updates.
- The engine uses `::` to separate arguments, so a literal `::` can't appear inside one.
- Disabling or uninstalling removes every registered macro.

## Install

Install via the extension manager with this repo's URL, or clone it and symlink the folder into `data/<user>/extensions/` as `MacroEnhanced`.

## Development

No build step. Tests use Node's built-in runner:

```
npm test
```

## License

AGPL-3.0 (same as SillyBunny).
