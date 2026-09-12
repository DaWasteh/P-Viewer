import { describe, expect, it } from "vitest";
import {
  SUPPORTED_BINARY_EXTENSIONS,
  SUPPORTED_FILE_EXTENSIONS,
  SUPPORTED_FILE_TYPE_CHOICES,
  SUPPORTED_TEXT_EXTENSIONS,
  isBinaryKind,
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

  it("recognizes the formats added in v0.1.3", () => {
    expect(detectFileType("main.tf")).toMatchObject({ kind: "code", language: "hcl" });
    expect(detectFileType("flake.nix")).toMatchObject({ kind: "code", language: "nix" });
    expect(detectFileType("demo.code-workspace")).toMatchObject({ kind: "json" });
    expect(detectFileType("bundle.js.map")).toMatchObject({ kind: "json", label: "Source Map" });
    expect(detectFileType("cpu.v")).toMatchObject({ kind: "code", language: "verilog" });
    expect(detectFileType("kernel.cu")).toMatchObject({ kind: "code", language: "cuda" });
    expect(detectFileType("app.csproj")).toMatchObject({ kind: "code", language: "xml" });
    expect(detectFileType("units.tab")).toMatchObject({ kind: "csv" });
    expect(detectFileType("cert.pem")).toMatchObject({ kind: "text" });
    expect(detectFileType("Dockerfile.prod")).toMatchObject({ kind: "code", language: "dockerfile" });
    expect(detectFileType("app.Dockerfile")).toMatchObject({ kind: "code", language: "dockerfile" });
    expect(detectFileType("go.mod")).toMatchObject({ kind: "code", language: "gomod" });
    expect(detectFileType("BUILD.bazel")).toMatchObject({ kind: "code", language: "starlark" });
    expect(detectFileType(".vimrc")).toMatchObject({ kind: "code", language: "vim" });
    expect(detectFileType("nginx.conf")).toMatchObject({ kind: "code", language: "nginx" });
    expect(detectFileType("poetry.lock")).toMatchObject({ kind: "code", language: "toml" });
    expect(fileTypeChoiceIdFor("Dockerfile.dev")).toBe("name:dockerfile");
  });

  it("treats images and PDF as read-only binary kinds that cannot be chosen as a target type", () => {
    expect(detectFileType("photo.JPG")).toMatchObject({ kind: "image", language: "binary" });
    expect(detectFileType("icon.ico")).toMatchObject({ kind: "image" });
    expect(detectFileType("paper.pdf")).toMatchObject({ kind: "pdf", language: "binary" });
    expect(isBinaryKind("image")).toBe(true);
    expect(isBinaryKind("pdf")).toBe(true);
    expect(isBinaryKind("svg")).toBe(false);
    expect(SUPPORTED_BINARY_EXTENSIONS).toEqual(
      expect.arrayContaining(["png", "apng", "jpg", "jpeg", "jfif", "gif", "webp", "bmp", "ico", "avif", "pdf"]),
    );
    expect(SUPPORTED_TEXT_EXTENSIONS).not.toContain("png");
    expect(SUPPORTED_TEXT_EXTENSIONS.length + SUPPORTED_BINARY_EXTENSIONS.length).toBe(SUPPORTED_FILE_EXTENSIONS.length);
    expect(SUPPORTED_FILE_TYPE_CHOICES.some((choice) => choice.extension === "png" || choice.extension === "pdf")).toBe(false);
  });

  it("falls back to plain text for unknown extensions", () => {
    expect(detectFileType("research.custom-format")).toMatchObject({
      kind: "text",
      language: "plaintext",
    });
    expect(extensionOf(".gitignore")).toBe("");
  });

  it("offers every supported text extension and special file name", () => {
    const extensionChoices = SUPPORTED_FILE_TYPE_CHOICES.filter(
      (choice) => choice.extension,
    );
    expect(extensionChoices.map((choice) => choice.extension)).toEqual(
      expect.arrayContaining([...SUPPORTED_TEXT_EXTENSIONS]),
    );
    expect(new Set(extensionChoices.map((choice) => choice.extension)).size).toBe(
      SUPPORTED_TEXT_EXTENSIONS.length,
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
