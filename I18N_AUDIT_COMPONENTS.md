# VOICEVOX components i18n audit

## Coverage baseline

- `src/components/**/*.vue`: **128** files
- Existing locale scope files under `tools/i18n/locales/<locale>`: **30** component scopes per locale
- Missing component locale scopes: **98**
- Existing non-Japanese locales: `en-US`, `zh-CN`, `zh-TW`, `zh-HK`, `ko-KR` (352 entries each at audit time).

> The new `i18n:audit:components` command performs the authoritative AST-based key audit, including Vue templates and `<script>` / `<script setup>` blocks. The list below is the structural scope gap found before that command is run with the project's normal dependencies.

## Missing component locale scopes

- `components/App.vue`
- `components/Base/BaseButton.vue`
- `components/Base/BaseCheckbox.vue`
- `components/Base/BaseContextMenu.vue`
- `components/Base/BaseContextMenuItem.vue`
- `components/Base/BaseContextMenuSeparator.vue`
- `components/Base/BaseDialog.vue`
- `components/Base/BaseDocumentView.vue`
- `components/Base/BaseIconButton.vue`
- `components/Base/BaseListItem.vue`
- `components/Base/BaseNavigationView.vue`
- `components/Base/BaseRowCard.vue`
- `components/Base/BaseScrollArea.vue`
- `components/Base/BaseSelect.vue`
- `components/Base/BaseSelectItem.vue`
- `components/Base/BaseSlider.vue`
- `components/Base/BaseSwitch.vue`
- `components/Base/BaseTextField.vue`
- `components/Base/BaseToggleGroup.vue`
- `components/Base/BaseToggleGroupItem.vue`
- `components/Base/BaseTooltip.vue`
- `components/CharacterButton.vue`
- `components/Dialog/AcceptDialog/AcceptDialog.vue`
- `components/Dialog/AllDialog.vue`
- `components/Dialog/ExportSongAudioDialog/BaseCell.vue`
- `components/Dialog/ExportSongAudioDialog/Container.vue`
- `components/Dialog/HelpDialog/HelpMarkdownViewSection.vue`
- `components/Dialog/OldDefaultStyleSelectDialog.vue`
- `components/Dialog/SettingDialog/ButtonToggleCell.vue`
- `components/Dialog/SettingDialog/SelectCell.vue`
- `components/Dialog/SettingDialog/ToggleCell.vue`
- `components/Dialog/TextDialog/MessageDialog.vue`
- `components/Dialog/TextDialog/QuestionDialog.vue`
- `components/Dialog/UpdateNotificationDialog/Container.vue`
- `components/ErrorBoundary.vue`
- `components/Menu/ContextMenu/Container.vue`
- `components/Menu/ContextMenu/Presentation.vue`
- `components/Menu/MenuBar/MenuBar.vue`
- `components/Menu/MenuBar/TitleBarEditorSwitcher.vue`
- `components/Menu/MenuButton.vue`
- `components/Menu/MenuItem.vue`
- `components/Sing/ChangeValueDialog/CommonDialog.vue`
- `components/Sing/ChangeValueDialog/TempoChangeDialog.vue`
- `components/Sing/ChangeValueDialog/TimeSignatureChangeDialog.vue`
- `components/Sing/CharacterMenuButton/CharacterSelectMenu.vue`
- `components/Sing/CharacterPortrait.vue`
- `components/Sing/ExportOverlay.vue`
- `components/Sing/ParameterPanelEditTargetSwitcher.vue`
- `components/Sing/PlayheadPositionDisplay.vue`
- `components/Sing/ScoreSequencer.vue`
- `components/Sing/SequencerGrid/Container.vue`
- `components/Sing/SequencerGrid/Presentation.vue`
- `components/Sing/SequencerGridSpacer.vue`
- `components/Sing/SequencerKeys.vue`
- `components/Sing/SequencerLyricInput.vue`
- `components/Sing/SequencerNote.vue`
- `components/Sing/SequencerNoteTimings.vue`
- `components/Sing/SequencerParameterGrid.vue`
- `components/Sing/SequencerParameterPanel.vue`
- `components/Sing/SequencerPhonemeTimingEditor.vue`
- `components/Sing/SequencerPhonemeTimingToolPalette.vue`
- `components/Sing/SequencerPhonemeTimings.vue`
- `components/Sing/SequencerPhraseIndicator.vue`
- `components/Sing/SequencerPitch.vue`
- `components/Sing/SequencerRuler/Container.vue`
- `components/Sing/SequencerRuler/GridLane/Container.vue`
- `components/Sing/SequencerRuler/GridLane/Presentation.vue`
- `components/Sing/SequencerRuler/LoopLane/Container.vue`
- `components/Sing/SequencerRuler/LoopLane/Presentation.vue`
- `components/Sing/SequencerRuler/Presentation.vue`
- `components/Sing/SequencerRuler/ValueChangesLane/Container.vue`
- `components/Sing/SequencerRuler/ValueChangesLane/Presentation.vue`
- `components/Sing/SequencerShadowNote.vue`
- `components/Sing/SequencerToolPalette.vue`
- `components/Sing/SequencerVolumeEditor/Container.vue`
- `components/Sing/SequencerVolumeEditor/Presentation.vue`
- `components/Sing/SequencerVolumeEditor/Tooltip.vue`
- `components/Sing/SequencerVolumeToolPalette.vue`
- `components/Sing/SequencerWaveform.vue`
- `components/Sing/SideBar/SideBar.vue`
- `components/Sing/SideBar/TrackItem.vue`
- `components/Sing/SingEditor.vue`
- `components/Sing/SingerIcon.vue`
- `components/Sing/SingingSettings/Popover.vue`
- `components/Sing/ToolBar/EditTargetSwitcher.vue`
- `components/Sing/ToolBar/ToolBar.vue`
- `components/Sing/TrackCard/SingerRow.vue`
- `components/Talk/AccentPhrase.vue`
- `components/Talk/AudioAccent.vue`
- `components/Talk/AudioCell.vue`
- `components/Talk/AudioDetail.vue`
- `components/Talk/AudioInfo.vue`
- `components/Talk/AudioParameter.vue`
- `components/Talk/CharacterPortrait.vue`
- `components/Talk/TalkEditor.vue`
- `components/Talk/ToolBar.vue`
- `components/Talk/v2/ParameterSlider.vue`
- `components/ToolTip.vue`

## Changes in this patch

1. Vue SFC extraction now covers template + `<script>` + `<script setup>` with the same source scope.
2. Vite localization rewriting now applies to translated TypeScript literals inside Vue SFC scripts as well as template text/attributes.
3. Added `tools/i18n/audit.ts` and package scripts `i18n:audit` / `i18n:audit:components` to detect missing and stale keys per locale.
4. Added a unit test covering script-setup localization.
