# Macro Enhanced

A SillyBunny extension that adds seven things to the experimental macro engine:

1. Utility macros for text, math, lists, dates and JSON.
2. Logic macros: comparisons, and/or/not, and a `{{switch}}` with lazy branches.
3. Cache-friendly state macros (`{{freeze}}`, `{{sticky}}`, `{{daily}}`, …) that keep prompts byte-stable for prompt caching, plus a Cache Auditor that finds what's breaking it.
4. Lorebook macros that pull World Info content and metadata into a prompt.
5. Custom macros you define yourself, no coding needed — global, per character, or per chat.
6. A template gallery of ready-made macros, and shareable macro packs (JSON import/export).
7. A sandboxed Macro Workbench with a live playground, the Cache Auditor, and a per-macro trace.

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
| `{{listunique}}` / `{{listreverse}}` / `{{listslice}}` | Dedupe, reverse, or cut a list |
| `{{listcontains::list::item}}` | `true`/`false`, numbers match numerically |
| `{{listshuffle::list::seed}}` | Shuffles — give it a seed and the order is fixed (cache-friendly) |
| `{{sum::3, 4, 5}}` / `{{avg::…}}` / `{{listmin::…}}` / `{{listmax::…}}` | List math |
| `{{jsonget::json::path}}` | Reads a value from JSON, e.g. `items[0].name` |
| `{{jsonkeys::json::path}}` / `{{jsonlength::json::path}}` | A JSON object's keys / a value's length |
| `{{jsonset::variable::path::value}}` | Sets a value inside a JSON variable, creating missing levels |

Macros can be nested: `{{calc::max({{getvar::hp}}, 0)}}`.

## Logic macros

| Macro | What it does |
|---|---|
| `{{eq}}` `{{neq}}` `{{gt}}` `{{gte}}` `{{lt}}` `{{lte}}` | Compare two values (`a::b`). Numbers compare numerically, anything else as text. Returns `true`/`false`, so they slot straight into `{{if}}`: `{{if {{gt::{{getvar::hp}}::0}}}}…{{/if}}` |
| `{{and::a::b}}` / `{{or::a::b}}` / `{{not::a}}` | Combine conditions, same truthiness rules as `{{if}}` |
| `{{isempty::value}}` | `true` when empty or only whitespace |
| `{{switch::value::red=…::blue=…::default=…}}` | Picks the matching branch. Only the winning branch's macros run |

## Date macros

| Macro | What it does |
|---|---|
| `{{dateadd::2026-08-03::3::days}}` | Adds time to a date (calendar-aware: Jan 31 + 1 month = Feb 28). Optional 4th argument formats the output |
| `{{datediff::from::to::unit}}` | Whole units between two dates, `days` by default |
| `{{dateformat::date::format}}` | Formats a date (`YYYY`, `MM`, `DD`, `HH`, `mm`, `dddd`, `A`, `[literal]`, …). Empty date means "now" — which changes every call, so it hurts prompt caching just like `{{time}}` |

## Cache-friendly state macros

SillyBunny re-runs every macro in your presets, character card, lorebooks and past AI messages on every generation. Prompt caching (the discount for re-sending an unchanged prompt start) needs that text to stay byte-for-byte identical — one `{{time}}` in a card quietly cancels the discount every minute. These macros give you the flavor without the churn. Their values live inside the chat and survive reloads.

| Macro | What it does |
|---|---|
| `{{freeze::key::content}}` | Evaluates the content once, saves the result in this chat, returns the saved result forever after. The inner macros don't even run again |
| `{{sticky::10::key::content}}` | Like freeze, but re-evaluates every N of your messages |
| `{{daily::key::content}}` | Like freeze, but re-evaluates once per calendar day |
| `{{rollonce::key::3d6}}` | Rolls dice once, keeps the total for the whole chat |
| `{{listpick::key::a, b, c}}` | Always the same pick from a list for this chat — a cache-safe `{{random}}` |
| `{{timeofday}}` / `{{season}}` | morning/afternoon/evening/night and the season — coarse on purpose |
| `{{chatdays}}` | Whole days since the chat started |
| `{{usermsgcount}}` `{{charmsgcount}}` `{{swipecount}}` `{{gencount}}` | Per-chat tallies, updated from chat events |

Manage stored values with `/me-unfreeze` (list, remove one, or `all=true`) or the "Frozen chat values" table in the settings panel.

## Cache Auditor

Workbench → Cache Audit (or `/me-audit`). Scans your preset prompts, character card, persona, lorebooks and recent chat for macros that change between generations, evaluates everything twice to catch surprises, and — when it can read the server's caching settings (admin only; there's a manual field otherwise) — tells you which findings actually cost money versus sit harmlessly below the cache breakpoints. Each finding comes with the fix: `{{freeze}}` it, `{{sticky}}` it, or swap in the coarse/deterministic variant.

## Lorebook macros

| Macro | What it does |
|---|---|
| `{{lore::Entry}}` (alias `{{wi::…}}`) | Inserts an entry's content by its title (memo) or uid, macros inside it expand too |
| `{{lorekeys::Entry}}` | The entry's trigger keywords |
| `{{loreexists::Entry}}` | `true`/`false`, for use with `{{if}}` |
| `{{lorecount::scope}}` | Entry count: `active` (triggered last generation), `bound`, or `all` |
| `{{loreactive}}` | Titles of the entries that triggered last generation |
| `{{lorebooks}}` | The books bound to this chat |
| `{{loreentries::book}}` | Titles of a book's enabled entries (or every bound book) |
| `{{lorefield::Entry::field}}` | One field of an entry: `keys`, `position`, `depth`, `probability`, `constant`, `enabled`, … |
| `{{loretokens::scope}}` | Rough token estimate of `active` or `bound` lore content |
| `{{lorepick::book::key}}` | One enabled entry's content — always the same one for this chat and key |

Without an explicit book, entries are searched in order: chat lorebook, then character books, then global books. Add a book name as a second argument to target one: `{{lore::Kingdom::My World}}`.

Books load in the background, so right after opening a chat the first use of a book can come back empty. It works from the next evaluation on.

## Custom macros

Open Extensions → Macro Enhanced → Your custom macros. A macro is a name plus a template, the text it expands to. Templates can use other macros. Arguments are optional: an argument named `who` is available in the template as `{{who}}` (or `{{arg1}}`, `{{arg2}}` by position), and callers pass values with `{{yourmacro::value1::value2}}`. Optional arguments can have defaults.

Macros are saved globally, for the current character, or for the current chat only. The most specific scope wins when names clash: chat beats character beats global. Character macros travel with the character card; chat macros live inside the chat file. Names are checked as you type; you can't use a name that belongs to another extension, one of this extension's built-ins, or the reserved `me-` prefix.

"Test in Workbench" saves the macro first (with the same checks as Save), then opens it in the Workbench.

From scripts: `/me-define name=greet args=who scope=chat Hello {{who}}!` and `/me-undefine greet`.

Macros that include themselves are stopped with a console warning instead of looping forever.

## Template gallery and macro packs

Extensions → Macro Enhanced → Template gallery. Four starter packs — RP state trackers (mood, relationship, outfit), dice & game mechanics, prompt-style guards, and time & scene helpers — install into whichever scope you pick and become ordinary custom macros you can open in the editor and tweak. Name collisions get a `-2` suffix instead of overwriting anything.

Custom macros can also be exported per scope as a small JSON pack file and imported on another machine (or shared). `/me-export scope=chat` prints the same JSON for scripting.

## Macro Workbench

Open it from the settings panel or with `/me-workbench`. Three tabs:

- **Playground** — type on the left, the evaluated result appears with a timing readout; the right side lists every chat and global variable plus the pending changes the text would have made (`hp: 50 → 35`, `frozen:key: (new) → …`).
- **Cache Audit** — the auditor described above.
- **Trace** — evaluates the Playground text one macro span at a time and shows what each span produced and how long it took.

Nothing is saved. Variable macros and the state macros (`{{freeze}}` and friends) write to a throwaway copy, and shorthand writes (`{{.x = 5}}`, `{{$y++}}`) are reverted after each preview. One caveat: shorthand writes touch the real value for a split second, so another extension reacting to variable changes instantly could notice. "Reset sandbox" discards all pending changes.

Results update as you type. Ctrl+Enter evaluates immediately.

## Slash commands

| Command | What it does |
|---|---|
| `/me-workbench` | Opens the Workbench |
| `/me-eval text` | Evaluates text through the engine (sandboxed, add `sandbox=false` to apply variable changes for real). Pipeable. |
| `/me-lore entry` | Returns a lorebook entry's raw content (`book=` to target a book). Pipeable. |
| `/me-unfreeze` | Lists stored `{{freeze}}`/`{{sticky}}`/`{{daily}}`/`{{rollonce}}` values; pass a key, `kind=`, or `all=true` to remove |
| `/me-audit` | The Cache Auditor as a pipeable text report |
| `/me-define` / `/me-undefine` | Create / remove custom macros from scripts (`scope=global\|character\|chat`) |
| `/me-export scope=…` | A scope's custom macros as pack JSON. Pipeable. |
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
