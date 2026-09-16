import type { App } from "vue";
import type {
  Locale,
  TranslationRule,
  TranslationRules,
} from "./voicevoxI18nPlugin";

const SUPPORTED_LOCALES: readonly Locale[] = [
  "ja-JP",
  "en-US",
  "zh-CN",
  "zh-TW",
  "zh-HK",
  "ko-KR",
  "vi-VN",
  "th-TH",
];

const SOURCE_ATTRIBUTE_NAMES = new Set([
  "title",
  "aria-label",
  "placeholder",
  "alt",
  "label",
  "description",
]);

const IGNORED_ATTRIBUTE_TAG_NAMES = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "PRE",
  "CODE",
]);

const IGNORED_TAG_NAMES = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "PRE",
  "CODE",
  "TEXTAREA",
  "OPTION",
]);

const LOCALE_STORAGE_KEY = "voicevox.locale";

const interpolate = (
  template: string,
  groups: Record<string, string | undefined>,
  fallbackParameters: readonly string[],
): string =>
  template.replace(/\{([^{}]+)\}/gu, (match, name: string) => {
    const byName = groups[name];
    if (byName != undefined) return byName;

    const numericIndex = Number(name);
    if (Number.isInteger(numericIndex)) {
      const parameterName = fallbackParameters[numericIndex];
      const byIndex = parameterName ? groups[parameterName] : undefined;
      if (byIndex != undefined) return byIndex;
    }

    return match;
  });

const getPreferredSystemLanguages = (): readonly string[] => {
  if (globalThis.__VOICEVOX_PREFERRED_SYSTEM_LANGUAGES__?.length) {
    return globalThis.__VOICEVOX_PREFERRED_SYSTEM_LANGUAGES__;
  }

  if (typeof navigator !== "undefined") {
    return navigator.languages?.length
      ? navigator.languages
      : navigator.language
        ? [navigator.language]
        : [];
  }

  return [];
};

const detectLocale = (languages: readonly string[]): Locale => {
  for (const raw of languages) {
    const language = raw.toLowerCase().replaceAll("_", "-");

    if (language === "ja" || language.startsWith("ja-")) return "ja-JP";
    if (language === "en" || language.startsWith("en-")) return "en-US";
    if (language === "zh-hans" || language.startsWith("zh-hans-")) {
      return "zh-CN";
    }
    if (
      language === "zh-hant-hk" ||
      language.startsWith("zh-hant-hk-") ||
      language === "zh-hk" ||
      language.startsWith("zh-hk-")
    ) {
      return "zh-HK";
    }
    if (language === "zh-hant" || language.startsWith("zh-hant-")) {
      return "zh-TW";
    }
    if (language === "ko" || language.startsWith("ko-")) return "ko-KR";
  }

  return "ja-JP";
};

const resolveLocale = (): Locale => {
  if (typeof localStorage !== "undefined") {
    try {
      let storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);

      if (storedLocale === "auto") storedLocale = null;

      if (storedLocale && SUPPORTED_LOCALES.includes(storedLocale as Locale)) {
        return storedLocale as Locale;
      }
    } catch {
      // Restricted environments may deny storage access.
    }
  }

  const detectedLocale = detectLocale(getPreferredSystemLanguages());

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, detectedLocale);
    } catch {
      // Ignore storage failures.
    }
  }

  return detectedLocale;
};

const hasIgnoredTextAncestor = (element: Element | null): boolean => {
  let current = element;
  while (current) {
    if (IGNORED_TAG_NAMES.has(current.tagName)) return true;
    if (current.getAttribute("contenteditable") === "true") return true;
    if (current.getAttribute("data-vv-i18n-ignore") === "true") return true;
    current = current.parentElement;
  }
  return false;
};

const hasIgnoredAttributeOwner = (element: Element): boolean => {
  let current: Element | null = element;
  while (current) {
    if (IGNORED_ATTRIBUTE_TAG_NAMES.has(current.tagName)) {
      return true;
    }
    if (current.getAttribute("data-vv-i18n-ignore") === "true") return true;
    current = current.parentElement;
  }
  return false;
};

const getRuleGroups = (
  match: RegExpExecArray,
  rule: TranslationRule,
): Record<string, string | undefined> => {
  const groups: Record<string, string | undefined> = {
    ...(match.groups ?? {}),
  };
  for (let index = 0; index < rule.parameters.length; index += 1) {
    const parameterName = rule.parameters[index];
    groups[parameterName] = groups[`p${index}`];
  }
  return groups;
};

type CompiledTranslationRule = TranslationRule & {
  regex: RegExp;
};

const compileRules = (
  rules: readonly TranslationRule[],
): CompiledTranslationRule[] =>
  rules.map((rule) => ({
    ...rule,
    regex: new RegExp(rule.pattern, rule.flags),
  }));

const applyRule = (value: string, rule: CompiledTranslationRule): string => {
  const regex = rule.regex;

  if (rule.type === "equals") {
    const match = regex.exec(value);
    if (!match) return value;

    const groups = getRuleGroups(match, rule);
    const translated = interpolate(rule.translation, groups, rule.parameters);
    return `${groups.lead ?? ""}${translated}${groups.trail ?? ""}`;
  }

  return value.replace(regex, (...args: unknown[]) => {
    const match = args[0];
    const groups = args.at(-1);
    if (typeof match !== "string" || !groups || typeof groups !== "object") {
      return String(match ?? "");
    }

    const normalizedGroups = {
      ...(groups as Record<string, string | undefined>),
    };
    for (let index = 0; index < rule.parameters.length; index += 1) {
      const parameterName = rule.parameters[index];
      normalizedGroups[parameterName] = normalizedGroups[`p${index}`];
    }

    const translated = interpolate(
      rule.translation,
      normalizedGroups,
      rule.parameters,
    );
    return translated;
  });
};

const translateValue = (
  value: string,
  rules: readonly CompiledTranslationRule[],
): string => {
  let result = value;

  for (const rule of rules) {
    const last = result;

    result = applyRule(result, rule);

    if (last !== result) break;
  }

  return result;
};

export function createRuntime(rules: TranslationRules) {
  const runtime = {
    locale: resolveLocale(),
    rules,
    compiledRules: {
      "en-US": compileRules(rules["en-US"]),
      "zh-CN": compileRules(rules["zh-CN"]),
      "zh-TW": compileRules(rules["zh-TW"]),
      "zh-HK": compileRules(rules["zh-HK"]),
      "ko-KR": compileRules(rules["ko-KR"]),
      "vi-VN": compileRules(rules["vi-VN"]),
      "th-TH": compileRules(rules["th-TH"]),
    },
    running: false,
    frameId: 0 as number | undefined,
    dirty: true,
    observer: undefined as MutationObserver | undefined,
    start(): void {
      console.log("call i18n:start");
      if (runtime.running || typeof window === "undefined") return;
      runtime.running = true;
      runtime.schedule();
    },
    stop(): void {
      console.log("call i18n:stop");
      runtime.running = false;
      if (runtime.frameId != undefined) {
        window.cancelAnimationFrame(runtime.frameId);
        runtime.frameId = undefined;
      }
      runtime.observer?.disconnect();
      runtime.observer = undefined;
    },
    schedule(): void {
      console.log("call i18n:schedule");
      if (!runtime.running) return;
      runtime.frameId = window.requestAnimationFrame(() => {
        runtime.frameId = undefined;
        if (runtime.dirty) {
          runtime.scan();
          runtime.dirty = false;
        }
      });
    },
    scan(): void {
      console.log("call i18n:scan");
      if (typeof document === "undefined" || runtime.locale === "ja-JP") {
        return;
      }

      const activeRules = runtime.compiledRules[runtime.locale] ?? [];
      if (activeRules.length === 0) return;

      const walker = document.createTreeWalker(
        document.body ?? document.documentElement,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      );

      const pendingAttributes = new Set<Element>();

      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          if (!hasIgnoredAttributeOwner(element)) {
            pendingAttributes.add(element);
          }
          continue;
        }

        const textNode = node as Text & { ok?: boolean };
        const parent = textNode.parentElement;
        if (!parent || hasIgnoredTextAncestor(parent)) continue;

        if (textNode.ok) continue;

        const translated = translateValue(textNode.data, activeRules);

        if (translated !== textNode.data) {
          textNode.data = translated;
        }

        textNode.ok = true;
      }

      for (const element of pendingAttributes) {
        for (const name of SOURCE_ATTRIBUTE_NAMES) {
          if (!element.hasAttribute(name)) continue;
          const current = element.getAttribute(name);
          if (current == null) continue;

          const translated = translateValue(current, activeRules);
          if (translated !== current) {
            element.setAttribute(name, translated);
          }
        }
      }
    },
    installObserver(): void {
      if (typeof MutationObserver === "undefined" || !document.body) return;
      if (runtime.observer) return;

      runtime.observer = new MutationObserver(() => {
        runtime.dirty = true;
        runtime.schedule();
      });

      runtime.observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [...SOURCE_ATTRIBUTE_NAMES],
      });

      runtime.dirty = true;
      runtime.schedule();
    },
    text(_scope: string, source: string): string {
      if (runtime.locale === "ja-JP") return source;
      return translateValue(
        source,
        runtime.compiledRules[runtime.locale] ?? [],
      );
    },
    template(
      _scope: string,
      quasis: readonly string[],
      values: readonly unknown[],
    ): string {
      let source = quasis[0] ?? "";
      for (let index = 0; index < values.length; index += 1) {
        source += `{${index}}${quasis[index + 1] ?? ""}`;
      }

      const translated = runtime.text("", source);
      return translated.replace(/\{(\d+)\}/gu, (match, index: string) => {
        const value = values[Number(index)];
        return value == undefined ? match : String(value);
      });
    },
  };

  return runtime;
}

export type VoicevoxI18nRuntime = ReturnType<typeof createRuntime>;

declare module "vue" {
  interface ComponentCustomProperties {
    $vvI18nText: (scope: string, source: string) => string;
    $vvI18nTemplate: (
      scope: string,
      quasis: readonly string[],
      values: readonly unknown[],
    ) => string;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __VOICEVOX_I18N__: VoicevoxI18nRuntime | undefined;
}

export function installVoicevoxI18nRuntime(
  _app: App,
  runtime: VoicevoxI18nRuntime,
): void {
  globalThis.__VOICEVOX_I18N__ = runtime;
  runtime.start();

  if (typeof document === "undefined") return;

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => runtime.installObserver(),
      {
        once: true,
      },
    );
  } else {
    runtime.installObserver();
  }
}

export function installVoicevoxI18n(app: App, rules: TranslationRules): void {
  installVoicevoxI18nRuntime(app, createRuntime(rules));
}
