import fs from "node:fs";
import path from "node:path";
import { parse as parseSfc } from "@vue/compiler-sfc";
import { baseParse } from "@vue/compiler-dom";
import ts from "typescript";

const JP = /[ぁ-ゖァ-ヺ一-龯]/u;

export type MessageCandidate = {
  scope: string;
  key: string;
  kind: "vue-text" | "vue-attribute" | "ts-string" | "ts-template";
};

const normalizeKey = (source: string): string =>
  source.trim().replace(/\s+/gu, " ");

function extractVue(file: string, projectRoot: string): MessageCandidate[] {
  const code = fs.readFileSync(file, "utf-8");
  const parsed = parseSfc(code, { filename: file });
  const template = parsed.descriptor.template;
  if (!template) return [];

  const ast = baseParse(template.content);
  const scope = path.relative(path.join(projectRoot, "src"), file).replaceAll(path.sep, "/");
  const result: MessageCandidate[] = [];

  const visit = (node: any): void => {
    if (node.type !== 1) return;

    for (const prop of node.props ?? []) {
      if (
        prop.type === 6 &&
        ["label", "title", "placeholder", "aria-label", "alt"].includes(prop.name) &&
        prop.value?.content &&
        JP.test(prop.value.content)
      ) {
        result.push({
          scope,
          key: normalizeKey(prop.value.content),
          kind: "vue-attribute",
        });
      }
    }

    for (const child of node.children ?? []) {
      if (child.type === 2 && child.content.trim() && JP.test(child.content)) {
        result.push({
          scope,
          key: normalizeKey(child.content),
          kind: "vue-text",
        });
      }
      if (child.type === 1) visit(child);
    }
  };

  for (const child of ast.children ?? []) visit(child);
  return result;
}

function extractTs(file: string, projectRoot: string): MessageCandidate[] {
  const code = fs.readFileSync(file, "utf-8");
  const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const scope = path.relative(path.join(projectRoot, "src"), file).replaceAll(path.sep, "/");
  const result: MessageCandidate[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isTemplateExpression(node)) {
      const quasis = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      if (quasis.some((value) => JP.test(value))) {
        let key = quasis[0] ?? "";
        for (let i = 0; i < node.templateSpans.length; i += 1) {
          key += `{${i}}${quasis[i + 1] ?? ""}`;
        }
        result.push({ scope, key: normalizeKey(key), kind: "ts-template" });
      }
      return;
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (JP.test(node.text)) {
        result.push({ scope, key: normalizeKey(node.text), kind: "ts-string" });
      }
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return result;
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
  const output = process.argv[3] ?? path.join(projectRoot, "tools/i18n/extracted-candidates.json");
  fs.writeFileSync(output, JSON.stringify(extractCandidates(projectRoot), null, 2) + "\n", "utf-8");
  console.log(`Extracted candidates to ${output}`);
}
