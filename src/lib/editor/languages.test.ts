import { describe, expect, it } from "vitest";
import { SUPPORTED_FILE_EXTENSIONS, SUPPORTED_FILE_TYPE_CHOICES, detectFileType, isBinaryKind } from "$lib/files/fileTypes";
import { loadLanguageForFile } from "./languages";

const astroFixture = `---
import Layout from "../layouts/Layout.astro";
const title: string = "Hello";
---
<Layout client:load>
  <h1>{title}</h1>
  <script lang="ts">const count: number = 1;</script>
  <style>h1 { color: red; }</style>
</Layout>`;

// Formats that intentionally stay plain text in the editor.
const PLAINTEXT_EXTENSIONS = new Set([
  "txt",
  "text",
  "log",
  "rst",
  "adoc",
  "asciidoc",
  "org",
  "srt",
  "vtt",
]);

describe("lazy editor language loading", () => {
  it("loads dedicated Astro mixed-language support", async () => {
    const support = await loadLanguageForFile("Card.ASTRO");
    expect(support).not.toBeNull();

    const tree = support!.language.parser.parse(astroFixture).toString();
    expect(tree).toContain("ComponentName");
    expect(tree).toContain("Script");
    expect(tree).toContain("StyleSheet");

    expect(() =>
      support!.language.parser.parse(`---\nconst value = { nested: true };\n<div>{value && <span>{value.nested}</span>}`),
    ).not.toThrow();
  });

  it("loads dedicated Svelte support", async () => {
    const support = await loadLanguageForFile("Widget.svelte");
    expect(support).not.toBeNull();

    const tree = support!.language.parser
      .parse('<script lang="ts">let count: number = 1</script><h1>{count}</h1>')
      .toString();
    expect(tree).toContain("Interpolation");
    expect(tree).toContain("TypeAnnotation");
  });

  it("loads every advertised web-source format", async () => {
    for (const fileName of [
      "index.html",
      "legacy.htm",
      "page.xhtml",
      "styles.css",
      "styles.scss",
      "styles.sass",
      "styles.less",
      "Component.vue",
      "Widget.svelte",
      "feed.xml",
      "icon.svg",
    ]) {
      await expect(loadLanguageForFile(fileName), fileName).resolves.not.toBeNull();
    }
  });

  it("provides highlighting for every supported non-plaintext extension", async () => {
    for (const extension of SUPPORTED_FILE_EXTENSIONS) {
      const fileName = `sample.${extension}`;
      const fileType = detectFileType(fileName);
      if (isBinaryKind(fileType.kind)) continue;
      if (fileType.kind === "text") {
        expect(fileType.language, fileName).toBe("plaintext");
        await expect(loadLanguageForFile(fileName), fileName).resolves.toBeNull();
        continue;
      }
      expect(PLAINTEXT_EXTENSIONS.has(extension), fileName).toBe(false);
      const support = await loadLanguageForFile(fileName);
      expect(support, fileName).not.toBeNull();
      expect(fileType.language, fileName).not.toBe("plaintext");
    }
  });

  it("provides highlighting for every special file name that is not plain text", async () => {
    for (const choice of SUPPORTED_FILE_TYPE_CHOICES) {
      if (!choice.fileName) continue;
      const support = await loadLanguageForFile(choice.fileName);
      if (choice.fileType.kind === "text" || choice.fileType.language === "gomod") {
        expect(support, choice.fileName).toBeNull();
      } else {
        expect(support, choice.fileName).not.toBeNull();
      }
    }
    // Legacy stream modes from language-data carry no name; lezer/custom modes do.
    await expect(loadLanguageForFile("Dockerfile.prod")).resolves.not.toBeNull();
    await expect(loadLanguageForFile("nginx.conf")).resolves.not.toBeNull();
    expect((await loadLanguageForFile("BUILD.bazel"))?.language.name).toBe("python");
    expect((await loadLanguageForFile(".vimrc"))?.language.name).toBe("vim");
    await expect(loadLanguageForFile("go.mod")).resolves.toBeNull();
  });

  it("uses maintained aliases for common web-adjacent formats", async () => {
    await expect(loadLanguageForFile("settings.jsonc")).resolves.not.toBeNull();
    await expect(loadLanguageForFile("README.mdx")).resolves.not.toBeNull();
    await expect(loadLanguageForFile(".env")).resolves.not.toBeNull();
    await expect(loadLanguageForFile(".env.local")).resolves.not.toBeNull();
    await expect(loadLanguageForFile(".editorconfig")).resolves.not.toBeNull();
    await expect(loadLanguageForFile("gemfile")).resolves.not.toBeNull();
    await expect(loadLanguageForFile("Makefile")).resolves.not.toBeNull();
    await expect(loadLanguageForFile("CMakeLists.txt")).resolves.not.toBeNull();
  });

  it("does not misclassify plain text or configuration files", async () => {
    const config = await loadLanguageForFile("app.cfg");
    expect(config?.language.name).toBe("properties");
    await expect(loadLanguageForFile("notes.text")).resolves.toBeNull();
    await expect(loadLanguageForFile("notes.txt")).resolves.toBeNull();
  });

  it("tokenizes bundled custom modes", async () => {
    const batch = await loadLanguageForFile("build.bat");
    expect(batch?.language.name).toBe("batch");
    const makefile = await loadLanguageForFile("Makefile");
    expect(makefile?.language.name).toBe("makefile");
    const graphql = await loadLanguageForFile("schema.graphql");
    expect(graphql?.language.name).toBe("graphql");
    const elixir = await loadLanguageForFile("app.ex");
    expect(elixir?.language.name).toBe("elixir");
    const bibtex = await loadLanguageForFile("refs.bib");
    expect(bibtex?.language.name).toBe("bibtex");
    const csv = await loadLanguageForFile("data.csv");
    expect(csv?.language.name).toBe("csv");
    const hcl = await loadLanguageForFile("main.tf");
    expect(hcl?.language.name).toBe("hcl");
    const nix = await loadLanguageForFile("flake.nix");
    expect(nix?.language.name).toBe("nix");
    const vim = await loadLanguageForFile("plugins.vim");
    expect(vim?.language.name).toBe("vim");

    for (const [support, source] of [
      [hcl, 'resource "aws_s3_bucket" "b" {\n  bucket = "x" # c\n  tags = { Name = var.name }\n  policy = <<-EOT\n  {}\n  EOT\n}\n/* block */\n'],
      [nix, "{ pkgs ? import <nixpkgs> {} }:\nlet x = ''\n  multi ''' line\n''; in rec { inherit x; y = ./path; z = \"s\\\"q\"; }\n"],
      [vim, '" comment\nset number\nlet g:mapleader = " "\nnnoremap <leader>w :w<CR>\nfunction! Fn(a)\n  return a:a . \'x\'\nendfunction\n'],
      [batch, "@echo off\nREM comment\nset NAME=%1\nif exist \"%NAME%\" goto :done\n:done\n"],
      [makefile, ".PHONY: all\nall: main.o\n\t$(CC) -o app main.o # link\n"],
      [graphql, 'query Q($id: ID!) { user(id: $id) { name @include(if: true) } }\n"""doc"""\n'],
      [elixir, 'defmodule App do\n  @moduledoc "x"\n  def run(:ok), do: IO.puts("hi")\nend\n'],
      [bibtex, "@article{key,\n  title = {T},\n  year = 2024\n}\n"],
      [csv, 'a,b\n1,"x,y"\n'],
    ] as const) {
      expect(() => support!.language.parser.parse(source)).not.toThrow();
    }
  });

  it("keeps the plaintext fallback for unknown extensions", async () => {
    await expect(loadLanguageForFile("notes.unknown-format")).resolves.toBeNull();
  });
});
