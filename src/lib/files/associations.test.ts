import { describe, expect, it } from "vitest";
import {
  FILE_ASSOCIATION_GROUPS,
  FILE_ASSOCIATION_IDS,
  extensionsForAssociationIds,
  normalizeAssociationIds,
} from "./associations";
import { SUPPORTED_FILE_EXTENSIONS } from "./fileTypes";

describe("system file association groups", () => {
  it("covers every supported extension exactly once", () => {
    const associated = FILE_ASSOCIATION_GROUPS.flatMap((group) => group.extensions);

    expect(associated).toHaveLength(SUPPORTED_FILE_EXTENSIONS.length);
    expect(new Set(associated).size).toBe(associated.length);
    expect(associated).toEqual(expect.arrayContaining([...SUPPORTED_FILE_EXTENSIONS]));
  });

  it("normalizes persisted selections", () => {
    expect(normalizeAssociationIds(undefined)).toEqual(FILE_ASSOCIATION_IDS);
    expect(normalizeAssociationIds(["markdown", "invalid", "markdown", 12])).toEqual([
      "markdown",
    ]);
  });

  it("resolves selected groups to their extensions", () => {
    expect(extensionsForAssociationIds(["markdown", "json"])).toEqual(
      expect.arrayContaining(["md", "markdown", "json", "jsonc", "json5"]),
    );
    expect(extensionsForAssociationIds([])).toEqual([]);
  });
});
