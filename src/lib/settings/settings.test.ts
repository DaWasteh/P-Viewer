import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
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
      }),
    ).toEqual({
      theme: "light",
      editorFontSize: 18,
      previewFontSize: 20,
      iconSize: 22,
      wordWrap: false,
      spellcheck: false,
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
    expect(DEFAULT_SETTINGS.editorFontSize).toBe(14);
  });
});
