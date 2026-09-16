import { describe, expect, it } from "vitest";
import { createUntitledDocument } from "./documents";
import {
  documentIsDirty,
  findTabByPath,
  insertionIndex,
  isPristineUntitled,
  nextUntitledName,
  parseTabTransfer,
  reorderTabs,
  sameDocumentPath,
  serializeTabTransfer,
} from "./tabs";

describe("document tabs", () => {
  it("creates unique names for parallel untitled documents", () => {
    const first = createUntitledDocument();
    const second = createUntitledDocument("Unbenannt 2.txt");

    expect(nextUntitledName([])).toBe("Unbenannt.txt");
    expect(nextUntitledName([first])).toBe("Unbenannt 2.txt");
    expect(nextUntitledName([first, second])).toBe("Unbenannt 3.txt");
  });

  it("detects pristine and edited documents independently", () => {
    const document = createUntitledDocument();
    expect(isPristineUntitled(document)).toBe(true);
    expect(documentIsDirty(document)).toBe(false);

    document.content = "Neue Notiz";
    expect(isPristineUntitled(document)).toBe(false);
    expect(documentIsDirty(document)).toBe(true);

    document.content = "";
    document.metadataDirty = true;
    expect(isPristineUntitled(document)).toBe(false);
    expect(documentIsDirty(document)).toBe(true);
  });

  it("matches Windows paths case-insensitively and POSIX paths exactly", () => {
    expect(sameDocumentPath("C:\\Notes\\Draft.md", "c:/notes/draft.md")).toBe(true);
    expect(sameDocumentPath("/home/me/Draft.md", "/home/me/draft.md")).toBe(false);
    expect(sameDocumentPath("", "/home/me/draft.md")).toBe(false);
  });

  it("finds save collisions while excluding the saving tab", () => {
    const first = createUntitledDocument("first.txt");
    first.path = "C:\\Notes\\first.txt";
    first.untitled = false;
    const second = createUntitledDocument("second.txt");
    second.path = "C:\\Notes\\second.txt";
    second.untitled = false;
    const tabs = [
      { id: "first", document: first, revision: 0 },
      { id: "second", document: second, revision: 0 },
    ];

    expect(findTabByPath(tabs, "c:/notes/second.txt", "first")?.id).toBe(
      "second",
    );
    expect(findTabByPath(tabs, "C:\\Notes\\first.txt", "first")).toBeUndefined();
  });

  it("finds the insertion index from tab midpoints", () => {
    const rects = [
      { left: 0, width: 100 },
      { left: 100, width: 100 },
      { left: 200, width: 100 },
    ];
    expect(insertionIndex(-5, rects)).toBe(0);
    expect(insertionIndex(49, rects)).toBe(0);
    expect(insertionIndex(51, rects)).toBe(1);
    expect(insertionIndex(250, rects)).toBe(3);
    expect(insertionIndex(999, rects)).toBe(3);
    expect(insertionIndex(10, [])).toBe(0);
  });

  it("reorders tabs in place and clamps the target index", () => {
    const tabs = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(reorderTabs(tabs, "a", 2)).toBe(true);
    expect(tabs.map((tab) => tab.id)).toEqual(["b", "c", "a"]);
    expect(reorderTabs(tabs, "c", 0)).toBe(true);
    expect(tabs.map((tab) => tab.id)).toEqual(["c", "b", "a"]);
    expect(reorderTabs(tabs, "b", 1)).toBe(false);
    expect(reorderTabs(tabs, "a", 99)).toBe(false);
    expect(reorderTabs(tabs, "missing", 0)).toBe(false);
    expect(tabs.map((tab) => tab.id)).toEqual(["c", "b", "a"]);
  });

  it("round-trips a tab transfer including unsaved edits and rejects damaged payloads", () => {
    const document = createUntitledDocument("notes.md");
    document.path = "C:\\Notes\\notes.md";
    document.untitled = false;
    document.savedContent = "# Notes";
    document.content = "# Notes\n\nEdited";
    document.version = "abc";

    const parsed = parseTabTransfer(serializeTabTransfer(document, "split"));
    expect(parsed?.mode).toBe("split");
    expect(parsed?.document).toEqual(document);
    expect(parsed && documentIsDirty(parsed.document)).toBe(true);

    const binary = createUntitledDocument("photo.png");
    binary.binary = { mime: "image/png", base64: "AAAA" };
    expect(parseTabTransfer(serializeTabTransfer(binary, "view"))?.document.binary).toEqual(binary.binary);

    expect(parseTabTransfer("not json")).toBeNull();
    expect(parseTabTransfer(JSON.stringify({ version: 2, document }))).toBeNull();
    expect(parseTabTransfer(JSON.stringify({ version: 1, document: { ...document, content: 5 } }))).toBeNull();
    expect(parseTabTransfer(JSON.stringify({ version: 1, document: { ...document, binary: { mime: "x" } } }))).toBeNull();
    expect(parseTabTransfer(JSON.stringify({ version: 1, document, mode: "bogus" }))?.mode).toBe("edit");
  });
});
