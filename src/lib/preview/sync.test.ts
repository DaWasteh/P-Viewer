import { describe, expect, it } from "vitest";
import { anchorForLine, lineToOffset, normalizeAnchors, offsetToLine, type SourceAnchor } from "./sync";

// # Title (1) · paragraph (3-4) · image (6, 600 px tall) · list 8-10 with items 8, 9, 10 · code 12-20
const anchors: SourceAnchor[] = normalizeAnchors([
  { start: 1, end: 1, top: 0, height: 40 },
  { start: 3, end: 4, top: 60, height: 50 },
  { start: 6, end: 6, top: 130, height: 600 },
  { start: 8, end: 10, top: 750, height: 90 },
  { start: 8, end: 8, top: 750, height: 30 },
  { start: 9, end: 9, top: 780, height: 30 },
  { start: 10, end: 10, top: 810, height: 30 },
  { start: 12, end: 20, top: 860, height: 270 },
]);

describe("source anchors", () => {
  it("maps lines to preview offsets by interpolating inside and between elements", () => {
    expect(lineToOffset(anchors, 1)).toBe(0);
    expect(lineToOffset(anchors, 3)).toBe(60);
    expect(lineToOffset(anchors, 4)).toBe(85);
    // The one-line image is 600 px tall: half a line into it is half the image.
    expect(lineToOffset(anchors, 6.5)).toBe(430);
    // Gap line 7 between the image (ends at 730) and the list (starts at 750).
    expect(lineToOffset(anchors, 7)).toBe(730);
    expect(lineToOffset(anchors, 7.5)).toBe(740);
    // Nested list items win over the list itself.
    expect(lineToOffset(anchors, 9)).toBe(780);
    expect(lineToOffset(anchors, 16)).toBe(980);
    expect(lineToOffset(anchors, 99)).toBe(1130);
    expect(lineToOffset([], 5)).toBeNull();
  });

  it("maps preview offsets back to source lines", () => {
    expect(offsetToLine(anchors, 0)).toBe(1);
    expect(offsetToLine(anchors, 85)).toBe(4);
    expect(offsetToLine(anchors, 430)).toBe(6.5);
    expect(offsetToLine(anchors, 740)).toBe(7.5);
    expect(offsetToLine(anchors, 795)).toBe(9.5);
    expect(offsetToLine(anchors, 5000)).toBe(21);
    expect(offsetToLine([], 10)).toBeNull();
  });

  it("round-trips positions", () => {
    for (const line of [1, 2.5, 3.2, 6.1, 6.9, 8.4, 9.7, 12, 15.5]) {
      expect(offsetToLine(anchors, lineToOffset(anchors, line)!)).toBeCloseTo(line, 5);
    }
  });

  it("drops anchors that would run backwards and picks the deepest anchor for a line", () => {
    const cleaned = normalizeAnchors([
      { start: 5, end: 5, top: 100, height: 10 },
      { start: 1, end: 1, top: 0, height: 10 },
      { start: 7, end: 7, top: 50, height: 10 },
    ]);
    expect(cleaned.map((anchor) => anchor.start)).toEqual([1, 5]);
    expect(anchorForLine(anchors, 9)?.height).toBe(30);
    expect(anchorForLine(anchors, 11)?.start).toBe(10);
  });
});
