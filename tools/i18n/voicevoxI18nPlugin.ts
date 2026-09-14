import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parse as parseSfc } from "@vue/compiler-sfc";
import { baseParse } from "@vue/compiler-dom";
import type { Plugin } from "vite";

type Catalog = Record<string, Record<string, string>>;
type Catalogs = Record<string, Catalog>;

const JP = /[ぁ-ゖァ-ヺ一-龯]/u;
const STATIC_UI_ATTRS = new Set([
  "label",
  "title",
  "description",
  "placeholder",
  "aria-label",
  "alt",
]);

const normalizeKey = (source: string): string =>
  source.trim().replace(/\s+/gu, " ");

function readJson(file: string): Record<string, string> {
  return JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, string>;
}

function loadCatalog(localeDir: string): Catalog {
  const result: Catalog = {};

  if (!fs.existsSync(localeDir)) return result;

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(file);
        continue;
      }
      if (!entry.name.endsWith(".json")) continue;

      const relative = path.relative(localeDir, file).replaceAll(path.sep, "/");
      const scope = relative.replace(/\.json$/u, "");
      result[scope] = readJson(file);
    }
  };

  walk(localeDir);
  return result;
}

function loadCatalogs(root: string): Catalogs {
  return {
    ja: loadCatalog(path.join(root, "ja")),
    "en-US": loadCatalog(path.join(root, "en-US")),
    "zh-Hans-CN": loadCatalog(path.join(root, "zh-Hans-CN")),
  };
}

function escapeJsString(value: string): string {
  return JSON.stringify(value);
}

function scopeFromId(id: string, projectRoot: string): string {
  return path.relative(path.join(projectRoot, "src"), id).replaceAll(path.sep, "/");
}

function hasTranslation(
  catalogs: Catalogs,
  locale: "en-US" | "zh-Hans-CN",
  scope: string,
  source: string,
): boolean {
  return catalogs[locale]?.[scope]?.[normalizeKey(source)] !== undefined;
}

function hasAnyTranslation(
  catalogs: Catalogs,
  scope: string,
  source: string,
): boolean {
  return hasTranslation(catalogs, "en-US", scope, source) ||
    hasTranslation(catalogs, "zh-Hans-CN", scope, source);
}

function rewriteVue(
  code: string,
  id: string,
  projectRoot: string,
  catalogs: Catalogs,
): string {
  const parsed = parseSfc(code, { filename: id });
  const template = parsed.descriptor.template;
  if (!template) return code;

  const ast = baseParse(template.content);
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  const scope = scopeFromId(id, projectRoot);

  const visitElement = (node: any): void => {
    if (node.type !== 1) return;

    for (const prop of node.props ?? []) {
      if (
        prop.type === 6 &&
        STATIC_UI_ATTRS.has(prop.name) &&
        prop.value?.content &&
        JP.test(prop.value.content) &&
        hasAnyTranslation(catalogs, scope, prop.value.content)
      ) {
        const translated = `:${prop.name}="$vvI18nText(${escapeJsString(scope)}, ${escapeJsString(prop.value.content)})"`;
        replacements.push({
          start: prop.loc.start.offset + template.loc.start.offset,
          end: prop.loc.end.offset + template.loc.start.offset,
          value: translated,
        });
      }
    }

    const children = node.children ?? [];
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];

      // Consecutive Text + Interpolation + Text children form one translatable message.
      if (child.type === 2 || child.type === 5) {
        const run: any[] = [];
        let j = i;
        while (
          j < children.length &&
          (children[j].type === 2 || children[j].type === 5)
        ) {
          run.push(children[j]);
          j += 1;
        }

        if (
          run.length > 1 &&
          run.some((x) => x.type === 5) &&
          run.some((x) => x.type === 2 && JP.test(x.content))
        ) {
          const actualQuasis: string[] = [];
          const expressions: string[] = [];

          for (const item of run) {
            if (item.type === 2) {
              actualQuasis.push(item.content);
            } else {
              const start = item.content.loc.start.offset + template.loc.start.offset;
              const end = item.content.loc.end.offset + template.loc.start.offset;
              expressions.push(code.slice(start, end).trim());
              actualQuasis.push("");
            }
          }

          let key = actualQuasis[0] ?? "";
          for (let k = 0; k < expressions.length; k += 1) {
            key += `{${k}}${actualQuasis[k + 1] ?? ""}`;
          }

          if (hasAnyTranslation(catalogs, scope, key)) {
            const args = `[${actualQuasis.map(escapeJsString).join(", ")}]`;
            const values = `[${expressions.join(", ")}]`;
            replacements.push({
              start: run[0].loc.start.offset + template.loc.start.offset,
              end: run[run.length - 1].loc.end.offset + template.loc.start.offset,
              value: `{{ $vvI18nTemplate(${escapeJsString(scope)}, ${args}, ${values}) }}`,
            });
          }
          i = j - 1;
          continue;
        }

        if (child.type === 2 && child.content.trim() && JP.test(child.content)) {
          if (hasAnyTranslation(catalogs, scope, child.content)) {
            replacements.push({
              start: child.loc.start.offset + template.loc.start.offset,
              end: child.loc.end.offset + template.loc.start.offset,
              value: `{{ $vvI18nText(${escapeJsString(scope)}, ${escapeJsString(child.content)}) }}`,
            });
          }
          continue;
        }
      }

      if (child.type === 1) visitElement(child);
    }
  };

  for (const child of ast.children ?? []) visitElement(child);
  if (!replacements.length) return code;

  replacements.sort((a, b) => b.start - a.start);
  let output = code;
  for (const replacement of replacements) {
    output = `${output.slice(0, replacement.start)}${replacement.value}${output.slice(replacement.end)}`;
  }

  return output;
}

function rewriteTypeScript(
  code: string,
  id: string,
  projectRoot: string,
  catalogs: Catalogs,
): string {
  const scope = scopeFromId(id, projectRoot);
  const sourceFile = ts.createSourceFile(
    id,
    code,
    ts.ScriptTarget.Latest,
    true,
    id.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const replacements: Array<{ start: number; end: number; value: string }> = [];

  const visit = (node: ts.Node): void => {
    if (ts.isTemplateExpression(node)) {
      const raw = code.slice(node.getStart(sourceFile), node.getEnd());
      if (JP.test(raw)) {
        const quasis: string[] = [node.head.text];
        const expressions: string[] = [];
        for (const span of node.templateSpans) {
          expressions.push(span.expression.getText(sourceFile));
          quasis.push(span.literal.text);
        }

        let key = quasis[0] ?? "";
        for (let i = 0; i < expressions.length; i += 1) {
          key += `{${i}}${quasis[i + 1] ?? ""}`;
        }

        if (hasAnyTranslation(catalogs, scope, key)) {
          replacements.push({
            start: node.getStart(sourceFile),
            end: node.getEnd(),
            value: `globalThis.__VOICEVOX_I18N__?.template(${escapeJsString(scope)}, [${quasis.map(escapeJsString).join(", ")}], [${expressions.join(", ")}]) ?? ${JSON.stringify(raw)}`,
          });
        }
      }
      return;
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const source = node.text;
      if (JP.test(source) && hasAnyTranslation(catalogs, scope, source)) {
        replacements.push({
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          value: `globalThis.__VOICEVOX_I18N__?.text(${escapeJsString(scope)}, ${escapeJsString(source)}) ?? ${node.getText(sourceFile)}`,
        });
      }
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  if (!replacements.length) return code;

  replacements.sort((a, b) => b.start - a.start);
  let output = code;
  for (const replacement of replacements) {
    output = `${output.slice(0, replacement.start)}${replacement.value}${output.slice(replacement.end)}`;
  }
  return output;
}

function createRuntimeModule(catalogs: Catalogs): string {
  const json = JSON.stringify(catalogs);
  return `
const LOCALE_STORAGE_KEY = "voicevox.locale";
const normalizeKey = (source) => source.trim().replace(/\\s+/gu, " ");
const detectLocale = (languages) => {
  for (const raw of languages) {
    const language = raw.toLowerCase();
    if (language === "ja" || language.startsWith("ja-")) return "ja";
    if (language === "zh" || language.startsWith("zh-")) return "zh-Hans-CN";
    if (language === "en" || language.startsWith("en-")) return "en-US";
  }
  return "en";
};
const getPreferredSystemLanguages = () => {
  if (globalThis.__VOICEVOX_PREFERRED_SYSTEM_LANGUAGES__?.length) {
    return globalThis.__VOICEVOX_PREFERRED_SYSTEM_LANGUAGES__;
  }
  if (typeof navigator !== "undefined") {
    return navigator.language ? [navigator.language] : [];
  }
  return [];
};
const resolveLocale = () => {
  if (typeof localStorage !== "undefined") {
    try {
      const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (
        storedLocale === "ja" ||
        storedLocale === "en-US" ||
        storedLocale === "zh-Hans-CN"
      ) {
        return storedLocale;
      }
    } catch {
      // Access to localStorage can fail in restricted environments.
    }
  }

  const preferredSystemLanguages = getPreferredSystemLanguages();
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

  return "ja";
};
const interpolate = (template, values) =>
  template.replace(/\\{(\\d+)\\}/gu, (match, index) => {
    const value = values[Number(index)];
    return value === undefined ? match : String(value);
  });

const catalogs = ${json};
const runtime = {
  locale: resolveLocale(),
  catalogs,
  text(scope, source) {
    const core = normalizeKey(source);
    const translated = runtime.catalogs[runtime.locale]?.[scope]?.[core];
    if (translated === undefined) return source;
    const leading = source.match(/^\\s*/u)?.[0] ?? "";
    const trailing = source.match(/\\s*$/u)?.[0] ?? "";
    return leading + translated + trailing;
  },
  template(scope, quasis, values) {
    let source = quasis[0] ?? "";
    for (let i = 0; i < values.length; i += 1) {
      source += "{" + i + "}" + (quasis[i + 1] ?? "");
    }
    const core = normalizeKey(source);
    const translated = runtime.catalogs[runtime.locale]?.[scope]?.[core];
    if (translated === undefined) return source;
    const result = interpolate(translated, values);
    const leading = source.match(/^\\s*/u)?.[0] ?? "";
    const trailing = source.match(/\\s*$/u)?.[0] ?? "";
    return leading + result + trailing;
  },
};
globalThis.__VOICEVOX_I18N__ = runtime;

export function installVoicevoxI18n(app) {
  app.config.globalProperties.$vvI18nText = runtime.text;
  app.config.globalProperties.$vvI18nTemplate = runtime.template;
}
`;
}

export function voicevoxI18n(): Plugin {
  const projectRoot = process.cwd();
  const catalogs = loadCatalogs(path.join(projectRoot, "tools/i18n/locales"));
  const runtimeId = "\0voicevox-i18n/runtime";

  return {
    name: "voicevox-i18n",
    enforce: "pre",

    resolveId(id) {
      if (id === runtimeId) return runtimeId;
      return undefined;
    },

    load(id) {
      if (id === runtimeId) return createRuntimeModule(catalogs);
      return undefined;
    },

    transform(code, id) {
      const cleanId = id.split("?", 1)[0];

      if (cleanId.endsWith(".vue") && !cleanId.includes("/node_modules/")) {
        return rewriteVue(code, cleanId, projectRoot, catalogs);
      }

      const relativeId = path.relative(projectRoot, cleanId).replaceAll(path.sep, "/");

      if (
        /\.(ts|tsx)$/u.test(cleanId) &&
        !cleanId.includes("/node_modules/") &&
        relativeId.startsWith("src/") &&
        (
          relativeId.startsWith("src/components/Dialog/") ||
          relativeId.startsWith("src/components/Menu/") ||
          relativeId === "src/store/project/index.ts" ||
          relativeId === "src/store/project/saveProjectHelper.ts" ||
          relativeId === "src/store/ui.ts" ||
          relativeId === "src/store/setting.ts" ||
          relativeId === "src/store/audio.ts" ||
          relativeId === "src/store/singing.ts" ||
          relativeId === "src/store/audioGenerate.ts" ||
          relativeId === "src/welcome/store/index.ts"
        )
      ) {
        return rewriteTypeScript(code, cleanId, projectRoot, catalogs);
      }

      if (
        relativeId === "src/main.ts" ||
        relativeId === "src/welcome/main.ts"
      ) {
        return {
          code:
            `import "${runtimeId}";\n` +
            `import { installVoicevoxI18n } from "${runtimeId}";\n` +
            code.replace(/createApp\(App\)/u, "createApp(App).use(installVoicevoxI18n)"),
          map: null,
        };
      }

      return undefined;
    },
  };
}
