# Macro Enhanced

A SillyBunny extension that adds eight things to the experimental macro engine:

1. Utility macros for text, math, lists, dates and JSON.
2. Logic macros: comparisons, and/or/not, and a `{{switch}}` with lazy branches.
3. Cache-friendly state macros (`{{freeze}}`, `{{sticky}}`, `{{daily}}`, …) that keep prompts byte-stable for prompt caching, plus a Cache Auditor that finds what's breaking it.
4. Lorebook macros that pull World Info content and metadata into a prompt.
5. Custom macros you define yourself, no coding needed — global, per character, or per chat.
6. A template gallery of ready-made macros, and shareable macro packs (JSON import/export).
7. A sandboxed Macro Workbench with a live playground, the Cache Auditor, and a per-macro trace.
8. A searchable in-app reference, so none of the above needs this file to be usable.

Requires the Experimental Macro Engine (User Settings, on by default). If it's off, the extension stays inactive and says so in its settings panel. Turning the engine on activates it right away.

All macros appear in `/help macros` and in autocomplete, grouped under the `enhanced-` categories.

## Where the documentation lives

Everything below is also in the extension itself: **Extensions → Macro Enhanced → Macro reference**, or the Reference tab of the Workbench.

It lists every macro and slash command with its arguments, what it returns, and worked examples you can drop straight into the Playground with one click — plus short written guides on the things a macro description can't cover (why prompt caching matters, which scope wins when names clash, what the sandbox does and doesn't save). Search covers all of it, and the `?` next to a section heading opens the matching guide.

Your own custom macros appear there too, with whatever descriptions you gave them.

## The macros

<!-- macros:start -->

*Generated from the macro definitions by `npm run docs` — 86 macros. Edit the descriptions in `src/*-macros.js`, not this table.*

### Text

| Macro | What it does | Returns |
|---|---|---|
| `{{capitalize::text}}` | Capitalizes the first letter of the text. | the text with its first letter capitalized |
| `{{default::value::fallback}}` | Returns the value, or the fallback when the value is empty or only whitespace. Handy around {{getvar}} for unset variables. | the value, or the fallback when it was empty |
| `{{length::text}}` | Returns the number of characters in the text. | a whole number |
| `{{lower::text}}` | Converts text to lowercase. | the lowercased text |
| `{{padend::text::length::[pad]}}` | Pads the end of the text to a target length. | the padded text |
| `{{padstart::text::length::[pad]}}` | Pads the start of the text to a target length. | the padded text |
| `{{regexreplace::text::pattern::[replacement]::[flags]}}` | Regular-expression replace with guardrails. On any problem the original text is returned with a warning. Note: a complex pattern on long text can be slow. | the replaced text |
| `{{repeat::text::count}}` | Repeats the text a number of times. | the repeated text |
| `{{replace::text::search::[replacement]}}` | Replaces every occurrence of a plain-text search string. Note: a literal "::" cannot appear in arguments. | the text with every match replaced |
| `{{split::text::separator::index}}` | Returns one piece of a split-up string. Returns nothing when the position is past either end. | the piece at that position |
| `{{substring::text::start::[end]}}` | Extracts part of the text by character positions. | the extracted part of the text |
| `{{titlecase::text}}` | Uppercases the first letter of every word. | the converted text |
| `{{tokencount::text}}` | Estimates the token count of the text (about 4 characters per token). This is an estimate, not an exact count. | an estimated number of tokens |
| `{{truncate::text::max::[ellipsis]}}` | Shortens text to a maximum number of characters. | the shortened text |
| `{{truncatetokens::text::maxTokens::[ellipsis]}}` | Shortens text to a rough token budget. This is an ESTIMATE (about 4 characters per token) and can be off by 20% or more — use it for budgeting, not exact limits. | the shortened text |
| `{{upper::text}}` | Converts text to uppercase. | the uppercased text |
| `{{wordcount::text}}` | Counts the words in the text. | the number of words |
| `{{wrap::prefix::suffix::value}}` | Surrounds a value with a prefix and suffix, but produces nothing at all when the value is empty. Useful for separators that should disappear along with what they separate. | the surrounded value, or nothing |

### Math

| Macro | What it does | Returns |
|---|---|---|
| `{{avg::list::[separator]}}` | Averages the numbers in a list. Non-numeric items are skipped with a warning. | the average |
| `{{calc::expression}}` | Computes an arithmetic expression. Supports + - * / % ^, parentheses, min, max, round, floor, ceil, abs, sqrt, pow, pi and e. | the computed number |
| `{{ceil::value}}` | Rounds a number up to a whole number. | a whole number |
| `{{clamp::value::min::max}}` | Limits a number to a range. | the number, limited to the range |
| `{{floor::value}}` | Rounds a number down to a whole number. | a whole number |
| `{{listmax::list::[separator]}}` | The largest value in a list (numeric when possible). | the largest value |
| `{{listmin::list::[separator]}}` | The smallest value in a list (numeric when possible). | the smallest value |
| `{{max::a::b}}` | The larger of two numbers. For a whole list, use {{listmax}}. | the larger number |
| `{{min::a::b}}` | The smaller of two numbers. For a whole list, use {{listmin}}. | the smaller number |
| `{{mod::value::divisor}}` | The remainder after dividing one number by another. | the remainder |
| `{{round::value::[decimals]}}` | Rounds a number to the given number of decimal places. | the rounded number |
| `{{sum::list::[separator]}}` | Adds up the numbers in a list. Non-numeric items are skipped with a warning. | the total |

### Lists and JSON

| Macro | What it does | Returns |
|---|---|---|
| `{{count::list::[separator]}}` | Counts the items in a separated list. | a whole number |
| `{{item::index::list::[separator]}}` | Picks one item out of a separated list. | the item at that position, or empty when out of range |
| `{{join::separator::…}}` | Joins the remaining arguments into one string. | the joined text |
| `{{jsonget::json::path}}` | Reads a value out of JSON text by path. | the value at that path, or empty when it is missing |
| `{{jsonkeys::json::[path]}}` | The keys of a JSON object, comma-separated. | the keys |
| `{{jsonlength::json::[path]}}` | The length of a JSON value: array items, object keys, or string characters. | the length |
| `{{jsonset::variable::path::value::[scope]}}` | Sets a value inside a JSON variable, creating missing levels. Returns nothing, like {{setvar}}. | an empty string |
| `{{listcontains::list::item::[separator]}}` | True when the list contains the item (numbers match numerically). Composes with {{if}}. | true or false |
| `{{listreverse::list::[separator]}}` | Reverses the order of the items. | the reversed list |
| `{{listshuffle::list::[seed]::[separator]}}` | Shuffles the items. Give it a seed to make the order deterministic and prompt-cache-friendly. | the shuffled list |
| `{{listslice::list::start::[end]::[separator]}}` | Extracts part of a list by item positions. | the sliced list |
| `{{listsort::list::[separator]::[order]}}` | Sorts a separated list alphabetically (numbers sort naturally). | the sorted list |
| `{{listunique::list::[separator]}}` | Removes duplicate items, keeping the first occurrence. | the deduplicated list |

### Logic

| Macro | What it does | Returns |
|---|---|---|
| `{{and::first::second::…}}` | True when every value is truthy (same rules as {{if}}: empty, "false", "off" and "0" are false). | true or false |
| `{{eq::a::b}}` | True when a = b. Numbers compare numerically, anything else as text. Composes with {{if}}. | true or false |
| `{{gt::a::b}}` | True when a > b. Numbers compare numerically, anything else as text. Composes with {{if}}. | true or false |
| `{{gte::a::b}}` | True when a ≥ b. Numbers compare numerically, anything else as text. Composes with {{if}}. | true or false |
| `{{isempty::value}}` (alias `{{blank}}`) | True when the value is empty or only whitespace. | true or false |
| `{{lt::a::b}}` | True when a < b. Numbers compare numerically, anything else as text. Composes with {{if}}. | true or false |
| `{{lte::a::b}}` | True when a ≤ b. Numbers compare numerically, anything else as text. Composes with {{if}}. | true or false |
| `{{neq::a::b}}` | True when a ≠ b. Numbers compare numerically, anything else as text. Composes with {{if}}. | true or false |
| `{{not::value}}` | Inverts a truthy/falsy value (same rules as {{if}}). | true or false |
| `{{or::first::second::…}}` | True when at least one value is truthy (same rules as {{if}}). | true or false |
| `{{switch::value::…}}` | Matches a value against case=result branches and returns the matching result. Only the winning branch's macros run. "default=result" catches everything else. | the matching branch's result |

### Conditions

| Macro | What it does | Returns |
|---|---|---|
| `{{expr::condition::…}}` | Works out a condition written the ordinary way, with == != > >= < <= && \|\| ! and brackets. Compare text or numbers; quote values containing spaces. Without this, {{if}} only asks whether the condition is non-empty, so "0 > 0" would count as true. | true or false |

### Chat variables

| Macro | What it does | Returns |
|---|---|---|
| `{{addchatvar::name::value}}` | Adds to a chat variable, creating it at 0 when it does not exist yet. Adds numerically when both sides are numbers, otherwise appends as text. Writes nothing to the prompt. | nothing |
| `{{deletechatvar::name}}` | Removes a chat variable from this chat. Writes nothing to the prompt. | nothing |
| `{{foreachChatVar::prefix::alias::content}}` | Repeats a block once per chat variable whose name starts with the prefix, in name order. Use it as a block with a matching {{/foreachChatVar}}. | the block repeated once per match, joined together |
| `{{getchatvar::name::[fallback]}}` | Reads a chat variable. Returns the fallback (or nothing) when it has never been set. | the stored value |
| `{{haschatvar::name}}` | True when the chat variable has been set in this chat. Composes with {{if}}. | true or false |
| `{{setchatvar::name::value}}` | Stores a value in a chat variable, which persists in this chat only. Writes nothing to the prompt. Separate from {{setvar}}, so loop prefixes never collide with scratch values. | nothing |

### Dates

| Macro | What it does | Returns |
|---|---|---|
| `{{dateadd::date::amount::unit::[format]}}` | Adds time to a date (calendar-aware: Jan 31 + 1 month = Feb 28). Note: with an empty date argument the result changes as time passes. | the shifted date |
| `{{datediff::from::to::[unit]}}` | Whole units between two dates (negative when "to" is earlier). | a whole number |
| `{{dateformat::date::[format]}}` | Formats a date. Note: with an empty date argument this changes every call — that hurts prompt caching, like {{time}}. | the formatted date |

### Cache-friendly state

| Macro | What it does | Returns |
|---|---|---|
| `{{charmsgcount}}` | How many character replies Macro Enhanced has counted in this chat. Only changes when it happens, so it is cache-friendly. | a whole number |
| `{{chatdays}}` | How many whole days this chat has existed. Changes at most once a day. | a whole number of days |
| `{{daily::key::content}}` | Like {{freeze}}, but re-evaluates its content once per calendar day (local time). Prompt caching only breaks at the first generation of each day. | the stored result |
| `{{freeze::key::content}}` | Evaluates its content once, saves the result in this chat, and returns the saved result from then on. Keeps prompts byte-stable for prompt caching. Undo with /me-unfreeze. | the stored result |
| `{{gencount}}` | How many generations Macro Enhanced has counted in this chat. Only changes when it happens, so it is cache-friendly. | a whole number |
| `{{listpick::key::list::[separator]}}` | Picks one item from a list — always the same one for this chat and key. A cache-friendly {{random}} that needs no storage. | the picked item |
| `{{rollonce::key::formula}}` | Rolls dice once, saves the total in this chat, and returns the same total from then on. Cache-friendly, unlike {{roll}}. Re-roll with /me-unfreeze. | the stored total |
| `{{season::[hemisphere]}}` | The current season. Changes four times a year — safe for prompt caching. | spring, summer, autumn or winter |
| `{{sticky::messages::key::content}}` | Like {{freeze}}, but re-evaluates its content every N of your messages. Between refreshes the stored result is returned unchanged, so prompt caching only breaks at refresh points. | the stored result |
| `{{swipecount}}` | How many swipes Macro Enhanced has counted in this chat. Only changes when it happens, so it is cache-friendly. | a whole number |
| `{{timeofday}}` | The coarse time of day: morning, afternoon, evening or night. Changes only a few times a day, so it is far kinder to prompt caching than {{time}}. | morning, afternoon, evening or night |
| `{{usermsgcount}}` | How many of your messages Macro Enhanced has counted in this chat. Only changes when it happens, so it is cache-friendly. | a whole number |

### Lorebook

| Macro | What it does | Returns |
|---|---|---|
| `{{lore::entry::[book]}}` | Inserts the content of a lorebook entry. Macros inside the entry are expanded too. | the entry's content, or empty when it is not found |
| `{{loreactive::[separator]}}` | Lists the titles of the lorebook entries that triggered during the last generation. | a comma separated list of entry titles |
| `{{lorebooks::[separator]}}` | Lists the lorebooks bound to this chat (chat book, character books, global books). | a comma separated list of lorebook names |
| `{{lorecount::[scope]}}` | Counts lorebook entries. | a whole number |
| `{{loreentries::[book]::[separator]}}` | Lists the titles of the enabled entries in a lorebook (or in every book bound to this chat). | a comma separated list of entry titles |
| `{{loreexists::entry::[book]}}` | Checks whether a lorebook entry exists. Returns "true" or "false". | true or false |
| `{{lorefield::entry::field::[book]}}` | Reads one field of a lorebook entry (its keywords, position, depth, probability, ...). | the field value, or empty when the field is unknown |
| `{{lorekeys::entry::[book]}}` | Lists the trigger keywords of a lorebook entry, comma separated. | a comma separated list of keywords |
| `{{lorepick::[book]::[key]}}` | Inserts the content of one enabled entry — always the same one for this chat and key. A cache-friendly random story seed. | the chosen entry's content |
| `{{loretokens::[scope]}}` | A rough token estimate (~4 characters per token) of lorebook content — pairs with {{lorecount}} for budget checks. | an estimated token count |

Optional arguments are shown in `[brackets]`; `…` means the macro takes any number of further values. Worked examples for every macro are in the Workbench's Reference tab.

<!-- macros:end -->

Macros can be nested: `{{calc::max({{getvar::hp}}, 0)}}`.

The comparison macros return the literal `true`/`false` that `{{if}}` expects, so they slot straight in: `{{if {{gt::{{getvar::hp}}::0}}}}…{{/if}}`. Only the winning branch of a `{{switch}}` is ever evaluated.

### Why the cache-friendly ones exist

SillyBunny re-runs every macro in your presets, character card, lorebooks and past AI messages on every generation. Prompt caching (the discount for re-sending an unchanged prompt start) needs that text to stay byte-for-byte identical — one `{{time}}` in a card quietly cancels the discount every minute. The `enhanced-state` macros give you the flavor without the churn. Their values live inside the chat and survive reloads.

Manage stored values with `/me-unfreeze` (list, remove one, or `all=true`) or the "Frozen chat values" table in the settings panel.

### Finding lorebook entries

Without an explicit book, entries are searched in order: chat lorebook, then character books, then global books. Add a book name as a second argument to target one: `{{lore::Kingdom::My World}}`.

Books load in the background, so right after opening a chat the first use of a book can come back empty. It works from the next evaluation on.

## Cache Auditor

Workbench → Cache Audit (or `/me-audit`). Scans your preset prompts, character card, persona, lorebooks and recent chat for macros that change between generations, evaluates everything twice to catch surprises, and — when it can read the server's caching settings (admin only; there's a manual field otherwise) — tells you which findings actually cost money versus sit harmlessly below the cache breakpoints. Each finding comes with the fix: `{{freeze}}` it, `{{sticky}}` it, or swap in the coarse/deterministic variant.

## Custom macros

Open Extensions → Macro Enhanced → Your custom macros. A macro is a name plus a template, the text it expands to. Templates can use other macros. Arguments are optional: an argument named `who` is available in the template as `{{who}}` (or `{{arg1}}`, `{{arg2}}` by position), and callers pass values with `{{yourmacro::value1::value2}}`. Optional arguments can have defaults, and each one can carry a short description.

The editor shows the exact way to call the macro as you type it, and the description you give it (and each argument) is what shows up in the macro reference and in `/help macros`.

Macros are saved globally, for the current character, or for the current chat only. The most specific scope wins when names clash: chat beats character beats global. Character macros travel with the character card; chat macros live inside the chat file. Names are checked as you type; you can't use a name that belongs to another extension, one of this extension's built-ins, or the reserved `me-` prefix.

"Test in Workbench" saves the macro first (with the same checks as Save), then opens it in the Workbench.

From scripts: `/me-define name=greet args=who scope=chat Hello {{who}}!` and `/me-undefine greet`.

Macros that include themselves are stopped with a console warning instead of looping forever.

## Template gallery and macro packs

Extensions → Macro Enhanced → Template gallery. Four starter packs — RP state trackers (mood, relationship, outfit), dice & game mechanics, prompt-style guards, and time & scene helpers — install into whichever scope you pick and become ordinary custom macros you can open in the editor and tweak. Name collisions get a `-2` suffix instead of overwriting anything.

Custom macros can also be exported per scope as a small JSON pack file and imported on another machine (or shared). `/me-export scope=chat` prints the same JSON for scripting.

## Macro Workbench

Open it from the settings panel or with `/me-workbench`. Four tabs:

- **Playground** — type on the left, the evaluated result appears with a timing readout; the right side lists every chat and global variable plus the pending changes the text would have made (`hp: 50 → 35`, `frozen:key: (new) → …`).
- **Reference** — every macro, slash command and guide, searchable. "Insert" drops an example into the Playground.
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
| `/me-chatvar` | Reads, sets, lists (`prefix=`) or deletes (`delete=true`) the chat variables used by `{{setchatvar}}` |
| `/me-audit` | The Cache Auditor as a pipeable text report |
| `/me-define` / `/me-undefine` | Create / remove custom macros from scripts (`scope=global\|character\|chat`) |
| `/me-export scope=…` | A scope's custom macros as pack JSON. Pipeable. |
| `/me-macros` | Lists everything this extension registered |

## Conditions in `{{if}}`

SillyBunny's `{{if}}` does not compare anything — it only asks whether its condition
is non-empty. So `{{if::{{.hp}} > 0}}` hands it the text `0 > 0`, which is not empty,
and the block always runs.

Turn on **Work out comparisons in {{if}} conditions** in the settings drawer and those
conditions are evaluated properly, with `== != > >= < <= && || !` and brackets. It is
off by default, and conditions without a comparison are untouched either way, so
switching it on cannot change what existing prompts do.

It works as an engine pre-processor rather than by replacing `{{if}}`: the registry
records ownership from the call stack, so re-registering the host's macro — even to
hand back the host's own handler — would mark it as ours, and the extension-disable
sweep would then remove `{{if}}` from the app entirely. Turning the setting off simply
removes the pre-processor.

`{{expr}}` is always available if you would rather opt in one condition at a time:
`{{if::{{expr::{{.hp}} > 0}}}}`.

## Chat variables

`{{setchatvar}}` and friends store values that stay with the chat, and
`{{foreachChatVar::prefix::alias}}…{{/foreachChatVar}}` walks every name starting with
a prefix.

They are a **separate store** from the host's `{{setvar}}`, deliberately. Content that
loops over a prefix almost always also uses `{{setvar}}` for scratch values under that
same prefix, and one shared namespace would render those scratch values as loop items.
The trade-off is that the built-in `/getchatvar` command is an alias for the host's
variables and will not see these — use `/me-chatvar`.

## Importing content from other apps

`scripts/convert-import.js` converts world books and regex-script bundles exported by
other chat apps into the shapes SillyBunny actually imports:

```
node scripts/convert-import.js "My World.json" my-regexes.json --out ./converted
```

It is a script rather than a feature because neither problem it solves is reachable
from inside an extension. A world book whose `entries` is an array is not read as a
world book at all — the importer falls through to its CharacterBook branch, which
looks for `keys` rather than `key`, and the import reports success having silently
dropped every keyword. A regex bundle wrapped in `{"scripts": […]}` fails outright,
since the importer takes a bare array.

It also rewrites the few macro spellings the host's grammar cannot express: `{{@name}}`
(`@` is not one of its sigils), `{{!setvar name value}}` (space-separated arguments
arrive as one argument), and a lone space argument (the lexer discards whitespace
between separators, so `:: ::` becomes `::{{space}}::`). Everything else is left
byte-for-byte alone, and anything dropped is reported rather than silently lost.

## Good to know

- If a future SillyBunny update ships a macro with the same name as one of ours, this extension steps aside and renames its own to `{{me-name}}` (noted in the settings panel). Every macro also has a hidden `{{me-…}}` alias from day one, so prompts using those keep working after updates.
- The engine uses `::` to separate arguments, so a literal `::` can't appear inside one.
- A `|` inside an argument starts an output filter, so `||` cannot appear in one either. Compat mode works around this by expressing OR through `{{or::a::b}}`, whose arguments are separated by `::` instead.
- Reading a variable back through `{{getvar}}` or `{{.x}}` converts anything numeric-looking to a number (`public/scripts/variables.js`), so `00` comes back as `0`. Store text you need to keep verbatim in a chat variable, or format it where you use it rather than where you set it.
- Disabling or uninstalling removes every registered macro.

## Install

Install via the extension manager with this repo's URL, or clone it and symlink the folder into `data/<user>/extensions/` as `MacroEnhanced`.

## Development

No build step. Tests use Node's built-in runner:

```
npm test
```

The macro tables above are generated from the macro definitions themselves, so the descriptions in `src/*-macros.js` are the only copy. After changing one:

```
npm run docs
```

`npm test` fails if you forget — and it also refuses any macro that ships without a description, a worked example, a "returns" line, or a description for each of its arguments. That contract is what keeps the in-app reference complete.

## License

AGPL-3.0 (same as SillyBunny).
