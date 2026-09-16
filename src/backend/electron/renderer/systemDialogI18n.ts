import type { Sandbox } from "@/type/preload";

// Only fields that Electron can actually render as dialog UI are translated.
// Paths, extensions, MIME types, and other machine-readable values pass through unchanged.
type SystemDialogMethod =
  | "showSaveDirectoryDialog"
  | "showOpenDirectoryDialog"
  | "showOpenFileDialog"
  | "showSaveFileDialog";

const SYSTEM_DIALOG_VISIBLE_TEXT_FIELDS: Record<
  SystemDialogMethod,
  readonly string[]
> = {
  showSaveDirectoryDialog: ["title"],
  showOpenDirectoryDialog: ["title"],
  showOpenFileDialog: ["title", "name"],
  showSaveFileDialog: ["title", "name"],
};

export type SystemDialogTextTranslator = (
  scope: string,
  source: string,
) => string;

export const translateSystemDialogArgs = (
  prop: keyof Sandbox,
  args: readonly unknown[],
  translator?: SystemDialogTextTranslator,
): readonly unknown[] => {
  const visibleTextFields =
    SYSTEM_DIALOG_VISIBLE_TEXT_FIELDS[prop as SystemDialogMethod];

  if (!visibleTextFields || args.length === 0 || !translator) return args;

  const options = args[0];
  if (typeof options !== "object" || options === null) return args;

  const translatedOptions = { ...(options as Record<string, unknown>) };

  for (const field of visibleTextFields) {
    const value = translatedOptions[field];
    if (typeof value !== "string") continue;

    translatedOptions[field] = translator(
      `electron.${String(prop)}.${field}`,
      value,
    );
  }

  return [translatedOptions, ...args.slice(1)];
};

export const translateSystemDialogArgumentsWithRuntime = (
  prop: keyof Sandbox,
  args: readonly unknown[],
): readonly unknown[] =>
  translateSystemDialogArgs(
    prop,
    args,
    globalThis.__VOICEVOX_I18N__?.text,
  );
