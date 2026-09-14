import fs from "node:fs";
import path from "node:path";
import { parse as parseSfc } from "@vue/compiler-sfc";
import {
  baseParse,
  type ElementNode,
  type InterpolationNode,
  type RootNode,
  type TextNode,
} from "@vue/compiler-dom";
import ts from "typescript";

const JAPANESE_RE = /[ぁ-ゖァ-ヺ一-龯]/u;

export type MessageCandidate = {
  scope: string;
  key: string;
  kind: "vue-text" | "vue-attribute" | "vue-template" | "ts-string" | "ts-template";
};

export const normalizeKey = (source: string): string =>
  source.trim().replace(/\s+/gu, " ");

function scopeFromFile(file: string, projectRoot: string): string {
  return path
    .relative(path.join(projectRoot, "src"), file)
    .replaceAll(path.sep, "/");
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
): { source: string; hasJapaneseText: boolean } {
  const quasis: string[] = [];
  const expressions: string[] = [];

  for (const node of nodes) {
    if (node.type === 2) {
      quasis.push(node.content);
    } else {
      expressions.push(getInterpolationSource(node, templateContent));
      quasis.push("");
    }
  }

  let source = quasis[0] ?? "";
  for (let i = 0; i < expressions.length; i += 1) {
    source += `{${i}}${quasis[i + 1] ?? ""}`;
  }

  return {
    source,
    hasJapaneseText: nodes.some(
      (node) => node.type === 2 && JAPANESE_RE.test(node.content),
    ),
  };
}

function extractVue(file: string, projectRoot: string): MessageCandidate[] {
  const code = fs.readFileSync(file, "utf-8");
  const parsed = parseSfc(code, { filename: file });
  const scope = scopeFromFile(file, projectRoot);
  const result: MessageCandidate[] = [];

  const template = parsed.descriptor.template;
  if (template) {
    const ast: RootNode = baseParse(template.content);

    const visit = (node: ElementNode): void => {
      for (const prop of node.props) {
        if (
          prop.type === 6 &&
          ["label", "title", "placeholder", "aria-label", "alt", "description"].includes(
            prop.name,
          ) &&
          prop.value?.content &&
          JAPANESE_RE.test(prop.value.content)
        ) {
          result.push({
            scope,
            key: normalizeKey(prop.value.content),
            kind: "vue-attribute",
          });
        }
      }

      const children = node.children;

      for (let i = 0; i < children.length; i += 1) {
        const child = children[i];

        if (child.type === 2 || child.type === 5) {
          const run: (TextNode | InterpolationNode)[] = [];
          let j = i;

          while (
            j < children.length &&
            (children[j].type === 2 || children[j].type === 5)
          ) {
            run.push(children[j] as TextNode | InterpolationNode);
            j += 1;
          }

          const hasInterpolation = run.some((node) => node.type === 5);
          const { source, hasJapaneseText } = collectVueTextRun(
            run,
            template.content,
          );

          if (hasInterpolation) {
            if (hasJapaneseText) {
              result.push({
                scope,
                key: normalizeKey(source),
                kind: "vue-template",
              });
            }
          } else {
            const text = run[0];
            if (
              text?.type === 2 &&
              text.content.trim() &&
              JAPANESE_RE.test(text.content)
            ) {
              result.push({
                scope,
                key: normalizeKey(text.content),
                kind: "vue-text",
              });
            }
          }

          i = j - 1;
          continue;
        }

        if (child.type === 1) {
          visit(child);
        }
      }
    };

    for (const child of ast.children) {
      if (child.type === 1) {
        visit(child);
      }
    }
  }

  for (const script of parsed.descriptor.script ? [parsed.descriptor.script] : []) {
    result.push(...extractTsCode(script.content, scope));
  }

  for (const script of parsed.descriptor.scriptSetup ? [parsed.descriptor.scriptSetup] : []) {
    result.push(...extractTsCode(script.content, scope));
  }

  return result;
}

function extractTsCode(
  code: string,
  scope: string,
): MessageCandidate[] {
  const sourceFile = ts.createSourceFile(
    scope,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const result: MessageCandidate[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isTemplateExpression(node)) {
      const quasis = [
        node.head.text,
        ...node.templateSpans.map((span) => span.literal.text),
      ];

      if (quasis.some((value) => JAPANESE_RE.test(value))) {
        let key = quasis[0] ?? "";
        for (let i = 0; i < node.templateSpans.length; i += 1) {
          key += `{${i}}${quasis[i + 1] ?? ""}`;
        }

        result.push({
          scope,
          key: normalizeKey(key),
          kind: "ts-template",
        });
      }

      ts.forEachChild(node, visit);
      return;
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (JAPANESE_RE.test(node.text)) {
        result.push({
          scope,
          key: normalizeKey(node.text),
          kind: "ts-string",
        });
      }
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return result;
}

function extractTs(file: string, projectRoot: string): MessageCandidate[] {
  const code = fs.readFileSync(file, "utf-8");
  const scope = scopeFromFile(file, projectRoot);
  return extractTsCode(code, scope);
}

export function extractCandidates(projectRoot = process.cwd()): MessageCandidate[] {
  const root = path.join(projectRoot, "src");
  const result: MessageCandidate[] = [];

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(file);
      } else if (entry.name.endsWith(".vue")) {
        result.push(...extractVue(file, projectRoot));
      } else if (entry.name.endsWith(".ts")) {
        result.push(...extractTs(file, projectRoot));
      }
    }
  };

  walk(root);
  return result;
}

if (process.argv[1]?.endsWith("extract.ts")) {
  const projectRoot = process.argv[2] ?? process.cwd();
  const output =
    process.argv[3] ??
    path.join(projectRoot, "tools/i18n/extracted-candidates.json");

  fs.writeFileSync(
    output,
    JSON.stringify(extractCandidates(projectRoot), null, 2) + "\n",
    "utf-8",
  );

  console.log(`Extracted candidates to ${output}`);
}
