import { beforeEach, describe, expect, it } from "vitest";
import { createRuntime, type LocaleCatalogs } from "../../tools/i18n/runtime";

const catalogs: LocaleCatalogs = {
  ja: {},
  en: { "src/test.vue": { "設定": "Settings" } },
  "zh-CN": { "src/test.vue": { "設定": "设置" } },
} as const;

describe("VOICEVOX i18n locale resolution", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      value: ["en-US"],
    });
    Object.defineProperty(navigator, "language", {
      configurable: true,
      value: "en-US",
    });
  });

  it("persists the detected locale on first launch", () => {
    const runtime = createRuntime(catalogs);

    expect(runtime.locale).toBe("en");
    expect(localStorage.getItem("voicevox.locale")).toBe("en");
  });

  it("uses the persisted locale before browser language", () => {
    localStorage.setItem("voicevox.locale", "zh-CN");

    Object.defineProperty(navigator, "languages", {
      configurable: true,
      value: ["ja-JP"],
    });
    Object.defineProperty(navigator, "language", {
      configurable: true,
      value: "ja-JP",
    });

    const runtime = createRuntime(catalogs);

    expect(runtime.locale).toBe("zh-CN");
    expect(runtime.text("src/test.vue", "設定")).toBe("设置");
  });

  it("replaces invalid persisted locale with the detected locale", () => {
    localStorage.setItem("voicevox.locale", "fr");

    const runtime = createRuntime(catalogs);

    expect(runtime.locale).toBe("en");
    expect(localStorage.getItem("voicevox.locale")).toBe("en");
  });
});
