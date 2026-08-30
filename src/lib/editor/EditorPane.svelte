<script lang="ts">
  import { onMount } from "svelte";
  import { basicSetup } from "codemirror";
  import { indentWithTab } from "@codemirror/commands";
  import { Compartment, EditorState } from "@codemirror/state";
  import { EditorView, keymap } from "@codemirror/view";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { loadLanguageForFile } from "./languages";

  interface CursorPosition {
    line: number;
    column: number;
    selected: number;
  }

  interface Props {
    value: string;
    fileName: string;
    readOnly?: boolean;
    theme?: "dark" | "light";
    fontSize?: number;
    wordWrap?: boolean;
    spellcheck?: boolean;
    markdownTools?: boolean;
    onChange?: (value: string) => void;
    onCursorChange?: (position: CursorPosition) => void;
  }

  let {
    value,
    fileName,
    readOnly = false,
    theme = "dark",
    fontSize = 14,
    wordWrap = false,
    spellcheck = false,
    markdownTools = false,
    onChange = () => undefined,
    onCursorChange = () => undefined,
  }: Props = $props();

  let host: HTMLDivElement;
  let view = $state.raw<EditorView | null>(null);
  let syncingFromParent = false;
  let languageRequest = 0;

  const languageCompartment = new Compartment();
  const readOnlyCompartment = new Compartment();
  const editableCompartment = new Compartment();
  const themeCompartment = new Compartment();
  const wrappingCompartment = new Compartment();
  const spellcheckCompartment = new Compartment();

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
        "&.cm-focused": { outline: "none" },
      },
      { dark },
    );
  }

  function themeExtensions(mode: "dark" | "light", size: number) {
    return mode === "dark" ? [oneDark, editorTheme(mode, size)] : [editorTheme(mode, size)];
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

  function wrapSelection(before: string, after = before, placeholder = "Text"): boolean {
    if (!view || readOnly) return false;
    const selection = view.state.selection.main;
    const selected = view.state.sliceDoc(selection.from, selection.to);
    const body = selected || placeholder;
    const insert = `${before}${body}${after}`;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert },
      selection: {
        anchor: selection.from + before.length,
        head: selection.from + before.length + body.length,
      },
      scrollIntoView: true,
    });
    view.focus();
    return true;
  }

  function prefixLines(prefix: string): boolean {
    if (!view || readOnly) return false;
    const selection = view.state.selection.main;
    const first = view.state.doc.lineAt(selection.from);
    const last = view.state.doc.lineAt(selection.to);
    const changes: Array<{ from: number; insert: string }> = [];
    for (let number = first.number; number <= last.number; number += 1) {
      changes.push({ from: view.state.doc.line(number).from, insert: prefix });
    }
    view.dispatch({ changes, scrollIntoView: true });
    view.focus();
    return true;
  }

  function insertCallout(): boolean {
    if (!view || readOnly) return false;
    const selection = view.state.selection.main;
    const selected = view.state.sliceDoc(selection.from, selection.to) || "Hinweis";
    const body = selected
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    const insert = `> [!NOTE]\n${body}`;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert },
      selection: { anchor: selection.from + insert.length },
      scrollIntoView: true,
    });
    view.focus();
    return true;
  }

  onMount(() => {
    const startState = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        keymap.of([
          indentWithTab,
          { key: "Mod-b", run: () => wrapSelection("**") },
          { key: "Mod-i", run: () => wrapSelection("*") },
        ]),
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
          }
          if (update.docChanged || update.selectionSet) reportCursor(update.view);
        }),
      ],
    });

    view = new EditorView({ state: startState, parent: host });
    reportCursor(view);

    return () => {
      languageRequest += 1;
      view?.destroy();
      view = null;
    };
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
  {#if markdownTools && !readOnly}
    <div class="markdown-tools" aria-label="Markdown-Formatierung">
      <button title="Fett (Strg/Cmd+B)" onclick={() => wrapSelection("**")}><strong>B</strong></button>
      <button title="Kursiv (Strg/Cmd+I)" onclick={() => wrapSelection("*")}><em>I</em></button>
      <button title="Überschrift" onclick={() => prefixLines("# ")}>H1</button>
      <button title="Zitat" onclick={() => prefixLines("> ")}>❯</button>
      <button title="Aufgabe" onclick={() => prefixLines("- [ ] ")}>☐</button>
      <button title="Inline-Code" onclick={() => wrapSelection("`", "`", "code")}>{"</>"}</button>
      <button title="Link" onclick={() => wrapSelection("[", "](https://)", "Link")}>↗</button>
      <button title="Hinweisbox" onclick={insertCallout}>NOTE</button>
      <span>Folding über den Pfeil neben den Zeilennummern</span>
    </div>
  {/if}
  <div class="editor-host" bind:this={host}></div>
</div>

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

  .markdown-tools {
    display: flex;
    min-height: 34px;
    align-items: center;
    gap: 2px;
    padding: 3px 8px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .markdown-tools button {
    min-width: 27px;
    height: 26px;
    padding: 0 6px;
    border: 0;
    border-radius: 5px;
    color: var(--text-muted);
    background: transparent;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
  }

  .markdown-tools button:hover {
    color: var(--text);
    background: var(--surface-hover);
  }

  .markdown-tools span {
    overflow: hidden;
    margin-left: auto;
    color: #6f7788;
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.cm-editor) {
    height: 100%;
  }
</style>
