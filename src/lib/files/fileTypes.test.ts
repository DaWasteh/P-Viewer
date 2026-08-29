import { describe, expect, it } from "vitest";
import {
  countLines,
  countWords,
  detectFileType,
  extensionOf,
  fileNameFromPath,
} from "./fileTypes";

describe("file type detection", () => {
  it("handles Windows and POSIX paths", () => {
    expect(fileNameFromPath("C:\\Paper\\draft.tex")).toBe("draft.tex");
    expect(fileNameFromPath("/home/user/notes.md")).toBe("notes.md");
  });

  it("recognizes document and code formats", () => {
    expect(detectFileType("paper.tex")).toMatchObject({ kind: "latex", language: "stex" });
    expect(detectFileType("README.md")).toMatchObject({ kind: "markdown" });
    expect(detectFileType("data.json")).toMatchObject({ kind: "json" });
    expect(detectFileType("script.py")).toMatchObject({ kind: "code", language: "python" });
    expect(detectFileType("run.bat")).toMatchObject({ kind: "code", language: "batch" });
    expect(detectFileType("index.html")).toMatchObject({ kind: "html", language: "html" });
    expect(detectFileType("legacy.HTM")).toMatchObject({ kind: "html", language: "html" });
    expect(detectFileType("page.xhtml")).toMatchObject({ kind: "html", language: "html" });
    expect(detectFileType("Card.ASTRO")).toMatchObject({ kind: "code", language: "astro" });
    expect(detectFileType("Widget.svelte")).toMatchObject({ kind: "code", language: "svelte" });
  });

  it("falls back to plain text for unknown extensions", () => {
    expect(detectFileType("research.custom-format")).toMatchObject({
      kind: "text",
      language: "plaintext",
    });
    expect(extensionOf(".gitignore")).toBe("");
  });
});

describe("document counters", () => {
  it("counts mixed line endings", () => {
    expect(countLines("a\r\nb\nc\r")).toBe(4);
  });

  it("counts Unicode words", () => {
    expect(countWords("Übermäßig gute Forschung – 2026")).toBe(4);
  });
});
