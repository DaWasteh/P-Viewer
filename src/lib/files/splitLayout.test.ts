import { describe, expect, it } from "vitest";
import {
  MAX_SPLIT_PANES,
  MIN_PANE_WEIGHT,
  addSplitPane,
  equalizePaneWeights,
  normalizePaneWeights,
  pickTabForNewPane,
  reconcilePanesAfterTabClose,
  removeSplitPane,
  resizePanePair,
  setPanePairLeftWeight,
  type WorkspacePane,
} from "./splitLayout";

describe("multi-tab splitscreen layout", () => {
  it("adds split panes while preserving existing proportions and enforcing uniqueness and max panes", () => {
    const single: WorkspacePane[] = [{ id: "p1", tabId: "t1", weight: 1 }];
    expect(addSplitPane(single, "p2", "t1")).toBeNull();

    const two = addSplitPane(single, "p2", "t2")!;
    expect(two).toEqual([
      { id: "p1", tabId: "t1", weight: 0.5 },
      { id: "p2", tabId: "t2", weight: 0.5 },
    ]);

    // Resize first pair to 70/30, then add a 3rd pane -> 70/30 ratio stays intact
    const resized = resizePanePair(two, 0, 0.2);
    const three = addSplitPane(resized, "p3", "t3")!;
    expect(three[0].weight / three[1].weight).toBeCloseTo(0.7 / 0.3, 5);
    expect(three[2].weight).toBeCloseTo(1 / 3, 5);
    expect(three.reduce((sum, p) => sum + p.weight, 0)).toBeCloseTo(1, 5);

    const four = addSplitPane(three, "p4", "t4")!;
    expect(four).toHaveLength(MAX_SPLIT_PANES);
    expect(addSplitPane(four, "p5", "t5")).toBeNull();
  });

  it("resizes only the adjacent pair and respects minimum pane weights", () => {
    const three = equalizePaneWeights([
      { id: "p1", tabId: "t1", weight: 1 },
      { id: "p2", tabId: "t2", weight: 1 },
      { id: "p3", tabId: "t3", weight: 1 },
    ]);
    const widened = resizePanePair(three, 0, 0.1);
    expect(widened[0].weight).toBeCloseTo(1 / 3 + 0.1, 5);
    expect(widened[1].weight).toBeCloseTo(1 / 3 - 0.1, 5);
    expect(widened[2].weight).toBeCloseTo(1 / 3, 5);

    // Extreme drag clamps at MIN_PANE_WEIGHT
    const clamped = resizePanePair(three, 0, 0.9);
    expect(clamped[1].weight).toBeCloseTo(MIN_PANE_WEIGHT, 5);
    expect(clamped[0].weight + clamped[1].weight).toBeCloseTo(2 / 3, 5);

    // Direct left-weight assignment (Home/End/Enter)
    const centered = setPanePairLeftWeight(clamped, 0, 1 / 3);
    expect(centered[0].weight).toBeCloseTo(1 / 3, 5);
    expect(centered[1].weight).toBeCloseTo(1 / 3, 5);
  });

  it("removes panes cleanly and normalizes remaining weights", () => {
    const single: WorkspacePane[] = [{ id: "p1", tabId: "t1", weight: 1 }];
    expect(removeSplitPane(single, "p1")).toBeNull();

    const three: WorkspacePane[] = [
      { id: "p1", tabId: "t1", weight: 0.5 },
      { id: "p2", tabId: "t2", weight: 0.3 },
      { id: "p3", tabId: "t3", weight: 0.2 },
    ];
    const removed = removeSplitPane(three, "p2")!;
    expect(removed.panes.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(removed.panes.reduce((sum, p) => sum + p.weight, 0)).toBeCloseTo(1, 5);
    expect(removed.nextActivePaneId).toBe("p3");
  });

  it("picks the next unshown tab around the active tab", () => {
    const panes: WorkspacePane[] = [{ id: "p1", tabId: "t2", weight: 1 }];
    expect(pickTabForNewPane(["t1", "t2", "t3"], panes, "t2")).toBe("t3");
    expect(pickTabForNewPane(["t1", "t2"], panes, "t2")).toBe("t1");
    expect(pickTabForNewPane(["t2"], panes, "t2")).toBeNull();
  });

  it("reconciles panes when a tab closes", () => {
    const two: WorkspacePane[] = [
      { id: "p1", tabId: "t1", weight: 0.4 },
      { id: "p2", tabId: "t2", weight: 0.6 },
    ];
    // Closing an unshown tab leaves panes intact
    const untouched = reconcilePanesAfterTabClose(two, "p1", "t3", "t1");
    expect(untouched.panes).toEqual(two);
    expect(untouched.activePaneId).toBe("p1");

    // Closing a tab shown in a split pane closes that pane and focuses remaining
    const shrunk = reconcilePanesAfterTabClose(two, "p2", "t2", "t1");
    expect(shrunk.panes).toEqual([{ id: "p1", tabId: "t1", weight: 1 }]);
    expect(shrunk.activePaneId).toBe("p1");

    // Closing the tab in single-pane mode swaps in the fallback tab
    const single = reconcilePanesAfterTabClose([{ id: "p1", tabId: "t1", weight: 1 }], "p1", "t1", "t2");
    expect(single.panes).toEqual([{ id: "p1", tabId: "t2", weight: 1 }]);
    expect(single.activePaneId).toBe("p1");
  });

  it("normalizes invalid weights safely", () => {
    const fixed = normalizePaneWeights([
      { id: "p1", tabId: "t1", weight: Number.NaN },
      { id: "p2", tabId: "t2", weight: -3 },
    ]);
    expect(fixed[0].weight).toBeCloseTo(0.5, 5);
    expect(fixed[1].weight).toBeCloseTo(0.5, 5);
  });
});
