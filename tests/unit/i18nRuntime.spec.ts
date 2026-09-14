import { beforeEach, describe, expect, it } from "vitest";
import { createRuntime, type LocaleCatalogs } from "../../tools/i18n/runtime";

const catalogs: LocaleCatalogs = {
  "ja-JP": {},
  "en-US": { "test.vue": { "設定": "Settings" } },
  "zh-CN": { "test.vue": { "設定": "设置" } },
  "zh-TW": { "test.vue": { "設定": "設定" } },
  "zh-HK": { "test.vue": { "設定": "設定" } },
  "ko-KR": { "test.vue": { "設定": "설정" } },
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
    localStorage.setItem("voicevox.locale", "zh-CN");
    globalThis.__VOICEVOX_PREFERRED_SYSTEM_LANGUAGES__ = ["ja-JP"];

    const runtime = createRuntime(catalogs);

    expect(runtime.locale).toBe("zh-CN");
    expect(runtime.text("src/test.vue", "設定")).toBe("设置");
  });

  it("uses preferred system languages instead of browser language preferences", () => {
    globalThis.__VOICEVOX_PREFERRED_SYSTEM_LANGUAGES__ = ["zh-CN"];
    Object.defineProperty(navigator, "language", {
      configurable: true,
      value: "ja-JP",
    });

    const runtime = createRuntime(catalogs);

    expect(runtime.locale).toBe("zh-CN");
  });

  it("detects Korean system locales", () => {
    globalThis.__VOICEVOX_PREFERRED_SYSTEM_LANGUAGES__ = ["ko-KR"];

    const runtime = createRuntime(catalogs);

    expect(runtime.locale).toBe("ko-KR");
    expect(runtime.text("src/test.vue", "設定")).toBe("설정");
  });

  it("detects Hong Kong Traditional Chinese system locales", () => {
    globalThis.__VOICEVOX_PREFERRED_SYSTEM_LANGUAGES__ = ["zh-HK"];

    const runtime = createRuntime(catalogs);

    expect(runtime.locale).toBe("zh-HK");
  });

  it("falls back to Japanese for unsupported system locales", () => {
    globalThis.__VOICEVOX_PREFERRED_SYSTEM_LANGUAGES__ = ["fr-FR"];

    const runtime = createRuntime(catalogs);

    expect(runtime.locale).toBe("ja-JP");
    expect(localStorage.getItem("voicevox.locale")).toBe("ja-JP");
  });

  it("replaces invalid persisted locale with the detected locale", () => {
    localStorage.setItem("voicevox.locale", "fr");

    const runtime = createRuntime(catalogs);

    expect(runtime.locale).toBe("en-US");
    expect(localStorage.getItem("voicevox.locale")).toBe("en-US");
  });
});
