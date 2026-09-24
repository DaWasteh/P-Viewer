import { readdir, readFile, writeFile } from "node:fs/promises";

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
/** Group ProgIDs predate per-extension icons; they stay with the group's first extension. */
const EXTENSION_PROG_ID_PREFIX = "PViewer.File.";

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

export function progIdFor(group, extension) {
  return extension === group.extensions[0] ? group.progId : `${EXTENSION_PROG_ID_PREFIX}${extension}`;
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

function renderNsisHooks(groups, registry) {
  const entries = groups.flatMap((group) =>
    group.extensions.map((extension) => ({
      group,
      extension,
      progId: progIdFor(group, extension),
      icon: registry.extensions[extension],
    })),
  );
  const registerProgIdLines = entries.map(
    (entry) =>
      `  !insertmacro PVIEWER_REGISTER_PROGID "${entry.progId}" "${escapeNsis(entry.group.description)}" "${entry.icon}"`,
  );
  const registerExtensionLines = entries.map(
    (entry) =>
      `  !insertmacro PVIEWER_REGISTER_EXTENSION "${entry.extension}" "${entry.progId}" "${entry.group.progId}"`,
  );
  const unregisterExtensionLines = entries.map(
    (entry) =>
      `  !insertmacro PVIEWER_UNREGISTER_EXTENSION "${entry.extension}" "${entry.progId}" "${entry.group.progId}"`,
  );
  const unregisterProgIdLines = [...entries].reverse().map(
    (entry) => `  !insertmacro PVIEWER_UNREGISTER_PROGID "${entry.progId}"`,
  );

  return `; Generated by scripts/sync-file-associations.mjs. Do not edit manually.\n` +
    `; Candidate-only registration: never writes an extension default or UserChoice.\n` +
    `; Windows keeps the user's current default until it is confirmed in Settings.\n` +
    `; Every extension has its own ProgID, so Explorer shows its file type icon\n` +
    `; from $INSTDIR\\assets\\file-icons (issue #3).\n\n` +
    `!macro PVIEWER_REGISTER_PROGID PROGID DESCRIPTION ICON\n` +
    `  WriteRegStr SHCTX "Software\\Classes\\\${PROGID}" "" "\${DESCRIPTION}"\n` +
    `  WriteRegStr SHCTX "Software\\Classes\\\${PROGID}\\DefaultIcon" "" "$INSTDIR\\assets\\file-icons\\\${ICON}.ico"\n` +
    `  WriteRegStr SHCTX "Software\\Classes\\\${PROGID}\\shell\\open\\command" "" '$"$INSTDIR\\\${MAINBINARYNAME}.exe$" $"%1$"'\n` +
    `!macroend\n\n` +
    `!macro PVIEWER_UNREGISTER_PROGID PROGID\n` +
    `  DeleteRegKey SHCTX "Software\\Classes\\\${PROGID}"\n` +
    `!macroend\n\n` +
    `!macro PVIEWER_REGISTER_EXTENSION EXT PROGID GROUPPROGID\n` +
    `  DeleteRegValue SHCTX "Software\\Classes\\.\${EXT}" "\${PROGID}_backup"\n` +
    `  ; Earlier versions offered the group ProgID for every extension of a group.\n` +
    `  StrCmp "\${PROGID}" "\${GROUPPROGID}" +2 0\n` +
    `  DeleteRegValue SHCTX "Software\\Classes\\.\${EXT}\\OpenWithProgids" "\${GROUPPROGID}"\n` +
    `  WriteRegStr SHCTX "Software\\Classes\\.\${EXT}\\OpenWithProgids" "\${PROGID}" ""\n` +
    `  WriteRegStr SHCTX "Software\\P-Viewer\\Capabilities\\FileAssociations" ".\${EXT}" "\${PROGID}"\n` +
    `  WriteRegStr SHCTX "Software\\Classes\\Applications\\\${MAINBINARYNAME}.exe\\SupportedTypes" ".\${EXT}" ""\n` +
    `!macroend\n\n` +
    `!macro PVIEWER_UNREGISTER_EXTENSION EXT PROGID GROUPPROGID\n` +
    `  DeleteRegValue SHCTX "Software\\Classes\\.\${EXT}\\OpenWithProgids" "\${PROGID}"\n` +
    `  DeleteRegValue SHCTX "Software\\Classes\\.\${EXT}\\OpenWithProgids" "\${GROUPPROGID}"\n` +
    `  DeleteRegKey /ifempty SHCTX "Software\\Classes\\.\${EXT}\\OpenWithProgids"\n` +
    `  DeleteRegValue SHCTX "Software\\Classes\\Applications\\\${MAINBINARYNAME}.exe\\SupportedTypes" ".\${EXT}"\n` +
    `!macroend\n\n` +
    `; Icons P-Viewer added to Windows-generated <ext>_auto_file classes are logged;\n` +
    `; only values that are still unchanged are removed again.\n` +
    `!macro PVIEWER_REMOVE_AUTO_FILE_ICONS\n` +
    `  Push $R0\n` +
    `  Push $R1\n` +
    `  Push $R2\n` +
    `  Push $R3\n` +
    `  StrCpy $R0 0\n` +
    `  pviewer_auto_file_loop:\n` +
    `    EnumRegValue $R1 HKCU "Software\\P-Viewer\\AutoFileIcons" $R0\n` +
    `    StrCmp $R1 "" pviewer_auto_file_done\n` +
    `    ReadRegStr $R2 HKCU "Software\\P-Viewer\\AutoFileIcons" $R1\n` +
    `    ReadRegStr $R3 HKCU "Software\\Classes\\$R1\\DefaultIcon" ""\n` +
    `    StrCmp $R2 $R3 0 +2\n` +
    `    DeleteRegKey HKCU "Software\\Classes\\$R1\\DefaultIcon"\n` +
    `    IntOp $R0 $R0 + 1\n` +
    `    Goto pviewer_auto_file_loop\n` +
    `  pviewer_auto_file_done:\n` +
    `  DeleteRegKey HKCU "Software\\P-Viewer\\AutoFileIcons"\n` +
    `  Pop $R3\n` +
    `  Pop $R2\n` +
    `  Pop $R1\n` +
    `  Pop $R0\n` +
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
    `  !insertmacro PVIEWER_REMOVE_AUTO_FILE_ICONS\n` +
    `  DeleteRegValue SHCTX "Software\\RegisteredApplications" "P-Viewer"\n` +
    `  DeleteRegKey SHCTX "Software\\P-Viewer\\Capabilities"\n` +
    `  DeleteRegKey /ifempty SHCTX "Software\\P-Viewer"\n` +
    `  DeleteRegKey /ifempty HKCU "Software\\P-Viewer"\n` +
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
