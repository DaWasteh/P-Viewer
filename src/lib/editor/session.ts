import { EditorSelection, EditorState, StateEffect, type Extension } from "@codemirror/state";
import { foldEffect, foldedRanges } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import type { TabViewState } from "$lib/files/tabs";

/** One immutable state per open tab, never a hidden live EditorView. */
export interface EditorSession {
  state?: EditorState;
  scrollTop?: number;
  scrollLeft?: number;
  /** The mounted editor, so the session can capture the live cursor and scroll position. */
  view?: EditorView;
  /** Cursor, selection and folds for an editor created without a retained state (session restore, transfer). */
  restore?: TabViewState;
}

export function restoreEditorState(session: EditorSession | undefined, value: string, extensions: Extension): EditorState {
  if (session?.state?.doc.toString() === value) {
    // Replace component-bound callbacks/compartments but retain matching state fields
    // (history, selection and folds) from the previous mounted editor.
    return session.state.update({ effects: StateEffect.reconfigure.of(extensions) }).state;
  }
  const restore = session?.restore;
  const clamp = (offset: number) => Math.max(0, Math.min(offset, value.length));
  const selection = restore?.selection
    ? EditorSelection.single(clamp(restore.selection.anchor), clamp(restore.selection.head))
    : undefined;
  let state = EditorState.create({ doc: value, extensions, selection });
  const folds = (restore?.folds ?? [])
    .map(([from, to]) => [clamp(from), clamp(to)] as const)
    .filter(([from, to]) => from < to);
  // Without the fold state field of `basicSetup` the effects are simply ignored.
  if (folds.length > 0) {
    state = state.update({ effects: folds.map(([from, to]) => foldEffect.of({ from, to })) }).state;
  }
  return state;
}

/** Cursor, selection, folds and scroll offsets of a tab's editor right now. */
export function captureEditorView(session: EditorSession | undefined): TabViewState | undefined {
  if (!session) return undefined;
  const state = session.view?.state ?? session.state;
  if (!state) return session.restore;
  const main = state.selection.main;
  const folds: Array<[number, number]> = [];
  foldedRanges(state).between(0, state.doc.length, (from, to) => {
    if (folds.length < 2_000) folds.push([from, to]);
  });
  return {
    selection: { anchor: main.anchor, head: main.head },
    editorScroll: session.view ? session.view.scrollDOM.scrollTop : session.scrollTop ?? 0,
    folds,
  };
}
