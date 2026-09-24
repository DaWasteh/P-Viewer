import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import {
  indentSelection,
  insertCallout,
  insertHorizontalRule,
  insertImage,
  insertLink,
  insertTable,
  markdownDestination,
  setAlignment,
  setHeading,
  toggleBlockquote,
  toggleCodeBlock,
  toggleInline,
  toggleList,
  type FormatCommand,
} from "./formatting";

function state(doc: string, ...ranges: Array<[number, number]>): EditorState {
  return EditorState.create({
    doc,
    selection: ranges.length ? EditorSelection.create(ranges.map(([anchor, head]) => EditorSelection.range(anchor, head))) : undefined,
    extensions: [EditorState.allowMultipleSelections.of(true), history()],
  });
}

function run(current: EditorState, command: FormatCommand): EditorState {
  const spec = command(current);
  if (!spec) return current;
  return current.update(spec).state;
}

function selected(current: EditorState): string[] {
  return current.selection.ranges.map((range) => current.sliceDoc(range.from, range.to));
}

describe("inline formatting (Markdown)", () => {
  it("wraps the selection in bold and keeps the text selected", () => {
    const next = run(state("Hallo Welt", [0, 5]), toggleInline("bold", "markdown"));
    expect(next.doc.toString()).toBe("**Hallo** Welt");
    expect(selected(next)).toEqual(["Hallo"]);
    const back = run(next, toggleInline("bold", "markdown"));
    expect(back.doc.toString()).toBe("Hallo Welt");
    expect(selected(back)).toEqual(["Hallo"]);
  });

  it("removes markers that are part of the selection", () => {
    const next = run(state("**Hallo**", [0, 9]), toggleInline("bold", "markdown"));
    expect(next.doc.toString()).toBe("Hallo");
    expect(selected(next)).toEqual(["Hallo"]);
  });

  it("combines and separates bold and italic", () => {
    let current = run(state("**Hallo**", [2, 7]), toggleInline("italic", "markdown"));
    expect(current.doc.toString()).toBe("***Hallo***");
    current = run(current, toggleInline("bold", "markdown"));
    expect(current.doc.toString()).toBe("*Hallo*");
    current = run(current, toggleInline("italic", "markdown"));
    expect(current.doc.toString()).toBe("Hallo");
    expect(run(state("_x_", [1, 2]), toggleInline("italic", "markdown")).doc.toString()).toBe("x");
    expect(run(state("__x__", [2, 3]), toggleInline("bold", "markdown")).doc.toString()).toBe("x");
    expect(run(state("x", [0, 1]), toggleInline("boldItalic", "markdown")).doc.toString()).toBe("***x***");
    expect(run(state("**x**", [2, 3]), toggleInline("boldItalic", "markdown")).doc.toString()).toBe("***x***");
    expect(run(state("***x***", [3, 4]), toggleInline("boldItalic", "markdown")).doc.toString()).toBe("x");
  });

  it("toggles strikethrough and inline code", () => {
    const struck = run(state("alt", [0, 3]), toggleInline("strikethrough", "markdown"));
    expect(struck.doc.toString()).toBe("~~alt~~");
    expect(run(struck, toggleInline("strikethrough", "markdown")).doc.toString()).toBe("alt");
    const code = run(state("npm test", [0, 8]), toggleInline("code", "markdown"));
    expect(code.doc.toString()).toBe("`npm test`");
    expect(run(code, toggleInline("code", "markdown")).doc.toString()).toBe("npm test");
  });

  it("formats the word at the cursor or inserts a selected placeholder", () => {
    const word = run(state("Hallo Welt", [2, 2]), toggleInline("bold", "markdown"));
    expect(word.doc.toString()).toBe("**Hallo** Welt");
    const empty = run(state("", [0, 0]), toggleInline("italic", "markdown"));
    expect(empty.doc.toString()).toBe("*kursiver Text*");
    expect(selected(empty)).toEqual(["kursiver Text"]);
  });

  it("applies to every selection in one undoable step", () => {
    const start = state("eins zwei drei", [0, 4], [10, 14]);
    const next = run(start, toggleInline("bold", "markdown"));
    expect(next.doc.toString()).toBe("**eins** zwei **drei**");
    expect(selected(next)).toEqual(["eins", "drei"]);
    let undone = next;
    undo({ state: next, dispatch: (transaction) => (undone = transaction.state) });
    expect(undone.doc.toString()).toBe("eins zwei drei");
  });
});

describe("inline formatting (HTML)", () => {
  it("uses tags and toggles them off again", () => {
    const next = run(state("Text", [0, 4]), toggleInline("bold", "html"));
    expect(next.doc.toString()).toBe("<strong>Text</strong>");
    expect(selected(next)).toEqual(["Text"]);
    expect(run(next, toggleInline("bold", "html")).doc.toString()).toBe("Text");
    expect(run(state("<em>x</em>", [0, 10]), toggleInline("italic", "html")).doc.toString()).toBe("x");
    expect(run(state("<b>x</b>", [3, 4]), toggleInline("bold", "html")).doc.toString()).toBe("x");
  });
});

describe("headings", () => {
  it("replaces an existing level instead of nesting markers", () => {
    expect(run(state("## Test", [3, 3]), setHeading(3, "markdown")).doc.toString()).toBe("### Test");
    expect(run(state("### Test", [0, 0]), setHeading(3, "markdown")).doc.toString()).toBe("Test");
    expect(run(state("Titel", [0, 0]), setHeading(1, "markdown")).doc.toString()).toBe("# Titel");
    expect(run(state("a\nb", [0, 3]), setHeading(2, "markdown")).doc.toString()).toBe("## a\n## b");
    expect(run(state("# Titel", [0, 0]), setHeading(0, "markdown")).doc.toString()).toBe("Titel");
  });

  it("wraps HTML headings", () => {
    const next = run(state("Titel", [0, 0]), setHeading(2, "html"));
    expect(next.doc.toString()).toBe("<h2>Titel</h2>");
    expect(run(next, setHeading(3, "html")).doc.toString()).toBe("<h3>Titel</h3>");
    expect(run(next, setHeading(2, "html")).doc.toString()).toBe("Titel");
  });
});

describe("lists and quotes", () => {
  it("formats every selected line and toggles back", () => {
    const fruit = state("Apfel\nBirne\nOrange", [0, 18]);
    const bullets = run(fruit, toggleList("bullet", "markdown"));
    expect(bullets.doc.toString()).toBe("- Apfel\n- Birne\n- Orange");
    expect(run(bullets, toggleList("bullet", "markdown")).doc.toString()).toBe("Apfel\nBirne\nOrange");
    const numbered = run(state(bullets.doc.toString(), [0, bullets.doc.length]), toggleList("numbered", "markdown"));
    expect(numbered.doc.toString()).toBe("1. Apfel\n2. Birne\n3. Orange");
    const tasks = run(state("- Aufgabe", [0, 0]), toggleList("task", "markdown"));
    expect(tasks.doc.toString()).toBe("- [ ] Aufgabe");
    expect(run(tasks, toggleList("task", "markdown")).doc.toString()).toBe("Aufgabe");
    expect(run(state("  a\n\n  b", [0, 8]), toggleList("bullet", "markdown")).doc.toString()).toBe("  - a\n\n  - b");
    // A selection ending at the start of the next line leaves that line alone.
    expect(run(state("a\nb", [0, 2]), toggleList("bullet", "markdown")).doc.toString()).toBe("- a\nb");
  });

  it("quotes and unquotes lines", () => {
    const quoted = run(state("Zeile 1\nZeile 2\nZeile 3", [0, 23]), toggleBlockquote("markdown"));
    expect(quoted.doc.toString()).toBe("> Zeile 1\n> Zeile 2\n> Zeile 3");
    expect(run(state(quoted.doc.toString(), [0, quoted.doc.length]), toggleBlockquote("markdown")).doc.toString()).toBe("Zeile 1\nZeile 2\nZeile 3");
  });

  it("wraps HTML lists and quotes", () => {
    const list = run(state("a\nb", [0, 3]), toggleList("bullet", "html"));
    expect(list.doc.toString()).toBe("<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>");
    expect(run(state(list.doc.toString(), [0, list.doc.length]), toggleList("bullet", "html")).doc.toString()).toBe("a\nb");
    expect(run(state("x", [0, 1]), toggleBlockquote("html")).doc.toString()).toBe("<blockquote>\n  x\n</blockquote>");
  });
});

describe("blocks and insertions", () => {
  it("fences code with a language and unwraps it again", () => {
    const fenced = run(state("let a = 1;", [0, 10]), toggleCodeBlock("javascript", "markdown"));
    expect(fenced.doc.toString()).toBe("```javascript\nlet a = 1;\n```");
    expect(selected(fenced)).toEqual(["let a = 1;"]);
    expect(run(state(fenced.doc.toString(), [0, fenced.doc.length]), toggleCodeBlock("javascript", "markdown")).doc.toString()).toBe("let a = 1;");
    expect(run(state("", [0, 0]), toggleCodeBlock("text", "markdown")).doc.toString()).toBe("```\n\n```");
    expect(run(state("a < b", [0, 5]), toggleCodeBlock("python", "html")).doc.toString()).toBe('<pre><code class="language-python">a &lt; b</code></pre>');
  });

  it("inserts links and selects the text part", () => {
    const link = run(state("OpenAI", [0, 6]), insertLink("https://example.com", "", "markdown"));
    expect(link.doc.toString()).toBe("[OpenAI](https://example.com)");
    expect(selected(link)).toEqual(["OpenAI"]);
    const empty = run(state("", [0, 0]), insertLink("https://example.com/a b", "", "markdown"));
    expect(empty.doc.toString()).toBe("[Link-Text](https://example.com/a%20b)");
    expect(selected(empty)).toEqual(["Link-Text"]);
    expect(run(state("x", [0, 1]), insertLink('https://a.b/?q="1"&r=2', "", "html")).doc.toString()).toBe('<a href="https://a.b/?q=&quot;1&quot;&amp;r=2">x</a>');
    expect(markdownDestination(" ./Bild (1).png ")).toBe("./Bild%20%281%29.png");
  });

  it("inserts images", () => {
    expect(run(state("", [0, 0]), insertImage("image.png", "Beschreibung", "markdown")).doc.toString()).toBe("![Beschreibung](image.png)");
    expect(run(state("", [0, 0]), insertImage("a.png", "Logo", "html")).doc.toString()).toBe('<img src="a.png" alt="Logo">');
  });

  it("generates tables from columns and rows", () => {
    expect(run(state("", [0, 0]), insertTable(3, 1, "markdown")).doc.toString()).toBe(
      "| Spalte 1 | Spalte 2 | Spalte 3 |\n| --- | --- | --- |\n| Inhalt | Inhalt | Inhalt |",
    );
    const html = run(state("", [0, 0]), insertTable(2, 1, "html")).doc.toString();
    expect(html).toContain("<th>Spalte 1</th><th>Spalte 2</th>");
    expect(html).toContain("<td>Inhalt</td><td>Inhalt</td>");
  });

  it("keeps a horizontal rule apart from paragraphs (no setext heading)", () => {
    expect(run(state("Text", [4, 4]), insertHorizontalRule("markdown")).doc.toString()).toBe("Text\n\n---");
    expect(run(state("Text\nMehr", [4, 4]), insertHorizontalRule("markdown")).doc.toString()).toBe("Text\n\n---\n\nMehr");
    expect(run(state("", [0, 0]), insertHorizontalRule("html")).doc.toString()).toBe("<hr>");
  });

  it("aligns with a div, switches alignment and unwraps", () => {
    const centered = run(state("Text", [0, 4]), setAlignment("center", "markdown"));
    expect(centered.doc.toString()).toBe('<div align="center">\n\nText\n\n</div>');
    expect(selected(centered)).toEqual(["Text"]);
    const right = run(centered, setAlignment("right", "markdown"));
    expect(right.doc.toString()).toBe('<div align="right">\n\nText\n\n</div>');
    expect(run(right, setAlignment("right", "markdown")).doc.toString()).toBe("Text");
    expect(run(state("Text", [0, 4]), setAlignment("left", "html")).doc.toString()).toBe('<div style="text-align: left;">\nText\n</div>');
  });

  it("indents with the editor's indent unit", () => {
    const indented = run(state("a\nb", [0, 3]), indentSelection("more"));
    expect(indented.doc.toString()).toBe("  a\n  b");
    expect(run(indented, indentSelection("less")).doc.toString()).toBe("a\nb");
  });

  it("puts alert boxes on lines of their own, also when clicked repeatedly", () => {
    const once = run(state("> [!NOTE]\n> Hinweis", [0, 0]), insertCallout());
    expect(once.doc.toString()).toBe("> [!NOTE]\n> Hinweis\n\n> [!NOTE]\n> Hinweis");
    expect(selected(once)).toEqual(["Hinweis"]);
    const middle = run(state("Text davor", [4, 4]), insertCallout());
    expect(middle.doc.toString()).toBe("Text davor\n\n> [!NOTE]\n> Hinweis");
    const paragraph = run(state("Absatz\nzweite Zeile\n\nDanach", [2, 2]), insertCallout());
    expect(paragraph.doc.toString()).toBe("Absatz\nzweite Zeile\n\n> [!NOTE]\n> Hinweis\n\nDanach");
    const wrapped = run(state("Zeile 1\n\nZeile 2", [2, 14]), insertCallout());
    expect(wrapped.doc.toString()).toBe("> [!NOTE]\n> Zeile 1\n>\n> Zeile 2");
  });
});
