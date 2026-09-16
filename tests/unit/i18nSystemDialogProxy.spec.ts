import { describe, expect, it } from "vitest";
import { translateSystemDialogArgs } from "../../src/backend/electron/renderer/systemDialogI18n";

describe("Electron system dialog i18n proxy", () => {
  it("translates only user-visible dialog text", () => {
    const translated = translateSystemDialogArgs(
      "showOpenFileDialog",
      [
        {
          title: "ファイルを開く",
          name: "音声ファイル",
          extensions: ["wav", "mp3"],
          defaultPath: "/tmp/ファイル.wav",
        },
      ],
      (_scope, source) => `translated:${source}`,
    );

    expect(translated).toEqual([
      {
        title: "translated:ファイルを開く",
        name: "translated:音声ファイル",
        extensions: ["wav", "mp3"],
        defaultPath: "/tmp/ファイル.wav",
      },
    ]);
  });

  it("does not touch non-visible arguments or methods", () => {
    const options = {
      title: "保存",
      name: "音声ファイル",
      defaultPath: "/tmp/保存.wav",
      extensions: ["wav"],
    };

    expect(
      translateSystemDialogArgs(
        "showSaveFileDialog",
        [options],
        (_scope, source) => `translated:${source}`,
      ),
    ).toEqual([
      {
        ...options,
        title: "translated:保存",
        name: "translated:音声ファイル",
      },
    ]);

    expect(
      translateSystemDialogArgs(
        "someOtherMethod" as never,
        [options],
        (_scope, source) => `translated:${source}`,
      ),
    ).toEqual([options]);
  });

  it("keeps methods with title-only UI scoped to title", () => {
    const translated = translateSystemDialogArgs(
      "showOpenDirectoryDialog",
      [
        {
          title: "フォルダを選択",
          name: "これは翻訳しない",
        },
      ],
      (_scope, source) => `translated:${source}`,
    );

    expect(translated).toEqual([
      {
        title: "translated:フォルダを選択",
        name: "これは翻訳しない",
      },
    ]);
  });
});
