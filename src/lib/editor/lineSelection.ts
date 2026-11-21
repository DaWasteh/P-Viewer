import { EditorSelection, type Extension, type Text } from "@codemirror/state";
import { EditorView, ViewPlugin, type PluginValue } from "@codemirror/view";

/** Distance in CSS pixels from the top/bottom edge of the editor scroller where auto-scroll begins. */
export const AUTOSCROLL_EDGE_PX = 36;
/** Maximum auto-scroll speed in CSS pixels per second. */
export const AUTOSCROLL_MAX_PX_PER_SEC = 4000;

/**
 * Computes the CodeMirror selection range covering every line between
 * `anchorLineNumber` and `targetLineNumber` (inclusive, 1-based).
 *
 * Includes the trailing newline whenever the last selected line is not the
 * final line of the document, so empty lines are visibly selected and
 * cutting/deleting removes the whole line cleanly.
 */
export function lineSelectionRange(
  doc: Text,
  anchorLineNumber: number,
  targetLineNumber: number,
): { anchor: number; head: number } {
  const clamp = (line: number) => Math.max(1, Math.min(doc.lines, Math.round(line)));
  const anchorNum = clamp(anchorLineNumber);
  const targetNum = clamp(targetLineNumber);
  const startLine = doc.line(Math.min(anchorNum, targetNum));
  const endLine = doc.line(Math.max(anchorNum, targetNum));
  const startOffset = startLine.from;
  const endOffset = endLine.number < doc.lines ? doc.line(endLine.number + 1).from : endLine.to;

  if (targetNum < anchorNum) {
    return { anchor: endOffset, head: startOffset };
  }
  return { anchor: startOffset, head: endOffset };
}

/**
 * Computes vertical auto-scroll velocity (CSS px/s) for a pointer at `clientY`
 * relative to the editor scroller bounds. Returns 0 inside the middle zone,
 * positive values near/past the bottom edge, and negative values near/past the
 * top edge. Speed grows smoothly and superlinearly the further the pointer moves
 * toward or beyond the edge.
 */
export function autoScrollVelocity(
  clientY: number,
  viewportTop: number,
  viewportBottom: number,
): number {
  const height = Math.max(0, viewportBottom - viewportTop);
  if (height === 0) return 0;

  const edge = Math.min(AUTOSCROLL_EDGE_PX, height / 4);
  const bottomTrigger = viewportBottom - edge;
  const topTrigger = viewportTop + edge;

  if (clientY > bottomTrigger) {
    const distance = clientY - bottomTrigger;
    return Math.min(AUTOSCROLL_MAX_PX_PER_SEC, 80 + distance * 10 + distance * distance * 0.12);
  }
  if (clientY < topTrigger) {
    const distance = topTrigger - clientY;
    return -Math.min(AUTOSCROLL_MAX_PX_PER_SEC, 80 + distance * 10 + distance * distance * 0.12);
  }
  return 0;
}

function isLineNumberTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".cm-lineNumbers"));
}

function lineBoundsAtClientY(view: EditorView, clientY: number): { first: number; last: number } {
  const doc = view.state.doc;
  const scrollerRect = view.scrollDOM.getBoundingClientRect();
  const clampedY = Math.max(scrollerRect.top + 1, Math.min(scrollerRect.bottom - 1, clientY));
  const height = clampedY - view.documentTop;

  if (height <= 0) {
    const block = view.lineBlockAtHeight(0);
    return { first: doc.lineAt(block.from).number, last: doc.lineAt(block.to).number };
  }
  if (height >= view.contentHeight) {
    return { first: doc.lines, last: doc.lines };
  }

  const block = view.lineBlockAtHeight(height);
  return {
    first: doc.lineAt(block.from).number,
    last: doc.lineAt(block.to).number,
  };
}

function existingAnchorLine(view: EditorView): number {
  const doc = view.state.doc;
  const main = view.state.selection.main;
  const line = doc.lineAt(main.anchor);
  // Upward full-line selections anchor at the start of the following line.
  if (main.anchor > main.head && main.anchor === line.from && line.number > 1) {
    return line.number - 1;
  }
  return line.number;
}

interface DragState {
  pointerId: number;
  anchorStartLine: number;
  anchorEndLine: number;
  clientY: number;
  rafId: number;
  lastTimestamp: number;
  scrollRemainder: number;
}

const gutterSelectionPlugin = ViewPlugin.fromClass(
  class GutterLineSelectionPlugin implements PluginValue {
    private drag: DragState | null = null;

    constructor(private readonly view: EditorView) {
      this.view.dom.addEventListener("pointerdown", this.handlePointerDown);
    }

    private applySelection(clientY: number, userEvent: string): void {
      if (!this.drag) return;
      const target = lineBoundsAtClientY(this.view, clientY);
      const doc = this.view.state.doc;
      const range =
        target.first < this.drag.anchorStartLine
          ? lineSelectionRange(doc, this.drag.anchorEndLine, target.first)
          : lineSelectionRange(doc, this.drag.anchorStartLine, target.last);

      const current = this.view.state.selection.main;
      if (current.anchor === range.anchor && current.head === range.head) return;

      this.view.dispatch({
        selection: EditorSelection.single(range.anchor, range.head),
        userEvent,
      });
    }

    private scheduleAutoScroll(): void {
      if (!this.drag || this.drag.rafId !== 0) return;
      const rect = this.view.scrollDOM.getBoundingClientRect();
      if (autoScrollVelocity(this.drag.clientY, rect.top, rect.bottom) === 0) return;
      this.drag.lastTimestamp = performance.now();
      this.drag.scrollRemainder = 0;
      this.drag.rafId = window.requestAnimationFrame(this.stepAutoScroll);
    }

    private stopAutoScroll(): void {
      if (!this.drag || this.drag.rafId === 0) return;
      window.cancelAnimationFrame(this.drag.rafId);
      this.drag.rafId = 0;
      this.drag.scrollRemainder = 0;
    }

    private readonly stepAutoScroll = (timestamp: number): void => {
      if (!this.drag) return;
      this.drag.rafId = 0;

      const scroller = this.view.scrollDOM;
      const rect = scroller.getBoundingClientRect();
      const velocity = autoScrollVelocity(this.drag.clientY, rect.top, rect.bottom);
      if (velocity === 0) return;

      const dt = Math.min(0.05, Math.max(0, (timestamp - this.drag.lastTimestamp) / 1000));
      this.drag.lastTimestamp = timestamp;
      this.drag.scrollRemainder += velocity * dt;
      const delta = Math.trunc(this.drag.scrollRemainder);

      if (delta !== 0) {
        const previousTop = scroller.scrollTop;
        scroller.scrollTop = previousTop + delta;
        this.drag.scrollRemainder -= delta;
        if (scroller.scrollTop !== previousTop) {
          this.applySelection(this.drag.clientY, "select");
        }
      }

      this.drag.rafId = window.requestAnimationFrame(this.stepAutoScroll);
    };

    private readonly handlePointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || !isLineNumberTarget(event.target)) return;
      event.preventDefault();
      this.stopDrag();

      const clicked = lineBoundsAtClientY(this.view, event.clientY);
      const anchorStartLine = event.shiftKey ? existingAnchorLine(this.view) : clicked.first;
      const anchorEndLine = event.shiftKey ? anchorStartLine : clicked.last;

      this.drag = {
        pointerId: event.pointerId,
        anchorStartLine,
        anchorEndLine,
        clientY: event.clientY,
        rafId: 0,
        lastTimestamp: 0,
        scrollRemainder: 0,
      };

      this.view.focus();
      this.applySelection(event.clientY, "select.pointer");

      window.addEventListener("pointermove", this.handlePointerMove);
      window.addEventListener("pointerup", this.handlePointerEnd);
      window.addEventListener("pointercancel", this.handlePointerEnd);
      window.addEventListener("blur", this.handleWindowBlur);
      this.scheduleAutoScroll();
    };

    private readonly handlePointerMove = (event: PointerEvent): void => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      this.drag.clientY = event.clientY;
      this.applySelection(event.clientY, "select");
      const rect = this.view.scrollDOM.getBoundingClientRect();
      if (autoScrollVelocity(event.clientY, rect.top, rect.bottom) !== 0) {
        this.scheduleAutoScroll();
      } else {
        this.stopAutoScroll();
      }
    };

    private readonly handlePointerEnd = (event: PointerEvent): void => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      this.stopDrag();
    };

    private readonly handleWindowBlur = (): void => {
      this.stopDrag();
    };

    private stopDrag(): void {
      if (!this.drag) return;
      this.stopAutoScroll();
      window.removeEventListener("pointermove", this.handlePointerMove);
      window.removeEventListener("pointerup", this.handlePointerEnd);
      window.removeEventListener("pointercancel", this.handlePointerEnd);
      window.removeEventListener("blur", this.handleWindowBlur);
      this.drag = null;
    }

    destroy(): void {
      this.stopDrag();
      this.view.dom.removeEventListener("pointerdown", this.handlePointerDown);
    }
  },
);

const gutterSelectionTheme = EditorView.theme({
  ".cm-lineNumbers": {
    userSelect: "none",
    cursor: "pointer",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    cursor: "pointer",
  },
});

const suppressDefaultGutterMouseDown = EditorView.domEventHandlers({
  mousedown(event) {
    if (event.button === 0 && isLineNumberTarget(event.target)) {
      event.preventDefault();
      return true;
    }
    return false;
  },
});

/** Enables clicking and dragging in the line-number gutter to select whole lines with edge auto-scroll. */
export function gutterLineSelection(): Extension {
  return [gutterSelectionPlugin, suppressDefaultGutterMouseDown, gutterSelectionTheme];
}
