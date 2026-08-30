import { describe, expect, it } from "vitest";
import { createUntitledDocument } from "./documents";
import {
  documentIsDirty,
  findTabByPath,
  isPristineUntitled,
  nextUntitledName,
  sameDocumentPath,
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
});
