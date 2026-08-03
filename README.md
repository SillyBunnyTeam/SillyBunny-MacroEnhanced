# Macro Enhanced

A SillyBunny extension that builds on the experimental macro engine with four things it doesn't have out of the box:

1. **Utility macros** — text tools, real math, and list handling for your prompts.
2. **Lorebook macros** — pull World Info content into a prompt on demand.
3. **Custom macros** — create your own macros in a settings panel, no coding needed.
4. **Macro Workbench** — a sandboxed playground to preview macro text before using it.

Requires the **Experimental Macro Engine** (User Settings → Experimental Macro Engine, on by default). If it's off, the extension stays dormant and tells you why in its settings panel — flip the toggle and it activates on the spot.

Every macro below shows up in `/help macros` and in autocomplete with full documentation, grouped under the `enhanced-…` categories.

## Utility macros

Text:

| Macro | What it does |
|---|---|
| `{{upper::text}}` / `{{lower::text}}` | UPPERCASE / lowercase |
| `{{capitalize::text}}` | Capitalizes the first letter |
| `{{replace::text::search::replacement}}` | Replaces every occurrence (plain text; replacement optional) |
| `{{substring::text::start::end}}` | Cuts by character positions; negatives count from the end |
| `{{length::text}}` | Character count |
| `{{repeat::text::count}}` | Repeats text (capped at 1000) |
| `{{default::value::fallback}}` | Uses the fallback when the value is empty — great around `{{getvar}}` |
| `{{truncate::text::max::ellipsis}}` | Shortens to a character limit |
| `{{truncatetokens::text::maxTokens}}` | Shortens to a rough token budget (~4 characters per token — an estimate, not exact) |
| `{{tokencount::text}}` | Rough token estimate for the text |

Math:

| Macro | What it does |
|---|---|
| `{{calc::2 * (3 + 4)}}` | Full arithmetic: `+ - * / % ^`, parentheses, `min`, `max`, `round`, `floor`, `ceil`, `abs`, `sqrt`, `pow`, `pi`, `e` |
| `{{round::value::decimals}}` | Rounds a number |
| `{{clamp::value::min::max}}` | Keeps a number inside a range |

Lists:

| Macro | What it does |
|---|---|
| `{{join::, ::a::b::c}}` | Joins arguments with a separator |
| `{{item::index::list::separator}}` | Picks one item (0-based; negatives from the end; separator defaults to `,`) |
| `{{count::list::separator}}` | Counts items |
| `{{listsort::list::separator::order}}` | Sorts naturally (`item2` before `item10`); `desc` reverses |
| `{{jsonget::json::path}}` | Reads a value from JSON, e.g. `items[0].name` |

Macros nest freely: `{{calc::max({{getvar::hp}}, 0)}}`.

## Lorebook macros

| Macro | What it does |
|---|---|
| `{{lore::Entry}}` (alias `{{wi::…}}`) | Inserts an entry's content by its title (memo) or uid; macros inside the entry expand too |
| `{{lorekeys::Entry}}` | The entry's trigger keywords |
| `{{loreexists::Entry}}` | `true`/`false` — pairs well with `{{if}}` |
| `{{lorecount::scope}}` | Entry count: `active` (triggered last generation), `bound`, or `all` |
| `{{loreactive}}` | Titles of the entries that triggered last generation |
| `{{lorebooks}}` | The books bound to this chat |

Without an explicit book, entries are searched in order: chat lorebook → character books → global books. Add a book name as a second argument to target one: `{{lore::Kingdom::My World}}`.

Books load in the background. In a freshly opened chat the very first evaluation of an unloaded book can come back empty; it's correct from the next evaluation on.

## Custom macros

Open **Extensions → Macro Enhanced → Your custom macros**. A macro is a name plus a template — the text it expands to, which can use any other macros. Add arguments if you want them: an argument named `who` is available inside the template as `{{who}}` (or `{{arg1}}`, `{{arg2}}`, … by position), and callers pass values with `{{yourmacro::value1::value2}}`. Optional arguments can have defaults.

Macros are saved globally or for the current character only (character macros win when names clash, and travel with the chat). Everything appears in `/help macros` under *enhanced-custom* with your description.

From scripts: `/me-define name=greet args=who Hello {{who}}!` and `/me-undefine greet`.

Self-referencing macros are stopped automatically (with a console warning) instead of looping forever.

## Macro Workbench

Open it from the extension's settings panel or with `/me-workbench`. Type on the left, see the fully evaluated result live on the right — plus every chat and global variable, and a **pending changes** list showing what the text *would* have changed (`hp: 50 → 35`).

Nothing is saved: variable macros (`{{setvar}}`, `{{incglobalvar}}`, …) write to a throwaway copy, and shorthand writes (`{{.x = 5}}`, `{{$y++}}`) are reverted immediately after each preview. One honest caveat: shorthand writes technically touch the real value for a split second before being restored — if some other extension reacts to variable changes instantly, it could notice. The "Reset sandbox" button discards all pending changes.

## Slash commands

| Command | What it does |
|---|---|
| `/me-workbench` | Opens the Workbench |
| `/me-eval text` | Evaluates text through the engine (sandboxed; add `sandbox=false` to apply variable changes for real). Pipeable. |
| `/me-lore entry` | Returns a lorebook entry's raw content (`book=` to target a book). Pipeable. |
| `/me-define` / `/me-undefine` | Create / remove custom macros from scripts |
| `/me-macros` | Lists everything this extension registered |

## Good to know

- **Name collisions:** if a future SillyBunny update ships a macro with the same name as one of ours, this extension steps aside automatically and re-registers as `{{me-name}}` instead (you'll see a note in the settings panel). Every macro also has a hidden `{{me-…}}` alias from day one — use those in prompts you want to be future-proof.
- **`::` in arguments:** the engine uses `::` to separate arguments, so a literal `::` can't appear inside one.
- **Uninstalling/disabling** removes every registered macro cleanly.

## Install

Install via the extension manager with this repo's URL, or clone it and symlink the folder into `data/<user>/extensions/` as `MacroEnhanced`.

## Development

No build step. Tests use Node's built-in runner:

```
npm test
```

## License

AGPL-3.0 (same as SillyBunny).
