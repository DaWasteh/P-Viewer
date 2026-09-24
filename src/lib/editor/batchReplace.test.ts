import { describe, expect, it } from "vitest";
import {
  applyRules,
  formatRules,
  historyLabel,
  minimalChange,
  normalizeHistory,
  parseRules,
  rememberRun,
  removeEntry,
  renameEntry,
  DEFAULT_REPLACE_OPTIONS,
} from "./batchReplace";

describe("batch replace rules", () => {
  it("parses tab and arrow separated rules and reports broken lines", () => {
    const parsed = parseRules("||ads.example.com^ => ||ads.example.org^\nalt\tneu\n\nohne Trenner\n => leer\n##.banner =>");
    expect(parsed.rules).toEqual([
      { search: "||ads.example.com^", replace: "||ads.example.org^", line: 1 },
      { search: "alt", replace: "neu", line: 2 },
      { search: "##.banner", replace: "", line: 6 },
    ]);
    expect(parsed.errors).toEqual(["Zeile 4: Trennzeichen fehlt (Tab oder „=>“).", "Zeile 5: Suchtext fehlt."]);
    expect(parseRules(formatRules(parsed.rules)).rules.map(({ search, replace }) => [search, replace])).toEqual([
      ["||ads.example.com^", "||ads.example.org^"],
      ["alt", "neu"],
      ["##.banner", ""],
    ]);
    expect(formatRules([{ search: "a=>b", replace: "c" }])).toBe("a=>b\tc");
  });

  it("applies rules in order, literally by default, and counts matches per rule", () => {
    const { rules } = parseRules("a.b => X\nX => Y\ncat => dog");
    const result = applyRules("a.b axb cat Cat", rules, DEFAULT_REPLACE_OPTIONS);
    expect(result.text).toBe("Y axb dog Cat");
    expect(result.counts).toEqual([1, 1, 1]);
    expect(result.total).toBe(3);
    expect(applyRules("Cat cat", rules.slice(2), { ...DEFAULT_REPLACE_OPTIONS, caseSensitive: false }).text).toBe("dog dog");
  });

  it("supports whole words, regular expressions with groups and literal dollar signs", () => {
    expect(applyRules("cat catalog cat", parseRules("cat => dog").rules, { ...DEFAULT_REPLACE_OPTIONS, wholeWord: true }).text).toBe("dog catalog dog");
    expect(applyRules("v1.2 v3.4", parseRules("v(\\d)\\.(\\d) => $2.$1 ($&) $$").rules, { ...DEFAULT_REPLACE_OPTIONS, regexp: true }).text).toBe("2.1 (v1.2) $ 4.3 (v3.4) $");
    expect(applyRules("price", parseRules("price => $1").rules, DEFAULT_REPLACE_OPTIONS).text).toBe("$1");
    expect(applyRules("abc", parseRules("x* => -").rules, { ...DEFAULT_REPLACE_OPTIONS, regexp: true }).text).toBe("abc");
    expect(() => applyRules("x", parseRules("( => y").rules, { ...DEFAULT_REPLACE_OPTIONS, regexp: true })).toThrow("Zeile 1");
  });

  it("computes a minimal change", () => {
    expect(minimalChange("abcdef", "abXYef")).toEqual({ from: 2, to: 4, insert: "XY" });
    expect(minimalChange("same", "same")).toBeNull();
    expect(minimalChange("aaa", "aaaa")).toEqual({ from: 3, to: 3, insert: "a" });
  });
});

describe("replace history", () => {
  it("moves repeated runs to the top and keeps names", () => {
    const first = rememberRun([], { name: "", rules: "a => b", options: DEFAULT_REPLACE_OPTIONS }, 1);
    const second = rememberRun(first, { name: "Adblock-Pflege", rules: "x => y", options: DEFAULT_REPLACE_OPTIONS }, 2);
    const again = rememberRun(second, { name: "", rules: "a => b", options: DEFAULT_REPLACE_OPTIONS }, 3);
    expect(again.map((entry) => entry.rules)).toEqual(["a => b", "x => y"]);
    expect(again[0].uses).toBe(2);
    expect(historyLabel(again[1])).toBe("Adblock-Pflege");
    expect(historyLabel(again[0])).toBe("a => b");
    const otherOptions = rememberRun(again, { name: "", rules: "a => b", options: { ...DEFAULT_REPLACE_OPTIONS, regexp: true } }, 4);
    expect(otherOptions).toHaveLength(3);
    const script = rememberRun(otherOptions, { name: "", kind: "script", rules: "a => b", options: DEFAULT_REPLACE_OPTIONS }, 5);
    expect(script).toHaveLength(4);
  });

  it("keeps named macros beyond the history limit", () => {
    let history = rememberRun([], { name: "Makro", rules: "keep => me", options: DEFAULT_REPLACE_OPTIONS }, 0);
    for (let index = 1; index <= 60; index += 1) {
      history = rememberRun(history, { name: "", rules: `r${index} => x`, options: DEFAULT_REPLACE_OPTIONS }, index);
    }
    expect(history.filter((entry) => !entry.name)).toHaveLength(40);
    expect(history.some((entry) => entry.name === "Makro")).toBe(true);
    const renamed = renameEntry(history, history[0].id, "  Neu  ");
    expect(renamed[0].name).toBe("Neu");
    expect(removeEntry(renamed, renamed[0].id)).toHaveLength(history.length - 1);
  });

  it("drops malformed stored entries", () => {
    expect(normalizeHistory([{ id: "1", rules: "a => b", usedAt: 5 }, { id: 2 }, "x", null])).toEqual([
      { id: "1", name: "", kind: "rules", rules: "a => b", options: DEFAULT_REPLACE_OPTIONS, usedAt: 5, uses: 1 },
    ]);
    expect(normalizeHistory("broken")).toEqual([]);
  });
});
