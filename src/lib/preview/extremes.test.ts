import { describe, expect, it } from "vitest";
import { countJsonNodes, MAX_JSON_DEPTH, MAX_JSON_NODES, parseJsonDocument } from "./json";
import { MAX_CSV_CELLS, MAX_CSV_CHARACTERS, parseCsv } from "./csv";
import { decodeMarkdownFragment, extractMarkdownHeadings, MAX_MARKDOWN_HEADINGS, renderMarkdown } from "./markdown";
import { parseNotebook, MAX_NOTEBOOK_CELLS } from "./notebook";
import { renderNotebookLatex, renderNotebookMarkdown } from "./notebookRendering";
import { MAX_PDF_DIMENSION, MAX_PDF_PAGE_PIXELS, boundedPdfScale } from "./pdfLimits";
import { renderLatexLive } from "./latex";

describe("bounded preview complexity", () => {
  it.each(["json", "jsonc", "json5", "jsonl", "ndjson"])("rejects deeply nested %s before recursive parsing", (extension) => {
    const result = parseJsonDocument("[".repeat(20_000) + "0" + "]".repeat(20_000), `data.${extension}`);
    expect(result.error).toContain("Verschachtelung");
    expect(result.value).toBeUndefined();
  });
  it("accepts the depth boundary and ignores braces in strings and comments", () => {
    expect(parseJsonDocument("[".repeat(MAX_JSON_DEPTH) + "0" + "]".repeat(MAX_JSON_DEPTH), "a.json").error).toBeUndefined();
    expect(parseJsonDocument(JSON.stringify("[".repeat(10_000)), "a.json").error).toBeUndefined();
    expect(parseJsonDocument(`/* ${"[".repeat(1000)} */ {"a":1,}`, "a.jsonc").value).toEqual({ a: 1 });
  });
  it("bounds broad JSON and counts without recursive stack overflow", () => {
    expect(parseJsonDocument(JSON.stringify(Array(100_000).fill(0)), "a.json").error).toContain("Knoten");
    let value: any = 0;
    for (let i = 0; i < 20_000; i++) value = [value];
    expect(countJsonNodes(value)).toBe(MAX_JSON_NODES + 1);
  });
  it("reads JSON Lines and NDJSON independently with source-line diagnostics", () => {
    expect(parseJsonDocument('{"a":1}\r\n\r\nnull\n[2,3]', "data.jsonl").value).toEqual([{ a: 1 }, null, [2, 3]]);
    expect(parseJsonDocument('{"a":1}\n\nnope', "data.ndjson")).toMatchObject({ error: "Ungültiger JSON-Datensatz", line: 3 });
    expect(parseJsonDocument('{"a":1}\n{"b":2}', "data.json").error).toBeTruthy();
  });
  it("bounds the padded CSV rectangle even when the last row is widest", () => {
    for (const source of [Array(5000).fill(Array(256).fill("x").join(",")).join("\n"), "x\n".repeat(4999) + Array(256).fill("x").join(",")]) {
      const table = parseCsv(source, ",");
      expect(table.rows.length * table.columnCount).toBeLessThanOrEqual(MAX_CSV_CELLS);
      expect(table.totalRows).toBe(5000);
      expect(table.truncatedRows).toBe(true);
    }
  });
  it.each(['""', '""\r\n'])("preserves explicitly empty CSV record %j", (source) => {
    expect(parseCsv(source, ",").rows).toEqual([[""]]);
  });
  it("reports malformed CSV and rejects oversized preview before parsing", () => {
    expect(parseCsv('a,"unfinished', ",").warning).toContain("Anführungszeichen");
    expect(parseCsv("x".repeat(MAX_CSV_CHARACTERS + 1)).warning).toContain("begrenzt");
    expect(parseCsv("\n\n", ",").rows).toEqual([]);
  });
  it("bounds heading-heavy Markdown and caps the outline", () => {
    expect(() => renderMarkdown("# x\n".repeat(50_000))).toThrow(/begrenzt/);
    expect(extractMarkdownHeadings("# x\n".repeat(400))).toHaveLength(MAX_MARKDOWN_HEADINGS);
    expect(decodeMarkdownFragment("%ZZ")).toBe("%ZZ");
    expect(decodeMarkdownFragment("h%C3%A4llo")).toBe("hällo");
  });
  it("bounds notebook cell and aggregate output budgets", () => {
    const result = parseNotebook(JSON.stringify({ cells: Array(1000).fill({ cell_type: "markdown", source: "hi" }) }));
    expect(result.cells).toHaveLength(MAX_NOTEBOOK_CELLS);
    expect(result.truncatedCells).toBe(true);
    const large = parseNotebook(JSON.stringify({ cells: Array(10).fill({ cell_type: "code", source: "x".repeat(200_000) }) }));
    expect(large.cells.length).toBeLessThan(3);
    expect(large.truncatedCells).toBe(true);
  });
  it("caps error fields and renders bare notebook LaTeX safely", () => {
    const result = parseNotebook(JSON.stringify({ cells: [{ cell_type: "code", outputs: [{ output_type: "error", ename: "x".repeat(300_000), evalue: "y".repeat(300_000) }] }] }));
    const output = result.cells[0].outputs[0];
    expect(output.kind).toBe("error");
    if (output.kind === "error") { expect(output.name.length).toBeLessThan(201_000); expect(output.value.length).toBeLessThan(201_000); }
    expect(renderNotebookLatex("\\displaystyle x^2")).toContain('class="katex"');
    expect(renderNotebookLatex("\\href{javascript:alert(1)}{X}")).not.toContain('href="javascript:');
    expect(renderNotebookMarkdown("<script>alert(1)</script>\n" + "# x\n".repeat(6000))).not.toContain("<script>");
  });
  it("rejects excessive LaTeX nesting without RangeError", () => {
    expect(() => renderLatexLive("{".repeat(5000) + "x" + "}".repeat(5000))).toThrow(/Verschachtelung/);
  });
  it("bounds PDF bitmaps for giant and extreme aspect ratios", () => {
    for (const [w, h] of [[600, 800], [1, 1_000_000], [1_000_000, 1], [1e9, 1e9]]) {
      const scale = boundedPdfScale(w, h, 10);
      expect(w * scale).toBeLessThanOrEqual(MAX_PDF_DIMENSION);
      expect(h * scale).toBeLessThanOrEqual(MAX_PDF_DIMENSION);
      expect(w * h * scale * scale).toBeLessThanOrEqual(MAX_PDF_PAGE_PIXELS + 0.01);
    }
    expect(() => boundedPdfScale(0, 800, 1)).toThrow();
    expect(() => boundedPdfScale(Infinity, 800, 1)).toThrow();
  });
});
