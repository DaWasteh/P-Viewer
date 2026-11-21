import { describe, expect, it } from "vitest";
import { Text } from "@codemirror/state";
import {
  AUTOSCROLL_EDGE_PX,
  AUTOSCROLL_MAX_PX_PER_SEC,
  autoScrollVelocity,
  lineSelectionRange,
} from "./lineSelection";

describe("gutter line selection helpers", () => {
  it("selects a single full line including its trailing newline except on the last line", () => {
    const doc = Text.of(["first", "second", "third"]);
    expect(lineSelectionRange(doc, 1, 1)).toEqual({ anchor: 0, head: 6 });
    expect(lineSelectionRange(doc, 2, 2)).toEqual({ anchor: 6, head: 13 });
    expect(lineSelectionRange(doc, 3, 3)).toEqual({ anchor: 13, head: 18 });
  });

  it("selects downward and upward multi-line ranges cleanly", () => {
    const doc = Text.of(["line 1", "line 2", "line 3", "line 4"]);
    // Downward: lines 2..3
    const down = lineSelectionRange(doc, 2, 3);
    expect(doc.sliceString(down.anchor, down.head)).toBe("line 2\nline 3\n");

    // Upward: anchor on line 3, drag up to line 1
    const up = lineSelectionRange(doc, 3, 1);
    expect(up.anchor).toBeGreaterThan(up.head);
    expect(doc.sliceString(up.head, up.anchor)).toBe("line 1\nline 2\nline 3\n");

    // Upward from the final line to line 2
    const upFromEnd = lineSelectionRange(doc, 4, 2);
    expect(doc.sliceString(upFromEnd.head, upFromEnd.anchor)).toBe("line 2\nline 3\nline 4");
  });

  it("handles empty lines and clamps out-of-range line numbers", () => {
    const doc = Text.of(["a", "", "b"]);
    const emptyLine = lineSelectionRange(doc, 2, 2);
    expect(emptyLine).toEqual({ anchor: 2, head: 3 });
    expect(doc.sliceString(emptyLine.anchor, emptyLine.head)).toBe("\n");

    expect(lineSelectionRange(doc, -5, 99)).toEqual({ anchor: 0, head: doc.length });
  });

  it("computes monotonic auto-scroll velocities near and past the viewport edges", () => {
    const top = 100;
    const bottom = 500;
    // Middle zone: no scrolling
    expect(autoScrollVelocity(300, top, bottom)).toBe(0);
    expect(autoScrollVelocity(bottom - AUTOSCROLL_EDGE_PX, top, bottom)).toBe(0);
    expect(autoScrollVelocity(top + AUTOSCROLL_EDGE_PX, top, bottom)).toBe(0);

    // Near bottom edge -> faster as pointer moves further down
    const nearBottom = autoScrollVelocity(bottom - 10, top, bottom);
    const atBottom = autoScrollVelocity(bottom, top, bottom);
    const belowBottom = autoScrollVelocity(bottom + 40, top, bottom);
    const farBelow = autoScrollVelocity(bottom + 120, top, bottom);
    expect(nearBottom).toBeGreaterThan(0);
    expect(atBottom).toBeGreaterThan(nearBottom);
    expect(belowBottom).toBeGreaterThan(atBottom);
    expect(farBelow).toBeGreaterThan(belowBottom);
    expect(autoScrollVelocity(bottom + 5000, top, bottom)).toBe(AUTOSCROLL_MAX_PX_PER_SEC);

    // Symmetric upward scrolling near and above the top edge
    const nearTop = autoScrollVelocity(top + 10, top, bottom);
    const aboveTop = autoScrollVelocity(top - 40, top, bottom);
    expect(nearTop).toBeLessThan(0);
    expect(aboveTop).toBeLessThan(nearTop);
    expect(nearTop).toBeCloseTo(-nearBottom, 5);
    expect(aboveTop).toBeCloseTo(-belowBottom, 5);

    // Degenerate zero-height viewport
    expect(autoScrollVelocity(200, 100, 100)).toBe(0);
  });
});
