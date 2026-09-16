# Runtime i18n implementation

## Scope
The localization system translates rendered UI at runtime for Japanese (`ja-JP`), English (`en-US`), Simplified Chinese (`zh-CN`), and Traditional Chinese (`zh-TW`).

## Design
- Vite does not parse or rewrite Vue/TypeScript source for localization.
- `tools/i18n/locales/translates/group_*.xml` are discovered and parsed during Vite configuration, then merged into compact regex rules.
- The virtual runtime module embeds those rules into the renderer bundle.
- After the Vue app mounts, `tools/i18n/runtime.ts` uses `requestAnimationFrame` as the scheduling mechanism.
- A `MutationObserver` marks the DOM dirty; translation work is then performed in the next animation frame.
- The runtime scans rendered text nodes and user-facing attributes (`title`, `aria-label`, `placeholder`, `alt`, `label`, `description`).
- `equals` rules preserve leading/trailing whitespace; `contains` rules replace matching substrings.
- `<param>` entries become regex capture groups. `{0}`, `{1}`, ... always substitute the original capture; when a `<param>` has `translate="allow"`, `[0]`, `[1]`, ... substitute the capture after a second pass through the active locale rules, falling back to the original capture when that second pass has no translation. Named placeholders such as `{name}` / `[name]` are also supported by matching the `<param name="name">` entry.
- Editable content (`textarea`, `contenteditable`) and code-oriented elements are excluded to avoid translating user data or source text.
- Missing translations leave the original text unchanged.
- Runtime locale selection remains based on `localStorage.voicevox.locale`, then Electron preferred system languages, with the existing locale mappings.

## Build integration
`vite.config.ts` registers `voicevoxI18n()` before Vue. The plugin only injects the runtime into
`src/main.ts` and `src/welcome/main.ts`; application source files are otherwise untouched by i18n.

## Why runtime regex
This approach follows DOM reality rather than compiler structure: dynamically generated strings,
Quasar-rendered labels, menus, dialogs, and later-rendered content can all be translated after they
exist in the page. It also removes the dependency on AST/source-range rewriting from the localization path.
