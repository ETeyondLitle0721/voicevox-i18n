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
  it("injects the runtime without rewriting Vue templates", async () => {
    const plugin = createPlugin();
    const source = `<template><div title="not translated">生成中です...</div></template>`;
    const transformed = await plugin.transform?.(
      source,
      `${projectRoot}/src/components/ProgressView.vue`,
    );

    expect(transformed).toBeUndefined();
  });

  it("does not rewrite TypeScript strings", async () => {
    const plugin = createPlugin();
    const source = `const label = "新規プロジェクト";`;
    const transformed = await plugin.transform?.(
      source,
      `${projectRoot}/src/components/Menu/MenuBar/useCommonMenuBarData.ts`,
    );

    expect(transformed).toBeUndefined();
  });

  it("still injects the runtime into the main renderer entry", async () => {
    const plugin = createPlugin();
    const source = await fs.readFile(`${projectRoot}/src/main.ts`, "utf8");
    const transformed = await plugin.transform?.(
      source,
      `${projectRoot}/src/main.ts`,
    );

    expect(typeof transformed).toBe("object");
    expect((transformed as { code: string }).code).toContain(
      'from "virtual:voicevox-i18n/runtime"',
    );
    expect((transformed as { code: string }).code).toContain(
      "createApp(App).use(installVoicevoxI18n)",
    );
  });

  it("embeds runtime regex rules parsed from locales.xml", () => {
    const plugin = createPlugin();
    const virtualId = plugin.resolveId?.("virtual:voicevox-i18n/runtime");
    expect(virtualId).toBe("\0virtual:voicevox-i18n/runtime");

    const loaded = plugin.load?.(virtualId as string);
    expect(typeof loaded).toBe("string");
    expect(loaded).toContain("const rules =");
    expect(loaded).toContain("マイグレーション処理が必要です。");
    expect(loaded).not.toContain("@vue/compiler-dom");
    expect(loaded).not.toContain("typescript");
  });
});
