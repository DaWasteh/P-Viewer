import type { OpenDocument, ViewMode } from "./types";

export interface DocumentTab {
  id: string;
  document: OpenDocument;
  revision: number;
}

export function documentIsDirty(document: OpenDocument): boolean {
  return document.metadataDirty || document.content !== document.savedContent;
}

export function isPristineUntitled(document: OpenDocument): boolean {
  return (
    document.untitled &&
    !document.path &&
    document.content === "" &&
    document.savedContent === "" &&
    !document.metadataDirty
  );
}

export function sameDocumentPath(left: string, right: string): boolean {
  if (!left || !right) return false;
  const windowsPath = /^(?:[a-z]:[\\/]|[\\/]{2})/i.test(left) || /^(?:[a-z]:[\\/]|[\\/]{2})/i.test(right);
  const normalize = (path: string) => path.replace(/\\/g, "/").replace(/^\/\/\?\/UNC\//i, "//").replace(/^\/\/\?\/(?=[a-z]:)/i, "");
  return windowsPath
    ? normalize(left).toLowerCase() === normalize(right).toLowerCase()
    : normalize(left) === normalize(right);
}

export function findTabByPath(
  tabs: DocumentTab[],
  path: string,
  excludedTabId?: string,
): DocumentTab | undefined {
  return tabs.find(
    (tab) =>
      tab.id !== excludedTabId &&
      tab.document.path &&
      sameDocumentPath(tab.document.path, path),
  );
}

export function nextUntitledName(documents: OpenDocument[]): string {
  const usedNames = new Set(documents.map(({ name }) => name.toLocaleLowerCase("de")));
  let index = 1;

  while (true) {
    const name = index === 1 ? "Unbenannt.txt" : `Unbenannt ${index}.txt`;
    if (!usedNames.has(name.toLocaleLowerCase("de"))) return name;
    index += 1;
  }
}

/**
 * Index at which an item dropped at `pointX` belongs, given the horizontal
 * extents of the items it is inserted among: before the first item whose
 * midpoint lies right of the pointer, otherwise at the end.
 */
export function insertionIndex(
  pointX: number,
  rects: ReadonlyArray<{ left: number; width: number }>,
): number {
  const index = rects.findIndex((rect) => pointX < rect.left + rect.width / 2);
  return index < 0 ? rects.length : index;
}

/** Moves the tab `id` so that it ends up at `index` among the remaining tabs. */
export function reorderTabs<T extends { id: string }>(tabs: T[], id: string, index: number): boolean {
  const from = tabs.findIndex((tab) => tab.id === id);
  if (from < 0) return false;
  const target = Math.max(0, Math.min(index, tabs.length - 1));
  if (target === from) return false;
  const [moved] = tabs.splice(from, 1);
  tabs.splice(target, 0, moved);
  return true;
}

/** Everything another window needs to continue with a tab; editor undo history stays behind. */
export interface TabTransfer {
  version: 1;
  document: OpenDocument;
  mode: ViewMode;
}

export function serializeTabTransfer(document: OpenDocument, mode: ViewMode): string {
  const transfer: TabTransfer = { version: 1, document: { ...document }, mode };
  return JSON.stringify(transfer);
}

const VIEW_MODES: readonly ViewMode[] = ["edit", "view", "split"];

/** Parses a transfer produced by `serializeTabTransfer`; anything malformed is rejected. */
export function parseTabTransfer(raw: string): TabTransfer | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.document)) return null;
  const document = value.document;
  if (
    typeof document.path !== "string" ||
    typeof document.name !== "string" ||
    typeof document.content !== "string" ||
    typeof document.savedContent !== "string" ||
    typeof document.encoding !== "string" ||
    typeof document.untitled !== "boolean" ||
    typeof document.metadataDirty !== "boolean" ||
    !isRecord(document.fileType) ||
    typeof document.fileType.kind !== "string"
  ) {
    return null;
  }
  if (document.binary != null) {
    if (!isRecord(document.binary) || typeof document.binary.base64 !== "string" || typeof document.binary.mime !== "string") {
      return null;
    }
  }
  const mode = VIEW_MODES.includes(value.mode as ViewMode) ? (value.mode as ViewMode) : "edit";
  return { version: 1, document: document as unknown as OpenDocument, mode };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
