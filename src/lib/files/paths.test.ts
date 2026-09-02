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

  it("preserves UNC roots and never traverses above the share", () => {
    expect(
      resolveDocumentReference(
        "\\\\server\\share\\docs\\readme.md",
        "../images/result.png",
      ),
    ).toBe("\\\\server\\share\\images\\result.png");
    expect(
      resolveDocumentReference(
        "\\\\server\\share\\readme.md",
        "../../outside.txt",
      ),
    ).toBe("\\\\server\\share\\outside.txt");
    expect(
      resolveDocumentReference(
        "\\\\server\\share\\docs\\readme.md",
        "\\assets\\logo.svg",
      ),
    ).toBe("\\\\server\\share\\assets\\logo.svg");
  });

  it("accepts absolute UNC and extended Windows paths", () => {
    expect(
      resolveDocumentReference(
        "C:\\docs\\readme.md",
        "\\\\archive\\public\\manual.pdf",
      ),
    ).toBe("\\\\archive\\public\\manual.pdf");
    expect(
      resolveDocumentReference(
        "\\\\?\\C:\\docs\\readme.md",
        "../manual.pdf",
      ),
    ).toBe("\\\\?\\C:\\manual.pdf");
    expect(
      resolveDocumentReference(
        "C:\\docs\\readme.md",
        "\\\\.\\PhysicalDrive0",
      ),
    ).toBeNull();
    expect(resolveDocumentReference("C:\\docs\\readme.md", "\\\\server"))
      .toBeNull();
    expect(resolveDocumentReference("C:\\docs\\readme.md", "\\\\server\\..\\x"))
      .toBeNull();
  });

  it("resolves drive-rooted and bare-document references", () => {
    expect(resolveDocumentReference("C:\\docs\\readme.md", "\\assets\\logo.svg"))
      .toBe("C:\\assets\\logo.svg");
    expect(resolveDocumentReference("readme.md", "notes/todo.md"))
      .toBe("notes/todo.md");
  });

  it("does not treat external or in-document links as files", () => {
    expect(resolveDocumentReference("/paper/readme.md", "https://example.com")).toBeNull();
    expect(resolveDocumentReference("/paper/readme.md", "#results")).toBeNull();
    expect(resolveDocumentReference("/paper/readme.md", "//example.com/image.png")).toBeNull();
  });

  it("rejects encoded schemes, controls, and ambiguous drive-relative paths", () => {
    expect(
      resolveDocumentReference("/paper/readme.md", "https%3A%2F%2Fexample.com%2Fx"),
    ).toBeNull();
    expect(
      resolveDocumentReference("/paper/readme.md", "%6Aavascript%3Aalert(1)"),
    ).toBeNull();
    expect(resolveDocumentReference("C:\\docs\\readme.md", "C:relative.txt"))
      .toBeNull();
    expect(resolveDocumentReference("/paper/readme.md", "bad%00name.txt"))
      .toBeNull();
  });
});
