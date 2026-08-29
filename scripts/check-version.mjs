import { readFile } from "node:fs/promises";

const rootPackage = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const lockfile = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const tauriConfig = JSON.parse(
  await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);
const cargoManifest = await readFile(
  new URL("../src-tauri/Cargo.toml", import.meta.url),
  "utf8",
);
const cargoVersion = cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

const versions = new Map([
  ["package.json", rootPackage.version],
  ["package-lock.json", lockfile.version],
  ["package-lock root package", lockfile.packages?.[""]?.version],
  ["src-tauri/tauri.conf.json", tauriConfig.version],
  ["src-tauri/Cargo.toml", cargoVersion],
]);
const expected = rootPackage.version;
const mismatches = [...versions].filter(([, version]) => version !== expected);

if (mismatches.length > 0) {
  console.error(`Version mismatch; expected ${expected}:`);
  for (const [file, version] of mismatches) console.error(`- ${file}: ${version ?? "missing"}`);
  process.exit(1);
}

const tag = process.argv[2];
if (tag && tag !== `v${expected}`) {
  console.error(`Release tag ${tag} does not match package version v${expected}.`);
  process.exit(1);
}

console.log(`PandaViewer version metadata is synchronized at v${expected}.`);
