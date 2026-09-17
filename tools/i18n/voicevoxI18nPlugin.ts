import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

export type Locale =
  | "ja-JP"
  | "en-US"
  | "zh-CN"
  | "zh-TW"
  | "zh-HK"
  | "ko-KR"
  | "vi-VN"
  | "th-TH";

export type TranslationRule = {
  type: "equals" | "contains";
  pattern: string;
  flags: "u" | "gu";
  parameters: readonly string[];
  translatableParameters: readonly boolean[];
  translation: string;
};

export type TranslationRules = Record<
  Exclude<Locale, "ja-JP">,
  readonly TranslationRule[]
>;

const SOURCE_LOCALES: readonly Exclude<Locale, "ja-JP">[] = [
  "en-US",
  "zh-CN",
  "zh-TW",
  "zh-HK",
  "ko-KR",
  "vi-VN",
  "th-TH",
];

const VIRTUAL_RUNTIME_PUBLIC_ID = "virtual:voicevox-i18n/runtime";
const VIRTUAL_RUNTIME_ID = `\0${VIRTUAL_RUNTIME_PUBLIC_ID}`;

const XML_ITEM_RE = /<item\b[^>]*>([\s\S]*?)<\/item>/gu;
const XML_MATCH_RE =
  /<match\b[^>]*\btype="(equals|contains)"[^>]*>([\s\S]*?)<\/match>/gu;
const XML_TRANSLATE_RE = /<translate\b[^>]*>([\s\S]*?)<\/translate>/u;
const XML_PART_RE = /<(text|param)\b([^>]*)\/>/gu;
const XML_ATTR_RE = /([:\w-]+)="([\s\S]*?)"/gu;
const XML_TRANSLATION_RE =
  /<(en-US|zh-CN|zh-TW|zh-HK|ko-KR|vi-VN|th-TH)\b[^>]*\bcontent="([\s\S]*?)"[^>]*\/>/gu;

const normalizeXmlEntity = (value: string): string =>
  value
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&")
    .replace(/&#x([0-9a-f]+);/giu, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/gu, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    );

const escapeRegExp = (value: string): string =>
  value.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");

const getXmlAttribute = (
  attributes: string,
  name: string,
): string | undefined => {
  for (const match of attributes.matchAll(XML_ATTR_RE)) {
    if (match[1] === name) {
      return normalizeXmlEntity(match[2]);
    }
  }
  return undefined;
};

function buildRule(
  type: "equals" | "contains",
  parts: readonly {
    kind: "text" | "param";
    value: string;
    translate?: boolean;
  }[],
  translation: string,
): TranslationRule {
  const parameters: string[] = [];
  const translatableParameters: boolean[] = [];
  const parameterGroups = new Map<string, string>();
  let parameterIndex = 0;
  let sourcePattern = "";

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];

    if (part.kind === "text") {
      sourcePattern += escapeRegExp(part.value);
      continue;
    }

    const existingGroup = parameterGroups.get(part.value);
    if (existingGroup) {
      sourcePattern += `\\k<${existingGroup}>`;
      continue;
    }

    const groupName = `p${parameterIndex}`;
    parameterIndex += 1;
    parameterGroups.set(part.value, groupName);
    parameters.push(part.value);
    translatableParameters.push(part.translate === true);

    const isLastPart = index === parts.length - 1;
    sourcePattern += `(?<${groupName}>${isLastPart ? "[\\s\\S]*" : "[\\s\\S]*?"})`;
  }

  const pattern =
    type === "equals"
      ? `^(?<lead>\\s*)${sourcePattern}(?<trail>\\s*)$`
      : sourcePattern;

  return {
    type,
    pattern,
    flags: type === "equals" ? "u" : "gu",
    parameters,
    translatableParameters,
    translation,
  };
}

export function parseTranslationRules(xml: string): TranslationRules {
  const rules: TranslationRules = {
    "en-US": [],
    "zh-CN": [],
    "zh-TW": [],
    "zh-HK": [],
    "ko-KR": [],
    "vi-VN": [],
    "th-TH": [],
  };

  for (const itemMatch of xml.matchAll(XML_ITEM_RE)) {
    const body = itemMatch[1];
    const matchSections = [...body.matchAll(XML_MATCH_RE)];
    const translateSection = body.match(XML_TRANSLATE_RE);

    if (matchSections.length === 0 || !translateSection) {
      continue;
    }

    const matches: Array<{
      type: "equals" | "contains";
      parts: Array<{
        kind: "text" | "param";
        value: string;
        translate?: boolean;
      }>;
    }> = [];

    for (const matchSection of matchSections) {
      const type = matchSection[1] as "equals" | "contains";
      const parts: Array<{
        kind: "text" | "param";
        value: string;
        translate?: boolean;
      }> = [];

      for (const partMatch of matchSection[2].matchAll(XML_PART_RE)) {
        const kind = partMatch[1] as "text" | "param";
        const content = getXmlAttribute(
          partMatch[2],
          kind === "text" ? "content" : "name",
        );
        if (content == undefined) continue;

        const translate =
          kind === "param" &&
          getXmlAttribute(partMatch[2], "translate") === "allow";
        parts.push({ kind, value: content, translate });
      }

      if (parts.length > 0) {
        matches.push({ type, parts });
      }
    }

    if (matches.length === 0) {
      continue;
    }

    for (const translationMatch of translateSection[1].matchAll(
      XML_TRANSLATION_RE,
    )) {
      const locale = translationMatch[1] as Exclude<Locale, "ja-JP">;
      const translation = normalizeXmlEntity(translationMatch[2]);
      for (const match of matches) {
        rules[locale] = [
          ...rules[locale],
          buildRule(match.type, match.parts, translation),
        ];
      }
    }
  }

  for (const locale of SOURCE_LOCALES) {
    rules[locale] = [...rules[locale]].sort((a, b) => {
      if (a.type !== b.type) return a.type === "equals" ? -1 : 1;
      return b.pattern.length - a.pattern.length;
    });
  }

  return rules;
}

function loadTranslationRules(files: readonly string[]): TranslationRules {
  if (files.length === 0) {
    throw new Error("voicevox-i18n: no locale XML files were found");
  }

  const merged: TranslationRules = {
    "en-US": [],
    "zh-CN": [],
    "zh-TW": [],
    "zh-HK": [],
    "ko-KR": [],
    "vi-VN": [],
    "th-TH": [],
  };

  for (const file of files) {
    if (!fs.existsSync(file)) {
      throw new Error(`voicevox-i18n: locale XML was not found: ${file}`);
    }

    const rules = parseTranslationRules(fs.readFileSync(file, "utf8"));
    for (const locale of SOURCE_LOCALES) {
      merged[locale] = [...merged[locale], ...rules[locale]];
    }
  }

  for (const locale of SOURCE_LOCALES) {
    merged[locale] = [...merged[locale]].sort((a, b) => {
      if (a.type !== b.type) return a.type === "equals" ? -1 : 1;
      return b.pattern.length - a.pattern.length;
    });
  }

  return merged;
}

function discoverLocaleXmlFiles(localeDir: string): string[] {
  if (!fs.existsSync(localeDir)) {
    throw new Error(
      `voicevox-i18n: locale directory was not found: ${localeDir}`,
    );
  }

  const files = fs
    .readdirSync(localeDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^group_\d{3}\.xml$/u.test(entry.name))
    .map((entry) => path.join(localeDir, entry.name))
    .sort((a, b) => a.localeCompare(b, "en"));

  if (files.length === 0) {
    throw new Error(
      `voicevox-i18n: no group_*.xml files were found in ${localeDir}`,
    );
  }

  return files;
}

const escapeJsString = (value: string): string => JSON.stringify(value);

function injectRuntimePlugin(code: string): string {
  if (code.includes(VIRTUAL_RUNTIME_PUBLIC_ID)) {
    return code;
  }

  const marker = "createApp(App)";
  const index = code.indexOf(marker);

  if (index < 0) {
    throw new Error(
      "voicevox-i18n: failed to find the application's createApp(App) call",
    );
  }

  const before = code.slice(0, index);
  const after = code.slice(index + marker.length);

  // The virtual module owns the already-parsed locale table and exposes a
  // zero-argument Vue plugin installer. Do not call the legacy two-argument
  // installVoicevoxI18n(app, rules) helper here: that would create an empty
  // runtime (or throw) before the application mounts.
  return (
    `import { installVoicevoxI18n } from "${VIRTUAL_RUNTIME_PUBLIC_ID}";\n` +
    before +
    `${marker}.use(installVoicevoxI18n)` +
    after
  );
}

function createVirtualRuntimeModule(
  rules: TranslationRules,
  runtimeFile: string,
): string {
  return [
    `import { installVoicevoxI18nRuntime, createRuntime } from ${escapeJsString(runtimeFile)};`,
    `const rules = ${JSON.stringify(rules)};`,
    `const runtime = createRuntime(rules);`,
    `globalThis.__VOICEVOX_I18N__ = runtime;`,
    ``,
    `export function installVoicevoxI18n(app) {`,
    `  installVoicevoxI18nRuntime(app, runtime);`,
    `}`,
    ``,
  ].join("\n");
}

export function voicevoxI18n(): Plugin {
  const projectRoot = process.cwd();
  const localeDir = path.join(projectRoot, "tools/i18n/locales/translates");

  let rules: TranslationRules = {
    "en-US": [],
    "zh-CN": [],
    "zh-TW": [],
    "zh-HK": [],
    "ko-KR": [],
    "vi-VN": [],
    "th-TH": [],
  };

  return {
    name: "voicevox-i18n",
    enforce: "pre",

    configResolved() {
      rules = loadTranslationRules(discoverLocaleXmlFiles(localeDir));
    },

    resolveId(id) {
      if (id === VIRTUAL_RUNTIME_PUBLIC_ID) {
        return VIRTUAL_RUNTIME_ID;
      }
      if (id === VIRTUAL_RUNTIME_ID) {
        return id;
      }
      return undefined;
    },

    load(id) {
      if (id === VIRTUAL_RUNTIME_ID) {
        const runtimeFile = path
          .join(projectRoot, "tools/i18n/runtime.ts")
          .replaceAll(path.sep, "/");
        return createVirtualRuntimeModule(rules, runtimeFile);
      }
      return undefined;
    },

    transform(code, id) {
      const cleanId = id.split("?", 1)[0];
      const relativeId = path
        .relative(projectRoot, cleanId)
        .replaceAll(path.sep, "/");

      if (
        relativeId === "src/main.ts" ||
        relativeId === "src/welcome/main.ts"
      ) {
        return {
          code: injectRuntimePlugin(code),
          map: null,
        };
      }

      // Localization is intentionally runtime-only. Vite never parses or rewrites
      // Vue/TypeScript source for i18n; the browser runtime handles rendered DOM.
      return undefined;
    },
  };
}
