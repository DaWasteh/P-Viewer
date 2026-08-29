import { describe, expect, it } from "vitest";
import { countJsonNodes, parseJsonDocument } from "./json";

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

  it("keeps strict JSON strict", () => {
    const result = parseJsonDocument('{"value": 1,}', "settings.json");
    expect(result.error).toBeDefined();
    expect(result.line).toBe(1);
  });

  it("reports the location of malformed input", () => {
    const result = parseJsonDocument('{\n  "value": nope\n}', "data.json");
    expect(result.error).toBeDefined();
    expect(result.line).toBe(2);
    expect(result.column).toBeGreaterThan(2);
  });
});
