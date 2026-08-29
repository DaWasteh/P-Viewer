import { describe, expect, it } from "vitest";
import { resolveDocumentReference } from "./paths";

describe("document references", () => {
  it("resolves Windows relative paths", () => {
    expect(
      resolveDocumentReference(
        "C:\\Papers\\Draft\\paper.md",
        "../figures/result%201.png",
      ),
    ).toBe("C:\\Papers\\figures\\result 1.png");
  });

  it("resolves POSIX relative paths", () => {
    expect(resolveDocumentReference("/home/me/paper/readme.md", "notes/method.md#data"))
      .toBe("/home/me/paper/notes/method.md");
  });

  it("does not treat external or in-document links as files", () => {
    expect(resolveDocumentReference("/paper/readme.md", "https://example.com")).toBeNull();
    expect(resolveDocumentReference("/paper/readme.md", "#results")).toBeNull();
  });
});
