import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import { voicevoxI18n } from "../../tools/i18n/voicevoxI18nPlugin";

const projectRoot = process.cwd();

type Hook<T extends (...args: never[]) => unknown> =
  | T
  | { handler: T };

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: Hook<T> | undefined,
): ((...args: Parameters<T>) => ReturnType<T>) | undefined {
  const handler = typeof hook === "function" ? hook : hook?.handler;
  return handler as
    | ((...args: Parameters<T>) => ReturnType<T>)
    | undefined;
}

function createPlugin() {
  const plugin = voicevoxI18n();
  getHookHandler(plugin.configResolved)?.({ root: projectRoot } as never);
  return plugin;
}

describe("voicevox i18n Vite plugin", () => {
  it("injects the runtime without rewriting Vue templates", async () => {
    const plugin = createPlugin();
    const source = `<template><div title="not translated">生成中です...</div></template>`;
    const transformed = await getHookHandler(plugin.transform)?.(
      source,
      `${projectRoot}/src/components/ProgressView.vue`,
    );

    expect(transformed).toBeUndefined();
  });

  it("does not rewrite TypeScript strings", async () => {
    const plugin = createPlugin();
    const source = `const label = "新規プロジェクト";`;
    const transformed = await getHookHandler(plugin.transform)?.(
      source,
      `${projectRoot}/src/components/Menu/MenuBar/useCommonMenuBarData.ts`,
    );

    expect(transformed).toBeUndefined();
  });

  it("still injects the runtime into the main renderer entry", async () => {
    const plugin = createPlugin();
    const source = await fs.readFile(`${projectRoot}/src/main.ts`, "utf8");
    const transformed = await getHookHandler(plugin.transform)?.(
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
});
