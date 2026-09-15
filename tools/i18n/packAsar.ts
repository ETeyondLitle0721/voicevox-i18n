import { createPackage } from "@electron/asar";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const distDir = path.join(root, "dist");
const packageJson = path.join(root, "package.json");
const output = path.join(root, "test6", "app.asar");

async function main() {
  const stageDir = await mkdtemp(path.join(os.tmpdir(), "voicevox-i18n-asar-"));
  try {
    await cp(distDir, path.join(stageDir, "dist"), { recursive: true });
    await cp(packageJson, path.join(stageDir, "package.json"));
    await rm(path.dirname(output), { recursive: true, force: true });
    await mkdir(path.dirname(output), { recursive: true });

    // 改用原生 JavaScript API 替代子进程
    await createPackage(stageDir, output);

    console.log(`Created ${output}`);
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }
}

await main();