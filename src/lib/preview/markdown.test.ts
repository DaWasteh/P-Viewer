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
    expect(html).toContain('<li class="task-list-item"><input type="checkbox" checked disabled>');
    expect(html).toContain("<table>");
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

describe("Markdown outline", () => {
  it("creates stable unique heading ids", () => {
    expect(extractMarkdownHeadings("# Methode\n\n## Daten\n\n## Daten")).toEqual([
      { id: "methode", depth: 1, text: "Methode" },
      { id: "daten", depth: 2, text: "Daten" },
      { id: "daten-1", depth: 2, text: "Daten" },
    ]);
  });
});
