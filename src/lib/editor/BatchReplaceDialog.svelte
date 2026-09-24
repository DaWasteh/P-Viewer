<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { EditorView } from "@codemirror/view";
  import { Play, Star, Trash2, X } from "@lucide/svelte";
  import { modal } from "$lib/modal";
  import {
    SCRIPT_TEMPLATE,
    applyRules,
    historyLabel,
    loadReplaceHistory,
    minimalChange,
    parseRules,
    rememberRun,
    removeEntry,
    runScript,
    saveReplaceHistory,
    DEFAULT_REPLACE_OPTIONS,
    type MacroKind,
    type ReplaceHistoryEntry,
    type ReplaceOptions,
  } from "./batchReplace";

  interface Props {
    view: EditorView;
    /** Rule text to start with, e.g. the query of the find widget. */
    initialRules?: string;
    light?: boolean;
    onClose: () => void;
  }

  let { view, initialRules = "", light = false, onClose }: Props = $props();

  let history = $state<ReplaceHistoryEntry[]>([]);
  let kind = $state<MacroKind>("rules");
  let rulesText = $state("");
  let scriptText = $state(SCRIPT_TEMPLATE);
  let options = $state<ReplaceOptions>({ ...DEFAULT_REPLACE_OPTIONS });
  let name = $state("");
  let selectionOnly = $state(false);
  let running = $state(false);
  let message = $state("");
  let failed = $state(false);
  let textarea = $state<HTMLTextAreaElement | null>(null);

  // Snapshot of the editor when the dialog opened.
  const { selection, readOnly } = untrack(() => ({ selection: view.state.selection.main, readOnly: view.state.readOnly }));
  const hasSelection = !selection.empty;
  const macros = $derived(history.filter((entry) => entry.name));
  const recent = $derived(history.filter((entry) => !entry.name));

  onMount(() => {
    rulesText = initialRules;
    selectionOnly = hasSelection && view.state.sliceDoc(selection.from, selection.to).includes("\n");
    void loadReplaceHistory().then((loaded) => (history = loaded));
    textarea?.focus();
  });

  function target(): { from: number; to: number; text: string } {
    const from = selectionOnly && hasSelection ? selection.from : 0;
    const to = selectionOnly && hasSelection ? selection.to : view.state.doc.length;
    return { from, to, text: view.state.sliceDoc(from, to) };
  }

  /** Live preview for rule lists: rule count, errors and matches in the current document. */
  const preview = $derived.by(() => {
    if (kind !== "rules") return null;
    const parsed = parseRules(rulesText);
    if (parsed.errors.length > 0) return { error: parsed.errors.slice(0, 3).join(" "), rules: parsed.rules.length, total: 0 };
    if (parsed.rules.length === 0) return { error: "", rules: 0, total: 0 };
    // Counting on every keystroke stays cheap only for ordinary documents.
    if (target().text.length > 2_000_000) return { error: "", rules: parsed.rules.length, total: -1 };
    try {
      void selectionOnly;
      const result = applyRules(target().text, parsed.rules, options);
      return { error: "", rules: parsed.rules.length, total: result.total, counts: result.counts };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), rules: parsed.rules.length, total: 0 };
    }
  });

  function load(entry: ReplaceHistoryEntry): void {
    kind = entry.kind;
    if (entry.kind === "script") scriptText = entry.rules;
    else rulesText = entry.rules;
    options = { ...entry.options };
    name = entry.name;
    message = "";
    textarea?.focus();
  }

  async function execute(run: { kind: MacroKind; source: string; options: ReplaceOptions; name: string }): Promise<void> {
    if (readOnly || running) return;
    message = "";
    failed = false;
    running = true;
    try {
      const { from, to, text } = target();
      let result: string;
      if (run.kind === "script") {
        result = await runScript(text, run.source);
      } else {
        const parsed = parseRules(run.source);
        if (parsed.errors.length > 0) throw new Error(parsed.errors[0]);
        if (parsed.rules.length === 0) throw new Error("Keine Regeln angegeben.");
        result = applyRules(text, parsed.rules, run.options).text;
      }
      // The document may have changed while a script ran.
      if (view.state.sliceDoc(from, to) !== text) throw new Error("Das Dokument wurde währenddessen geändert. Bitte erneut ausführen.");
      const change = minimalChange(text, result);
      if (change) {
        view.dispatch({
          changes: { from: from + change.from, to: from + change.to, insert: change.insert },
          userEvent: "input.replace.all",
          scrollIntoView: true,
        });
      }
      history = rememberRun(history, { name: run.name, kind: run.kind, rules: run.source, options: run.options });
      await saveReplaceHistory(history).catch(() => undefined);
      if (!change) {
        message = run.kind === "script" ? "Das Skript hat nichts geändert." : "Keine Treffer – nichts geändert.";
        return;
      }
      onClose();
      view.focus();
    } catch (error) {
      failed = true;
      message = error instanceof Error ? error.message : String(error);
    } finally {
      running = false;
    }
  }

  function applyCurrent(): void {
    void execute({ kind, source: kind === "script" ? scriptText : rulesText, options: { ...options }, name });
  }

  async function forget(entry: ReplaceHistoryEntry): Promise<void> {
    history = removeEntry(history, entry.id);
    await saveReplaceHistory(history).catch(() => undefined);
  }

  function describe(entry: ReplaceHistoryEntry): string {
    const when = new Date(entry.usedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    if (entry.kind === "script") return `JavaScript · ${when}`;
    const count = parseRules(entry.rules).rules.length;
    return `${count} ${count === 1 ? "Regel" : "Regeln"} · ${when}`;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      view.focus();
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      applyCurrent();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog use:modal class="batch-dialog" class:light aria-labelledby="batch-title" onkeydown={handleKeydown}>
  <header>
    <h2 id="batch-title">Mehrfach ersetzen und Makros</h2>
    <button class="icon" aria-label="Schließen" title="Schließen (Esc)" onclick={() => { onClose(); view.focus(); }}><X size={16} aria-hidden="true" /></button>
  </header>
  <div class="body">
    <aside aria-label="Makros und Verlauf">
      <h3><Star size={12} aria-hidden="true" /> Makros</h3>
      {#each macros as entry (entry.id)}
        {@render item(entry)}
      {:else}
        <p class="empty">Noch keine Makros. Gib einer Ersetzung einen Namen, um sie hier dauerhaft abzulegen.</p>
      {/each}
      <h3>Verlauf</h3>
      {#each recent as entry (entry.id)}
        {@render item(entry)}
      {:else}
        <p class="empty">Ausgeführte Ersetzungen erscheinen hier.</p>
      {/each}
    </aside>

    <section>
      <div class="kinds" role="tablist" aria-label="Art">
        <button role="tab" aria-selected={kind === "rules"} class:active={kind === "rules"} onclick={() => (kind = "rules")}>Ersetzungsliste</button>
        <button role="tab" aria-selected={kind === "script"} class:active={kind === "script"} onclick={() => (kind = "script")}>JavaScript</button>
      </div>
      {#if kind === "rules"}
        <label class="editor-label" for="batch-rules">Eine Regel pro Zeile: <code>suchen =&gt; ersetzen</code> oder Tab-getrennt; leerer Ersatz löscht. Regeln laufen der Reihe nach.</label>
        <textarea id="batch-rules" bind:this={textarea} bind:value={rulesText} spellcheck="false" placeholder={"||werbung.example^ => ||werbung.example^$third-party\nFrüh => Frühschicht"}></textarea>
        <div class="options">
          <label><input type="checkbox" bind:checked={options.caseSensitive} /> Groß-/Kleinschreibung</label>
          <label><input type="checkbox" bind:checked={options.wholeWord} /> Ganzes Wort</label>
          <label><input type="checkbox" bind:checked={options.regexp} /> Muster (regulärer Ausdruck, $1 im Ersatz)</label>
        </div>
      {:else}
        <label class="editor-label" for="batch-script">Das Skript erhält <code>text</code> und gibt den neuen Text mit <code>return</code> zurück. Es läuft abgeschottet ohne Datei-, Netzwerk- oder App-Zugriff und wird nach 5 Sekunden abgebrochen.</label>
        <textarea id="batch-script" bind:this={textarea} bind:value={scriptText} spellcheck="false"></textarea>
      {/if}
      <div class="options">
        <label title={hasSelection ? "" : "Keine Auswahl im Editor"}><input type="checkbox" bind:checked={selectionOnly} disabled={!hasSelection} /> Nur in der Auswahl</label>
        <label class="name">Als Makro speichern unter <input bind:value={name} placeholder="optional, z. B. Adblock-Pflege" maxlength="120" /></label>
      </div>
      <p class="status" class:error={failed || Boolean(preview?.error)} role="status">
        {#if message}
          {message}
        {:else if preview?.error}
          {preview.error}
        {:else if preview && preview.rules > 0}
          {preview.rules} {preview.rules === 1 ? "Regel" : "Regeln"}{preview.total >= 0 ? ` · ${preview.total.toLocaleString("de-DE")} Treffer${selectionOnly ? " in der Auswahl" : ""}` : ""}
        {:else if kind === "script"}
          Ergebnis ersetzt {selectionOnly ? "die Auswahl" : "das ganze Dokument"}; ein Rückgängig stellt alles wieder her.
        {/if}
      </p>
    </section>
  </div>
  <footer>
    {#if readOnly}<span class="hint">Dieses Dokument ist schreibgeschützt.</span>{/if}
    <button onclick={() => { onClose(); view.focus(); }}>Abbrechen</button>
    <button class="primary" disabled={readOnly || running || Boolean(preview?.error)} onclick={applyCurrent} title="Anwenden (Strg+Eingabe)">
      {running ? "Läuft …" : "Anwenden"}
    </button>
  </footer>
</dialog>

{#snippet item(entry: ReplaceHistoryEntry)}
  <div class="entry">
    <button class="load" title={`Laden und bearbeiten\n${entry.rules.slice(0, 400)}`} onclick={() => load(entry)}>
      <strong>{historyLabel(entry)}</strong>
      <small>{describe(entry)}</small>
    </button>
    <button class="icon" aria-label={`„${historyLabel(entry)}“ direkt ausführen`} title="Direkt ausführen" disabled={readOnly || running} onclick={() => void execute({ kind: entry.kind, source: entry.rules, options: entry.options, name: entry.name })}>
      <Play size={13} aria-hidden="true" />
    </button>
    <button class="icon" aria-label={`„${historyLabel(entry)}“ entfernen`} title="Entfernen" onclick={() => void forget(entry)}>
      <Trash2 size={13} aria-hidden="true" />
    </button>
  </div>
{/snippet}

<style>
  .batch-dialog {
    display: flex;
    width: min(860px, calc(100vw - 32px));
    height: min(620px, calc(100vh - 40px));
    flex-direction: column;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: 9px;
    color: var(--text);
    background: var(--surface-raised);
    box-shadow: 0 16px 50px rgb(0 0 0 / 45%);
    font-size: 11px;
  }

  .batch-dialog::backdrop {
    background: rgb(4 6 10 / 52%);
  }

  header,
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
  }

  header {
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
  }

  footer {
    justify-content: flex-end;
    border-top: 1px solid var(--border);
  }

  h2 {
    margin: 0;
    font-size: 14px;
  }

  .body {
    display: grid;
    min-height: 0;
    flex: 1;
    grid-template-columns: 250px minmax(0, 1fr);
  }

  aside {
    min-height: 0;
    padding: 10px;
    overflow: auto;
    border-right: 1px solid var(--border);
    background: var(--surface);
  }

  h3 {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 6px 4px 6px;
    color: var(--text-faint);
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .empty {
    margin: 0 4px 12px;
    color: var(--text-faint);
    font-size: 10px;
    line-height: 1.45;
  }

  .entry {
    display: flex;
    align-items: center;
    gap: 2px;
    border-radius: 5px;
  }

  .entry:hover {
    background: var(--surface-hover);
  }

  .entry .load {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 6px;
    border: 0;
    text-align: left;
  }

  .entry strong,
  .entry small {
    overflow: hidden;
    max-width: 100%;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .entry strong {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 600;
  }

  .entry small {
    color: var(--text-faint);
    font-size: 9px;
  }

  section {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    gap: 9px;
    padding: 12px 14px;
  }

  .kinds {
    display: flex;
    gap: 2px;
    align-self: flex-start;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--inset);
  }

  .kinds button {
    height: 25px;
    padding: 0 10px;
    border: 0;
    border-radius: 5px;
  }

  .kinds button.active {
    background: var(--surface-raised);
    box-shadow: 0 1px 4px rgb(0 0 0 / 24%);
  }

  .editor-label {
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1.45;
  }

  code,
  textarea {
    font-family: var(--mono);
    /* "=>" must stay readable as typed, not as an arrow ligature. */
    font-variant-ligatures: none;
  }

  textarea {
    min-height: 0;
    flex: 1;
    padding: 9px;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    outline: none;
    color: var(--text);
    background: var(--inset);
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.55;
    resize: none;
    tab-size: 4;
    white-space: pre;
  }

  textarea:focus {
    border-color: var(--accent);
  }

  .options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 16px;
    color: var(--text-muted);
  }

  .options label {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .options input[type="checkbox"] {
    margin: 0;
    accent-color: var(--accent);
  }

  .options .name {
    flex: 1;
    min-width: 260px;
  }

  .options .name input {
    min-width: 0;
    flex: 1;
    height: 26px;
    padding: 0 7px;
    border: 1px solid var(--border-strong);
    border-radius: 5px;
    outline: none;
    color: var(--text);
    background: var(--inset);
    font: inherit;
  }

  .status {
    min-height: 16px;
    margin: 0;
    color: var(--text-muted);
  }

  .status.error {
    color: var(--danger);
  }

  .hint {
    margin-right: auto;
    color: var(--text-faint);
  }

  button {
    border: 1px solid transparent;
    border-radius: 6px;
    color: inherit;
    background: transparent;
    cursor: pointer;
    font: inherit;
  }

  footer button {
    height: 30px;
    padding: 0 12px;
    border-color: var(--border-strong);
  }

  button:hover:not(:disabled) {
    background: var(--surface-hover);
  }

  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  button:disabled {
    cursor: default;
    opacity: 0.45;
  }

  button.primary {
    border-color: transparent;
    color: #fff;
    background: #5c6fd7;
  }

  button.primary:hover:not(:disabled) {
    background: #6d7fe1;
  }

  button.icon {
    display: grid;
    width: 26px;
    height: 26px;
    flex: 0 0 26px;
    place-items: center;
    color: var(--text-muted);
  }

  .light.batch-dialog::backdrop {
    background: rgb(40 46 60 / 28%);
  }
</style>
