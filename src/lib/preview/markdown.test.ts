import { describe, expect, it } from "vitest";
import { renderMarkdown, renderMarkdownDocument } from "./markdown";

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

  it("sanitizes wrappers that are not plain alignment blocks", () => {
    const html = renderMarkdown('<div align="center" onclick="alert(1)">\n\nx\n\n</div>\n\n<div class="evil" style="color:red">z</div>');
    expect(html).toMatch(/<div align="center"[^>]*>\s*<p[^>]*>x<\/p>\s*<\/div>/);
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("evil");
    expect(html).not.toContain("style=");
    expect(html).toContain(">z</div>");
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

describe("Raw HTML in Markdown (issue #6)", () => {
  it("renders safe raw HTML blocks and inline elements", () => {
    const html = renderMarkdown(`
# Test

<hr>

<h2>HTML Heading</h2>

<b>Bold HTML</b> und <strong>stark</strong>, <i>kursiv</i>, <em>betont</em>, <kbd>Strg</kbd>, H<sub>2</sub>O, x<sup>2</sup><br>nächste Zeile

<table>
  <tr>
    <td align="center">Cell</td>
  </tr>
</table>
`);
    expect(html).toMatch(/<hr[ >]/);
    expect(html).toMatch(/<h2[^>]* id="html-heading">HTML Heading<\/h2>/);
    expect(html).toContain("<b>Bold HTML</b>");
    expect(html).toContain("<strong>stark</strong>");
    expect(html).toContain("<i>kursiv</i>");
    expect(html).toContain("<em>betont</em>");
    expect(html).toContain("<kbd>Strg</kbd>");
    expect(html).toContain("<sub>2</sub>");
    expect(html).toContain("<sup>2</sup>");
    expect(html).toContain("<br>nächste Zeile");
    expect(html).toMatch(/<table[^>]*>\s*<tbody>/);
    expect(html).toContain('<td align="center">Cell</td>');
  });

  it("keeps HTML and Markdown image sources identical for the local image resolver", () => {
    const html = renderMarkdown([
      "![Image](image.png)",
      '<img src="image.png" width="75%" alt="Test">',
      '<img src="./images/image.png">',
      '<img src="../images/image.png" height="40">',
      '<img src="https://raw.githubusercontent.com/user/repo/main/image.png">',
    ].join("\n\n"));
    expect(html).toContain('<img src="image.png" alt="Image"');
    expect(html).toMatch(/<img src="image.png" width="75%" alt="Test"/);
    expect(html).toContain('src="./images/image.png"');
    expect(html).toMatch(/src="\.\.\/images\/image.png" height="40"/);
    expect(html).toContain('src="https://raw.githubusercontent.com/user/repo/main/image.png"');
  });

  it("renders HTML links but leaves opening them to the preview", () => {
    const html = renderMarkdown('<a href="https://example.com" target="_blank" rel="noopener">Example</a>');
    expect(html).toContain('<a href="https://example.com">Example</a>');
    expect(html).not.toContain("target=");
  });

  it("renders complete HTML tables with sizes, spans and alignment", () => {
    const html = renderMarkdown(`<table>
  <thead>
    <tr>
      <th>Feature</th>
      <th colspan="2">Status</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Markdown</td>
      <td width="50%" align="center" rowspan="2"><img src="screen1.png" width="75%"></td>
      <td>✅</td>
    </tr>
  </tbody>
</table>`);
    expect(html).toContain("<thead>");
    expect(html).toContain('<th colspan="2">Status</th>');
    expect(html).toMatch(/<td width="50%" align="center" rowspan="2"><img src="screen1.png" width="75%"[^>]*><\/td>/);
    expect(html).toContain("<td>✅</td>");
  });

  it("mixes Markdown and HTML in document order with source lines", () => {
    const html = renderMarkdown(`# Titel

Normaler **Markdown Text**

<hr>

<h2>HTML Heading</h2>

<b>HTML Bold</b>

- Markdown Item 1
- Markdown Item 2

<table>
  <tr>
    <td>HTML Table</td>
  </tr>
</table>

## Markdown Heading`);
    const order = ["<h1", "<strong>Markdown Text</strong>", "<hr", "HTML Heading", "<b>HTML Bold</b>", "Markdown Item 2", "HTML Table", "Markdown Heading"];
    const positions = order.map((part) => html.indexOf(part));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain('<h2 data-source-start="7" data-source-end="7" id="html-heading">');
    expect(html).toContain('<table data-source-start="14" data-source-end="18">');
  });

  it("renders details with Markdown inside", () => {
    const html = renderMarkdown("<details open>\n<summary>Mehr</summary>\n\n**fett** im Detail\n\n</details>");
    expect(html).toMatch(/<details open>\s*<summary>Mehr<\/summary>\s*<p[^>]*><strong>fett<\/strong> im Detail<\/p>\s*<\/details>/);
  });

  it("sanitizes dangerous raw HTML but keeps the text", () => {
    const html = renderMarkdown(`
<script>alert("xss")</script>

<style>body { display: none }</style>

<img src="x" onerror="alert('xss')">

<a href="javascript:alert('xss')">Danger</a>

<div onclick="alert('xss')">
Test
</div>

<img src="javascript:alert(1)"> <img src="data:image/svg+xml,<svg onload=alert(1)>">

<iframe src="https://example.com"></iframe><object data="x.swf"></object><embed src="x.swf">

<form action="https://example.com"><input type="text" name="q" onfocus="alert(1)"></form>

<base href="https://example.com/"><meta http-equiv="refresh" content="0;url=https://example.com">

<a href="https://example.com" onmouseover="alert(1)" style="position:fixed">Link</a>
`);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert");
    expect(html).not.toContain("display: none");
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:image");
    expect(html).not.toMatch(/<(?:iframe|object|embed|form|base|meta|style)\b/);
    expect(html).not.toContain("style=");
    // An input only survives as a disabled checkbox with a prefixed name.
    expect(html).toContain('<input name="user-content-q" disabled type="checkbox">');
    expect(html).toContain(">Danger</a>");
    expect(html).toContain("Test");
    expect(html).toContain('<a href="https://example.com">Link</a>');
  });

  it("prefixes ids and names from raw HTML against DOM clobbering, footnotes only once", () => {
    const html = renderMarkdown('<a name="install"></a>\n\n<div id="config">x</div>\n\nText[^1]\n\n[^1]: Anmerkung');
    expect(html).toContain('<a name="user-content-install"></a>');
    expect(html).toContain('id="user-content-config"');
    expect(html).toContain('href="#user-content-fn-1"');
    expect(html).toContain('id="user-content-fn-1"');
    expect(html).toContain('aria-describedby="user-content-footnote-label"');
    expect(html).toContain('id="user-content-footnote-label"');
    expect(html).not.toContain("user-content-user-content");
  });

  it("renders README-style HTML like GitHub", () => {
    const html = renderMarkdown(`<img src="https://raw.githubusercontent.com/user/repo/main/UI.png">

<a href="https://example.com/script" target="_blank">Enhancer</a>

<hr>
<h2>Why You Need This</h2>
<hr>

<b>Improves audio in real time.</b><br>
Boost bass and treble.

<ul>
<li><b>Volume Boost</b> from 25% to 300%</li>
<li>Keep one persistent setup</li>
</ul>

<table>
  <tr>
    <td width="50%" align="center">
      <img src="Sceenshots/screen1.PNG" width="75%">
    </td>
    <td width="50%" align="center">
      <img src="Sceenshots/screen2.PNG" width="60%">
      <img src="Sceenshots/screen3.PNG" width="60%">
    </td>
  </tr>
</table>

<p>
Each control ranges from <b>0 to 10</b>.
</p>`);
    expect(html.match(/<img /g)).toHaveLength(4);
    expect(html.match(/<td width="50%" align="center">/g)).toHaveLength(2);
    expect(html).toContain('<a href="https://example.com/script">Enhancer</a>');
    expect(html).toMatch(/<hr[^>]*>\s*<h2[^>]*>Why You Need This<\/h2>\s*<hr/);
    expect(html).toContain("<b>Improves audio in real time.</b><br>\nBoost bass and treble.");
    expect(html).toMatch(/<li[^>]*><b>Volume Boost<\/b> from 25% to 300%<\/li>/);
    expect(html).toMatch(/<p[^>]*>\nEach control ranges from <b>0 to 10<\/b>\.\n<\/p>/);
  });
});

describe("Markdown outline", () => {
  it("creates stable unique heading ids that match the rendered document", () => {
    const { html, headings } = renderMarkdownDocument("# Methode\n\n## Daten\n\n## Daten\n\n<h2>Daten</h2>\n\n### Formel $E = mc^2$\n\nText[^1]\n\n[^1]: Fußnote");
    expect(headings).toEqual([
      { id: "methode", depth: 1, text: "Methode" },
      { id: "daten", depth: 2, text: "Daten" },
      { id: "daten-1", depth: 2, text: "Daten" },
      { id: "daten-2", depth: 2, text: "Daten" },
      { id: "formel-e--mc2", depth: 3, text: "Formel E = mc^2" },
    ]);
    for (const { id } of headings) expect(html).toContain(`id="${id}"`);
  });

  it("includes headings written as HTML with their own or prefixed ids", () => {
    const { headings } = renderMarkdownDocument('<h2>Screenshots</h2>\n\n<h3 id="setup">Setup</h3>');
    expect(headings).toEqual([
      { id: "screenshots", depth: 2, text: "Screenshots" },
      { id: "user-content-setup", depth: 3, text: "Setup" },
    ]);
  });
});
