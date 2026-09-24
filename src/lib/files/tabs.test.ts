import { describe, expect, it } from "vitest";
import { createUntitledDocument } from "./documents";
import {
  bulkCloseTargets,
  clampSplitRatio,
  disambiguationHints,
  documentIsDirty,
  findTabByPath,
  fuzzyScore,
  insertionIndex,
  isPristineUntitled,
  logicalInsertionIndex,
  moveTab,
  nextUntitledName,
  normalizePinnedOrder,
  parseTabTransfer,
  parseTransferState,
  reorderTabs,
  sameDocumentPath,
  searchTabs,
  serializeRestoreTransfer,
  serializeTabTransfer,
  setTabPinned,
  sortTabs,
  tabIsDirty,
  visibleTabIds,
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
      { id: "first", document: first, revision: 0, recoveryId: "r1" },
      { id: "second", document: second, revision: 0, recoveryId: "r2" },
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

    const parsed = parseTabTransfer(serializeTabTransfer(document, "split", { recoveryId: "r-1", pinned: true, selection: { anchor: 2, head: 4 } }));
    expect(parsed?.mode).toBe("split");
    expect(parsed?.document).toEqual(document);
    expect(parsed?.state).toEqual({ recoveryId: "r-1", pinned: true, selection: { anchor: 2, head: 4 } });
    expect(parsed?.document && documentIsDirty(parsed.document)).toBe(true);

    const binary = createUntitledDocument("photo.png");
    binary.binary = { mime: "image/png", base64: "AAAA" };
    expect(parseTabTransfer(serializeTabTransfer(binary, "view"))?.document?.binary).toEqual(binary.binary);

    expect(parseTabTransfer("not json")).toBeNull();
    expect(parseTabTransfer(JSON.stringify({ version: 2, document }))).toBeNull();
    expect(parseTabTransfer(JSON.stringify({ version: 1, document: { ...document, content: 5 } }))).toBeNull();
    expect(parseTabTransfer(JSON.stringify({ version: 1, document: { ...document, binary: { mime: "x" } } }))).toBeNull();
    expect(parseTabTransfer(JSON.stringify({ version: 1, document, mode: "bogus" }))?.mode).toBe("edit");
  });

  it("keeps pinned tabs in front and moves tabs only within their group", () => {
    const tabs: Array<{ id: string; pinned?: boolean }> = [{ id: "a" }, { id: "b" }, { id: "c", pinned: true }, { id: "d" }];
    normalizePinnedOrder(tabs);
    expect(tabs.map((tab) => tab.id)).toEqual(["c", "a", "b", "d"]);
    expect(setTabPinned(tabs, "d", true)).toBe(true);
    expect(tabs.map((tab) => tab.id)).toEqual(["c", "d", "a", "b"]);
    // A regular tab cannot be dragged into the pinned area and vice versa.
    expect(reorderTabs(tabs, "b", 0)).toBe(true);
    expect(tabs.map((tab) => tab.id)).toEqual(["c", "d", "b", "a"]);
    expect(reorderTabs(tabs, "c", 3)).toBe(true);
    expect(tabs.map((tab) => tab.id)).toEqual(["d", "c", "b", "a"]);
    expect(moveTab(tabs, "c", "right")).toBe(false);
    expect(moveTab(tabs, "a", "start")).toBe(true);
    expect(tabs.map((tab) => tab.id)).toEqual(["d", "c", "a", "b"]);
    expect(moveTab(tabs, "a", "end")).toBe(true);
    expect(moveTab(tabs, "d", "left")).toBe(false);
    expect(setTabPinned(tabs, "d", false)).toBe(true);
    expect(tabs.map((tab) => tab.id)).toEqual(["c", "d", "b", "a"]);
  });

  it("maps drops among visible tabs to logical positions", () => {
    const all = ["a", "b", "c", "d", "e", "f"];
    const visible = ["a", "b", "f"];
    expect(logicalInsertionIndex(all, visible, "a", 0)).toBe(0);
    expect(logicalInsertionIndex(all, visible, "a", 1)).toBe(4);
    expect(logicalInsertionIndex(all, visible, "a", 2)).toBe(5);
    expect(logicalInsertionIndex(all, visible, null, 3)).toBe(6);
    expect(logicalInsertionIndex(all, [], "x", 0)).toBe(6);
  });

  it("selects bulk close targets relative to the right-clicked tab in logical order", () => {
    const tab = (id: string, name: string, path: string, extra: { pinned?: boolean; dirty?: boolean } = {}) => {
      const document = createUntitledDocument(name);
      document.path = path;
      document.untitled = !path;
      if (extra.dirty) document.content = "changed";
      return { id, document, pinned: extra.pinned };
    };
    const tabs = [
      tab("p", "pinned.md", "C:\\docs\\pinned.md", { pinned: true }),
      tab("a", "a.md", "C:\\docs\\a.md"),
      tab("b", "b.txt", "C:\\docs\\b.txt", { dirty: true }),
      tab("c", "c.md", "C:\\other\\c.md"),
      tab("d", "Unbenannt.txt", ""),
    ];
    expect(bulkCloseTargets(tabs, "b", "others")).toEqual(["a", "c", "d"]);
    expect(bulkCloseTargets(tabs, "b", "right")).toEqual(["c", "d"]);
    expect(bulkCloseTargets(tabs, "b", "left")).toEqual(["a"]);
    expect(bulkCloseTargets(tabs, "b", "all")).toEqual(["p", "a", "b", "c", "d"]);
    expect(bulkCloseTargets(tabs, "b", "saved")).toEqual(["a", "c", "d"]);
    expect(bulkCloseTargets(tabs, "a", "extension")).toEqual(["a", "c"]);
    expect(bulkCloseTargets(tabs, "a", "folder")).toEqual(["b"]);
    expect(bulkCloseTargets(tabs, "d", "folder")).toEqual([]);
    expect(bulkCloseTargets(tabs, "missing", "all")).toEqual([]);
  });

  it("treats restored tabs with recovery text as dirty", () => {
    const document = createUntitledDocument("a.md");
    expect(tabIsDirty({ document })).toBe(false);
    expect(tabIsDirty({ document, restore: { state: "pending", hasRecovery: true } })).toBe(true);
  });

  it("sorts each group by name, type or folder", () => {
    const make = (name: string, path: string, pinned = false) => ({ pinned, document: { name, path } });
    const tabs = [make("b.md", "/z/b.md"), make("a10.txt", "/a/a10.txt"), make("z.md", "/a/z.md", true), make("a2.md", "/z/a2.md")];
    sortTabs(tabs, "name");
    expect(tabs.map((tab) => tab.document.name)).toEqual(["z.md", "a2.md", "a10.txt", "b.md"]);
    sortTabs(tabs, "type");
    expect(tabs.map((tab) => tab.document.name)).toEqual(["z.md", "a2.md", "b.md", "a10.txt"]);
    sortTabs(tabs, "folder");
    expect(tabs.map((tab) => tab.document.name)).toEqual(["z.md", "a10.txt", "a2.md", "b.md"]);
  });

  it("distinguishes equally named files by the shortest differing folder", () => {
    const hints = disambiguationHints([
      { id: "1", name: "README.md", path: "C:\\p\\docs\\README.md" },
      { id: "2", name: "README.md", path: "C:\\p\\plugins\\audio\\README.md" },
      { id: "3", name: "readme.md", path: "C:\\p\\plugins\\video\\README.md" },
      { id: "4", name: "main.js", path: "C:\\p\\main.js" },
    ]);
    expect(hints.get("1")).toBe("docs");
    expect(hints.get("2")).toBe("audio");
    expect(hints.get("3")).toBe("video");
    expect(hints.has("4")).toBe(false);
  });

  it("fuzzy-matches tab names", () => {
    expect(fuzzyScore("rdme", "README.md")).toBeGreaterThan(0);
    expect(fuzzyScore("xyz", "README.md")).toBe(-1);
    const items = [
      { name: "thread.md", path: "/a/thread.md" },
      { name: "README.md", path: "/a/README.md" },
      { name: "README-DE.md", path: "/a/README-DE.md" },
      { name: "notes.txt", path: "/docs/readme-example/notes.txt" },
    ];
    expect(searchTabs(items, "read").map((item) => item.name).slice(0, 2)).toEqual(["README.md", "README-DE.md"]);
    expect(searchTabs(items, "read").map((item) => item.name)).toContain("notes.txt");
    expect(searchTabs(items, "")).toHaveLength(4);
  });

  it("computes the visible tabs by width without reordering or oscillating", () => {
    const tabs = ["h", "a", "b", "c", "d", "e", "f", "g", "i", "j", "k"].map((id) => ({ id, pinned: id === "h" }));
    const metrics = { available: 600, minTabWidth: 120, pinnedTabWidth: 40, overflowButtonWidth: 80 };
    // 520 px for tabs: the active tab, the pinned tab and the first regular ones.
    expect(visibleTabIds(tabs, "k", metrics)).toEqual(["h", "a", "b", "c", "k"]);
    expect(visibleTabIds(tabs, "b", metrics)).toEqual(["h", "a", "b", "c", "d"]);
    // Everything fits: no overflow button is reserved.
    expect(visibleTabIds(tabs.slice(1, 4), "a", { ...metrics, available: 360 })).toEqual(["a", "b", "c"]);
    // Even without room the active tab stays visible.
    expect(visibleTabIds(tabs, "j", { ...metrics, available: 100 })).toEqual(["j"]);
  });

  it("restores transfers without a document and validates stored state", () => {
    const raw = serializeRestoreTransfer({ recoveryId: "abc", path: "C:\\x.md", name: "x.md", hasRecovery: true, splitRatio: 9, selection: { anchor: 1, head: 2 } }, "split", true);
    const parsed = parseTabTransfer(raw);
    expect(parsed?.document).toBeUndefined();
    expect(parsed?.active).toBe(true);
    expect(parsed?.state?.splitRatio).toBe(0.8);
    expect(parsed?.state?.selection).toEqual({ anchor: 1, head: 2 });
    expect(parseTabTransfer(JSON.stringify({ version: 1, mode: "edit", state: { recoveryId: "../x", path: "a", name: "a" } }))).toBeNull();
    expect(parseTransferState({ recoveryId: "a", folds: [[5, 2], [1, 3], "x"], editorScroll: -4 })).toEqual({ recoveryId: "a", folds: [[1, 3]] });
    expect(clampSplitRatio(0.05)).toBe(0.2);
    expect(clampSplitRatio(Number.NaN)).toBe(0.5);
  });
});
