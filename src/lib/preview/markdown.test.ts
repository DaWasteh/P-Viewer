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
    expect(html).toContain('type="checkbox"');
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
