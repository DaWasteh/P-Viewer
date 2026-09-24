// Imports and verifies the Windows file type icons.
//
//   node scripts/file-icons.mjs import <folder>   add or replace `<extension>.ico` files
//   node scripts/file-icons.mjs                   regenerate previews and the registry
//   node scripts/file-icons.mjs --check           fail when anything is out of sync
//
// Icons are stored once per distinct content under src-tauri/assets/file-icons
// (installed next to the EXE on Windows); a 32 px PNG of each is placed under
// static/file-icons for tabs, the tab overflow menu and the settings preview.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRegistry,
  canonicalName,
  parseIco,
  previewPng,
  sha256,
  supportedKinds,
} from "./file-icon-registry.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const assetDir = join(root, "src-tauri", "assets", "file-icons");
const previewDir = join(root, "static", "file-icons");
const registryPath = join(root, "src", "lib", "files", "file-icons.json");
const associations = JSON.parse(await readFile(join(root, "src", "lib", "files", "associations.json"), "utf8"));
const kinds = supportedKinds(await readFile(join(root, "src", "lib", "files", "fileTypes.ts"), "utf8"));

const [command, argument] = process.argv.slice(2);
if (command === "import") {
  if (!argument) fail("Bitte den Ordner mit den ICO-Dateien angeben.");
  await importFolder(argument);
} else if (command === "--check") {
  await check();
} else if (command === undefined) {
  await regenerate(await storedSources());
} else {
  fail(`Unbekannter Befehl: ${command}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function storedSources() {
  try {
    return JSON.parse(await readFile(registryPath, "utf8")).sources ?? {};
  } catch {
    return {};
  }
}

async function icoFiles(folder) {
  const names = await readdir(folder).catch(() => []);
  return names.filter((name) => extname(name).toLowerCase() === ".ico").sort();
}

async function importFolder(folder) {
  const sources = await storedSources();
  // Content hash → stored name, including icons imported earlier.
  const stored = new Map();
  for (const file of await icoFiles(assetDir)) {
    stored.set(sha256(await readFile(join(assetDir, file))), basename(file, ".ico"));
  }

  const incoming = new Map();
  const skipped = [];
  for (const file of await icoFiles(folder)) {
    const extension = basename(file, extname(file)).toLowerCase();
    if (!kinds.has(extension)) {
      skipped.push(`${file} (keine unterstützte Dateiendung)`);
      continue;
    }
    const bytes = await readFile(join(folder, file));
    try {
      parseIco(bytes, file);
      previewPng(bytes, file);
    } catch (error) {
      skipped.push(`${file} (${error.message})`);
      continue;
    }
    const hash = sha256(bytes);
    const entry = incoming.get(hash) ?? { bytes, extensions: [] };
    entry.extensions.push(extension);
    incoming.set(hash, entry);
  }

  await mkdir(assetDir, { recursive: true });
  for (const [hash, { bytes, extensions }] of incoming) {
    let name = stored.get(hash);
    if (!name) {
      name = canonicalName(extensions);
      // Never overwrite a different stored icon that happens to share the name.
      if ([...stored.values()].includes(name)) name = `${name}-${hash.slice(0, 8)}`;
      await writeFile(join(assetDir, `${name}.ico`), bytes);
      stored.set(hash, name);
    }
    for (const extension of extensions) sources[extension] = name;
  }

  // Drop stored icons no extension refers to any more.
  const referenced = new Set(Object.values(sources));
  for (const name of stored.values()) {
    if (!referenced.has(name)) await rm(join(assetDir, `${name}.ico`));
  }

  await regenerate(sources);
  console.log(`${Object.keys(sources).length} Dateiendungen mit eigenem Icon, ${incoming.size} unterschiedliche Icons importiert.`);
  for (const entry of skipped) console.warn(`Übersprungen: ${entry}`);
}

async function expected(sources) {
  const available = new Map();
  for (const file of await icoFiles(assetDir)) {
    const name = basename(file, ".ico");
    const bytes = await readFile(join(assetDir, file));
    available.set(name, previewPng(bytes, file));
  }
  const registry = buildRegistry(sources, associations, kinds, new Set(available.keys()));
  return { registry, previews: available, text: `${JSON.stringify(registry, null, 2)}\n` };
}

async function regenerate(sources) {
  const { previews, text } = await expected(sources);
  await rm(previewDir, { recursive: true, force: true });
  await mkdir(previewDir, { recursive: true });
  for (const [name, png] of previews) await writeFile(join(previewDir, `${name}.png`), png);
  await writeFile(registryPath, text);
  console.log(`${previews.size} Dateityp-Icons und ihre Vorschaubilder sind aktuell.`);
}

async function check() {
  const sources = await storedSources();
  const { registry, previews, text } = await expected(sources);
  const problems = [];
  if ((await readFile(registryPath, "utf8").catch(() => "")) !== text) problems.push("src/lib/files/file-icons.json");
  const previewFiles = (await readdir(previewDir).catch(() => [])).filter((name) => name.endsWith(".png"));
  for (const [name, png] of previews) {
    const actual = await readFile(join(previewDir, `${name}.png`)).catch(() => null);
    if (!actual || !actual.equals(png)) problems.push(`static/file-icons/${name}.png`);
  }
  for (const file of previewFiles) {
    if (!previews.has(basename(file, ".png"))) problems.push(`static/file-icons/${file} (verwaist)`);
  }
  const referenced = new Set([
    ...Object.values(registry.extensions),
    ...Object.values(registry.fileNames),
    ...Object.values(registry.categories),
  ]);
  for (const name of previews.keys()) {
    if (!referenced.has(name)) problems.push(`src-tauri/assets/file-icons/${name}.ico (nicht verwendet)`);
  }
  if (problems.length > 0) {
    console.error(`Dateityp-Icons sind nicht synchron: ${problems.join(", ")}`);
    console.error("Bitte `npm run sync:icons` ausführen.");
    process.exit(1);
  }
  console.log(`${previews.size} Dateityp-Icons decken ${Object.keys(registry.extensions).length} Dateiendungen ab.`);
}
