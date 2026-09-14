# VOICEVOX build-time localization MVP

This directory implements the first localization stage without requiring application
source changes:

- Vue SFC text nodes and selected UI attributes are transformed during the Vite build.
- Selected UI-facing TypeScript string literals/template strings are transformed during the Vite build.
- Translation lookup is scoped by the source file path.
- Lookup keys are normalized with `trim()` + internal whitespace collapsing.
- Missing translations always fall back to the original Japanese source.
- Runtime locale is selected from the persisted `localStorage` key `voicevox.locale` when valid.
  On first launch, Electron's `app.getPreferredSystemLanguages()` result is detected, normalized, and persisted so later launches keep the
  initial locale; `zh-Hans` maps to `zh-CN`, `zh-Hant-HK`/`zh-HK` to `zh-HK`, `zh-Hant` to `zh-TW`, `en-*` to `en-US`, `ko-*` to `ko-KR`, and unsupported languages fall back to `ja`.
- English, Simplified Chinese, Traditional Chinese (Taiwan), Traditional Chinese (Hong Kong), and Korean catalogs are provided for the first Tier 1 surface.

The source tree is not modified by the compiler; generated transforms exist only in Vite's module graph.


## Auditing coverage

`pnpm i18n:audit:components` audits every Japanese UI string extracted from
`src/components/**/*.vue` against all supported non-Japanese locales.

The extractor now includes both Vue templates and `<script>` / `<script setup>`
blocks, so user-visible strings implemented in component logic are covered too.
Use `pnpm i18n:audit` to audit the whole `src` tree. Add `--strict` to make the
command exit non-zero when any translation key is missing.
