// Compiles the generated Windows installer hooks with makensis and runs them
// against HKCU under test-only names (`.pvhooktest*`, `P-Viewer-HookTest`):
// exact registry values after install, idempotent reinstall, kept registration
// for updates and in-place reinstalls, and a complete but foreign-data-preserving
// uninstall (issue #7). Windows only; `npm run test:installer-hooks`.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderNsisHooks } from "./nsis-hooks.mjs";

if (process.platform !== "win32") {
  console.log("Installer-Hook-Test übersprungen: nur unter Windows ausführbar.");
  process.exit(0);
}

const OPTIONS = { appKey: "P-Viewer-HookTest", verbKey: "PViewerHookTest", verbLabel: "Mit P-Viewer öffnen" };
const BINARY = "pviewer-hooktest";
const PRODUCT = "P-Viewer Hook Test";
const DESCRIPTION = 'Prüf-Dokument "A" & $B';
const GROUPS = [
  { id: "hooktest", progId: "PViewerHookTest.Doc", description: DESCRIPTION, extensions: ["pvhooktesta", "pvhooktestb"] },
];
const ICONS = { extensions: { pvhooktesta: "md", pvhooktestb: "json" } };
const PROG_IDS = { pvhooktesta: "PViewerHookTest.Doc", pvhooktestb: "PViewer.File.pvhooktestb" };

const CLASSES = "Software\\Classes";
const KEYS = [
  `${CLASSES}\\.pvhooktesta`,
  `${CLASSES}\\.pvhooktestb`,
  `${CLASSES}\\PViewerHookTest.Doc`,
  `${CLASSES}\\PViewer.File.pvhooktestb`,
  `${CLASSES}\\Applications\\${BINARY}.exe`,
  `${CLASSES}\\SystemFileAssociations\\.pvhooktesta`,
  `${CLASSES}\\SystemFileAssociations\\.pvhooktestb`,
  `Software\\${OPTIONS.appKey}`,
  "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.pvhooktesta",
  "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.pvhooktestb",
];

const SNAPSHOT_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$result = [ordered]@{}
function Add-Key([Microsoft.Win32.RegistryKey]$key, [string]$path) {
  $values = [ordered]@{}
  foreach ($name in ($key.GetValueNames() | Sort-Object)) {
    $label = if ($name -eq '') { '(default)' } else { $name }
    $values[$label] = [string]$key.GetValue($name, $null, 'DoNotExpandEnvironmentNames')
  }
  $result[$path] = $values
  foreach ($sub in ($key.GetSubKeyNames() | Sort-Object)) {
    $child = $key.OpenSubKey($sub)
    try { Add-Key $child "$path\\$sub" } finally { $child.Close() }
  }
}
foreach ($root in ($env:PVIEWER_HOOKTEST_KEYS | ConvertFrom-Json)) {
  $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($root)
  if ($key) { try { Add-Key $key $root } finally { $key.Close() } }
}
$registered = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\RegisteredApplications')
$result['RegisteredApplications'] = [ordered]@{ value = if ($registered) { [string]$registered.GetValue('${OPTIONS.appKey}') } else { '' } }
$result | ConvertTo-Json -Depth 4 -Compress
`;

const TEST_SCRIPT = `﻿Unicode true
!include LogicLib.nsh
!define MAINBINARYNAME "${BINARY}"
!define PRODUCTNAME "${PRODUCT}"
Var UpdateMode
!include "hooks.nsh"
OutFile "hooktest.exe"
RequestExecutionLevel user
SilentInstall silent
Name "hooktest"

Function HookInstall
  !insertmacro NSIS_HOOK_POSTINSTALL
FunctionEnd

Function HookUninstall
  !insertmacro NSIS_HOOK_PREUNINSTALL
FunctionEnd

Section
  SetShellVarContext current
  ReadEnvStr $0 PVIEWER_HOOKTEST_MODE
  ReadEnvStr $INSTDIR PVIEWER_HOOKTEST_DIR
  StrCpy $UpdateMode 0
  \${If} $0 == "install"
    Call HookInstall
  \${Else}
    \${If} $0 == "uninstall-update"
      StrCpy $UpdateMode 1
    \${ElseIf} $0 == "uninstall-inplace"
      ; Like Tauri's reinstall page: the uninstaller runs in place with _?=.
      StrCpy $INSTDIR $EXEDIR
    \${EndIf}
    Call HookUninstall
  \${EndIf}
SectionEnd
`;

function findMakensis() {
  const candidates = [
    process.env.MAKENSIS,
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "tauri", "NSIS", "makensis.exe"),
    process.env["ProgramFiles(x86)"] && join(process.env["ProgramFiles(x86)"], "NSIS", "makensis.exe"),
    process.env.ProgramFiles && join(process.env.ProgramFiles, "NSIS", "makensis.exe"),
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) return found;
  if (spawnSync("makensis", ["/VERSION"]).status === 0) return "makensis";
  throw new Error("makensis wurde nicht gefunden (MAKENSIS setzen oder NSIS installieren).");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  return result;
}

function reg(...args) {
  return run("reg.exe", args);
}

function removeTestKeys() {
  for (const key of KEYS) reg("delete", `HKCU\\${key}`, "/f");
  reg("delete", "HKCU\\Software\\RegisteredApplications", "/v", OPTIONS.appKey, "/f");
}

function snapshot(workDir) {
  const script = join(workDir, "snapshot.ps1");
  writeFileSync(script, SNAPSHOT_SCRIPT);
  const result = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], {
    env: { ...process.env, PVIEWER_HOOKTEST_KEYS: JSON.stringify(KEYS) },
  });
  if (result.status !== 0) throw new Error(`Registry-Snapshot fehlgeschlagen: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

const failures = [];
function expectEqual(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${label}: erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}`);
  }
}
function value(state, key, name = "(default)") {
  return state[key]?.[name];
}

const workDir = mkdtempSync(join(tmpdir(), "pviewer-hooktest-"));
// A space in the install path checks the quoting of every command.
const installDir = join(workDir, "Program Files", PRODUCT);
const command = `"${installDir}\\${BINARY}.exe" "%1"`;
const appIcon = `${installDir}\\${BINARY}.exe,0`;

function hooks(mode) {
  const result = run(join(workDir, "hooktest.exe"), [], {
    cwd: workDir,
    env: { ...process.env, PVIEWER_HOOKTEST_MODE: mode, PVIEWER_HOOKTEST_DIR: installDir },
  });
  if (result.status !== 0) throw new Error(`Hook-Lauf ${mode} endete mit ${result.status}.`);
}

try {
  writeFileSync(join(workDir, "hooks.nsh"), renderNsisHooks(GROUPS, ICONS, OPTIONS));
  writeFileSync(join(workDir, "hooktest.nsi"), TEST_SCRIPT);
  const makensis = findMakensis();
  const compiled = run(makensis, ["/V2", "/WX", "hooktest.nsi"], { cwd: workDir });
  if (compiled.status !== 0) throw new Error(`makensis ist fehlgeschlagen:\n${compiled.stdout}\n${compiled.stderr}`);

  removeTestKeys();
  // Foreign registrations that must survive install and uninstall untouched.
  reg("add", `HKCU\\${CLASSES}\\.pvhooktesta`, "/ve", "/d", "Foreign.Handler", "/f");
  reg("add", `HKCU\\${CLASSES}\\.pvhooktesta\\OpenWithProgids`, "/v", "Foreign.Handler", "/d", "", "/f");
  reg("add", `HKCU\\${CLASSES}\\SystemFileAssociations\\.pvhooktesta`, "/v", "PerceivedType", "/d", "text", "/f");
  reg("add", `HKCU\\${CLASSES}\\SystemFileAssociations\\.pvhooktesta\\shell\\Foreign.Verb\\command`, "/ve", "/d", "foreign.exe %1", "/f");
  const before = snapshot(workDir);

  hooks("install");
  const installed = snapshot(workDir);
  for (const [extension, progId] of Object.entries(PROG_IDS)) {
    const icon = ICONS.extensions[extension];
    expectEqual(`${progId} Beschreibung`, value(installed, `${CLASSES}\\${progId}`), DESCRIPTION);
    expectEqual(`${progId} Symbol`, value(installed, `${CLASSES}\\${progId}\\DefaultIcon`), `${installDir}\\assets\\file-icons\\${icon}.ico`);
    expectEqual(`${progId} Öffnen-Befehl`, value(installed, `${CLASSES}\\${progId}\\shell\\open\\command`), command);
    expectEqual(`.${extension} OpenWithProgids`, value(installed, `${CLASSES}\\.${extension}\\OpenWithProgids`, progId), "");
    expectEqual(`.${extension} SupportedTypes`, value(installed, `${CLASSES}\\Applications\\${BINARY}.exe\\SupportedTypes`, `.${extension}`), "");
    expectEqual(`.${extension} Capabilities`, value(installed, `Software\\${OPTIONS.appKey}\\Capabilities\\FileAssociations`, `.${extension}`), progId);
    const verb = `${CLASSES}\\SystemFileAssociations\\.${extension}\\shell\\${OPTIONS.verbKey}`;
    expectEqual(`.${extension} Kontextmenü`, value(installed, verb), "Mit P-Viewer öffnen");
    expectEqual(`.${extension} Kontextmenü-Symbol`, value(installed, verb, "Icon"), appIcon);
    expectEqual(`.${extension} Kontextmenü-Befehl`, value(installed, `${verb}\\command`), command);
  }
  expectEqual("Applications Name", value(installed, `${CLASSES}\\Applications\\${BINARY}.exe`, "FriendlyAppName"), PRODUCT);
  expectEqual("Applications Symbol", value(installed, `${CLASSES}\\Applications\\${BINARY}.exe\\DefaultIcon`), appIcon);
  expectEqual("Applications Öffnen-Befehl", value(installed, `${CLASSES}\\Applications\\${BINARY}.exe\\shell\\open\\command`), command);
  expectEqual("RegisteredApplications", installed.RegisteredApplications.value, `Software\\${OPTIONS.appKey}\\Capabilities`);
  expectEqual("Fremde Standardzuordnung bleibt", value(installed, `${CLASSES}\\.pvhooktesta`), "Foreign.Handler");
  expectEqual("Keine neue Standardzuordnung", value(installed, `${CLASSES}\\.pvhooktestb`), undefined);
  expectEqual("Fremdes OpenWithProgids bleibt", value(installed, `${CLASSES}\\.pvhooktesta\\OpenWithProgids`, "Foreign.Handler"), "");
  expectEqual("Fremdes Kontextmenü bleibt", value(installed, `${CLASSES}\\SystemFileAssociations\\.pvhooktesta\\shell\\Foreign.Verb\\command`), "foreign.exe %1");
  for (const extension of Object.keys(PROG_IDS)) {
    const fileExts = `Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.${extension}`;
    expectEqual(`.${extension} FileExts/UserChoice unverändert`, JSON.stringify(installed[fileExts]), JSON.stringify(before[fileExts]));
  }

  hooks("install");
  expectEqual("Erneute Installation ist idempotent", snapshot(workDir), installed);
  hooks("uninstall-update");
  expectEqual("Update-Deinstallation behält die Registrierung", snapshot(workDir), installed);
  hooks("uninstall-inplace");
  expectEqual("Deinstallation beim Drüberinstallieren behält die Registrierung", snapshot(workDir), installed);

  hooks("uninstall");
  const removed = snapshot(workDir);
  for (const key of [
    `${CLASSES}\\PViewerHookTest.Doc`,
    `${CLASSES}\\PViewer.File.pvhooktestb`,
    `${CLASSES}\\Applications\\${BINARY}.exe`,
    `${CLASSES}\\SystemFileAssociations\\.pvhooktesta\\shell\\${OPTIONS.verbKey}`,
    `${CLASSES}\\SystemFileAssociations\\.pvhooktestb`,
    `${CLASSES}\\.pvhooktestb\\OpenWithProgids`,
    `Software\\${OPTIONS.appKey}`,
  ]) {
    expectEqual(`${key} entfernt`, removed[key], undefined);
  }
  expectEqual("RegisteredApplications entfernt", removed.RegisteredApplications.value, "");
  expectEqual("P-Viewer aus OpenWithProgids entfernt", value(removed, `${CLASSES}\\.pvhooktesta\\OpenWithProgids`, PROG_IDS.pvhooktesta), undefined);
  for (const key of Object.keys(before)) {
    if (key === "RegisteredApplications") continue;
    for (const [name, data] of Object.entries(before[key])) {
      expectEqual(`Fremder Wert ${key}\\${name} bleibt`, value(removed, key, name), data);
    }
  }
} finally {
  removeTestKeys();
  rmSync(workDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`Installer-Hook-Test fehlgeschlagen (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Installer-Hooks: Registrierung, Kontextmenü, Updates und Deinstallation in der Registry geprüft.");
