<script lang="ts">
  import { onMount } from "svelte";
  import { basicSetup } from "codemirror";
  import { indentWithTab } from "@codemirror/commands";
  import { Compartment, EditorSelection, EditorState, Prec, StateEffect, StateField } from "@codemirror/state";
  import { Decoration, EditorView, keymap, type DecorationSet } from "@codemirror/view";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { loadLanguageForFile } from "./languages";
  import { restoreEditorState, type EditorSession } from "./session";
  import FormattingToolbar from "./FormattingToolbar.svelte";
  import { findReplace } from "./findReplace";
  import BatchReplaceDialog from "./BatchReplaceDialog.svelte";
  import { loadReplaceHistory, rememberRun, saveReplaceHistory } from "./batchReplace";
  import { toggleInline, type FormatCommand, type FormatDialect } from "./formatting";
  import type { PreviewSyncController } from "$lib/preview/sync";

  interface CursorPosition {
    line: number;
    column: number;
    selected: number;
  }

  interface Props {
    value: string;
    fileName: string;
    readOnly?: boolean;
    session?: EditorSession;
    theme?: "dark" | "light";
    fontSize?: number;
    wordWrap?: boolean;
    spellcheck?: boolean;
    /** Formatting toolbar and shortcuts for Markdown or HTML source; null hides them. */
    formatting?: FormatDialect | null;
    documentPath?: string;
    /** Split view synchronisation with the preview (issue #2). */
    sync?: PreviewSyncController;
    onChange?: (value: string) => void;
    onCursorChange?: (position: CursorPosition) => void;
  }

  let {
    value,
    fileName,
    readOnly = false,
    session,
    theme = "dark",
    fontSize = 14,
    wordWrap = false,
    spellcheck = false,
    formatting = null,
    documentPath = "",
    sync,
    onChange = () => undefined,
    onCursorChange = () => undefined,
  }: Props = $props();

  let host: HTMLDivElement;
  let view = $state.raw<EditorView | null>(null);
  let toolbar = $state<FormattingToolbar | null>(null);
  let syncingFromParent = false;
  let batchDialog = $state<{ initialRules: string } | null>(null);

  /** A plain "Alle ersetzen" also joins the replacement history. */
  async function rememberReplaceAll(query: { search: string; replace: string; caseSensitive: boolean; wholeWord: boolean; regexp: boolean }): Promise<void> {
    const separator = query.search.includes("=>") || query.replace.includes("=>") ? "\t" : " => ";
    const history = await loadReplaceHistory();
    await saveReplaceHistory(
      rememberRun(history, {
        name: "",
        rules: `${query.search}${separator}${query.replace}`,
        options: { caseSensitive: query.caseSensitive, wholeWord: query.wholeWord, regexp: query.regexp },
      }),
    ).catch(() => undefined);
  }
  let languageRequest = 0;

  const languageCompartment = new Compartment();
  const readOnlyCompartment = new Compartment();
  const editableCompartment = new Compartment();
  const themeCompartment = new Compartment();
  const wrappingCompartment = new Compartment();
  const spellcheckCompartment = new Compartment();

  // A short line highlight when the preview sends the cursor here.
  const flashEffect = StateEffect.define<number | null>();
  const flashField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(decorations, transaction) {
      for (const effect of transaction.effects) {
        if (!effect.is(flashEffect)) continue;
        if (effect.value === null) return Decoration.none;
        const line = transaction.state.doc.lineAt(effect.value);
        return Decoration.set([Decoration.line({ class: "cm-sync-flash" }).range(line.from)]);
      }
      return decorations.map(transaction.changes);
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  function editorTheme(mode: "dark" | "light", size: number) {
    const dark = mode === "dark";
    return EditorView.theme(
      {
        "&": {
          height: "100%",
          color: dark ? "#dfe2ea" : "#232733",
          backgroundColor: dark ? "#111318" : "#fbfbfc",
          fontSize: `${size}px`,
        },
        ".cm-scroller": {
          overflow: "auto",
          fontFamily:
            'var(--font-mono, "JetBrains Mono", "Cascadia Code", monospace)',
          lineHeight: "1.65",
        },
        ".cm-content": {
          minHeight: "100%",
          padding: "16px 0 70px",
          caretColor: dark ? "#9ba8ff" : "#465dd2",
        },
        ".cm-line": { padding: "0 18px 0 8px" },
        ".cm-gutters": {
          borderRight: `1px solid ${dark ? "#272b34" : "#e1e3e9"}`,
          color: dark ? "#626a79" : "#969cab",
          backgroundColor: dark ? "#13161b" : "#f5f6f8",
        },
        ".cm-activeLine": {
          backgroundColor: dark ? "#171b23" : "#f2f4fa",
        },
        ".cm-activeLineGutter": {
          color: dark ? "#aeb5c3" : "#525968",
          backgroundColor: dark ? "#1a1e27" : "#e9ebf2",
        },
        ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
          backgroundColor: dark ? "#39447a !important" : "#cdd5ff !important",
        },
        // Inactive native selections would otherwise use the system's white highlight text.
        "::selection": { color: dark ? "#f1f3f8" : "#232733" },
        ".cm-cursor, .cm-dropCursor": {
          borderLeftColor: dark ? "#9ba8ff" : "#465dd2",
        },
        ".cm-foldPlaceholder": {
          border: "0",
          color: dark ? "#9ba4b6" : "#636b7a",
          backgroundColor: dark ? "#262b36" : "#e7e9ef",
        },
        ".cm-tooltip": {
          border: `1px solid ${dark ? "#363b48" : "#d4d7df"}`,
          color: dark ? "#e7e9ef" : "#252934",
          backgroundColor: dark ? "#1d2028" : "#ffffff",
        },
        ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
          color: dark ? "#fff" : "#1e2538",
          backgroundColor: dark ? "#39447a" : "#dce2ff",
        },
        ".cm-sync-flash": {
          backgroundColor: dark ? "#2d3766 !important" : "#dde3ff !important",
        },
        "&.cm-focused": { outline: "none" },
      },
      { dark },
    );
  }

  function themeExtensions(mode: "dark" | "light", size: number) {
    // First theme wins at equal specificity. Keep One Dark's syntax/content palette,
    // but give the line-number rail its own darker, readable surface.
    const darkGutter = EditorView.theme({
      ".cm-gutters": { backgroundColor: "#1e2229", color: "#929bab", borderRight: "1px solid #303640" },
      ".cm-activeLineGutter": { backgroundColor: "#252a33", color: "#c5ccd8" },
    }, { dark: true });
    return mode === "dark" ? [darkGutter, oneDark, editorTheme(mode, size)] : [editorTheme(mode, size)];
  }

  function reportCursor(editor: EditorView): void {
    const selection = editor.state.selection.main;
    const line = editor.state.doc.lineAt(selection.head);
    onCursorChange({
      line: line.number,
      column: selection.head - line.from + 1,
      selected: selection.to - selection.from,
    });
  }

  /** Formatting shortcuts only act where the toolbar is offered. */
  function format(command: (dialect: FormatDialect) => FormatCommand): boolean {
    if (!formatting || readOnly || !toolbar) return false;
    return toolbar.run(command(formatting));
  }

  let flashTimer = 0;

  /** Sync adapter: fractional line at the top edge of the viewport. */
  function topLine(editor: EditorView): number {
    const height = Math.max(0, editor.scrollDOM.getBoundingClientRect().top - editor.documentTop);
    const block = editor.lineBlockAtHeight(height);
    const first = editor.state.doc.lineAt(block.from).number;
    const last = editor.state.doc.lineAt(block.to).number;
    const fraction = block.height > 0 ? Math.max(0, Math.min(1, (height - block.top) / block.height)) : 0;
    return first + fraction * (last - first + 1);
  }

  function scrollToLine(editor: EditorView, line: number): void {
    const doc = editor.state.doc;
    const number = Math.max(1, Math.min(doc.lines, Math.floor(line)));
    const block = editor.lineBlockAt(doc.line(number).from);
    const firstInBlock = doc.lineAt(block.from).number;
    const lastInBlock = doc.lineAt(block.to).number;
    const fraction = Math.max(0, Math.min(1, (line - firstInBlock) / (lastInBlock - firstInBlock + 1)));
    const scroller = editor.scrollDOM;
    // Distance between the scroller's content origin and the first document line.
    const offset = editor.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const top = block.top + fraction * block.height + offset;
    if (Math.abs(scroller.scrollTop - top) > 1) scroller.scrollTop = top;
  }

  function revealLine(editor: EditorView, line: number): void {
    const doc = editor.state.doc;
    const target = doc.line(Math.max(1, Math.min(doc.lines, Math.floor(line))));
    editor.dispatch({
      selection: EditorSelection.cursor(target.from),
      effects: [EditorView.scrollIntoView(target.from, { y: "center" }), flashEffect.of(target.from)],
      userEvent: "select.sync",
    });
    editor.focus();
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      if (view === editor) editor.dispatch({ effects: flashEffect.of(null) });
    }, 650);
  }

  onMount(() => {
    const mountedSession = session;
    const startState = restoreEditorState(mountedSession, value, [
        basicSetup,
        // Above basicSetup: Mod-i is otherwise "select parent syntax".
        Prec.high(keymap.of([
          { key: "Mod-b", run: () => format((dialect) => toggleInline("bold", dialect)) },
          { key: "Mod-i", run: () => format((dialect) => toggleInline("italic", dialect)) },
          { key: "Mod-Shift-x", run: () => format((dialect) => toggleInline("strikethrough", dialect)) },
          { key: "Mod-e", run: () => format((dialect) => toggleInline("code", dialect)) },
          { key: "Mod-k", run: () => Boolean(formatting && !readOnly && toolbar?.openLinkDialog()) },
        ])),
        keymap.of([indentWithTab]),
        findReplace({
          onBatch: (_view, initialRules) => {
            if (!readOnly) batchDialog = { initialRules };
          },
          onReplaceAll: (query) => void rememberReplaceAll(query),
        }),
        flashField,
        languageCompartment.of([]),
        readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
        editableCompartment.of(EditorView.editable.of(!readOnly)),
        themeCompartment.of(themeExtensions(theme, fontSize)),
        wrappingCompartment.of(wordWrap ? EditorView.lineWrapping : []),
        spellcheckCompartment.of(
          EditorView.contentAttributes.of({ spellcheck: String(spellcheck) }),
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !syncingFromParent) {
            onChange(update.state.doc.toString());
            sync?.editorInteracted();
          }
          if (update.docChanged || update.selectionSet) reportCursor(update.view);
          // A click in the editor shows the matching part of the preview.
          if (update.transactions.some((transaction) => transaction.isUserEvent("select.pointer"))) {
            const line = update.state.doc.lineAt(update.state.selection.main.head).number;
            sync?.revealInPreview(line);
          }
        }),
      ]);

    view = new EditorView({ state: startState, parent: host });
    const editor = view;
    if (mountedSession) mountedSession.view = editor;
    editor.requestMeasure({ read: () => null, write: () => {
      editor.scrollDOM.scrollTop = mountedSession?.scrollTop ?? 0;
      editor.scrollDOM.scrollLeft = mountedSession?.scrollLeft ?? 0;
    } });
    reportCursor(view);

    return () => {
      languageRequest += 1;
      window.clearTimeout(flashTimer);
      if (mountedSession && view) {
        mountedSession.state = view.state;
        mountedSession.scrollTop = view.scrollDOM.scrollTop;
        mountedSession.scrollLeft = view.scrollDOM.scrollLeft;
        mountedSession.restore = undefined;
        if (mountedSession.view === view) mountedSession.view = undefined;
      }
      view?.destroy();
      view = null;
    };
  });

  $effect(() => {
    const editor = view;
    const controller = sync;
    if (!editor || !controller) return;
    return controller.attachEditor({
      scroller: editor.scrollDOM,
      topLine: () => topLine(editor),
      lineCount: () => editor.state.doc.lines,
      scrollToLine: (line) => scrollToLine(editor, line),
      revealLine: (line) => revealLine(editor, line),
    });
  });

  $effect(() => {
    const editor = view;
    const nextValue = value;
    if (!editor || editor.state.doc.toString() === nextValue) return;

    syncingFromParent = true;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: nextValue },
    });
    syncingFromParent = false;
  });

  $effect(() => {
    const editor = view;
    const nextFileName = fileName;
    const request = ++languageRequest;
    if (!editor) return;

    void loadLanguageForFile(nextFileName).then((language) => {
      if (view !== editor || request !== languageRequest) return;
      editor.dispatch({
        effects: languageCompartment.reconfigure(language ?? []),
      });
    });
  });

  $effect(() => {
    view?.dispatch({
      effects: [
        readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
        editableCompartment.reconfigure(EditorView.editable.of(!readOnly)),
      ],
    });
  });

  $effect(() => {
    view?.dispatch({
      effects: themeCompartment.reconfigure(themeExtensions(theme, fontSize)),
    });
  });

  $effect(() => {
    view?.dispatch({
      effects: wrappingCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    });
  });

  $effect(() => {
    view?.dispatch({
      effects: spellcheckCompartment.reconfigure(
        EditorView.contentAttributes.of({ spellcheck: String(spellcheck) }),
      ),
    });
  });
</script>

<div class="editor-shell">
  {#if formatting}
    <FormattingToolbar bind:this={toolbar} {view} dialect={formatting} disabled={readOnly} {documentPath} light={theme === "light"} />
  {/if}
  <div class="editor-host" bind:this={host}></div>
</div>

{#if batchDialog && view}
  <BatchReplaceDialog {view} initialRules={batchDialog.initialRules} light={theme === "light"} onClose={() => (batchDialog = null)} />
{/if}

<style>
  .editor-shell {
    display: flex;
    min-width: 0;
    min-height: 0;
    width: 100%;
    height: 100%;
    flex-direction: column;
    background: var(--bg);
  }

  .editor-host {
    min-width: 0;
    min-height: 0;
    flex: 1;
  }

  :global(.cm-editor) {
    height: 100%;
  }
</style>
