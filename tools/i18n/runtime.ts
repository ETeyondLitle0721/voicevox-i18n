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

const resolveGroupValue = (
  groups: Record<string, string | undefined>,
  name: string,
  parameters: readonly string[],
): string | undefined => {
  const byName = groups[name];
  if (byName != undefined) return byName;

  const numericIndex = Number(name);
  if (Number.isInteger(numericIndex)) {
    const parameterName = parameters[numericIndex];
    return parameterName ? groups[parameterName] : undefined;
  }

  return undefined;
};

const interpolate = (
  template: string,
  originalGroups: Record<string, string | undefined>,
  parameters: readonly string[],
  translatedGroups: Record<string, string | undefined>,
): string =>
  template.replace(
    /\{([^{}]+)\}|\[([^[\]]+)\]/gu,
    (
      match,
      originalName: string | undefined,
      translatedName: string | undefined,
    ) => {
      if (originalName != undefined) {
        return (
          resolveGroupValue(originalGroups, originalName, parameters) ?? match
        );
      }

      if (translatedName == undefined) return match;

      const translated = resolveGroupValue(
        translatedGroups,
        translatedName,
        parameters,
      );

      return (
        translated ??
        resolveGroupValue(originalGroups, translatedName, parameters) ??
        match
      );
    },
  );

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

const getTranslatedGroups = (
  groups: Record<string, string | undefined>,
  rule: TranslationRule,
  translateGroup: (source: string) => string,
): Record<string, string | undefined> => {
  const translated: Record<string, string | undefined> = {};

  for (let index = 0; index < rule.parameters.length; index += 1) {
    const parameterName = rule.parameters[index];
    const source = groups[parameterName];

    translated[parameterName] =
      source != undefined && rule.translatableParameters[index]
        ? translateGroup(source)
        : undefined;
  }

  return translated;
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

const applyRule = (
  value: string,
  rule: CompiledTranslationRule,
  translateGroup: (source: string) => string,
): string => {
  // Clone the RegExp so a nested second-pass translation cannot interfere with
  // the parent `replace()` iteration when the rule uses the global flag.
  const regex = new RegExp(rule.regex.source, rule.regex.flags);

  if (rule.type === "equals") {
    const match = regex.exec(value);
    if (!match) return value;

    const groups = getRuleGroups(match, rule);
    const translatedGroups = getTranslatedGroups(groups, rule, translateGroup);
    const translated = interpolate(
      rule.translation,
      groups,
      rule.parameters,
      translatedGroups,
    );
    return `${groups.lead ?? ""}${translated}${groups.trail ?? ""}`;
  }

  return value.replace(regex, (...args: unknown[]) => {
    const match = args[0];
    const groups = args.at(-1);

    if (typeof match !== "string" || !groups || typeof groups !== "object") {
      console.error("Invalid match or groups", match, groups);

      return String(match ?? "");
    }

    const normalizedGroups = {
      ...(groups as Record<string, string | undefined>),
    };
    for (let index = 0; index < rule.parameters.length; index += 1) {
      const parameterName = rule.parameters[index];
      normalizedGroups[parameterName] = normalizedGroups[`p${index}`];
    }

    const translatedGroups = getTranslatedGroups(
      normalizedGroups,
      rule,
      translateGroup,
    );
    return interpolate(
      rule.translation,
      normalizedGroups,
      rule.parameters,
      translatedGroups,
    );
  });
};

const MAX_SECOND_TRANSLATION_DEPTH = 4;

const translateValue = (
  value: string,
  rules: readonly CompiledTranslationRule[],
  depth = 0,
): { from: string; to: string; changed: boolean } => {
  let result = value.trim();
  const last = result;

  const translateGroup = (source: string): string => {
    if (depth >= MAX_SECOND_TRANSLATION_DEPTH) return source;

    const translated = translateValue(source, rules, depth + 1);
    return translated.changed ? translated.to : source;
  };

  for (const rule of rules) {
    result = applyRule(result, rule, translateGroup);

    if (last !== result) break;
  }

  return { from: last, to: result, changed: last !== result };
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
    clickCallback: () => runtime.scan(),
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
      window.removeEventListener("click", runtime.clickCallback);
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
      window.addEventListener("click", runtime.clickCallback);
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

        const textNode = node as Text & { ok?: boolean; lastData?: string };
        const parent = textNode.parentElement;
        if (!parent || hasIgnoredTextAncestor(parent)) continue;

        if (textNode.ok && textNode.lastData === textNode.data) continue;

        const translated = translateValue(textNode.data, activeRules);

        if (translated.changed) {
          textNode.data = textNode.data.replace(translated.from, translated.to);
          textNode.lastData = textNode.data;
        }

        textNode.ok = true;
      }

      for (const element of pendingAttributes) {
        for (const name of SOURCE_ATTRIBUTE_NAMES) {
          if (!element.hasAttribute(name)) continue;
          const current = element.getAttribute(name);
          if (current == null) continue;

          const translated = translateValue(current, activeRules);

          if (translated.changed) {
            element.setAttribute(
              name,
              current.replace(translated.from, translated.to),
            );
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
      return translateValue(source, runtime.compiledRules[runtime.locale] ?? [])
        .to;
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
