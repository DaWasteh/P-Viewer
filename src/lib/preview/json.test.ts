import { describe, expect, it } from "vitest";
import { countJsonNodes, jsonDialectFor, parseJsonDocument } from "./json";

describe("JSON preview parsing", () => {
  it("parses strict JSON", () => {
    const result = parseJsonDocument('{"paper":{"year":2026},"open":true}', "data.json");
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ paper: { year: 2026 }, open: true });
    expect(countJsonNodes(result.value!)).toBe(4);
  });

  it("supports comments and trailing commas in JSONC", () => {
    const result = parseJsonDocument('{ // note\n "value": 1,\n}', "settings.jsonc");
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ value: 1 });
  });

  it("keeps strict JSON strict with a German diagnosis", () => {
    const result = parseJsonDocument('{"value": 1,}', "data.json");
    expect(result.error).toContain("Nachgestelltes Komma");
    expect(result.line).toBe(1);
    expect(parseJsonDocument('{ // note\n "value": 1 }', "data.json").error).toContain("Kommentare");
    expect(parseJsonDocument('{"a":1}\n{"b":2}', "data.json").error).toContain(".jsonl");
  });

  it("treats tooling files as JSONC by convention", () => {
    for (const name of ["tsconfig.json", "tsconfig.build.json", ".vscode/settings.json", "launch.json", ".babelrc", ".eslintrc", "demo.code-workspace", ".prettierrc.json"]) {
      expect(jsonDialectFor(name)).toBe("jsonc");
      expect(parseJsonDocument('{ // comment\n "value": 1,\n}', name).value).toEqual({ value: 1 });
    }
    expect(jsonDialectFor("package.json")).toBe("json");
    expect(jsonDialectFor("C:\\data\\records.NDJSON")).toBe("jsonl");
    expect(jsonDialectFor("config.json5")).toBe("json5");
  });

  it("reports the location of malformed input", () => {
    const result = parseJsonDocument('{\n  "value": nope\n}', "data.json");
    expect(result.error).toBeDefined();
    expect(result.line).toBe(2);
    expect(result.column).toBeGreaterThan(2);
  });
});
