import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILE_ASSOCIATION_IDS,
  FILE_ASSOCIATION_GROUPS,
  FILE_ASSOCIATION_IDS,
  extensionsForAssociationIds,
  normalizeAssociationIds,
} from "./associations";
import { SUPPORTED_FILE_EXTENSIONS } from "./fileTypes";
import runtimeSource from "../../../src-tauri/src/associations.rs?raw";
import windowsConfigSource from "../../../src-tauri/tauri.windows.conf.json?raw";
import nsisHooks from "../../../src-tauri/windows/file-associations.nsh?raw";

const windowsConfig = JSON.parse(windowsConfigSource) as {
  bundle: { fileAssociations: unknown[] };
};

describe("system file association groups", () => {
  it("covers every supported extension exactly once", () => {
    const associated = FILE_ASSOCIATION_GROUPS.flatMap((group) => group.extensions);

    expect(associated).toHaveLength(SUPPORTED_FILE_EXTENSIONS.length);
    expect(new Set(associated).size).toBe(associated.length);
    expect(associated).toEqual(expect.arrayContaining([...SUPPORTED_FILE_EXTENSIONS]));
  });

  it("keeps images and PDF out of the initial default-app selection", () => {
    const binaryGroups = FILE_ASSOCIATION_GROUPS.filter((group) => group.defaultSelection === false);
    expect(binaryGroups.map((group) => group.id)).toEqual(
      expect.arrayContaining(["png-image", "jpeg-image", "pdf"]),
    );
    expect(binaryGroups.flatMap((group) => group.extensions)).toEqual(
      expect.arrayContaining(["png", "jpg", "webp", "pdf"]),
    );
    expect(DEFAULT_FILE_ASSOCIATION_IDS).not.toContain("pdf");
    expect(DEFAULT_FILE_ASSOCIATION_IDS).toContain("markdown");
    expect(DEFAULT_FILE_ASSOCIATION_IDS.length + binaryGroups.length).toBe(FILE_ASSOCIATION_IDS.length);
  });

  it("normalizes persisted selections", () => {
    expect(normalizeAssociationIds(undefined)).toEqual(DEFAULT_FILE_ASSOCIATION_IDS);
    expect(normalizeAssociationIds(["pdf", "markdown"])).toEqual(["pdf", "markdown"]);
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

  it("keeps Windows installer registration candidate-only", () => {
    expect(windowsConfig.bundle.fileAssociations).toEqual([]);
    expect(nsisHooks).toContain("Candidate-only registration");
    expect(nsisHooks).not.toContain("APP_ASSOCIATE");
    expect(nsisHooks).not.toMatch(
      /WriteRegStr SHCTX "Software\\Classes\\\.\$\{EXT\}" ""/,
    );
    expect(nsisHooks).toContain(
      'WriteRegStr SHCTX "Software\\Classes\\.${EXT}\\OpenWithProgids" "${PROGID}" ""',
    );
    expect(runtimeSource).not.toContain("UserChoice");
    expect(runtimeSource).toContain("ms-settings:defaultapps?registeredAppUser=P-Viewer");
    expect(runtimeSource).toContain("SHChangeNotify");
  });
});
