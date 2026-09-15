import fs from "node:fs";
import path from "node:path";
import { extractCandidates, normalizeKey, type MessageCandidate } from "./extract";

type Locale = "en-US" | "zh-CN" | "zh-TW" | "zh-HK" | "ko-KR" | "vi-VN" | "th-TH";

const LOCALES: readonly Locale[] = [
  "en-US",
  "zh-CN",
  "zh-TW",
  "zh-HK",
  "ko-KR",
  "vi-VN",
  "th-TH",
];

function loadLocale(
  projectRoot: string,
  locale: Locale,
): Record<string, Record<string, string>> {
  const localeRoot = path.join(projectRoot, "tools/i18n/locales", locale);
  const catalog: Record<string, Record<string, string>> = {};

  const visit = (dir: string): void => {
    if (!fs.existsSync(dir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        visit(file);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

      const scope = path
        .relative(localeRoot, file)
        .replaceAll(path.sep, "/")
        .slice(0, -".json".length);

      const raw: unknown = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error(`Invalid locale catalog: ${file}`);
      }

      catalog[scope] = Object.fromEntries(
        Object.entries(raw as Record<string, unknown>).map(([key, value]) => {
          if (typeof value !== "string") {
            throw new Error(`Invalid translation in ${file}: "${key}"`);
          }
          return [normalizeKey(key), value];
        }),
      );
    }
  };

  visit(localeRoot);
  return catalog;
}

function main(): void {
  const projectRoot = process.argv[3] ?? process.cwd();
  const componentsOnly = process.argv.includes("--components-only");
  const strict = process.argv.includes("--strict");

  console.log(`Auditing i18n in ${projectRoot}`);

  const candidates = extractCandidates(projectRoot).filter((candidate) =>
    componentsOnly ? candidate.scope.startsWith("components/") : true,
  );

  const uniqueCandidates = new Map<string, MessageCandidate>();
  for (const candidate of candidates) {
    uniqueCandidates.set(
      `${candidate.scope}\u0000${candidate.key}`,
      candidate,
    );
  }

  let hasFailure = false;
  const summary: string[] = [];

  for (const locale of LOCALES) {
    const catalog = loadLocale(projectRoot, locale);
    const missing = [...uniqueCandidates.values()].filter(
      ({ scope, key }) => catalog[scope]?.[normalizeKey(key)] === undefined,
    );

    const stale: Array<{ scope: string; key: string }> = [];
    for (const [scope, entries] of Object.entries(catalog)) {
      for (const key of Object.keys(entries)) {
        if (!uniqueCandidates.has(`${scope}\u0000${normalizeKey(key)}`)) {
          stale.push({ scope, key });
        }
      }
    }

    const affectedScopes = new Set(missing.map(({ scope }) => scope)).size;
    const line =
      `${locale}: ${missing.length} missing keys in ${affectedScopes} scopes, ` +
      `${stale.length} stale keys`;
    summary.push(line);

    if (missing.length > 0) {
      hasFailure = true;
      for (const candidate of missing) {
        console.log(
          `[missing] ${locale} ${candidate.scope} :: ${candidate.key} (${candidate.kind})`,
        );
      }
    }

    for (const entry of stale) {
      console.log(`[stale] ${locale} ${entry.scope} :: ${entry.key}`);
    }
  }

  console.log(`\n${summary.join("\n")}`);

  if (strict && hasFailure) {
    process.exitCode = 1;
  }
}

main();
