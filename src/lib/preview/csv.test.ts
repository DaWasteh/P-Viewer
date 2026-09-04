import { describe, expect, it } from "vitest";
import { MAX_CSV_ROWS, detectCsvDelimiter, isNumericValue, parseCsv } from "./csv";

describe("CSV parsing", () => {
  it("detects the most consistent delimiter", () => {
    expect(detectCsvDelimiter("a,b,c\n1,2,3\n")).toBe(",");
    expect(detectCsvDelimiter("a;b;c\n1;2;3\n")).toBe(";");
    expect(detectCsvDelimiter("a\tb\n1\t2\n")).toBe("\t");
    expect(detectCsvDelimiter("a|b\n1|2\n")).toBe("|");
    expect(detectCsvDelimiter("x", "data.tsv")).toBe("\t");
    expect(detectCsvDelimiter("1,5;2,5\n3,5;4,5\n")).toBe(";");
  });

  it("parses quoted fields, escaped quotes and embedded line breaks", () => {
    const table = parseCsv('name,note\n"Doe, Jane","Says ""hi""\nsecond line"\n');
    expect(table.delimiter).toBe(",");
    expect(table.rows).toEqual([
      ["name", "note"],
      ["Doe, Jane", 'Says "hi"\nsecond line'],
    ]);
    expect(table.columnCount).toBe(2);
    expect(table.totalRows).toBe(2);
  });

  it("handles CRLF endings, ragged rows and numeric column detection", () => {
    const table = parseCsv("a;b;c\r\n1;2,5\r\n3;4;x;extra\r\n", ";");
    expect(table.rows).toEqual([
      ["a", "b", "c"],
      ["1", "2,5"],
      ["3", "4", "x", "extra"],
    ]);
    expect(table.columnCount).toBe(4);
    expect(table.numericColumns).toEqual([true, true, false, false]);
  });

  it("limits the number of rendered rows", () => {
    const content = Array.from({ length: MAX_CSV_ROWS + 5 }, (_, index) => `${index},x`).join("\n");
    const table = parseCsv(content, ",");
    expect(table.rows).toHaveLength(MAX_CSV_ROWS);
    expect(table.totalRows).toBe(MAX_CSV_ROWS + 5);
    expect(table.truncatedRows).toBe(true);
  });

  it("recognizes localized numbers", () => {
    expect(isNumericValue("1.234,56")).toBe(true);
    expect(isNumericValue("-12.5")).toBe(true);
    expect(isNumericValue("3e10")).toBe(true);
    expect(isNumericValue("12 %")).toBe(true);
    expect(isNumericValue("abc")).toBe(false);
    expect(isNumericValue("2024-01-01")).toBe(false);
  });
});
