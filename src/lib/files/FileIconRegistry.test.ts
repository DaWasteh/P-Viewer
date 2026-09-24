import { describe, expect, it } from "vitest";

const previews = new Set(Object.keys(import.meta.glob("/static/file-icons/*.png")).map((path) => path.split("/").pop()));
const icons = new Set(Object.keys(import.meta.glob("/src-tauri/assets/file-icons/*.ico")).map((path) => path.split("/").pop()));
import registry from "./file-icons.json";
import associations from "./associations.json";
import { fileIconName, fileIconUrl } from "./FileIconRegistry";

describe("file type icons", () => {
  it("uses the delivered icon of an extension", () => {
    expect(fileIconName("README.txt")).toBe("txt");
    expect(fileIconName("C:\\Projekte\\main.py")).toBe("py");
    expect(fileIconName("app.js")).toBe("js");
    expect(fileIconName("config.json")).toBe("json");
    expect(fileIconName("index.html")).toBe("html");
    expect(fileIconName("style.css")).toBe("css");
    expect(fileIconName("dokument.pdf")).toBe("pdf");
    expect(fileIconName("bild.PNG")).toBe("png");
    expect(fileIconName("notes.markdown")).toBe("markdown");
  });

  it("prefers exact file names over the extension", () => {
    expect(fileIconName("requirements.txt")).toBe("py");
    expect(fileIconName("notes.txt")).toBe("txt");
    expect(fileIconName("Cargo.toml")).toBe("rs");
    expect(fileIconName("tsconfig.json")).toBe("ts");
    expect(fileIconName("README")).toBe("md");
    expect(fileIconName("Dockerfile.dev")).toBe(fileIconName("Dockerfile"));
    expect(fileIconName(".env.local")).toBe("env");
  });

  it("falls back to the format group and the category", () => {
    expect(fileIconName("paper.tex")).toBe("conf");
    expect(fileIconName("fix.patch")).toBe("conf");
    expect(fileIconName("unknown.zzz")).toBe("txt");
    expect(fileIconName("Unbenannt.txt")).toBe("txt");
  });

  it("covers every supported extension with an existing preview", () => {
    const supported = associations.flatMap((group) => group.extensions);
    expect(Object.keys(registry.extensions).sort()).toEqual([...supported].sort());
    for (const icon of new Set([...Object.values(registry.extensions), ...Object.values(registry.fileNames), ...Object.values(registry.categories)])) {
      expect(previews.has(`${icon}.png`), icon).toBe(true);
      expect(icons.has(`${icon}.ico`), icon).toBe(true);
    }
  });

  it("builds app-relative preview URLs", () => {
    expect(fileIconUrl("a.md")).toBe("/file-icons/md.png");
    expect(fileIconUrl("a.md", "/base")).toBe("/base/file-icons/md.png");
  });
});
