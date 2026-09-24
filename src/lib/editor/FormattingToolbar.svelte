<script lang="ts">
  import { onMount, tick, type Component } from "svelte";
  import type { EditorView } from "@codemirror/view";
  import {
    Bold,
    ChevronDown,
    Code,
    Ellipsis,
    Heading,
    Image,
    Italic,
    Link,
    List,
    ListIndentDecrease,
    ListIndentIncrease,
    ListOrdered,
    ListTodo,
    MessageSquareWarning,
    Quote,
    SeparatorHorizontal,
    SquareCode,
    Strikethrough,
    Table,
    TextAlignCenter,
    TextAlignEnd,
    TextAlignStart,
  } from "@lucide/svelte";
  import ContextMenu, { type MenuEntry } from "$lib/ContextMenu.svelte";
  import { relativeReference } from "$lib/files/paths";
  import {
    CODE_LANGUAGES,
    indentSelection,
    insertCallout,
    insertHorizontalRule,
    insertImage,
    insertLink,
    insertTable,
    setAlignment,
    setHeading,
    toggleBlockquote,
    toggleCodeBlock,
    toggleInline,
    toggleList,
    type FormatCommand,
    type FormatDialect,
  } from "./formatting";

  interface Props {
    view: EditorView | null;
    dialect: FormatDialect;
    disabled?: boolean;
    /** Folder for relative image paths chosen from disk. */
    documentPath?: string;
    light?: boolean;
  }

  let { view, dialect, disabled = false, documentPath = "", light = false }: Props = $props();

  type DialogKind = "link" | "image" | "table";
  interface ToolItem {
    id: string;
    label: string;
    shortcut?: string;
    icon: Component<{ size?: number; "aria-hidden"?: boolean | "true" }>;
    group: number;
    run?: () => void;
    menu?: () => MenuEntry[];
    dialog?: DialogKind;
  }

  const primary = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "Cmd" : "Strg";
  const BUTTON_WIDTH = 30;
  const SEPARATOR_WIDTH = 9;
  const MORE_WIDTH = 32;

  let toolbar: HTMLDivElement;
  let width = $state(0);
  let menu = $state<{ items: MenuEntry[]; x: number; y: number; label: string } | null>(null);
  let dialog = $state<{ kind: DialogKind; left: number; top: number } | null>(null);
  let linkUrl = $state("https://");
  let linkText = $state("");
  let imageSource = $state("");
  let imageAlt = $state("");
  let tableColumns = $state(3);
  let tableRows = $state(3);
  let firstField = $state<HTMLInputElement | null>(null);
  /** The native file dialog takes the focus; the image dialog must stay open meanwhile. */
  let pickingFile = false;

  /** Runs a formatting command as one transaction and gives the focus back to the editor. */
  export function run(command: FormatCommand): boolean {
    if (!view || disabled) return false;
    const transaction = command(view.state);
    if (transaction) view.dispatch(transaction);
    view.focus();
    return true;
  }

  const headingMenu = (): MenuEntry[] => [
    ...[1, 2, 3, 4, 5, 6].map((level) => ({ label: `Überschrift ${level}`, action: () => run(setHeading(level, dialect)) })),
    { separator: true },
    { label: "Normaler Text", action: () => run(setHeading(0, dialect)) },
  ];
  const codeMenu = (): MenuEntry[] =>
    CODE_LANGUAGES.map((language) => ({ label: language.label, action: () => run(toggleCodeBlock(language.id, dialect)) }));

  const items = $derived.by((): ToolItem[] => {
    const list: ToolItem[] = [
      { id: "bold", label: "Fett", shortcut: `${primary}+B`, icon: Bold, group: 0, run: () => run(toggleInline("bold", dialect)) },
      { id: "italic", label: "Kursiv", shortcut: `${primary}+I`, icon: Italic, group: 0, run: () => run(toggleInline("italic", dialect)) },
      { id: "strike", label: "Durchgestrichen", shortcut: `${primary}+Umschalt+X`, icon: Strikethrough, group: 0, run: () => run(toggleInline("strikethrough", dialect)) },
      { id: "code", label: "Inline-Code", shortcut: `${primary}+E`, icon: Code, group: 0, run: () => run(toggleInline("code", dialect)) },
      { id: "heading", label: "Überschrift", icon: Heading, group: 1, menu: headingMenu },
      { id: "bullets", label: "Aufzählung", icon: List, group: 2, run: () => run(toggleList("bullet", dialect)) },
      { id: "numbers", label: "Nummerierte Liste", icon: ListOrdered, group: 2, run: () => run(toggleList("numbered", dialect)) },
      { id: "tasks", label: "Aufgabenliste", icon: ListTodo, group: 2, run: () => run(toggleList("task", dialect)) },
      { id: "quote", label: "Zitat", icon: Quote, group: 3, run: () => run(toggleBlockquote(dialect)) },
      { id: "codeblock", label: "Codeblock", icon: SquareCode, group: 3, menu: codeMenu },
      { id: "link", label: "Link", shortcut: `${primary}+K`, icon: Link, group: 3, dialog: "link" },
      { id: "image", label: "Bild", icon: Image, group: 3, dialog: "image" },
      { id: "table", label: "Tabelle", icon: Table, group: 3, dialog: "table" },
      { id: "rule", label: "Trennlinie", icon: SeparatorHorizontal, group: 4, run: () => run(insertHorizontalRule(dialect)) },
      { id: "left", label: "Linksbündig", icon: TextAlignStart, group: 5, run: () => run(setAlignment("left", dialect)) },
      { id: "center", label: "Zentriert", icon: TextAlignCenter, group: 5, run: () => run(setAlignment("center", dialect)) },
      { id: "right", label: "Rechtsbündig", icon: TextAlignEnd, group: 5, run: () => run(setAlignment("right", dialect)) },
      { id: "indent", label: "Einrücken", shortcut: "Tab", icon: ListIndentIncrease, group: 6, run: () => run(indentSelection("more")) },
      { id: "outdent", label: "Ausrücken", shortcut: "Umschalt+Tab", icon: ListIndentDecrease, group: 6, run: () => run(indentSelection("less")) },
    ];
    if (dialect === "markdown") {
      list.push({ id: "callout", label: "Hinweisbox (GitHub-Callout)", icon: MessageSquareWarning, group: 7, run: () => run(insertCallout()) });
    }
    return list;
  });

  function widthOf(count: number): number {
    let total = 0;
    for (let index = 0; index < count; index += 1) {
      if (index > 0 && items[index].group !== items[index - 1].group) total += SEPARATOR_WIDTH;
      total += BUTTON_WIDTH + (items[index].menu ? 10 : 0);
    }
    return total;
  }

  /** Buttons that fit; the rest move into the "…" menu in the same order. */
  const visibleCount = $derived.by(() => {
    if (width <= 0 || widthOf(items.length) <= width) return items.length;
    let count = items.length;
    while (count > 0 && widthOf(count) + SEPARATOR_WIDTH + MORE_WIDTH > width) count -= 1;
    return count;
  });

  onMount(() => {
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => (width = Math.floor(entry.contentRect.width)));
    });
    observer.observe(toolbar);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });

  function tooltip(item: ToolItem): string {
    return item.shortcut ? `${item.label} (${item.shortcut})` : item.label;
  }

  function activate(item: ToolItem, anchor: HTMLElement): void {
    if (disabled) return;
    if (item.run) item.run();
    else if (item.menu) openMenu(item.menu(), anchor, item.label);
    else if (item.dialog) void openDialog(item.dialog, anchor);
  }

  function openMenu(entries: MenuEntry[], anchor: HTMLElement, label: string): void {
    const rect = anchor.getBoundingClientRect();
    menu = { items: entries, x: rect.left, y: rect.bottom + 2, label };
  }

  function overflowEntries(): MenuEntry[] {
    const hidden = items.slice(visibleCount);
    const entries: MenuEntry[] = [];
    hidden.forEach((item, index) => {
      if (index > 0 && item.group !== hidden[index - 1].group) entries.push({ separator: true });
      entries.push({
        label: item.label,
        shortcut: item.shortcut,
        children: item.menu?.(),
        action: item.run ?? (item.dialog ? () => void openDialog(item.dialog!, toolbar) : undefined),
      });
    });
    return entries;
  }

  /** Strg/Cmd+K and the toolbar button. */
  export function openLinkDialog(): boolean {
    if (!view || disabled) return false;
    void openDialog("link", toolbar.querySelector<HTMLElement>('[data-tool="link"]') ?? toolbar);
    return true;
  }

  async function openDialog(kind: DialogKind, anchor: HTMLElement): Promise<void> {
    if (!view) return;
    const selection = view.state.selection.main;
    const selected = view.state.sliceDoc(selection.from, selection.to);
    if (kind === "link") {
      const looksLikeUrl = /^(?:https?:\/\/|mailto:|www\.)\S+$/i.test(selected.trim());
      linkUrl = looksLikeUrl ? selected.trim() : "https://";
      linkText = looksLikeUrl ? "" : selected.split("\n")[0];
    } else if (kind === "image") {
      imageSource = "";
      imageAlt = selected.split("\n")[0];
    }
    const toolbarRect = toolbar.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    dialog = {
      kind,
      left: Math.max(4, Math.min(anchorRect.left - toolbarRect.left, toolbarRect.width - 290)),
      top: toolbarRect.height + 2,
    };
    await tick();
    firstField?.focus();
    firstField?.select();
  }

  function closeDialog(): void {
    dialog = null;
    view?.focus();
  }

  function submitDialog(event: SubmitEvent): void {
    event.preventDefault();
    if (!dialog) return;
    const kind = dialog.kind;
    dialog = null;
    if (kind === "link") run(insertLink(linkUrl, linkText, dialect));
    else if (kind === "image") run(insertImage(imageSource, imageAlt, dialect));
    else run(insertTable(tableColumns, tableRows, dialect));
  }

  async function chooseImage(): Promise<void> {
    pickingFile = true;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Bilder", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"] }],
      });
      if (typeof selected === "string") imageSource = relativeReference(documentPath, selected);
    } catch {
      // Without the desktop runtime the path is typed by hand.
    } finally {
      pickingFile = false;
      firstField?.focus();
    }
  }

  function handleDialogKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeDialog();
    }
  }
</script>

<div class="formatting-toolbar" class:light bind:this={toolbar} role="toolbar" aria-label={dialect === "html" ? "HTML-Formatierung" : "Markdown-Formatierung"}>
  {#each items.slice(0, visibleCount) as item, index (item.id)}
    {#if index > 0 && item.group !== items[index - 1].group}<span class="separator" aria-hidden="true"></span>{/if}
    <button
      type="button"
      class:has-menu={Boolean(item.menu)}
      data-tool={item.id}
      title={tooltip(item)}
      aria-label={item.label}
      aria-haspopup={item.menu ? "menu" : item.dialog ? "dialog" : undefined}
      {disabled}
      onmousedown={(event) => event.preventDefault()}
      onclick={(event) => activate(item, event.currentTarget)}
    >
      <item.icon size={15} aria-hidden="true" />
      {#if item.menu}<ChevronDown size={9} aria-hidden="true" />{/if}
    </button>
  {/each}
  {#if visibleCount < items.length}
    <span class="separator" aria-hidden="true"></span>
    <button
      type="button"
      class="more"
      title="Weitere Formatierungen"
      aria-label="Weitere Formatierungen"
      aria-haspopup="menu"
      {disabled}
      onmousedown={(event) => event.preventDefault()}
      onclick={(event) => openMenu(overflowEntries(), event.currentTarget, "Weitere Formatierungen")}
    >
      <Ellipsis size={15} aria-hidden="true" />
    </button>
  {/if}

  {#if dialog}
    <div
      class="format-dialog"
      role="dialog"
      tabindex="-1"
      aria-label={dialog.kind === "link" ? "Link einfügen" : dialog.kind === "image" ? "Bild einfügen" : "Tabelle einfügen"}
      style={`left: ${dialog.left}px; top: ${dialog.top}px`}
      onkeydown={handleDialogKeydown}
      onfocusout={(event) => {
        if (!pickingFile && !event.currentTarget.contains(event.relatedTarget as Node | null)) dialog = null;
      }}
    >
    <form onsubmit={submitDialog}>
      {#if dialog.kind === "link"}
        <label>Adresse (URL)<input bind:this={firstField} bind:value={linkUrl} spellcheck="false" /></label>
        <label>Text <small>(leer: markierter Text)</small><input bind:value={linkText} /></label>
      {:else if dialog.kind === "image"}
        <label>Bildpfad oder URL
          <span class="field-row">
            <input bind:this={firstField} bind:value={imageSource} placeholder="bild.png" spellcheck="false" />
            {#if "__TAURI_INTERNALS__" in window}
              <button type="button" onclick={() => void chooseImage()}>Datei wählen …</button>
            {/if}
          </span>
        </label>
        <label>Beschreibung (Alternativtext)<input bind:value={imageAlt} /></label>
      {:else}
        <span class="field-row">
          <label>Spalten<input bind:this={firstField} type="number" min="1" max="20" bind:value={tableColumns} /></label>
          <label>Zeilen<input type="number" min="1" max="100" bind:value={tableRows} /></label>
        </span>
      {/if}
      <span class="dialog-actions">
        <button type="button" onclick={closeDialog}>Abbrechen</button>
        <button type="submit" class="primary">Einfügen</button>
      </span>
    </form>
    </div>
  {/if}
</div>

{#if menu}
  <ContextMenu items={menu.items} x={menu.x} y={menu.y} label={menu.label} {light} onClose={() => (menu = null)} />
{/if}

<style>
  .formatting-toolbar {
    position: relative;
    z-index: 4;
    display: flex;
    min-width: 0;
    min-height: 34px;
    align-items: center;
    gap: 2px;
    padding: 3px 8px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .formatting-toolbar > button {
    display: inline-flex;
    width: 28px;
    height: 26px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 1px;
    padding: 0;
    border: 0;
    border-radius: 5px;
    color: var(--text-muted);
    background: transparent;
    cursor: pointer;
  }

  .formatting-toolbar > button.has-menu {
    width: 38px;
  }

  .formatting-toolbar > button:hover:not(:disabled) {
    color: var(--text);
    background: var(--surface-hover);
  }

  .formatting-toolbar > button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .formatting-toolbar > button:disabled {
    cursor: default;
    opacity: 0.4;
  }

  .separator {
    width: 1px;
    height: 17px;
    flex: 0 0 auto;
    margin: 0 3px;
    background: var(--border);
  }

  .format-dialog {
    position: absolute;
    width: 280px;
    padding: 11px;
    border: 1px solid var(--border-strong);
    border-radius: 7px;
    color: var(--text);
    background: var(--surface-raised);
    box-shadow: 0 8px 26px rgb(0 0 0 / 38%);
    font-size: 11px;
  }

  .format-dialog form {
    display: grid;
    gap: 9px;
  }

  .format-dialog label {
    display: grid;
    min-width: 0;
    gap: 4px;
    color: var(--text-muted);
    font-size: 10px;
  }

  .format-dialog small {
    color: var(--text-faint);
  }

  .format-dialog input {
    min-width: 0;
    height: 27px;
    padding: 0 7px;
    border: 1px solid var(--border-strong);
    border-radius: 5px;
    outline: none;
    color: var(--text);
    background: var(--inset);
    font: inherit;
    font-size: 11px;
  }

  .format-dialog input:focus {
    border-color: var(--accent);
  }

  .field-row {
    display: flex;
    gap: 7px;
  }

  .field-row > * {
    flex: 1;
  }

  .field-row > button {
    flex: 0 0 auto;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }

  .format-dialog button {
    height: 27px;
    padding: 0 10px;
    border: 1px solid var(--border-strong);
    border-radius: 5px;
    color: var(--text);
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    white-space: nowrap;
  }

  .format-dialog button:hover {
    background: var(--surface-hover);
  }

  .format-dialog button.primary {
    border-color: transparent;
    color: #fff;
    background: #5c6fd7;
  }

  .format-dialog button.primary:hover {
    background: #6d7fe1;
  }
</style>
