import { beforeEach, describe, expect, it } from "vitest";
import { createRuntime } from "../../tools/i18n/runtime";
import type { TranslationRules } from "../../tools/i18n/voicevoxI18nPlugin";

const rules: TranslationRules = {
  "en-US": [
    {
      type: "equals",
      pattern: "^(?<lead>\\s*)設定(?<trail>\\s*)$",
      flags: "u",
      parameters: [],
      translation: "Settings",
    },
    {
      type: "contains",
      pattern: "ファイルが見つかりません：(?<p0>[\\s\\S]*)",
      flags: "gu",
      parameters: ["0"],
      translation: "File not found: {0}",
    },
    {
      type: "contains",
      pattern: "エンジン：(?<p0>[\\s\\S]*?)!",
      flags: "gu",
      parameters: ["0"],
      translation: "Engine: {0}!",
    },
  ],
  "zh-CN": [],
  "zh-TW": [],
  "zh-HK": [],
  "ko-KR": [],
};

describe("VOICEVOX runtime i18n", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.__VOICEVOX_PREFERRED_SYSTEM_LANGUAGES__ = ["en-US"];
    document.body.innerHTML = "";
  });

  it("translates rendered text nodes without AST/source rewriting", () => {
    const runtime = createRuntime(rules);
    runtime.scan();

    document.body.innerHTML = `
      <button><span> 設定 </span></button>
      <p>エンジン：VOICEVOX!</p>
    `;

    runtime.scan();

    expect(document.body.textContent).toContain(" Settings ");
    expect(document.body.textContent).toContain("Engine: VOICEVOX!");
  });

  it("translates user-facing DOM attributes", () => {
    const runtime = createRuntime(rules);
    const button = document.createElement("button");
    button.setAttribute("title", "設定");
    button.setAttribute("aria-label", "設定");
    button.setAttribute("id", "設定");
    const input = document.createElement("input");
    input.setAttribute("placeholder", "設定");
    document.body.append(button, input);

    runtime.scan();

    expect(button.getAttribute("title")).toBe("Settings");
    expect(button.getAttribute("aria-label")).toBe("Settings");
    expect(button.getAttribute("id")).toBe("設定");
    expect(input.getAttribute("placeholder")).toBe("Settings");
  });

  it("does not translate editable or code content", () => {
    const runtime = createRuntime(rules);
    document.body.innerHTML = `
      <textarea>設定</textarea>
      <div contenteditable="true">設定</div>
      <code>設定</code>
      <pre>設定</pre>
    `;

    runtime.scan();

    expect(document.body.querySelector("textarea")?.textContent).toBe("設定");
    expect(document.body.querySelector("[contenteditable='true']")?.textContent).toBe("設定");
    expect(document.body.querySelector("code")?.textContent).toBe("設定");
    expect(document.body.querySelector("pre")?.textContent).toBe("設定");
  });

  it("keeps the original locale behavior", () => {
    localStorage.setItem("voicevox.locale", "zh-CN");
    const runtime = createRuntime(rules);
    expect(runtime.locale).toBe("zh-CN");
    expect(runtime.text("ignored", "設定")).toBe("設定");

    localStorage.setItem("voicevox.locale", "en-US");
    const englishRuntime = createRuntime(rules);
    expect(englishRuntime.locale).toBe("en-US");
    expect(englishRuntime.text("ignored", "設定")).toBe("Settings");
  });
});
