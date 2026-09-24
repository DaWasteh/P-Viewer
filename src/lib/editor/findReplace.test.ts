import { describe, expect, it } from "vitest";
import { SearchQuery } from "@codemirror/search";
import { EditorSelection, EditorState } from "@codemirror/state";
import { countMatches, describeMatches } from "./findReplace";

function view(doc: string, from = 0, to = from) {
  return { state: EditorState.create({ doc, selection: EditorSelection.single(from, to) }) };
}

describe("find and replace counter", () => {
  it("counts matches and knows the selected one", () => {
    const query = new SearchQuery({ search: "ab" });
    expect(countMatches(view("ab xab ab", 4, 6), query)).toEqual({ total: 3, current: 2, capped: false });
    expect(describeMatches(countMatches(view("ab xab ab", 4, 6), query), query)).toBe("2 von 3");
    expect(describeMatches(countMatches(view("ab xab ab"), query), query)).toBe("3 Treffer");
  });

  it("respects case, whole word and regular expressions", () => {
    expect(countMatches(view("Ab ab AB"), new SearchQuery({ search: "ab", caseSensitive: true })).total).toBe(1);
    expect(countMatches(view("cat catalog cat"), new SearchQuery({ search: "cat", wholeWord: true })).total).toBe(2);
    expect(countMatches(view("a1 b22 c333"), new SearchQuery({ search: "[0-9]+", regexp: true })).total).toBe(3);
  });

  it("reports empty, missing and invalid searches", () => {
    expect(describeMatches(countMatches(view("x"), new SearchQuery({ search: "" })), new SearchQuery({ search: "" }))).toBe("");
    const none = new SearchQuery({ search: "zzz" });
    expect(describeMatches(countMatches(view("x"), none), none)).toBe("Keine Treffer");
    const invalid = new SearchQuery({ search: "(", regexp: true });
    expect(describeMatches(countMatches(view("("), invalid), invalid)).toBe("Ungültiger Ausdruck");
  });
});
