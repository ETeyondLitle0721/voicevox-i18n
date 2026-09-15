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
