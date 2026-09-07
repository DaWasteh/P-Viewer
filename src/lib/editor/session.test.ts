import { describe, expect, it } from "vitest";
import { EditorSelection } from "@codemirror/state";
import { history, undoDepth } from "@codemirror/commands";
import { restoreEditorState } from "./session";

describe("per-tab editor sessions", () => {
  it("retains undo history and selection across component reconfiguration", () => {
    let state = restoreEditorState(undefined, "before", [history()]);
    state = state.update({ changes: { from: 6, insert: " after" }, selection: EditorSelection.cursor(3) }).state;
    const restored = restoreEditorState({ state, scrollTop: 123 }, "before after", [history()]);
    expect(restored.doc.toString()).toBe("before after");
    expect(restored.selection.main.head).toBe(3);
    expect(undoDepth(restored)).toBe(1);
  });
  it("does not restore stale history for a newly loaded document", () => {
    const state = restoreEditorState(undefined, "old", [history()]);
    const restored = restoreEditorState({ state }, "new", [history()]);
    expect(restored.doc.toString()).toBe("new");
    expect(undoDepth(restored)).toBe(0);
  });
});
