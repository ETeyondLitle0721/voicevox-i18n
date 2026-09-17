# VOICEVOX runtime localization

The i18n runtime localizes the already-rendered interface instead of rewriting application source.

- `locales/translates/group_*.xml` remain the source of translation rules; all matching group files are loaded and merged.
- The Vite plugin only packages those rules and injects the runtime into the two application entry points.
- `runtime.ts` schedules work with `requestAnimationFrame` and uses regular expressions to match/replace translated text.
- `MutationObserver` triggers another frame when Vue or another UI layer changes the DOM.
- User-editable content and code-oriented nodes are ignored.

The locale still comes from `voicevox.locale`, with Electron preferred-system-language detection on first launch.

The extraction/audit tools remain separate build tooling for finding translation coverage; they do not participate
in runtime translation.


An `<item>` may contain multiple `<match>` elements. They are treated as OR conditions: each `<match>` is compiled into its own runtime rule, and all of those rules reuse the same `<translate>` values. This is useful when different source spellings should produce the same localized string.

```xml
<item id="#0793">
    <match type="equals">
        <text content="囁き" />
    </match>

    <match type="equals">
        <text content="ささやき" />
    </match>

    <translate>
        <en-US content="Whisper" />
        <zh-CN content="耳语" />
        <zh-TW content="耳語" />
        <ko-KR content="속삭임" />
    </translate>
</item>
```

`<param translate="allow">` enables second-pass translation of that capture. Use `{0}` for the original captured text and `[0]` for the translated capture; `[0]` falls back to the original when no second-pass rule matches.
