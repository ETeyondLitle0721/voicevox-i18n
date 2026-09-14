# Tier 1 i18n MVP implementation

## Scope
This snapshot adds build-time localization for Tier 1 UI surfaces: menus, buttons, dialogs,
error/startup messages, settings, project management, import/export and shortcut-related UI.

Locales: English (`en-US`) and Simplified Chinese (`zh-CN`).

## Design
- Original Vue/TS source files remain unchanged on disk by the transform.
- `tools/i18n/voicevoxI18nPlugin.ts` runs as a Vite `pre` plugin.
- Vue SFC template text and selected static UI attributes are localized through AST/source ranges.
- Selected TypeScript UI modules are localized through the TypeScript AST.
- Message identity is scoped by source file path plus a normalized source template.
- Lookup normalization trims leading/trailing whitespace and collapses internal whitespace.
- Leading/trailing whitespace is restored after translation.
- Template placeholders use `0`, `1`, ... and may be reordered by the target language.
- Missing entries always fall back to the original Japanese source.
- Runtime locale is selected from the persisted `localStorage` key `voicevox.locale` when valid.
  On first launch, Electron's `app.getPreferredSystemLanguages()` result is detected and persisted so later launches keep the initial locale.
  `zh-*` maps to `zh-CN`; `en-*` maps to `en-US`; other locales fall back to English.
- Locale catalogs are split by source module under `tools/i18n/locales/<locale>/`.

## Build integration
`vite.config.ts` registers the plugin before `@vitejs/plugin-vue`.
The plugin injects a virtual runtime and installs it into the two Vue app entry points at build time;
the source entry files themselves are not edited.

## Current limitation
The uploaded environment did not contain `node_modules` and network access was unavailable, so the
full VOICEVOX build could not be executed here. The TypeScript sources were syntax-transpiled and the
runtime lookup/reordering behavior was exercised independently.
