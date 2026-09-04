import { describe, expect, it } from "vitest";
import {
  SUPPORTED_FILE_EXTENSIONS,
  SUPPORTED_FILE_TYPE_CHOICES,
  countLines,
  countWords,
  detectFileType,
  extensionOf,
  fileNameForFileTypeChoice,
  fileNameFromPath,
  fileNameWithExtension,
  fileTypeChoiceIdFor,
  normalizeCustomExtension,
} from "./fileTypes";

describe("file type detection", () => {
  it("handles Windows and POSIX paths", () => {
    expect(fileNameFromPath("C:\\Paper\\draft.tex")).toBe("draft.tex");
    expect(fileNameFromPath("/home/user/notes.md")).toBe("notes.md");
  });

  it("recognizes document and code formats", () => {
    expect(detectFileType("paper.tex")).toMatchObject({ kind: "latex", language: "stex" });
    expect(detectFileType("README.md")).toMatchObject({ kind: "markdown" });
    expect(detectFileType("report.Rmd")).toMatchObject({ kind: "markdown" });
    expect(detectFileType("data.json")).toMatchObject({ kind: "json" });
    expect(detectFileType("map.geojson")).toMatchObject({ kind: "json" });
    expect(detectFileType("analysis.ipynb")).toMatchObject({ kind: "notebook" });
    expect(detectFileType("table.csv")).toMatchObject({ kind: "csv", language: "csv" });
    expect(detectFileType("table.TSV")).toMatchObject({ kind: "csv" });
    expect(detectFileType("logo.svg")).toMatchObject({ kind: "svg", language: "xml" });
    expect(detectFileType("script.py")).toMatchObject({ kind: "code", language: "python" });
    expect(detectFileType("run.bat")).toMatchObject({ kind: "code", language: "batch" });
    expect(detectFileType("index.html")).toMatchObject({ kind: "html", language: "html" });
    expect(detectFileType("legacy.HTM")).toMatchObject({ kind: "html", language: "html" });
    expect(detectFileType("page.xhtml")).toMatchObject({ kind: "html", language: "html" });
    expect(detectFileType("Card.ASTRO")).toMatchObject({ kind: "code", language: "astro" });
    expect(detectFileType("Widget.svelte")).toMatchObject({ kind: "code", language: "svelte" });
    expect(detectFileType("main.hs")).toMatchObject({ kind: "code", language: "haskell" });
    expect(detectFileType("schema.graphql")).toMatchObject({ kind: "code", language: "graphql" });
    expect(detectFileType("app.dockerfile")).toMatchObject({ kind: "code", language: "dockerfile" });
    expect(detectFileType("notes.rst")).toMatchObject({ kind: "text" });
  });

  it("recognizes special file names case-insensitively", () => {
    expect(detectFileType("Dockerfile")).toMatchObject({ kind: "code", language: "dockerfile" });
    expect(detectFileType("makefile")).toMatchObject({ kind: "code", language: "makefile" });
    expect(detectFileType("/repo/CMakeLists.txt")).toMatchObject({ kind: "code", language: "cmake" });
    expect(detectFileType(".gitignore")).toMatchObject({ kind: "code", language: "ignore" });
    expect(detectFileType(".env")).toMatchObject({ kind: "code", language: "properties" });
    expect(detectFileType(".env.production")).toMatchObject({ kind: "code", language: "properties" });
    expect(detectFileType("LICENSE")).toMatchObject({ kind: "text" });
    expect(fileTypeChoiceIdFor(".env.local")).toBe("name:.env");
  });

  it("falls back to plain text for unknown extensions", () => {
    expect(detectFileType("research.custom-format")).toMatchObject({
      kind: "text",
      language: "plaintext",
    });
    expect(extensionOf(".gitignore")).toBe("");
  });

  it("offers every supported extension and special file name", () => {
    const extensionChoices = SUPPORTED_FILE_TYPE_CHOICES.filter(
      (choice) => choice.extension,
    );
    expect(extensionChoices.map((choice) => choice.extension)).toEqual(
      expect.arrayContaining([...SUPPORTED_FILE_EXTENSIONS]),
    );
    expect(new Set(extensionChoices.map((choice) => choice.extension)).size).toBe(
      SUPPORTED_FILE_EXTENSIONS.length,
    );

    for (const choice of SUPPORTED_FILE_TYPE_CHOICES) {
      const fileName = fileNameForFileTypeChoice("Unbenannt.txt", choice);
      expect(detectFileType(fileName), choice.label).toEqual(choice.fileType);
      expect(fileTypeChoiceIdFor(fileName), choice.label).toBe(choice.id);
    }
  });

  it("replaces known and custom extensions safely", () => {
    expect(fileNameWithExtension("Unbenannt.txt", "md")).toBe("Unbenannt.md");
    expect(fileNameWithExtension("archive.backup.txt", ".notes")).toBe(
      "archive.backup.notes",
    );
    expect(normalizeCustomExtension("  .Eigene_Endung  ")).toBe("eigene_endung");
    expect(fileTypeChoiceIdFor("draft.eigene_endung")).toBe(
      "custom:eigene_endung",
    );
    expect(() => fileNameWithExtension("notes.txt", "../md")).toThrow(
      "Ungültige Dateiendung",
    );
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
