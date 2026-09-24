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

describe("restored editor view state", () => {
  it("applies a clamped selection and folds to a freshly created state", async () => {
    const { codeFolding, foldedRanges } = await import("@codemirror/language");
    const { captureEditorView } = await import("./session");
    const text = "line 1\nline 2\nline 3\nline 4";
    const state = restoreEditorState({ restore: { selection: { anchor: 3, head: 999 }, folds: [[6, 20], [50, 60]] } }, text, [codeFolding()]);
    expect(state.selection.main.anchor).toBe(3);
    expect(state.selection.main.head).toBe(text.length);
    const folded: Array<[number, number]> = [];
    foldedRanges(state).between(0, text.length, (from, to) => { folded.push([from, to]); });
    expect(folded).toEqual([[6, 20]]);
    const captured = captureEditorView({ state, scrollTop: 42 });
    expect(captured).toEqual({ selection: { anchor: 3, head: text.length }, editorScroll: 42, folds: [[6, 20]] });
  });

  it("ignores restore data when a retained state matches the document", () => {
    const state = restoreEditorState(undefined, "same", []).update({ selection: EditorSelection.cursor(2) }).state;
    const restored = restoreEditorState({ state, restore: { selection: { anchor: 0, head: 0 } } }, "same", []);
    expect(restored.selection.main.head).toBe(2);
  });
});
