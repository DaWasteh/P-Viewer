import { readdir, readFile, writeFile } from "node:fs/promises";
import { renderNsisHooks, verifyNsisHooks } from "./nsis-hooks.mjs";

const root = new URL("../", import.meta.url);
const associationsUrl = new URL("src/lib/files/associations.json", root);
const fileIconsUrl = new URL("src/lib/files/file-icons.json", root);
const iconDirectoryUrl = new URL("src-tauri/assets/file-icons/", root);
const fileTypesUrl = new URL("src/lib/files/fileTypes.ts", root);
const tauriConfigUrl = new URL("src-tauri/tauri.conf.json", root);
const windowsConfigUrl = new URL("src-tauri/tauri.windows.conf.json", root);
const nsisHooksUrl = new URL("src-tauri/windows/file-associations.nsh", root);
const checkOnly = process.argv.includes("--check");

/** Installed next to the EXE; DefaultIcon values point into this folder. */
const ICON_RESOURCE = "assets/file-icons/*";

const associations = JSON.parse(await readFile(associationsUrl, "utf8"));
const fileIcons = JSON.parse(await readFile(fileIconsUrl, "utf8"));
const iconFiles = new Set(await readdir(iconDirectoryUrl).catch(() => []));
const fileTypesSource = await readFile(fileTypesUrl, "utf8");
const tauriConfig = JSON.parse(await readFile(tauriConfigUrl, "utf8"));
const windowsConfig = JSON.parse(await readFile(windowsConfigUrl, "utf8"));

validateAssociations(associations, fileTypesSource);
validateIcons(associations, fileIcons, iconFiles);

tauriConfig.bundle.fileAssociations = associations.map((association) => ({
  ext: association.extensions,
  name: association.progId,
  description: association.description,
  role: "Editor",
  mimeType: association.mimeType,
  rank: "Alternate",
  contentTypes: association.contentTypes,
}));
// Tauri's generic Windows association macro temporarily takes ownership of each
// extension and can restore an obsolete fallback during uninstall. Windows uses
// candidate-only NSIS hooks below; Linux and macOS keep the shared bundle metadata.
windowsConfig.bundle.fileAssociations = [];
// Only Windows installs the file type icons (Explorer DefaultIcon targets).
windowsConfig.bundle.resources = [...(tauriConfig.bundle.resources ?? []), ICON_RESOURCE];

const expectedConfig = `${JSON.stringify(tauriConfig, null, 2)}\n`;
const expectedWindowsConfig = `${JSON.stringify(windowsConfig, null, 2)}\n`;
const expectedHooks = renderNsisHooks(associations, fileIcons);
const hookProblems = verifyNsisHooks(expectedHooks, associations, fileIcons);
if (hookProblems.length > 0) {
  console.error("Die generierten Windows-Installer-Hooks sind fehlerhaft:");
  for (const problem of hookProblems) console.error(`- ${problem}`);
  process.exit(1);
}

if (checkOnly) {
  const [actualConfig, actualWindowsConfig, actualHooks] = await Promise.all([
    readFile(tauriConfigUrl, "utf8"),
    readFile(windowsConfigUrl, "utf8"),
    readFile(nsisHooksUrl, "utf8").catch(() => ""),
  ]);
  const drift = [];
  if (actualConfig !== expectedConfig) drift.push("src-tauri/tauri.conf.json");
  if (actualWindowsConfig !== expectedWindowsConfig) {
    drift.push("src-tauri/tauri.windows.conf.json");
  }
  if (actualHooks !== expectedHooks) drift.push("src-tauri/windows/file-associations.nsh");
  if (drift.length > 0) {
    console.error(`Dateizuordnungen sind nicht synchron: ${drift.join(", ")}`);
    console.error("Bitte `npm run sync:associations` ausführen.");
    process.exit(1);
  }
  const extensionCount = associations.reduce((sum, group) => sum + group.extensions.length, 0);
  console.log(
    `${associations.length} Dateiformatgruppen sind mit Tauri und dem Windows-Installer synchron; ` +
      `${extensionCount} Dateiendungen mit ProgID, „Öffnen mit“ und Kontextmenü geprüft.`,
  );
} else {
  await Promise.all([
    writeFile(tauriConfigUrl, expectedConfig),
    writeFile(windowsConfigUrl, expectedWindowsConfig),
    writeFile(nsisHooksUrl, expectedHooks),
  ]);
  console.log(
    `${associations.length} Dateiformatgruppen in Tauri-Konfiguration und Windows-Installer übernommen.`,
  );
}

function validateIcons(groups, registry, files) {
  for (const group of groups) {
    for (const extension of group.extensions) {
      const icon = registry.extensions?.[extension];
      if (!icon) throw new Error(`Kein Dateityp-Symbol für .${extension}; bitte \`npm run sync:icons\` ausführen.`);
      if (!files.has(`${icon}.ico`)) throw new Error(`src-tauri/assets/file-icons/${icon}.ico fehlt.`);
      if (!/^[a-z0-9][a-z0-9+-]*$/.test(icon)) throw new Error(`Ungültiger Symbolname: ${icon}`);
    }
  }
}

function validateAssociations(groups, source) {
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error("associations.json muss mindestens eine Formatgruppe enthalten.");
  }

  const typeBlock = source.match(
    /const TYPES:[\s\S]*?= \{([\s\S]*?)\n\};\n\nconst SPECIAL_NAMES/,
  )?.[1];
  if (!typeBlock) throw new Error("Unterstützte Dateiendungen konnten nicht gelesen werden.");

  // Keys with hyphens (`"code-workspace"`) are quoted in the TypeScript source.
  const supported = [
    ...typeBlock.matchAll(/^\s{2}"?([a-z0-9][\w-]*)"?:/gm),
  ].map((match) => match[1]);
  const ids = new Set();
  const progIds = new Set();
  const extensions = new Set();

  for (const group of groups) {
    if (!/^[a-z][a-z0-9-]*$/.test(group.id) || ids.has(group.id)) {
      throw new Error(`Ungültige oder doppelte Zuordnungs-ID: ${group.id}`);
    }
    if (!/^PViewer\.[A-Za-z0-9]+$/.test(group.progId) || progIds.has(group.progId)) {
      throw new Error(`Ungültige oder doppelte Windows-ProgID: ${group.progId}`);
    }
    if (typeof group.label !== "string" || group.label.trim() === "") {
      throw new Error(`Formatgruppe ${group.id} enthält keine Bezeichnung.`);
    }
    if (typeof group.description !== "string" || group.description.trim() === "") {
      throw new Error(`Formatgruppe ${group.id} enthält keine Beschreibung.`);
    }
    if (!Array.isArray(group.extensions) || group.extensions.length === 0) {
      throw new Error(`Formatgruppe ${group.id} enthält keine Dateiendung.`);
    }
    if (typeof group.mimeType !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(group.mimeType)) {
      throw new Error(`Formatgruppe ${group.id} enthält keinen gültigen MIME-Typ.`);
    }
    if (
      !Array.isArray(group.contentTypes) ||
      group.contentTypes.length === 0 ||
      group.contentTypes.some(
        (contentType) => typeof contentType !== "string" || !/^[A-Za-z0-9.-]+$/.test(contentType),
      )
    ) {
      throw new Error(`Formatgruppe ${group.id} enthält keinen gültigen macOS-Inhaltstyp.`);
    }
    ids.add(group.id);
    progIds.add(group.progId);
    for (const extension of group.extensions) {
      if (!/^[a-z0-9][a-z0-9+-]*$/.test(extension) || extensions.has(extension)) {
        throw new Error(`Ungültige oder doppelte Dateiendung: ${extension}`);
      }
      extensions.add(extension);
    }
  }

  const missing = supported.filter((extension) => !extensions.has(extension));
  const unexpected = [...extensions].filter((extension) => !supported.includes(extension));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Abdeckung der Dateiendungen stimmt nicht (fehlend: ${missing.join(", ") || "keine"}; ` +
        `unerwartet: ${unexpected.join(", ") || "keine"}).`,
    );
  }
}

