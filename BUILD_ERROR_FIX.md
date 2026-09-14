# Build error repair

Fixed:
1. `src/components/Sing/ExportOverlay.vue`
   - Do not use a runtime `globalThis.__VOICEVOX_I18N__` expression in a TypeScript literal type.
   - `ExportingInfo.mediaName` is now `string`.
   - i18n lookup remains at runtime with a `??` fallback.

2. `src/components/Dialog/EngineManageDialog.vue`
   - Parenthesized the `??` expression used as the fallback operand of `||`.
   - This avoids the JavaScript/TypeScript restriction against mixing `||` and `??` without parentheses.

The resulting code contains no same-expression `|| ... ??` construct for the reported case.
