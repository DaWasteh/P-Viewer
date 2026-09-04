import { describe, expect, it } from "vitest";
import { NotebookParseError, parseNotebook, stripAnsi } from "./notebook";

const notebook = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {
    kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
    language_info: { name: "python" },
  },
  cells: [
    { cell_type: "markdown", source: ["# Titel\n", "Text"] },
    {
      cell_type: "code",
      execution_count: 3,
      source: "print('hi')",
      outputs: [
        { output_type: "stream", name: "stdout", text: ["hi\n"] },
        {
          output_type: "execute_result",
          data: { "text/plain": ["42"], "text/html": ["<b>42</b>"] },
        },
        { output_type: "display_data", data: { "image/png": "iVBORw0KGgo=" } },
        { output_type: "display_data", data: { "text/html": "<script>x</script>" } },
        {
          output_type: "error",
          ename: "ValueError",
          evalue: "bad",
          traceback: ["\u001B[0;31mValueError\u001B[0m: bad"],
        },
      ],
    },
    { cell_type: "raw", source: "raw text" },
  ],
};

describe("Jupyter notebook parsing", () => {
  it("extracts cells, kernel metadata and safe outputs", () => {
    const parsed = parseNotebook(JSON.stringify(notebook));
    expect(parsed.language).toBe("python");
    expect(parsed.kernel).toBe("Python 3");
    expect(parsed.nbformat).toBe("4.5");
    expect(parsed.cells).toHaveLength(3);
    expect(parsed.cells[0]).toMatchObject({ type: "markdown", source: "# Titel\nText" });
    expect(parsed.cells[1].executionCount).toBe(3);
    expect(parsed.cells[1].outputs).toEqual([
      { kind: "stream", name: "stdout", text: "hi\n" },
      { kind: "text", text: "42" },
      { kind: "image", dataUrl: "data:image/png;base64,iVBORw0KGgo=", alt: "png-Ausgabe" },
      { kind: "html-only" },
      { kind: "error", name: "ValueError", value: "bad", traceback: "ValueError: bad" },
    ]);
    expect(parsed.cells[2].type).toBe("raw");
  });

  it("never emits raw HTML or invalid image data", () => {
    const parsed = parseNotebook(
      JSON.stringify({
        cells: [
          {
            cell_type: "code",
            outputs: [
              { output_type: "display_data", data: { "image/png": "not base64!" } },
              { output_type: "display_data", data: { "image/svg+xml": "<svg/>" } },
            ],
          },
        ],
      }),
    );
    expect(parsed.cells[0].outputs).toEqual([]);
    expect(JSON.stringify(parsed)).not.toContain("<svg");
  });

  it("rejects non-notebook JSON with a readable error", () => {
    expect(() => parseNotebook("{}")).toThrow(NotebookParseError);
    expect(() => parseNotebook("nope")).toThrow(/kein gültiges JSON/);
  });

  it("strips ANSI colors from tracebacks", () => {
    expect(stripAnsi("\u001B[1;32mok\u001B[0m")).toBe("ok");
  });
});
