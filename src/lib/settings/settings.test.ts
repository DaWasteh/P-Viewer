import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  nativeThemeFor,
  normalizeExtension,
  preferredViewMode,
  normalizeSettings,
  resetSettings,
} from "./settings";

describe("settings normalization", () => {
  it("uses dark mode defaults", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.theme).toBe("dark");
  });

  it("keeps valid preferences", () => {
    expect(
      normalizeSettings({
        theme: "light",
        editorFontSize: 18,
        previewFontSize: 20,
        iconSize: 22,
        wordWrap: false,
        spellcheck: false,
        debugMode: true,
        defaultAppAssociations: ["markdown", "json"],
      }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      theme: "light",
      editorFontSize: 18,
      previewFontSize: 20,
      iconSize: 22,
      wordWrap: false,
      spellcheck: false,
      debugMode: true,
      defaultAppAssociations: ["markdown", "json"],
    });
  });

  it("clamps numeric values and rejects malformed fields", () => {
    expect(
      normalizeSettings({
        theme: "neon",
        editorFontSize: 100,
        previewFontSize: 2,
        iconSize: Number.NaN,
        wordWrap: "yes",
      }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      editorFontSize: 28,
      previewFontSize: 12,
    });
  });

  it("returns a mutable reset copy", () => {
    const reset = resetSettings();
    reset.editorFontSize = 20;
    reset.defaultAppAssociations.pop();
    reset.extensionViewModes.md = "split";
    expect(DEFAULT_SETTINGS.extensionViewModes).toEqual({});
    expect(DEFAULT_SETTINGS.editorFontSize).toBe(14);
    expect(reset.defaultAppAssociations).toHaveLength(
      DEFAULT_SETTINGS.defaultAppAssociations.length - 1,
    );
  });

  it("migrates old settings and rejects invalid modes without losing existing preferences", () => {
    const settings = normalizeSettings({ theme: "light", defaultViewMode: "invalid", extensionViewModes: { md: "invalid", txt: "view", pdf: "edit" } });
    expect(settings.theme).toBe("light");
    expect(settings.defaultViewMode).toBe("edit");
    expect(settings.extensionViewModes).toEqual({ txt: "view", pdf: "edit" });
    expect(normalizeSettings({ extensionViewModes: [] }).extensionViewModes).toEqual({});
  });

  it("normalizes extensions and prefers the longest case-insensitive filename suffix", () => {
    const settings = normalizeSettings({ defaultViewMode: "view", extensionViewModes: { " .MD ": "split", ts: "view", "D.TS": "edit", env: "edit", "../txt": "split", "a/b": "edit" } });
    expect(settings.extensionViewModes).toEqual({ md: "split", ts: "view", "d.ts": "edit", env: "edit" });
    expect(preferredViewMode(settings, "C:\\notes\\README.MD")).toBe("split");
    expect(preferredViewMode(settings, "/docs/types.d.ts")).toBe("edit");
    expect(preferredViewMode(settings, "/docs/.env")).toBe("edit");
    for (const name of ["README", "file.txt", "/folder.md/file", "file.toString", "file.__proto__"]) {
      expect(preferredViewMode(settings, name)).toBe("view");
    }
    for (const invalid of ["", ".", "*.md", "md,txt", "md txt", "a".repeat(65), "__proto__"]) {
      expect(normalizeExtension(invalid)).toBeNull();
    }
  });

  it("releases native theme control for the system preference", () => {
    expect(nativeThemeFor("system")).toBeNull();
    expect(nativeThemeFor("dark")).toBe("dark");
    expect(nativeThemeFor("light")).toBe("light");
  });
});
