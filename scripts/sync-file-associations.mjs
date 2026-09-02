import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const associationsUrl = new URL("src/lib/files/associations.json", root);
const fileTypesUrl = new URL("src/lib/files/fileTypes.ts", root);
const tauriConfigUrl = new URL("src-tauri/tauri.conf.json", root);
const windowsConfigUrl = new URL("src-tauri/tauri.windows.conf.json", root);
const nsisHooksUrl = new URL("src-tauri/windows/file-associations.nsh", root);
const checkOnly = process.argv.includes("--check");

const associations = JSON.parse(await readFile(associationsUrl, "utf8"));
const fileTypesSource = await readFile(fileTypesUrl, "utf8");
const tauriConfig = JSON.parse(await readFile(tauriConfigUrl, "utf8"));
const windowsConfig = JSON.parse(await readFile(windowsConfigUrl, "utf8"));

validateAssociations(associations, fileTypesSource);

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

const expectedConfig = `${JSON.stringify(tauriConfig, null, 2)}\n`;
const expectedWindowsConfig = `${JSON.stringify(windowsConfig, null, 2)}\n`;
const expectedHooks = renderNsisHooks(associations);

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
  console.log(
    `${associations.length} Dateiformatgruppen sind mit Tauri und dem Windows-Installer synchron.`,
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

function validateAssociations(groups, source) {
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error("associations.json muss mindestens eine Formatgruppe enthalten.");
  }

  const typeBlock = source.match(
    /const TYPES:[\s\S]*?= \{([\s\S]*?)\n\};\n\nconst SPECIAL_NAMES/,
  )?.[1];
  if (!typeBlock) throw new Error("Unterstützte Dateiendungen konnten nicht gelesen werden.");

  const supported = [
    ...typeBlock.matchAll(/^\s{2}([a-zA-Z][\w]*):/gm),
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

function renderNsisHooks(groups) {
  const registerProgIdLines = groups.map(
    (group) =>
      `  !insertmacro PVIEWER_REGISTER_PROGID "${group.progId}" "${escapeNsis(group.description)}"`,
  );
  const registerExtensionLines = groups.flatMap((group) =>
    group.extensions.map(
      (extension) =>
        `  !insertmacro PVIEWER_REGISTER_EXTENSION "${extension}" "${group.progId}"`,
    ),
  );
  const unregisterExtensionLines = groups.flatMap((group) =>
    group.extensions.map(
      (extension) =>
        `  !insertmacro PVIEWER_UNREGISTER_EXTENSION "${extension}" "${group.progId}"`,
    ),
  );
  const unregisterProgIdLines = [...groups].reverse().map(
    (group) => `  !insertmacro PVIEWER_UNREGISTER_PROGID "${group.progId}"`,
  );

  return `; Generated by scripts/sync-file-associations.mjs. Do not edit manually.\n` +
    `; Candidate-only registration: never writes an extension default or UserChoice.\n` +
    `; Windows keeps the user's current default until it is confirmed in Settings.\n\n` +
    `!macro PVIEWER_REGISTER_PROGID PROGID DESCRIPTION\n` +
    `  WriteRegStr SHCTX "Software\\Classes\\\${PROGID}" "" "\${DESCRIPTION}"\n` +
    `  WriteRegStr SHCTX "Software\\Classes\\\${PROGID}\\DefaultIcon" "" "$INSTDIR\\\${MAINBINARYNAME}.exe,0"\n` +
    `  WriteRegStr SHCTX "Software\\Classes\\\${PROGID}\\shell\\open\\command" "" '$"$INSTDIR\\\${MAINBINARYNAME}.exe$" $"%1$"'\n` +
    `!macroend\n\n` +
    `!macro PVIEWER_UNREGISTER_PROGID PROGID\n` +
    `  DeleteRegKey SHCTX "Software\\Classes\\\${PROGID}"\n` +
    `!macroend\n\n` +
    `!macro PVIEWER_REGISTER_EXTENSION EXT PROGID\n` +
    `  DeleteRegValue SHCTX "Software\\Classes\\.\${EXT}" "\${PROGID}_backup"\n` +
    `  WriteRegStr SHCTX "Software\\Classes\\.\${EXT}\\OpenWithProgids" "\${PROGID}" ""\n` +
    `  WriteRegStr SHCTX "Software\\P-Viewer\\Capabilities\\FileAssociations" ".\${EXT}" "\${PROGID}"\n` +
    `  WriteRegStr SHCTX "Software\\Classes\\Applications\\\${MAINBINARYNAME}.exe\\SupportedTypes" ".\${EXT}" ""\n` +
    `!macroend\n\n` +
    `!macro PVIEWER_UNREGISTER_EXTENSION EXT PROGID\n` +
    `  DeleteRegValue SHCTX "Software\\Classes\\.\${EXT}\\OpenWithProgids" "\${PROGID}"\n` +
    `  DeleteRegKey /ifempty SHCTX "Software\\Classes\\.\${EXT}\\OpenWithProgids"\n` +
    `  DeleteRegValue SHCTX "Software\\Classes\\Applications\\\${MAINBINARYNAME}.exe\\SupportedTypes" ".\${EXT}"\n` +
    `!macroend\n\n` +
    `!macro NSIS_HOOK_POSTINSTALL\n` +
    `  WriteRegStr SHCTX "Software\\P-Viewer\\Capabilities" "ApplicationName" "\${PRODUCTNAME}"\n` +
    `  WriteRegStr SHCTX "Software\\P-Viewer\\Capabilities" "ApplicationDescription" "Schneller Editor und Dokumentbetrachter"\n` +
    `  WriteRegStr SHCTX "Software\\P-Viewer\\Capabilities" "ApplicationIcon" "$INSTDIR\\\${MAINBINARYNAME}.exe,0"\n` +
    `  WriteRegStr SHCTX "Software\\RegisteredApplications" "P-Viewer" "Software\\P-Viewer\\Capabilities"\n` +
    `  WriteRegStr SHCTX "Software\\Classes\\Applications\\\${MAINBINARYNAME}.exe" "FriendlyAppName" "\${PRODUCTNAME}"\n` +
    `  WriteRegStr SHCTX "Software\\Classes\\Applications\\\${MAINBINARYNAME}.exe\\DefaultIcon" "" "$INSTDIR\\\${MAINBINARYNAME}.exe,0"\n` +
    `  WriteRegStr SHCTX "Software\\Classes\\Applications\\\${MAINBINARYNAME}.exe\\shell\\open\\command" "" '$"$INSTDIR\\\${MAINBINARYNAME}.exe$" $"%1$"'\n` +
    `${registerProgIdLines.join("\n")}\n` +
    `${registerExtensionLines.join("\n")}\n` +
    `  System::Call "shell32::SHChangeNotify(i,i,i,i) (0x08000000, 0x1000, 0, 0)"\n` +
    `!macroend\n\n` +
    `!macro NSIS_HOOK_PREUNINSTALL\n` +
    `${unregisterExtensionLines.join("\n")}\n` +
    `${unregisterProgIdLines.join("\n")}\n` +
    `  DeleteRegValue SHCTX "Software\\RegisteredApplications" "P-Viewer"\n` +
    `  DeleteRegKey SHCTX "Software\\P-Viewer\\Capabilities"\n` +
    `  DeleteRegKey /ifempty SHCTX "Software\\P-Viewer"\n` +
    `  DeleteRegKey SHCTX "Software\\Classes\\Applications\\\${MAINBINARYNAME}.exe"\n` +
    `  System::Call "shell32::SHChangeNotify(i,i,i,i) (0x08000000, 0x1000, 0, 0)"\n` +
    `!macroend\n`;
}

function escapeNsis(value) {
  return value
    .replace(/\$/g, () => "$$")
    .replace(/"/g, () => '$\\"')
    .replace(/[\r\n]+/g, " ");
}
