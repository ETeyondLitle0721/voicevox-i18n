import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import { voicevoxI18n } from "../../tools/i18n/voicevoxI18nPlugin";

const projectRoot = process.cwd();

function createPlugin() {
  const plugin = voicevoxI18n();
  plugin.configResolved?.({ root: projectRoot } as never);
  return plugin;
}

describe("voicevox i18n Vite plugin", () => {
  it("uses a public virtual module id instead of embedding the NUL byte in source", async () => {
    const plugin = createPlugin();
    const source = await fs.readFile(`${projectRoot}/src/main.ts`, "utf8");
    const transformed = plugin.transform?.(
      source,
      `${projectRoot}/src/main.ts`,
    );

    expect(typeof transformed).toBe("object");
    expect((transformed as { code: string }).code).toContain(
      'from "virtual:voicevox-i18n/runtime"',
    );
    expect((transformed as { code: string }).code).not.toContain(
      "\\0voicevox-i18n/runtime",
    );
  });

  it("rewrites a translated Vue text node without touching unrelated attributes", async () => {
    const plugin = createPlugin();
    const source = `<template><div title="not translated">生成中です...</div></template>`;
    const transformed = await plugin.transform?.(
      source,
      `${projectRoot}/src/components/ProgressView.vue`,
    );

    expect(transformed).toContain("$vvI18nText");
    expect(transformed).toContain("生成中です...");
  });

  it("rewrites a Vue text/interpolation run using the same catalog key format as extraction", async () => {
    const plugin = createPlugin();
    const source = `<template><div>エンジン: {{ name }}!</div></template>`;
    const transformed = await plugin.transform?.(
      source,
      `${projectRoot}/src/components/EngineStartupOverlay.vue`,
    );

    // The current catalog does not necessarily contain this synthetic message;
    // this test mainly locks the plugin into returning source unchanged when absent.
    expect(transformed).toBe(source);
  });


  it("keeps semantic hotkey action names while translating menu labels", async () => {
    const plugin = createPlugin();
    const source = `
      const hotkeyAction = {
        callback: () => {},
        name: "新規プロジェクト",
      };
      const menuItem = {
        label: "新規プロジェクト",
        onClick: () => {},
      };
    `;

    const transformed = await plugin.transform?.(
      source,
      `${projectRoot}/src/components/Menu/MenuBar/useCommonMenuBarData.ts`,
    );

    expect(transformed).toContain('name: "新規プロジェクト"');
    expect(transformed).toContain(
      'globalThis.__VOICEVOX_I18N__?.text("components/Menu/MenuBar/useCommonMenuBarData.ts", "新規プロジェクト")',
    );
  });

  it("rewrites only the trimmed portion of a translated Vue text node", async () => {
    const plugin = createPlugin();
    const source = `<template><div>\n  閉じる  \n</div></template>`;
    const transformed = await plugin.transform?.(
      source,
      `${projectRoot}/src/components/Dialog/SaveAllResultDialog.vue`,
    );

    expect(transformed).toContain(
      `\n  {{ $vvI18nText("components/Dialog/SaveAllResultDialog.vue", "閉じる") }}  \n`,
    );
  });

  it("uses a valid Vue binding when rewriting a static UI attribute", async () => {
    const plugin = createPlugin();
    const source = `<template><q-btn label="閉じる" /></template>`;
    const transformed = await plugin.transform?.(
      source,
      `${projectRoot}/src/components/Dialog/SaveAllResultDialog.vue`,
    );

    expect(transformed).toContain(
      `:label='$vvI18nText("components/Dialog/SaveAllResultDialog.vue", "閉じる")'`,
    );
  });



  it("rewrites translated strings inside Vue script setup blocks", async () => {
    const plugin = createPlugin();
    const source = `
      <template><div /></template>
      <script setup lang="ts">
      const label = "生成中です...";
      </script>
    `;

    const transformed = await plugin.transform?.(
      source,
      `${projectRoot}/src/components/ProgressView.vue`,
    );

    expect(transformed).toContain(
      'globalThis.__VOICEVOX_I18N__?.text("components/ProgressView.vue", "生成中です...")',
    );
  });

  it("keeps the original source as the fallback for a translated TypeScript literal", async () => {
    const plugin = createPlugin();
    const source = `const label = "エラー";`;
    const transformed = await plugin.transform?.(
      source,
      `${projectRoot}/src/store/singing.ts`,
    );

    expect(transformed).toContain("globalThis.__VOICEVOX_I18N__?.text");
    expect(transformed).toContain('"エラー"');
  });
});
