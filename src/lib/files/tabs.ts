import type { OpenDocument, ViewMode } from "./types";

/**
 * Per-tab view state that survives tab switches, window transfers and (via
 * the session) restarts. Positions use CodeMirror document offsets.
 */
export interface TabViewState {
  selection?: { anchor: number; head: number };
  editorScroll?: number;
  previewScroll?: number;
  /** Folded editor ranges as [from, to] offsets. */
  folds?: Array<[number, number]>;
}

/** A tab restored from the session whose file has not been read yet. */
export interface TabRestore {
  state: "pending" | "loading" | "error";
  error?: string;
  /** Last known on-disk version; a mismatch means the file changed meanwhile. */
  version?: string;
  /** The unsaved content lives in the recovery store under the tab's recovery id. */
  hasRecovery: boolean;
  /** Network paths that did not answer in time are marked as unavailable, not failed. */
  unavailable?: boolean;
}

/** A notice shown above a restored tab, e.g. an external change since the last session. */
export interface TabNotice {
  kind: "external-change" | "missing";
  /** On-disk text for "Datenträgerversion verwenden". */
  diskContent?: string;
  diskVersion?: string;
}

export interface DocumentTab {
  id: string;
  document: OpenDocument;
  revision: number;
  mode?: ViewMode;
  /** Pinned tabs stay left of all other tabs and survive bulk closes. */
  pinned?: boolean;
  /** Editor share of the split view, 0.2–0.8. */
  splitRatio?: number;
  /** Per-tab preview synchronisation toggle; undefined follows the settings. */
  previewSync?: boolean;
  /** Stable key for the session and the recovery store; travels with the tab. */
  recoveryId: string;
  view?: TabViewState;
  restore?: TabRestore;
  notice?: TabNotice;
}

export const MIN_SPLIT_RATIO = 0.2;
export const MAX_SPLIT_RATIO = 0.8;

export function clampSplitRatio(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, value));
}

export function newRecoveryId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ?? `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function isRecoveryId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,64}$/.test(value);
}

export function documentIsDirty(document: OpenDocument): boolean {
  return document.metadataDirty || document.content !== document.savedContent;
}

/** Dirty including restored tabs whose unsaved text still waits in the recovery store. */
export function tabIsDirty(tab: Pick<DocumentTab, "document" | "restore">): boolean {
  return Boolean(tab.restore?.hasRecovery) || documentIsDirty(tab.document);
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

/** Index range `[start, end)` of the group (pinned or regular) a tab belongs to. */
function groupRange<T extends { pinned?: boolean }>(tabs: readonly T[], pinned: boolean): [number, number] {
  const pinnedCount = tabs.filter((tab) => tab.pinned).length;
  return pinned ? [0, pinnedCount] : [pinnedCount, tabs.length];
}

/**
 * Moves the tab `id` so that it ends up at `index` among the remaining tabs.
 * Pinned and regular tabs keep separate areas: the index is clamped into the
 * moved tab's own group.
 */
export function reorderTabs<T extends { id: string; pinned?: boolean }>(tabs: T[], id: string, index: number): boolean {
  const from = tabs.findIndex((tab) => tab.id === id);
  if (from < 0) return false;
  const [start, end] = groupRange(tabs, Boolean(tabs[from].pinned));
  const target = Math.max(start, Math.min(index, end - 1, tabs.length - 1));
  if (target === from) return false;
  const [moved] = tabs.splice(from, 1);
  tabs.splice(target, 0, moved);
  return true;
}

/**
 * Converts an insertion index among the visible tabs (the dragged tab
 * excluded) into an index among all remaining tabs, so tabs hidden in the
 * overflow menu keep their logical position.
 */
export function logicalInsertionIndex(
  allIds: readonly string[],
  visibleIds: readonly string[],
  movingId: string | null,
  visibleIndex: number,
): number {
  const remaining = allIds.filter((id) => id !== movingId);
  const visible = visibleIds.filter((id) => id !== movingId);
  if (visible.length === 0) return remaining.length;
  if (visibleIndex < visible.length) return Math.max(0, remaining.indexOf(visible[visibleIndex]));
  return remaining.indexOf(visible[visible.length - 1]) + 1;
}

/** Restores the invariant "pinned tabs first" without changing either group's order. */
export function normalizePinnedOrder<T extends { pinned?: boolean }>(tabs: T[]): void {
  const ordered = [...tabs.filter((tab) => tab.pinned), ...tabs.filter((tab) => !tab.pinned)];
  if (ordered.every((tab, index) => tab === tabs[index])) return;
  tabs.splice(0, tabs.length, ...ordered);
}

/** Pins or unpins a tab; it moves to the end of the pinned area or the start of the regular one. */
export function setTabPinned<T extends { id: string; pinned?: boolean }>(tabs: T[], id: string, pinned: boolean): boolean {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0 || Boolean(tabs[index].pinned) === pinned) return false;
  const [tab] = tabs.splice(index, 1);
  tab.pinned = pinned;
  const pinnedCount = tabs.filter((candidate) => candidate.pinned).length;
  tabs.splice(pinnedCount, 0, tab);
  return true;
}

export type TabMove = "left" | "right" | "start" | "end";

/** Moves a tab within its own group; returns false at the group boundary. */
export function moveTab<T extends { id: string; pinned?: boolean }>(tabs: T[], id: string, move: TabMove): boolean {
  const from = tabs.findIndex((tab) => tab.id === id);
  if (from < 0) return false;
  const [start, end] = groupRange(tabs, Boolean(tabs[from].pinned));
  const target = move === "left" ? from - 1 : move === "right" ? from + 1 : move === "start" ? start : end - 1;
  if (target < start || target >= end) return false;
  return reorderTabs(tabs, id, target);
}

export type TabSort = "name" | "type" | "folder";

/** Sorts pinned and regular tabs separately; ties keep their current order. */
export function sortTabs<T extends { pinned?: boolean; document: Pick<OpenDocument, "name" | "path"> }>(tabs: T[], by: TabSort): void {
  const compare = (left: string, right: string) => left.localeCompare(right, "de", { sensitivity: "base", numeric: true });
  const key = (tab: T): string[] => {
    const name = tab.document.name;
    if (by === "type") return [extensionOfName(name), name];
    if (by === "folder") return [directoryOf(tab.document.path), name];
    return [name];
  };
  const sortGroup = (group: T[]) =>
    group
      .map((tab, index) => ({ tab, index, key: key(tab) }))
      .sort((left, right) => {
        for (let part = 0; part < left.key.length; part += 1) {
          const result = compare(left.key[part], right.key[part]);
          if (result !== 0) return result;
        }
        return left.index - right.index;
      })
      .map(({ tab }) => tab);
  tabs.splice(0, tabs.length, ...sortGroup(tabs.filter((tab) => tab.pinned)), ...sortGroup(tabs.filter((tab) => !tab.pinned)));
}

export function extensionOfName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Folder of a path with its original separators, or "" for untitled documents. */
export function directoryOf(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut > 0 ? path.slice(0, cut) : "";
}

export type BulkClose = "others" | "right" | "left" | "all" | "saved" | "extension" | "folder";

/**
 * Tabs a bulk close affects, always relative to the right-clicked tab and the
 * logical tab order (never only the visible part of the strip). Pinned tabs
 * are protected from everything but "all".
 */
export function bulkCloseTargets(
  tabs: ReadonlyArray<Pick<DocumentTab, "id" | "pinned" | "document" | "restore">>,
  contextId: string,
  kind: BulkClose,
): string[] {
  const index = tabs.findIndex((tab) => tab.id === contextId);
  if (index < 0) return [];
  const context = tabs[index];
  const unpinned = (tab: (typeof tabs)[number]) => !tab.pinned;
  let targets: Array<(typeof tabs)[number]>;
  switch (kind) {
    case "others":
      targets = tabs.filter((tab) => tab.id !== contextId && unpinned(tab));
      break;
    case "right":
      targets = tabs.slice(index + 1).filter(unpinned);
      break;
    case "left":
      targets = tabs.slice(0, index).filter(unpinned);
      break;
    case "all":
      targets = [...tabs];
      break;
    case "saved":
      targets = tabs.filter((tab) => unpinned(tab) && !tabIsDirty(tab));
      break;
    case "extension": {
      const extension = extensionOfName(context.document.name);
      targets = tabs.filter((tab) => unpinned(tab) && extensionOfName(tab.document.name) === extension);
      break;
    }
    case "folder": {
      const folder = directoryOf(context.document.path);
      targets = folder
        ? tabs.filter((tab) => tab.id !== contextId && unpinned(tab) && sameDocumentPath(directoryOf(tab.document.path), folder))
        : [];
      break;
    }
  }
  return targets.map((tab) => tab.id);
}

/**
 * Short folder hints for tabs whose file names collide: the shortest trailing
 * folder path that tells them apart ("docs", "plugins/audio").
 */
export function disambiguationHints(items: ReadonlyArray<{ id: string; name: string; path: string }>): Map<string, string> {
  const hints = new Map<string, string>();
  const byName = new Map<string, typeof items[number][]>();
  for (const item of items) {
    const key = item.name.toLocaleLowerCase("de");
    byName.set(key, [...(byName.get(key) ?? []), item]);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const segments = group.map((item) => directoryOf(item.path).split(/[\\/]/).filter(Boolean));
    const longest = Math.max(1, ...segments.map((parts) => parts.length));
    for (let depth = 1; depth <= longest; depth += 1) {
      const labels = segments.map((parts) => parts.slice(-depth).join("/"));
      if (new Set(labels).size === labels.length || depth === longest) {
        group.forEach((item, index) => hints.set(item.id, labels[index] || "nicht gespeichert"));
        break;
      }
    }
  }
  return hints;
}

/**
 * Fuzzy subsequence score (higher is better), or -1 when `query` does not
 * match. Consecutive characters, word starts and an early first hit score
 * higher, so "rdme" finds README.md and "read" prefers README over thread.md.
 */
export function fuzzyScore(query: string, text: string): number {
  const needle = query.trim().toLocaleLowerCase("de");
  if (!needle) return 0;
  const haystack = text.toLocaleLowerCase("de");
  let score = 0;
  let position = -1;
  let streak = 0;
  for (const character of needle) {
    const found = haystack.indexOf(character, position + 1);
    if (found < 0) return -1;
    const wordStart = found === 0 || /[\s._\-\\/]/.test(haystack[found - 1]);
    streak = found === position + 1 ? streak + 1 : 0;
    score += 1 + streak * 3 + (wordStart ? 4 : 0);
    position = found;
  }
  return score - haystack.indexOf(needle[0]) * 0.1;
}

/** Filters and ranks tabs by name (and path) for the overflow menu or a tab switcher. */
export function searchTabs<T extends { name: string; path: string }>(items: readonly T[], query: string): T[] {
  if (!query.trim()) return [...items];
  return items
    .map((item, index) => {
      const nameScore = fuzzyScore(query, item.name);
      const pathScore = fuzzyScore(query, item.path);
      const score = Math.max(nameScore >= 0 ? nameScore + 10 : -1, pathScore);
      return { item, index, score };
    })
    .filter(({ score }) => score >= 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item);
}

export interface TabStripMetrics {
  /** Width available for tabs plus the overflow button. */
  available: number;
  minTabWidth: number;
  pinnedTabWidth: number;
  overflowButtonWidth: number;
}

/**
 * Tabs the strip shows at its current width. Nothing is ever reordered: the
 * result keeps the logical order. Pinned tabs come first, the active tab is
 * always visible, the rest fill up in order; the overflow button's width is
 * reserved as soon as anything overflows, so the layout cannot oscillate.
 */
export function visibleTabIds(
  tabs: ReadonlyArray<{ id: string; pinned?: boolean }>,
  activeId: string,
  metrics: TabStripMetrics,
): string[] {
  const widthOf = (tab: { pinned?: boolean }) => (tab.pinned ? metrics.pinnedTabWidth : metrics.minTabWidth);
  const total = tabs.reduce((sum, tab) => sum + widthOf(tab), 0);
  if (total <= metrics.available) return tabs.map((tab) => tab.id);

  let budget = metrics.available - metrics.overflowButtonWidth;
  const visible = new Set<string>();
  const active = tabs.find((tab) => tab.id === activeId);
  if (active) {
    visible.add(active.id);
    budget -= widthOf(active);
  }
  for (const tab of tabs.filter((candidate) => candidate.pinned && candidate.id !== activeId)) {
    if (budget < widthOf(tab)) break;
    visible.add(tab.id);
    budget -= widthOf(tab);
  }
  for (const tab of tabs.filter((candidate) => !candidate.pinned && candidate.id !== activeId)) {
    if (budget < widthOf(tab)) break;
    visible.add(tab.id);
    budget -= widthOf(tab);
  }
  return tabs.filter((tab) => visible.has(tab.id)).map((tab) => tab.id);
}

/**
 * Everything another window needs to continue with a tab; editor undo history
 * stays behind. A tab restored from the session may travel without its
 * document: the target window then reads file and recovery text itself.
 */
export interface TabTransfer {
  version: 1;
  document?: OpenDocument;
  mode: ViewMode;
  state?: TransferState;
  /** The tab becomes the active tab of the receiving window. */
  active?: boolean;
}

/** View and session state a transferred or restored tab carries along. */
export interface TransferState extends TabViewState {
  recoveryId: string;
  pinned?: boolean;
  splitRatio?: number;
  previewSync?: boolean;
  /** Only for tabs without a document: what to load and whether recovery text exists. */
  path?: string;
  name?: string;
  untitled?: boolean;
  version?: string;
  hasRecovery?: boolean;
  encoding?: string;
  lineEnding?: OpenDocument["lineEnding"];
  hasBom?: boolean;
}

export function serializeTabTransfer(document: OpenDocument, mode: ViewMode, state?: TransferState): string {
  const transfer: TabTransfer = { version: 1, document: { ...document }, mode, ...(state ? { state } : {}) };
  return JSON.stringify(transfer);
}

export function serializeRestoreTransfer(state: TransferState, mode: ViewMode, active: boolean): string {
  const transfer: TabTransfer = { version: 1, mode, state, active };
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
  if (!isRecord(value) || value.version !== 1) return null;
  const mode = VIEW_MODES.includes(value.mode as ViewMode) ? (value.mode as ViewMode) : "edit";
  const state = parseTransferState(value.state);
  if (value.document == null) {
    if (!state || typeof state.path !== "string" || typeof state.name !== "string") return null;
    return { version: 1, mode, state, active: value.active === true };
  }
  if (!isRecord(value.document)) return null;
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
  return {
    version: 1,
    document: document as unknown as OpenDocument,
    mode,
    ...(state ? { state } : {}),
    active: value.active === true,
  };
}

/** Validates transferred or stored tab state field by field; bad fields are dropped. */
export function parseTransferState(value: unknown): TransferState | undefined {
  if (!isRecord(value) || !isRecoveryId(value.recoveryId)) return undefined;
  const state: TransferState = { recoveryId: value.recoveryId };
  if (typeof value.pinned === "boolean") state.pinned = value.pinned;
  if (typeof value.splitRatio === "number" && Number.isFinite(value.splitRatio)) state.splitRatio = clampSplitRatio(value.splitRatio);
  if (typeof value.previewSync === "boolean") state.previewSync = value.previewSync;
  if (typeof value.path === "string" && value.path.length <= 32_768) state.path = value.path;
  if (typeof value.name === "string" && value.name.length > 0 && value.name.length <= 1_024) state.name = value.name;
  if (typeof value.untitled === "boolean") state.untitled = value.untitled;
  if (typeof value.version === "string" && value.version.length <= 256) state.version = value.version;
  if (typeof value.hasRecovery === "boolean") state.hasRecovery = value.hasRecovery;
  if (typeof value.encoding === "string" && value.encoding.length <= 64) state.encoding = value.encoding;
  if (value.lineEnding === "lf" || value.lineEnding === "crlf" || value.lineEnding === "cr") state.lineEnding = value.lineEnding;
  if (typeof value.hasBom === "boolean") state.hasBom = value.hasBom;
  if (isRecord(value.selection) && isOffset(value.selection.anchor) && isOffset(value.selection.head)) {
    state.selection = { anchor: value.selection.anchor, head: value.selection.head };
  }
  if (isOffset(value.editorScroll)) state.editorScroll = value.editorScroll;
  if (isOffset(value.previewScroll)) state.previewScroll = value.previewScroll;
  if (Array.isArray(value.folds)) {
    const folds = value.folds
      .filter((fold): fold is [number, number] => Array.isArray(fold) && fold.length === 2 && isOffset(fold[0]) && isOffset(fold[1]) && fold[0] < fold[1])
      .slice(0, 2_000);
    if (folds.length > 0) state.folds = folds.map(([from, to]) => [from, to]);
  }
  return state;
}

function isOffset(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
