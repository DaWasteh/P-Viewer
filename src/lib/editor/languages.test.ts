import { describe, expect, it } from "vitest";
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

  it("uses maintained aliases for common web-adjacent formats", async () => {
    await expect(loadLanguageForFile("settings.jsonc")).resolves.not.toBeNull();
    await expect(loadLanguageForFile("README.mdx")).resolves.not.toBeNull();
    await expect(loadLanguageForFile(".env")).resolves.not.toBeNull();
  });

  it("keeps the plaintext fallback for unknown extensions", async () => {
    await expect(loadLanguageForFile("notes.unknown-format")).resolves.toBeNull();
  });
});
