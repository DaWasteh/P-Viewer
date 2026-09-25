import { describe, expect, it } from "vitest";
import associations from "./associations.json";
import fileIcons from "./file-icons.json";
import generatedHooks from "../../../src-tauri/windows/file-associations.nsh?raw";
import { associationEntries, renderNsisHooks, verifyNsisHooks } from "../../../scripts/nsis-hooks.mjs";

const hooks = renderNsisHooks(associations, fileIcons);
const extensions = associations.flatMap((group) => group.extensions);

describe("Windows installer hooks (issue #7)", () => {
  it("are generated from associations.json and pass their own checks", () => {
    expect(generatedHooks.replace(/\r\n/g, "\n")).toBe(hooks);
    expect(verifyNsisHooks(hooks, associations, fileIcons)).toEqual([]);
    expect(associationEntries(associations, fileIcons)).toHaveLength(extensions.length);
  });

  it("write usable, quoted open commands", () => {
    expect(hooks).not.toContain('$"');
    const commands = hooks.split("\n").filter((line) => /\\command" ""/.test(line));
    // ProgID, Applications\<exe> and the context menu verb.
    expect(commands).toHaveLength(3);
    for (const line of commands) expect(line.trimEnd().endsWith('"$\\"$INSTDIR\\${MAINBINARYNAME}.exe$\\" $\\"%1$\\""')).toBe(true);
  });

  it("add a context menu verb for every supported extension and remove it again", () => {
    for (const extension of extensions) {
      expect(hooks).toContain(`!insertmacro PVIEWER_REGISTER_CONTEXT_MENU "${extension}"\n`);
      expect(hooks).toContain(`!insertmacro PVIEWER_UNREGISTER_CONTEXT_MENU "${extension}"\n`);
    }
    expect(hooks).toContain('"Software\\Classes\\SystemFileAssociations\\.${EXT}\\shell\\PViewer" "" "Mit P-Viewer öffnen"');
    expect(hooks).not.toMatch(/Software\\Classes\\\*\\/);
  });

  it("keep the registration when an installer replaces the current version", () => {
    const uninstall = hooks.slice(hooks.indexOf("!macro NSIS_HOOK_PREUNINSTALL"));
    const guard = uninstall.indexOf("${AndIf} $EXEDIR != $INSTDIR");
    expect(uninstall.indexOf("${If} $UpdateMode <> 1")).toBeLessThan(guard);
    expect(guard).toBeLessThan(uninstall.indexOf("PVIEWER_UNREGISTER_"));
    expect(uninstall.indexOf("${EndIf}")).toBeGreaterThan(uninstall.lastIndexOf("SHChangeNotify"));
  });

  it("reject broken variants", () => {
    const problems = (text: string) => verifyNsisHooks(text, associations, fileIcons).join("\n");
    const brokenQuote = hooks.replace('"$\\"$INSTDIR\\${MAINBINARYNAME}.exe$\\" $\\"%1$\\""', `'$"$INSTDIR\\\${MAINBINARYNAME}.exe$" $"%1$"'`);
    expect(problems(brokenQuote)).toContain('$" statt');
    expect(problems(hooks.replace('  !insertmacro PVIEWER_REGISTER_CONTEXT_MENU "md"\n', ""))).toContain("PVIEWER_REGISTER_CONTEXT_MENU fehlt");
    expect(problems(hooks.replace('  !insertmacro PVIEWER_UNREGISTER_CONTEXT_MENU "pdf"\n', ""))).toContain("nicht symmetrisch");
    expect(problems(hooks.replace('  !insertmacro PVIEWER_UNREGISTER_PROGID "PViewer.Markdown"\n', ""))).toContain("nicht symmetrisch");
    const withDefault = hooks.replace("!macroend\n\n!macro PVIEWER_UNREGISTER_EXTENSION", '  WriteRegStr SHCTX "Software\\Classes\\.${EXT}" "" "${PROGID}"\n!macroend\n\n!macro PVIEWER_UNREGISTER_EXTENSION');
    expect(problems(withDefault)).toContain("Standardzuordnung");
    const withUserChoice = hooks.replace("  !pragma warning pop\n!macroend\n\n; An installer", '  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.md\\UserChoice"\n  !pragma warning pop\n!macroend\n\n; An installer');
    expect(problems(withUserChoice)).toContain("UserChoice");
    expect(problems(hooks.replace("  ${AndIf} $EXEDIR != $INSTDIR\n", ""))).toContain("Neuinstallationen");
    expect(problems(hooks.replace('SystemFileAssociations\\.${EXT}\\shell\\PViewer"', '*\\shell\\PViewer"'))).toContain("alle Dateien");
  });
});
