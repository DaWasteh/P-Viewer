import { describe, expect, it } from "vitest";
import { extractMarkdownHeadings, renderMarkdown } from "./markdown";

describe("Markdown rendering", () => {
  it("renders GFM tasks, tables and KaTeX math", () => {
    const html = renderMarkdown(`
# Paper

- [x] reviewed

| A | B |
| - | - |
| 1 | 2 |

$E = mc^2$
`);

    expect(html).toContain('id="paper"');
    expect(html).toMatch(/<li class="task-list-item"[^>]*><input type="checkbox" checked disabled>/);
    expect(html).toMatch(/<table[ >]/);
    expect(html).toContain('class="katex"');
  });

  it("renders GitHub-style callout boxes", () => {
    const html = renderMarkdown("> [!WARNING]\n> Reproduzierbarkeit prüfen.");
    expect(html).toContain("<aside");
    expect(html).toContain("callout-warning");
    expect(html).toContain('data-callout="warning"');
    expect(html).not.toContain("[!WARNING]");
  });

  it("drops raw scripts and unsafe URL protocols", () => {
    const html = renderMarkdown(
      '<script>alert("x")</script>\n\n[unsafe](javascript:alert(1))',
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
  });

  it("links footnotes to matching ids with German labels", () => {
    const html = renderMarkdown("Text[^1]\n\n[^1]: Anmerkung");
    expect(html).toContain('href="#user-content-fn-1"');
    expect(html).toContain('id="user-content-fn-1"');
    expect(html).toContain('id="user-content-fnref-1"');
    expect(html).not.toContain("user-content-user-content");
    expect(html).toContain(">Fußnoten</h2>");
    expect(html).toContain('aria-label="Zurück zu Verweis 1"');
  });

  it("highlights common and additional fenced code languages without failing on unknown ones", () => {
    const html = renderMarkdown(
      "```dockerfile\nFROM node:22\n```\n\n```powershell\nGet-Process\n```\n\n```unknownlang\nx\n```\n\n```txt\nplain\n```",
    );
    expect(html).toContain('class="hljs language-dockerfile"');
    expect(html).toContain("hljs-keyword");
    expect(html).toContain('class="hljs language-powershell"');
    expect(html).toContain("language-unknownlang");
    expect(html).toContain("plain");
  });
});

describe("Markdown alignment and source lines", () => {
  it("renders aligned div wrappers with Markdown inside", () => {
    const html = renderMarkdown('<div align="center">\n\n**Hallo**\n\n</div>\n\nDanach');
    expect(html).toMatch(/<div align="center"[^>]*>\s*<p[^>]*><strong>Hallo<\/strong><\/p>\s*<\/div>/);
    expect(html).toMatch(/<p data-source-start="7"[^>]*>Danach<\/p>/);
    const compact = renderMarkdown('<p align="right">\nRechts *kursiv*\n</p>');
    expect(compact).toMatch(/<div align="right"[^>]*>\s*<p[^>]*>Rechts <em>kursiv<\/em><\/p>\s*<\/div>/);
    expect(compact).toContain('data-source-start="2"');
  });

  it("keeps all other raw HTML out", () => {
    const html = renderMarkdown('<div align="center" onclick="alert(1)">\n\nx\n\n</div>\n\n<div align="justify">\n\ny\n\n</div>\n\n<div class="evil">z</div>');
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("justify");
    expect(html).not.toContain("evil");
    expect(html).not.toMatch(/<div align/);
  });

  it("annotates block elements with their source lines", () => {
    const html = renderMarkdown("# Titel\n\nAbsatz\nzweite Zeile\n\n- a\n- b\n\n```js\nx\n```");
    expect(html).toContain('<h1 data-source-start="1" data-source-end="1" id="titel">');
    expect(html).toMatch(/<p data-source-start="3" data-source-end="4">/);
    expect(html).toMatch(/<ul data-source-start="6" data-source-end="7">/);
    expect(html).toMatch(/<li data-source-start="7" data-source-end="7">/);
    expect(html).toMatch(/<pre data-source-start="9" data-source-end="11">/);
  });
});

describe("Markdown outline", () => {
  it("creates stable unique heading ids", () => {
    expect(extractMarkdownHeadings("# Methode\n\n## Daten\n\n## Daten")).toEqual([
      { id: "methode", depth: 1, text: "Methode" },
      { id: "daten", depth: 2, text: "Daten" },
      { id: "daten-1", depth: 2, text: "Daten" },
    ]);
  });
});
