import type { App } from "vue";

export type VoicevoxLocale = "ja-JP" | "en-US" | "zh-CN" | "zh-TW";

export type LocaleCatalog = Record<string, Record<string, string>>;
export type LocaleCatalogs = Record<VoicevoxLocale, LocaleCatalog>;

declare global {
  // eslint-disable-next-line no-var
  var __VOICEVOX_I18N__: {
    locale: VoicevoxLocale;
    catalogs: LocaleCatalogs;
    text(scope: string, source: string): string;
    template(
      scope: string,
      quasis: readonly string[],
      values: readonly unknown[],
    ): string;
  } | undefined;
}

const normalizeKey = (source: string): string =>
  source.trim().replace(/\s+/gu, " ");

const LOCALE_STORAGE_KEY = "voicevox.locale";

const detectLocale = (languages: readonly string[]): VoicevoxLocale => {
  for (const raw of languages) {
    const language = raw.toLowerCase().replaceAll("_", "-");

    if (language === "ja" || language.startsWith("ja-")) return "ja-JP";
    if (language === "en" || language.startsWith("en-")) return "en-US";
    if (language === "zh-hans" || language.startsWith("zh-hans-")) {
      return "zh-CN";
    }
    if (language === "zh-hant" || language.startsWith("zh-hant-")) {
      return "zh-TW";
    }
  }

  return "ja-JP";
};

const getPreferredSystemLanguages = (): readonly string[] => {
  if (globalThis.__VOICEVOX_PREFERRED_SYSTEM_LANGUAGES__?.length) {
    return globalThis.__VOICEVOX_PREFERRED_SYSTEM_LANGUAGES__;
  }

  if (typeof navigator !== "undefined") {
    return navigator.language ? [navigator.language] : [];
  }

  return [];
};

const resolveLocale = (): VoicevoxLocale => {
  if (typeof localStorage !== "undefined") {
    try {
      const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (
        storedLocale === "ja-JP" ||
        storedLocale === "en-US" ||
        storedLocale === "zh-CN" ||
        storedLocale === "zh-TW"
      ) {
        return storedLocale;
      }
    } catch {
      // Access to localStorage can fail in restricted environments.
    }
  }

  const preferredSystemLanguages = getPreferredSystemLanguages();

  console.log(
    `Detected preferred system languages: ${preferredSystemLanguages.join(", ")}`,
  );

  if (preferredSystemLanguages.length) {
    const detectedLocale = detectLocale(preferredSystemLanguages);

    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, detectedLocale);
      } catch {
        // Ignore storage failures and keep using the detected locale for this run.
      }
    }

    return detectedLocale;
  }

  return "ja-JP";
};

const interpolate = (template: string, values: readonly unknown[]): string =>
  template.replace(/\{(\d+)\}/gu, (match, index: string) => {
    const value = values[Number(index)];
    return value === undefined ? match : String(value);
  });

export function createRuntime(catalogs: LocaleCatalogs) {
  const runtime = {
    locale: resolveLocale(),
    catalogs,
    text(scope: string, source: string): string {
      const core = normalizeKey(source);
      const translated = runtime.catalogs[runtime.locale]?.[scope]?.[core];
      if (translated === undefined) return source;

      const leading = source.match(/^\s*/u)?.[0] ?? "";
      const trailing = source.match(/\s*$/u)?.[0] ?? "";
      return `${leading}${translated}${trailing}`;
    },
    template(
      scope: string,
      quasis: readonly string[],
      values: readonly unknown[],
    ): string {
      let source = quasis[0] ?? "";
      for (let i = 0; i < values.length; i += 1) {
        source += `{${i}}${quasis[i + 1] ?? ""}`;
      }

      const core = normalizeKey(source);
      const translated = runtime.catalogs[runtime.locale]?.[scope]?.[core];
      const output = translated ?? core;

      const result = interpolate(output, values);
      const leading = source.match(/^\s*/u)?.[0] ?? "";
      const trailing = source.match(/\s*$/u)?.[0] ?? "";
      return translated === undefined ? source : `${leading}${result}${trailing}`;
    },
  };

  return runtime;
}

export type VoicevoxI18nRuntime = ReturnType<typeof createRuntime>;

export function installVoicevoxI18nRuntime(
  app: App,
  runtime: VoicevoxI18nRuntime,
): void {
  globalThis.__VOICEVOX_I18N__ = runtime;
  app.config.globalProperties.$vvI18nText = runtime.text;
  app.config.globalProperties.$vvI18nTemplate = runtime.template;
}

export function installVoicevoxI18n(
  app: App,
  catalogs: LocaleCatalogs,
): void {
  installVoicevoxI18nRuntime(app, createRuntime(catalogs));
}
