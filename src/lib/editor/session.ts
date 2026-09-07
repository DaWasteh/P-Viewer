import { EditorState, StateEffect, type Extension } from "@codemirror/state";

/** One immutable state per open tab, never a hidden live EditorView. */
export interface EditorSession {
  state?: EditorState;
  scrollTop?: number;
  scrollLeft?: number;
}

export function restoreEditorState(session: EditorSession | undefined, value: string, extensions: Extension): EditorState {
  if (session?.state?.doc.toString() === value) {
    // Replace component-bound callbacks/compartments but retain matching state fields
    // (history, selection and folds) from the previous mounted editor.
    return session.state.update({ effects: StateEffect.reconfigure.of(extensions) }).state;
  }
  return EditorState.create({ doc: value, extensions });
}
