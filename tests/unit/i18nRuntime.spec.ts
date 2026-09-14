import { beforeEach, describe, expect, it } from "vitest";
import { createRuntime, type LocaleCatalogs } from "../../tools/i18n/runtime";

const catalogs: LocaleCatalogs = {
  ja: {},
  "en-US": { "src/test.vue": { "設定": "Settings" } },
  "zh-Hans-CN": { "src/test.vue": { "設定": "设置" } },
} as const;

describe("VOICEVOX i18n locale resolution", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.__VOICEVOX_PREFERRED_SYSTEM_LANGUAGES__ = ["en-US"];
    Object.defineProperty(navigator, "language", {
      configurable: true,
      value: "ja-JP",
    });
  });

  it("persists the detected locale on first launch", () => {
    const runtime = createRuntime(catalogs);

    expect(runtime.locale).toBe("en-US");
    expect(localStorage.getItem("voicevox.locale")).toBe("en-US");
  });

  it("uses the persisted locale before system language", () => {
    localStorage.setItem("voicevox.locale", "zh-Hans-CN");
    globalThis.__VOICEVOX_PREFERRED_SYSTEM_LANGUAGES__ = ["ja-JP"];

    const runtime = createRuntime(catalogs);

    expect(runtime.locale).toBe("zh-Hans-CN");
    expect(runtime.text("src/test.vue", "設定")).toBe("设置");
  });

  it("uses preferred system languages instead of browser language preferences", () => {
    globalThis.__VOICEVOX_PREFERRED_SYSTEM_LANGUAGES__ = ["zh-Hans-CN"];
    Object.defineProperty(navigator, "language", {
      configurable: true,
      value: "ja-JP",
    });

    const runtime = createRuntime(catalogs);

    expect(runtime.locale).toBe("zh-Hans-CN");
  });

  it("replaces invalid persisted locale with the detected locale", () => {
    localStorage.setItem("voicevox.locale", "fr");

    const runtime = createRuntime(catalogs);

    expect(runtime.locale).toBe("en-US");
    expect(localStorage.getItem("voicevox.locale")).toBe("en-US");
  });
});
