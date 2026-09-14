import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parse as parseSfc } from "@vue/compiler-sfc";
import {
  baseParse,
  NodeTypes,
  type ElementNode,
  type InterpolationNode,
  type RootNode,
  type TextNode,
} from "@vue/compiler-dom";
import type { Plugin } from "vite";

type Locale = "ja-JP" | "en-US" | "zh-CN" | "zh-TW";
type Catalog = Record<string, Record<string, string>>;
type Catalogs = Record<Locale, Catalog>;

type Replacement = {
  start: number;
  end: number;
  value: string;
};

const SOURCE_LOCALES: readonly Exclude<Locale, "ja-JP">[] = ["en-US", "zh-CN", "zh-TW"];

const STATIC_UI_ATTRS = new Set([
  "label",
  "title",
  "description",
  "placeholder",
  "aria-label",
  "alt",
]);

const JAPANESE_RE = /[ぁ-ゖァ-ヺ一-龯]/u;
const VIRTUAL_RUNTIME_PUBLIC_ID = "virtual:voicevox-i18n/runtime";
const VIRTUAL_RUNTIME_ID = `\0${VIRTUAL_RUNTIME_PUBLIC_ID}`;

const normalizeKey = (source: string): string =>
  source.trim().replace(/\s+/gu, " ");

const escapeJsString = (value: string): string => JSON.stringify(value);

function getTrimmedTextRange(text: string): { start: number; end: number } {
  const start = text.search(/\S/u);
  if (start < 0) {
    return { start: 0, end: 0 };
  }

  const end = text.search(/\s+$/u);
  return {
    start,
    end: end < 0 ? text.length : end,
  };
}

function stripQuery(id: string): string {
  return id.split("?", 1)[0];
}

function toPosixPath(file: string): string {
  return file.replaceAll(path.sep, "/");
}

function scopeFromId(id: string, projectRoot: string): string {
  return toPosixPath(path.relative(path.join(projectRoot, "src"), id));
}

function readCatalogFile(file: string): Record<string, string> {
  const value: unknown = JSON.parse(fs.readFileSync(file, "utf-8"));

  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid i18n catalog: ${file}`);
  }

  const result: Record<string, string> = {};

  for (const [key, translated] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (typeof translated !== "string") {
      throw new Error(
        `Invalid i18n entry in ${file}: "${key}" must map to a string`,
      );
    }

    result[normalizeKey(key)] = translated;
  }

  return result;
}

function loadCatalog(localeDir: string): Catalog {
  const result: Catalog = {};

  if (!fs.existsSync(localeDir)) {
    return result;
  }

  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        visit(file);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      const relative = toPosixPath(path.relative(localeDir, file));
      const scope = relative.slice(0, -".json".length);
      result[scope] = readCatalogFile(file);
    }
  };

  visit(localeDir);
  return result;
}

function loadCatalogs(root: string): Catalogs {
  return {
    "ja-JP": loadCatalog(path.join(root, "ja-JP")),
    "en-US": loadCatalog(path.join(root, "en-US")),
    "zh-CN": loadCatalog(path.join(root, "zh-CN")),
    "zh-TW": loadCatalog(path.join(root, "zh-TW")),
  };
}

function findTranslation(
  catalogs: Catalogs,
  scope: string,
  source: string,
): boolean {
  const key = normalizeKey(source);

  return SOURCE_LOCALES.some(
    (locale) => catalogs[locale]?.[scope]?.[key] != undefined,
  );
}

function applyReplacements(
  code: string,
  replacements: readonly Replacement[],
): string {
  if (replacements.length === 0) {
    return code;
  }

  const ordered = [...replacements].sort((a, b) => a.start - b.start);

  let previousEnd = 0;
  for (const replacement of ordered) {
    if (
      replacement.start < previousEnd ||
      replacement.start > replacement.end ||
      replacement.end > code.length
    ) {
      throw new Error(
        `Overlapping or invalid i18n replacement: ${JSON.stringify(replacement)}`,
      );
    }

    previousEnd = replacement.end;
  }

  let output = code;

  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const replacement = ordered[i];
    output =
      output.slice(0, replacement.start) +
      replacement.value +
      output.slice(replacement.end);
  }

  return output;
}

function replacement(
  templateContentOffset: number,
  start: number,
  end: number,
  value: string,
): Replacement {
  return {
    start: templateContentOffset + start,
    end: templateContentOffset + end,
    value,
  };
}

function getInterpolationSource(
  node: InterpolationNode,
  templateContent: string,
): string {
  return templateContent
    .slice(node.content.loc.start.offset, node.content.loc.end.offset)
    .trim();
}

function collectVueTextRun(
  nodes: readonly (TextNode | InterpolationNode)[],
  templateContent: string,
): {
  source: string;
  quasis: string[];
  expressions: string[];
} {
  const quasis: string[] = [];
  const expressions: string[] = [];

  for (const node of nodes) {
    if (node.type === NodeTypes.TEXT) {
      quasis.push(node.content);
      continue;
    }

    expressions.push(getInterpolationSource(node, templateContent));
    quasis.push("");
  }

  let source = quasis[0] ?? "";
  for (let i = 0; i < expressions.length; i += 1) {
    source += `{${i}}${quasis[i + 1] ?? ""}`;
  }

  return { "source": source.trim(), quasis, expressions };
}

function rewriteVue(
  code: string,
  id: string,
  projectRoot: string,
  catalogs: Catalogs,
): string {
  const parsed = parseSfc(code, { filename: id });
  const template = parsed.descriptor.template;

  if (!template) {
    return code;
  }

  const root: RootNode = baseParse(template.content);
  const scope = scopeFromId(id, projectRoot);
  const replacements: Replacement[] = [];
  const templateContent = template.content;
  const templateContentRelativeOffset = template.loc.source.indexOf(
    templateContent,
  );
  if (templateContentRelativeOffset < 0) {
    throw new Error(
      `voicevox-i18n: failed to locate template content in ${scope}`,
    );
  }
  const templateContentOffset =
    template.loc.start.offset + templateContentRelativeOffset;

  const visitElement = (node: ElementNode): void => {
    for (const prop of node.props) {
      if (
        prop.type === NodeTypes.ATTRIBUTE &&
        STATIC_UI_ATTRS.has(prop.name) &&
        prop.value?.content &&
        JAPANESE_RE.test(prop.value.content) &&
        findTranslation(catalogs, scope, prop.value.content)
      ) {
        replacements.push(
          replacement(
            templateContentOffset,
            prop.loc.start.offset,
            prop.loc.end.offset,
            `:${prop.name}='$vvI18nText(${escapeJsString(scope)}, ${escapeJsString(prop.value.content.trim())})'`,
          ),
        );
      }
    }

    const children = node.children;
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];

      if (
        child.type === NodeTypes.TEXT ||
        child.type === NodeTypes.INTERPOLATION
      ) {
        const run: (TextNode | InterpolationNode)[] = [];
        let j = i;

        while (
          j < children.length &&
          (children[j].type === NodeTypes.TEXT ||
            children[j].type === NodeTypes.INTERPOLATION)
        ) {
          run.push(children[j] as TextNode | InterpolationNode);
          j += 1;
        }

        const hasInterpolation = run.some(
          (item) => item.type === NodeTypes.INTERPOLATION,
        );
        const hasJapaneseText = run.some(
          (item) =>
            item.type === NodeTypes.TEXT && JAPANESE_RE.test(item.content),
        );

        if (hasInterpolation && hasJapaneseText) {
          const { source, quasis, expressions } = collectVueTextRun(
            run,
            templateContent,
          );

          if (findTranslation(catalogs, scope, source)) {
            replacements.push(
              replacement(
                templateContentOffset,
                run[0].loc.start.offset,
                run.at(-1)?.loc.end.offset ?? run[0].loc.end.offset,
                `{{ $vvI18nTemplate(${escapeJsString(scope)}, [${quasis
                  .map(escapeJsString)
                  .join(", ")}], [${expressions.join(", ")}]) }}`,
              ),
            );
          }
        } else {
          for (const item of run) {
            if (item.type !== NodeTypes.TEXT || !JAPANESE_RE.test(item.content)) {
              continue;
            }

            const source = item.content.trim();
            const range = getTrimmedTextRange(item.content);
            if (range.end <= range.start || !findTranslation(catalogs, scope, source)) {
              continue;
            }

            replacements.push(
              replacement(
                templateContentOffset,
                item.loc.start.offset + range.start,
                item.loc.start.offset + range.end,
                `{{ $vvI18nText(${escapeJsString(scope)}, ${escapeJsString(source)}) }}`,
              ),
            );
          }
        }

        i = j - 1;
        continue;
      }

      if (child.type === NodeTypes.ELEMENT) {
        visitElement(child);
      }
    }
  };

  for (const child of root.children) {
    if (child.type === NodeTypes.ELEMENT) {
      visitElement(child);
    }
  }

  return applyReplacements(code, replacements);
}

function isStringLikeLiteral(
  node: ts.Node,
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function isPropertyKey(node: ts.Node): boolean {
  const parent = node.parent;

  return (
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isPropertySignature(parent) && parent.name === node) ||
    (ts.isMethodSignature(parent) && parent.name === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isPropertyDeclaration(parent) && parent.name === node) ||
    (ts.isEnumMember(parent) && parent.name === node) ||
    (ts.isJsxAttribute(parent) && parent.name === node) ||
    (ts.isJsxElement(parent) && parent.openingElement.tagName === node) ||
    (ts.isJsxOpeningElement(parent) && parent.tagName === node)
  );
}

function isModuleSpecifier(node: ts.Node): boolean {
  const parent = node.parent;

  return (
    (ts.isImportDeclaration(parent) && parent.moduleSpecifier === node) ||
    (ts.isExportDeclaration(parent) && parent.moduleSpecifier === node) ||
    (ts.isImportEqualsDeclaration(parent) && parent.moduleReference === node) ||
    (ts.isImportTypeNode(parent) && parent.argument === node)
  );
}

function hasObjectProperty(
  object: ts.ObjectLiteralExpression,
  name: string,
): boolean {
  return object.properties.some((property) => {
    if (!ts.isPropertyAssignment(property)) return false;
    return property.name.getText() === name;
  });
}

function isHotkeyActionNameLiteral(node: ts.Node): boolean {
  const parent = node.parent;
  if (!ts.isPropertyAssignment(parent) || parent.name.getText() !== "name") {
    return false;
  }

  const object = parent.parent;
  if (!ts.isObjectLiteralExpression(object)) {
    return false;
  }

  // A HotkeyAction is identified by its callback and name properties.
  // The name is a stable domain identifier and must never be localized.
  return hasObjectProperty(object, "callback") &&
    (hasObjectProperty(object, "editor") ||
      object.parent.getText().includes("registerHotkey"));
}

function shouldRewriteStringLiteral(node: ts.Node): boolean {
  if (
    isModuleSpecifier(node) ||
    isPropertyKey(node) ||
    isHotkeyActionNameLiteral(node)
  ) {
    return false;
  }

  // Never rewrite a directive prologue such as "use strict".
  if (
    ts.isExpressionStatement(node.parent) &&
    node.parent.expression === node &&
    ts.isSourceFile(node.parent.parent)
  ) {
    return false;
  }

  return true;
}

function buildTemplateKey(
  node: ts.TemplateExpression,
  sourceFile: ts.SourceFile,
): {
  source: string;
  quasis: string[];
  expressions: string[];
} {
  const quasis = [
    node.head.text,
    ...node.templateSpans.map((span) => span.literal.text),
  ];
  const expressions = node.templateSpans.map((span) =>
    span.expression.getText(sourceFile).trim(),
  );

  let source = quasis[0] ?? "";
  for (let i = 0; i < expressions.length; i += 1) {
    source += `{${i}}${quasis[i + 1] ?? ""}`;
  }

  return { source, quasis, expressions };
}

function rewriteTypeScript(
  code: string,
  id: string,
  projectRoot: string,
  catalogs: Catalogs,
): string {
  const sourceFile = ts.createSourceFile(
    id,
    code,
    ts.ScriptTarget.Latest,
    true,
    id.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const scope = scopeFromId(id, projectRoot);
  const replacements: Replacement[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isTemplateExpression(node)) {
      const { source, quasis, expressions } = buildTemplateKey(
        node,
        sourceFile,
      );

      if (
        JAPANESE_RE.test(source) &&
        findTranslation(catalogs, scope, source)
      ) {
        const raw = node.getText(sourceFile);

        replacements.push({
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          value:
            `globalThis.__VOICEVOX_I18N__?.template(` +
            `${escapeJsString(scope)}, ` +
            `[${quasis.map(escapeJsString).join(", ")}], ` +
            `[${expressions.join(", ")}]) ?? ${escapeJsString(raw)}`,
        });

        return;
      }

      // A non-translatable template can still contain translatable
      // string literals inside one of its expressions.
      ts.forEachChild(node, visit);
      return;
    }

    if (isStringLikeLiteral(node)) {
      const source = node.text;

      if (
        JAPANESE_RE.test(source) &&
        findTranslation(catalogs, scope, source) &&
        shouldRewriteStringLiteral(node)
      ) {
        replacements.push({
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          value:
            `globalThis.__VOICEVOX_I18N__?.text(` +
            `${escapeJsString(scope)}, ` +
            `${escapeJsString(source)}) ?? ${node.getText(sourceFile)}`,
        });

        return;
      }

      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return applyReplacements(code, replacements);
}

function createVirtualRuntimeModule(
  catalogs: Catalogs,
  runtimeFile: string,
): string {
  return [
    `import { installVoicevoxI18nRuntime, createRuntime } from ${escapeJsString(runtimeFile)};`,
    `const catalogs = ${JSON.stringify(catalogs)};`,
    `const runtime = createRuntime(catalogs);`,
    `globalThis.__VOICEVOX_I18N__ = runtime;`,
    ``,
    `export function installVoicevoxI18n(app) {`,
    `  installVoicevoxI18nRuntime(app, runtime);`,
    `}`,
    ``,
  ].join("\n");
}

function injectRuntimePlugin(code: string): string {
  const marker = "createApp(App)";
  const index = code.indexOf(marker);

  if (index < 0) {
    throw new Error(
      "voicevox-i18n: failed to find the application's createApp(App) call",
    );
  }

  const before = code.slice(0, index);
  const after = code.slice(index + marker.length);

  return (
    `import { installVoicevoxI18n } from "${VIRTUAL_RUNTIME_PUBLIC_ID}";\n` +
    before +
    `${marker}.use(installVoicevoxI18n)` +
    after
  );
}

export function voicevoxI18n(): Plugin {
  const projectRoot = process.cwd();
  const localesRoot = path.join(projectRoot, "tools/i18n/locales");

  let catalogs: Catalogs = {
    "ja-JP": {},
    "en-US": {},
    "zh-CN": {},
    "zh-TW": {},
  };

  return {
    name: "voicevox-i18n",
    enforce: "pre",

    configResolved() {
      catalogs = loadCatalogs(localesRoot);
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
        const runtimeFile = toPosixPath(
          path.join(projectRoot, "tools/i18n/runtime.ts"),
        );
        return createVirtualRuntimeModule(catalogs, runtimeFile);
      }
      return undefined;
    },

    transform(code, id) {
      const cleanId = stripQuery(id);
      const relativeId = toPosixPath(path.relative(projectRoot, cleanId));

      if (cleanId.endsWith(".vue") && !relativeId.includes("node_modules/")) {
        return rewriteVue(code, cleanId, projectRoot, catalogs);
      }

      const shouldRewriteTs =
        /\.(?:ts|tsx)$/u.test(cleanId) &&
        relativeId.startsWith("src/") &&
        !relativeId.includes("node_modules/") &&
        !/\.d\.ts$/u.test(cleanId) &&
        (relativeId.startsWith("src/components/Dialog/") ||
          relativeId.startsWith("src/components/Menu/") ||
          relativeId === "src/store/project/index.ts" ||
          relativeId === "src/store/project/saveProjectHelper.ts" ||
          relativeId === "src/store/ui.ts" ||
          relativeId === "src/store/setting.ts" ||
          relativeId === "src/store/audio.ts" ||
          relativeId === "src/store/audioGenerate.ts" ||
          relativeId === "src/store/singing.ts" ||
          relativeId === "src/welcome/store/index.ts");

      if (shouldRewriteTs) {
        return rewriteTypeScript(code, cleanId, projectRoot, catalogs);
      }

      if (
        relativeId === "src/main.ts" ||
        relativeId === "src/welcome/main.ts"
      ) {
        return {
          code: injectRuntimePlugin(code),
          map: null,
        };
      }

      return undefined;
    },
  };
}
