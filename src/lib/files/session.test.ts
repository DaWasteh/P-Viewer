import { describe, expect, it } from "vitest";
import { parseWindowSession } from "./session";

describe("window session persistence", () => {
  it("round-trips multi-pane splitscreen layout and filters invalid panes", () => {
    const raw = JSON.stringify({
      version: 1,
      activeRecoveryId: "r-b",
      tabs: [
        { recoveryId: "r-a", path: "C:/docs/a.md", name: "a.md", untitled: false, mode: "edit" },
        { recoveryId: "r-b", path: "C:/docs/b.md", name: "b.md", untitled: false, mode: "view" },
      ],
      panes: [
        { recoveryId: "r-a", weight: 0.35 },
        { recoveryId: "r-b", weight: 0.65 },
        { recoveryId: "r-b", weight: 0.2 }, // duplicate
        { recoveryId: "missing", weight: 0.5 }, // unknown tab
        { recoveryId: "r-a", weight: -1 }, // invalid weight
      ],
    });
    const parsed = parseWindowSession(raw);
    expect(parsed?.activeRecoveryId).toBe("r-b");
    expect(parsed?.panes).toEqual([
      { recoveryId: "r-a", weight: 0.35 },
      { recoveryId: "r-b", weight: 0.65 },
    ]);
  });

  it("omits panes when fewer than two valid panes remain", () => {
    const raw = JSON.stringify({
      version: 1,
      tabs: [{ recoveryId: "r-a", path: "C:/docs/a.md", name: "a.md", untitled: false, mode: "edit" }],
      panes: [{ recoveryId: "r-a", weight: 1 }],
    });
    const parsed = parseWindowSession(raw);
    expect(parsed?.panes).toBeUndefined();
  });
});
