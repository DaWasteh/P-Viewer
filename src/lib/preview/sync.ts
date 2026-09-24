/**
 * Editor ↔ preview synchronisation for the split view (issue #2).
 *
 * The rendered Markdown carries its source lines (`data-source-start/end`).
 * The preview turns them into a cached, sorted anchor list; mapping between a
 * source line and a preview offset is a binary search plus interpolation inside
 * an element or across the gap to the next one, so tall images, tables or code
 * blocks never skew the position like a plain percentage would. Only when no
 * anchor exists at all does the proportional fallback apply.
 */
export type SyncMode = "off" | "editor-to-preview" | "preview-to-editor" | "bidirectional";

export interface SourceAnchor {
  /** First and last source line (1-based, inclusive). */
  start: number;
  end: number;
  /** Offset of the element's top inside the scroller's content, and its height. */
  top: number;
  height: number;
}

/** Collects anchors below `root`, measured relative to the scrolling `scroller`. */
export function collectAnchors(root: ParentNode, scroller: HTMLElement): SourceAnchor[] {
  const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
  const anchors: SourceAnchor[] = [];
  for (const element of root.querySelectorAll<HTMLElement>("[data-source-start]")) {
    const start = Number(element.dataset.sourceStart);
    const end = Number(element.dataset.sourceEnd ?? start);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const rects = element.getClientRects();
    // Collapsed sections and elements without a box are no anchors.
    if (rects.length === 0) continue;
    const rect = element.getBoundingClientRect();
    anchors.push({ start, end: Math.max(start, end), top: rect.top - base, height: rect.height });
  }
  return normalizeAnchors(anchors);
}

/**
 * Sorts by source line (stable, so nested elements follow their parents) and
 * drops anchors whose position runs backwards, which would break the search.
 */
export function normalizeAnchors(anchors: SourceAnchor[]): SourceAnchor[] {
  const sorted = anchors
    .map((anchor, index) => ({ anchor, index }))
    .sort((left, right) => left.anchor.start - right.anchor.start || left.index - right.index)
    .map(({ anchor }) => anchor);
  const result: SourceAnchor[] = [];
  for (const anchor of sorted) {
    const previous = result[result.length - 1];
    if (previous && anchor.top < previous.top - 0.5) continue;
    result.push(anchor);
  }
  return result;
}

/** Index of the last element for which `key(element) <= value`, or -1. */
function lastAtOrBelow(anchors: readonly SourceAnchor[], value: number, key: (anchor: SourceAnchor) => number): number {
  let low = 0;
  let high = anchors.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (key(anchors[middle]) <= value) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Preview offset of a (fractional, 1-based) source line; null without anchors. */
export function lineToOffset(anchors: readonly SourceAnchor[], line: number): number | null {
  if (anchors.length === 0) return null;
  const index = lastAtOrBelow(anchors, Math.floor(line), (anchor) => anchor.start);
  if (index < 0) {
    const first = anchors[0];
    return first.top * clamp01((line - 1) / Math.max(1, first.start - 1));
  }
  const anchor = anchors[index];
  const bottom = anchor.top + anchor.height;
  if (line < anchor.end + 1) {
    return anchor.top + clamp01((line - anchor.start) / (anchor.end - anchor.start + 1)) * anchor.height;
  }
  const next = anchors[index + 1];
  if (!next) return bottom;
  const gapStart = anchor.end + 1;
  const fraction = clamp01((line - gapStart) / Math.max(1, next.start - gapStart));
  return bottom + fraction * Math.max(0, next.top - bottom);
}

/** Source line (fractional, 1-based) shown at a preview offset; null without anchors. */
export function offsetToLine(anchors: readonly SourceAnchor[], offset: number): number | null {
  if (anchors.length === 0) return null;
  const index = lastAtOrBelow(anchors, offset, (anchor) => anchor.top);
  if (index < 0) {
    const first = anchors[0];
    return 1 + (first.start - 1) * clamp01(first.top > 0 ? offset / first.top : 1);
  }
  const anchor = anchors[index];
  const bottom = anchor.top + anchor.height;
  if (offset < bottom) {
    return anchor.start + clamp01(anchor.height > 0 ? (offset - anchor.top) / anchor.height : 0) * (anchor.end - anchor.start + 1);
  }
  const next = anchors[index + 1];
  if (!next) return anchor.end + 1;
  const gapStart = anchor.end + 1;
  const fraction = clamp01(next.top > bottom ? (offset - bottom) / (next.top - bottom) : 1);
  return gapStart + fraction * Math.max(0, next.start - gapStart);
}

/** The anchor that best represents a source line (for highlighting). */
export function anchorForLine(anchors: readonly SourceAnchor[], line: number): SourceAnchor | null {
  const index = lastAtOrBelow(anchors, line, (anchor) => anchor.start);
  if (index < 0) return anchors[0] ?? null;
  // The deepest element covering the line; otherwise the closest one before it.
  for (let candidate = index; candidate >= 0 && anchors[candidate].start === anchors[index].start; candidate -= 1) {
    if (anchors[candidate].end >= line) return anchors[candidate];
  }
  return anchors[index];
}

export interface EditorSyncAdapter {
  scroller: HTMLElement;
  /** Fractional source line at the top edge of the editor viewport. */
  topLine(): number;
  lineCount(): number;
  scrollToLine(line: number): void;
  /** Moves the cursor to the line, focuses the editor and briefly highlights the line. */
  revealLine(line: number): void;
}

export interface PreviewSyncAdapter {
  scroller: HTMLElement;
  /** Cached anchors; rebuilt only after rendering or layout changes. */
  anchors(): SourceAnchor[];
  /** Briefly highlights the element of a source line. */
  flashLine(line: number): void;
}

type Side = "editor" | "preview";

/**
 * Keeps both sides of the split view aligned. The side the user last
 * interacted with (wheel, pointer, keys, touch) owns the scroll position;
 * scroll events of the other side are programmatic echoes and are ignored,
 * so no scroll loop can start. Work is coalesced into one animation frame.
 */
export class PreviewSyncController {
  private mode: SyncMode = "off";
  private clickNavigation = true;
  private active = false;
  private editor: EditorSyncAdapter | null = null;
  private preview: PreviewSyncAdapter | null = null;
  private owner: Side | null = null;
  private frame = 0;

  /** `active` is true only in the split view of a Markdown document. */
  configure(options: { active: boolean; mode: SyncMode; clickNavigation: boolean }): void {
    const becameActive = options.active && !this.active;
    this.active = options.active;
    this.mode = options.mode;
    this.clickNavigation = options.clickNavigation;
    if (!this.active) this.cancel();
    if (becameActive) this.owner = null;
  }

  get clickNavigationEnabled(): boolean {
    return this.active && this.clickNavigation && Boolean(this.editor);
  }

  private follows(side: Side): boolean {
    if (!this.active || this.mode === "off") return false;
    return side === "preview"
      ? this.mode === "editor-to-preview" || this.mode === "bidirectional"
      : this.mode === "preview-to-editor" || this.mode === "bidirectional";
  }

  private watch(side: Side, scroller: HTMLElement): () => void {
    const claim = () => {
      this.owner = side;
    };
    const scrolled = () => {
      if (this.owner === side) this.schedule(side);
    };
    const events = ["wheel", "pointerdown", "keydown", "touchstart"] as const;
    for (const type of events) scroller.addEventListener(type, claim, { passive: true, capture: true });
    scroller.addEventListener("scroll", scrolled, { passive: true });
    return () => {
      for (const type of events) scroller.removeEventListener(type, claim, { capture: true });
      scroller.removeEventListener("scroll", scrolled);
    };
  }

  attachEditor(adapter: EditorSyncAdapter): () => void {
    this.editor = adapter;
    this.owner = null;
    const stop = this.watch("editor", adapter.scroller);
    return () => {
      stop();
      if (this.editor === adapter) this.editor = null;
      this.cancel();
    };
  }

  attachPreview(adapter: PreviewSyncAdapter): () => void {
    this.preview = adapter;
    this.owner = null;
    const stop = this.watch("preview", adapter.scroller);
    return () => {
      stop();
      if (this.preview === adapter) this.preview = null;
      this.cancel();
    };
  }

  /** The user typed or moved the cursor: the editor leads from now on. */
  editorInteracted(): void {
    this.owner = "editor";
  }

  /**
   * The preview re-rendered (text changed, images loaded, width changed). The
   * part the user is working on stays in view instead of jumping elsewhere.
   */
  previewChanged(): void {
    if (this.owner === "editor") this.schedule("editor");
    else if (this.owner === "preview") this.schedule("preview");
  }

  /** Click navigation from the preview to the source line. */
  navigateToSource(line: number): boolean {
    if (!this.active || !this.editor) return false;
    this.owner = "editor";
    this.editor.revealLine(line);
    return true;
  }

  /** The editor cursor was placed on `line` by the user: show and highlight it in the preview. */
  revealInPreview(line: number): void {
    if (!this.follows("preview") || !this.preview) return;
    const scroller = this.preview.scroller;
    const offset = lineToOffset(this.preview.anchors(), line);
    if (offset !== null && (offset < scroller.scrollTop || offset > scroller.scrollTop + scroller.clientHeight - 40)) {
      scroller.scrollTo({ top: Math.max(0, offset - scroller.clientHeight / 3), behavior: "instant" });
    }
    this.preview.flashLine(line);
  }

  private schedule(source: Side): void {
    const target: Side = source === "editor" ? "preview" : "editor";
    if (!this.follows(target)) return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      if (source === "editor") this.syncEditorToPreview();
      else this.syncPreviewToEditor();
    });
  }

  private cancel(): void {
    cancelAnimationFrame(this.frame);
  }

  syncEditorToPreview(): void {
    const editor = this.editor;
    const preview = this.preview;
    if (!editor || !preview) return;
    const scroller = preview.scroller;
    const line = editor.topLine();
    let offset = lineToOffset(preview.anchors(), line);
    if (offset === null) {
      const lines = Math.max(1, editor.lineCount());
      offset = ((line - 1) / lines) * (scroller.scrollHeight - scroller.clientHeight);
    }
    const top = Math.max(0, Math.min(offset, scroller.scrollHeight - scroller.clientHeight));
    if (Math.abs(scroller.scrollTop - top) > 1) scroller.scrollTo({ top, behavior: "instant" });
  }

  syncPreviewToEditor(): void {
    const editor = this.editor;
    const preview = this.preview;
    if (!editor || !preview) return;
    const scroller = preview.scroller;
    let line = offsetToLine(preview.anchors(), scroller.scrollTop);
    if (line === null) {
      const range = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
      line = 1 + (scroller.scrollTop / range) * Math.max(0, editor.lineCount() - 1);
    }
    editor.scrollToLine(Math.max(1, Math.min(line, editor.lineCount() + 0.999)));
  }
}
