export const MAX_SPLIT_PANES = 4;
export const MIN_PANE_WEIGHT = 0.15;

/** One side-by-side document slot in the workspace. */
export interface WorkspacePane {
  id: string;
  tabId: string;
  /** Positive relative width share; weights across all panes sum to 1. */
  weight: number;
}

/** Normalizes pane weights so each pane stays above the minimum share and weights sum to 1. */
export function normalizePaneWeights(panes: readonly WorkspacePane[]): WorkspacePane[] {
  if (panes.length === 0) return [];
  if (panes.length === 1) return [{ ...panes[0], weight: 1 }];

  const floor = Math.min(MIN_PANE_WEIGHT, 1 / panes.length);
  const raw = panes.map((pane) => (Number.isFinite(pane.weight) && pane.weight > 0 ? pane.weight : 1 / panes.length));
  const rawTotal = raw.reduce((sum, value) => sum + value, 0);
  const scaled = raw.map((value) => Math.max(floor, value / rawTotal));
  const total = scaled.reduce((sum, value) => sum + value, 0);
  return panes.map((pane, index) => ({ ...pane, weight: scaled[index] / total }));
}

/** Gives every pane the exact same width share. */
export function equalizePaneWeights(panes: readonly WorkspacePane[]): WorkspacePane[] {
  if (panes.length === 0) return [];
  const share = 1 / panes.length;
  return panes.map((pane) => ({ ...pane, weight: share }));
}

/**
 * Resizes the adjacent pair `(dividerIndex, dividerIndex + 1)` by `deltaRatio`
 * (fraction of total workspace width) while keeping their combined width and all
 * other panes unchanged.
 */
export function resizePanePair(
  panes: readonly WorkspacePane[],
  dividerIndex: number,
  deltaRatio: number,
): WorkspacePane[] {
  if (dividerIndex < 0 || dividerIndex >= panes.length - 1 || !Number.isFinite(deltaRatio)) {
    return panes.map((pane) => ({ ...pane }));
  }
  const left = panes[dividerIndex];
  const right = panes[dividerIndex + 1];
  const pairSum = left.weight + right.weight;
  const minShare = Math.min(MIN_PANE_WEIGHT, pairSum / 2);
  const nextLeft = Math.max(minShare, Math.min(pairSum - minShare, left.weight + deltaRatio));
  const nextRight = pairSum - nextLeft;
  return panes.map((pane, index) => {
    if (index === dividerIndex) return { ...pane, weight: nextLeft };
    if (index === dividerIndex + 1) return { ...pane, weight: nextRight };
    return { ...pane };
  });
}

/** Sets the left pane weight in the adjacent pair directly (clamped), keeping the pair sum constant. */
export function setPanePairLeftWeight(
  panes: readonly WorkspacePane[],
  dividerIndex: number,
  leftWeight: number,
): WorkspacePane[] {
  if (dividerIndex < 0 || dividerIndex >= panes.length - 1) {
    return panes.map((pane) => ({ ...pane }));
  }
  return resizePanePair(panes, dividerIndex, leftWeight - panes[dividerIndex].weight);
}

/**
 * Appends a new split pane for `tabId` if the limit is not reached and the tab
 * is not already displayed in another pane. Existing panes keep their relative
 * proportions while making room for the new pane.
 */
export function addSplitPane(
  panes: readonly WorkspacePane[],
  nextPaneId: string,
  tabId: string,
): WorkspacePane[] | null {
  if (panes.length >= MAX_SPLIT_PANES || panes.some((pane) => pane.tabId === tabId)) {
    return null;
  }
  const normalized = normalizePaneWeights(panes);
  const nextCount = normalized.length + 1;
  const newWeight = 1 / nextCount;
  const scale = (nextCount - 1) / nextCount;
  return [
    ...normalized.map((pane) => ({ ...pane, weight: pane.weight * scale })),
    { id: nextPaneId, tabId, weight: newWeight },
  ];
}

/** Removes a pane from the split layout (never removes the last remaining pane). */
export function removeSplitPane(
  panes: readonly WorkspacePane[],
  paneId: string,
): { panes: WorkspacePane[]; nextActivePaneId: string } | null {
  if (panes.length <= 1) return null;
  const index = panes.findIndex((pane) => pane.id === paneId);
  if (index < 0) return null;
  const remaining = normalizePaneWeights(panes.filter((pane) => pane.id !== paneId));
  const nextActive = remaining[Math.min(index, remaining.length - 1)];
  return { panes: remaining, nextActivePaneId: nextActive.id };
}

/**
 * Picks a tab that is not yet visible in any split pane, preferring the tab
 * right after `activeTabId` and wrapping around. Returns null when every open
 * tab is already visible.
 */
export function pickTabForNewPane(
  tabIds: readonly string[],
  panes: readonly WorkspacePane[],
  activeTabId: string,
): string | null {
  const shown = new Set(panes.map((pane) => pane.tabId));
  const start = Math.max(0, tabIds.indexOf(activeTabId));
  for (let offset = 1; offset <= tabIds.length; offset += 1) {
    const candidate = tabIds[(start + offset) % tabIds.length];
    if (!shown.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Updates panes after `closedTabId` was removed from the tab list.
 * - If another pane was showing `closedTabId`, that pane is removed (closing a
 *   tab in multi-pane split shrinks the split cleanly without duplicating tabs).
 * - If it was the only pane, it switches to `fallbackTabId`.
 */
export function reconcilePanesAfterTabClose(
  panes: readonly WorkspacePane[],
  activePaneId: string,
  closedTabId: string,
  fallbackTabId: string,
): { panes: WorkspacePane[]; activePaneId: string } {
  const affectedIndex = panes.findIndex((pane) => pane.tabId === closedTabId);
  if (affectedIndex < 0) {
    return { panes: panes.map((pane) => ({ ...pane })), activePaneId };
  }
  if (panes.length === 1) {
    return {
      panes: [{ ...panes[0], tabId: fallbackTabId, weight: 1 }],
      activePaneId: panes[0].id,
    };
  }
  const remaining = normalizePaneWeights(panes.filter((_, index) => index !== affectedIndex));
  const nextActive = remaining.some((pane) => pane.id === activePaneId)
    ? activePaneId
    : remaining[Math.min(affectedIndex, remaining.length - 1)].id;
  return { panes: remaining, activePaneId: nextActive };
}
