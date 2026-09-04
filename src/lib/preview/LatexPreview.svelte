<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import {
    AlertTriangle,
    CheckCircle2,
    Eye,
    FileOutput,
    Play,
    RefreshCw,
    Terminal,
  } from "@lucide/svelte";
  import "katex/dist/katex.min.css";
  import PdfViewer from "./PdfViewer.svelte";
  import { renderLatexLive } from "./latex";

  interface LatexEngineInfo {
    id: string;
    label: string;
    available: boolean;
    version?: string | null;
  }

  interface LatexCompileResult {
    success: boolean;
    engine: string;
    engineLabel: string;
    pdfBase64?: string | null;
    log: string;
    durationMs: number;
    error?: string | null;
  }

  interface Props {
    content: string;
    path: string;
    fileName: string;
    theme?: "dark" | "light";
    fontSize?: number;
  }

  let { content, path, fileName, theme = "dark", fontSize = 16 }: Props = $props();

  let viewMode = $state<"live" | "pdf">("live");
  let liveHtml = $state("");
  let liveWarnings = $state<string[]>([]);
  let liveError = $state("");
  let engines = $state<LatexEngineInfo[]>([]);
  let selectedEngine = $state("auto");
  let enginesChecked = $state(false);
  let checking = $state(false);
  let compiling = $state(false);
  let result = $state<LatexCompileResult | null>(null);
  let errorMessage = $state("");
  let compiledContent = $state<string | null>(null);

  const desktop =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const availableEngines = $derived(engines.filter((engine) => engine.available));
  const previewStale = $derived(
    result?.success === true && compiledContent !== null && compiledContent !== content,
  );

  $effect(() => {
    const source = content;
    const timer = window.setTimeout(() => {
      try {
        const rendered = renderLatexLive(source);
        liveHtml = rendered.html;
        liveWarnings = rendered.warnings;
        liveError = "";
      } catch (error) {
        liveError = error instanceof Error ? error.message : String(error);
      }
    }, 100);
    return () => window.clearTimeout(timer);
  });

  onMount(() => {
    if (viewMode === "pdf") void detectEngines();
  });

  function selectView(next: "live" | "pdf"): void {
    viewMode = next;
    if (next === "pdf" && !enginesChecked && !checking) void detectEngines();
  }

  async function detectEngines(): Promise<void> {
    checking = true;
    enginesChecked = true;
    errorMessage = "";
    try {
      if (!desktop) {
        engines = [];
        return;
      }
      engines = await invoke<LatexEngineInfo[]>("detect_latex_engines");
      if (
        selectedEngine !== "auto" &&
        !engines.some((engine) => engine.id === selectedEngine && engine.available)
      ) {
        selectedEngine = "auto";
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      checking = false;
    }
  }

  async function compile(): Promise<void> {
    if (!desktop || compiling || availableEngines.length === 0) return;
    compiling = true;
    errorMessage = "";
    try {
      result = await invoke<LatexCompileResult>("compile_latex", {
        path,
        content,
        engine: selectedEngine,
      });
      if (result.success) compiledContent = content;
      else errorMessage = result.error ?? "Der LaTeX-Build ist fehlgeschlagen.";
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      compiling = false;
    }
  }

  function durationLabel(milliseconds: number): string {
    if (milliseconds < 1_000) return `${milliseconds} ms`;
    return `${(milliseconds / 1_000).toFixed(1)} s`;
  }
</script>

<div class:light={theme === "light"} class="latex-preview">
  <div class="latex-toolbar">
    <div class="view-switch" aria-label="LaTeX-Vorschaumodus">
      <button
        class:active={viewMode === "live"}
        aria-pressed={viewMode === "live"}
        onclick={() => selectView("live")}
      >
        <Eye size={14} aria-hidden="true" /> Live
      </button>
      <button
        class:active={viewMode === "pdf"}
        aria-pressed={viewMode === "pdf"}
        onclick={() => selectView("pdf")}
      >
        <FileOutput size={14} aria-hidden="true" /> PDF
      </button>
    </div>

    {#if viewMode === "live"}
      <span class="bundled-status"><CheckCircle2 size={13} aria-hidden="true" /> Offline integriert</span>
      {#if liveWarnings.length > 0}
        <span class="live-warning-count">{liveWarnings.length} Vereinfachung{liveWarnings.length === 1 ? "" : "en"}</span>
      {/if}
    {:else}
      <label>
        <span>Engine</span>
        <select bind:value={selectedEngine} disabled={checking || compiling || availableEngines.length === 0}>
          <option value="auto">Automatisch{availableEngines[0] ? ` · ${availableEngines[0].label}` : ""}</option>
          {#each availableEngines as engine}
            <option value={engine.id}>{engine.label}</option>
          {/each}
        </select>
      </label>
      <button class="compile-button" onclick={() => void compile()} disabled={checking || compiling || availableEngines.length === 0 || !content.trim()}>
        {#if compiling}<span class="spinner"></span>{:else}<Play size={14} fill="currentColor" aria-hidden="true" />{/if}
        <span>{compiling ? "Kompiliert …" : "PDF bauen"}</span>
      </button>
      <button class="refresh-button" title="LaTeX-Compiler erneut suchen" onclick={() => void detectEngines()} disabled={checking || compiling}>
        <span class:spinning={checking}><RefreshCw size={14} aria-hidden="true" /></span>
      </button>
      {#if result?.success}
        <span class="build-status success"><CheckCircle2 size={13} aria-hidden="true" />{result.engineLabel} · {durationLabel(result.durationMs)}</span>
      {/if}
      {#if previewStale}<span class="stale">PDF ist älter als der Text</span>{/if}
    {/if}
  </div>

  <div class="latex-content">
    {#if viewMode === "live"}
      <div class="live-scroll">
        {#if liveError}
          <div class="latex-state build-error" role="alert">
            <AlertTriangle size={28} strokeWidth={1.5} aria-hidden="true" />
            <strong>Live-Vorschau fehlgeschlagen</strong>
            <p>{liveError}</p>
          </div>
        {:else if content.trim()}
          <!-- Plain source is escaped by latex.ts; KaTeX runs with trust disabled. -->
          <article class="latex-document" style={`--latex-font-size: ${fontSize}px`}>
            {@html liveHtml}
          </article>
          {#if liveWarnings.length > 0}
            <details class="live-warnings">
              <summary><AlertTriangle size={13} aria-hidden="true" /> Vereinfachte LaTeX-Funktionen</summary>
              <ul>
                {#each liveWarnings as warning}<li>{warning}</li>{/each}
              </ul>
            </details>
          {/if}
        {:else}
          <div class="latex-state">
            <strong>Leeres LaTeX-Dokument</strong>
            <p>Die gebündelte Live-Vorschau erscheint beim Schreiben automatisch.</p>
          </div>
        {/if}
      </div>
    {:else if result?.success && result.pdfBase64}
      <PdfViewer pdfBase64={result.pdfBase64} />
    {:else if checking}
      <div class="latex-state">
        <span class="spinner large"></span>
        <strong>Optionale LaTeX-Umgebung wird geprüft</strong>
      </div>
    {:else if errorMessage}
      <div class="latex-state build-error" role="alert">
        <AlertTriangle size={28} strokeWidth={1.5} aria-hidden="true" />
        <strong>LaTeX-PDF-Build fehlgeschlagen</strong>
        <p>{errorMessage}</p>
        {#if availableEngines.length > 0}
          <button onclick={() => void compile()}><Play size={13} aria-hidden="true" /> Erneut bauen</button>
        {:else}
          <button onclick={() => void detectEngines()}><RefreshCw size={13} aria-hidden="true" /> Erneut suchen</button>
        {/if}
      </div>
    {:else if availableEngines.length === 0}
      <div class="latex-state no-engine">
        <AlertTriangle size={30} strokeWidth={1.5} aria-hidden="true" />
        <strong>Kein externer LaTeX-Compiler gefunden</strong>
        <p>
          Die Live-Vorschau ist vollständig in P-Viewer gebündelt und benötigt keine Installation.
          Nur für einen typografisch exakten PDF-Build kann optional MiKTeX, TeX Live, MacTeX oder
          Tectonic verwendet werden.
        </p>
        <button onclick={() => void detectEngines()}>
          <RefreshCw size={14} aria-hidden="true" /> Erneut suchen
        </button>
        <small>Shell-Escape bleibt aus Sicherheitsgründen deaktiviert.</small>
      </div>
    {:else}
      <div class="latex-state ready">
        <Play size={28} strokeWidth={1.4} aria-hidden="true" />
        <strong>{fileName} als PDF darstellen</strong>
        <p>Der optionale Build läuft lokal, ohne Shell-Escape, und schreibt Hilfsdateien nur in einen temporären Ordner.</p>
        <button onclick={() => void compile()}><Play size={13} fill="currentColor" aria-hidden="true" /> PDF bauen</button>
      </div>
    {/if}

    {#if viewMode === "pdf" && result?.log}
      <details class="build-log" open={!result.success}>
        <summary><Terminal size={13} aria-hidden="true" /> Build-Log</summary>
        <pre>{result.log}</pre>
      </details>
    {/if}
  </div>
</div>

<style>
  .latex-preview {
    display: grid;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    grid-template-rows: 40px minmax(0, 1fr);
    color: #d8dbe4;
    background: #111318;
  }

  .latex-toolbar {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    border-bottom: 1px solid #292d36;
    background: #171a20;
  }

  .view-switch {
    display: flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid #303642;
    border-radius: 6px;
    background: #111419;
  }

  .view-switch button {
    height: 25px;
    padding: 0 8px;
    background: transparent;
  }

  .view-switch button.active {
    color: #f1f3ff;
    background: #303a68;
  }

  .latex-toolbar label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #7f8797;
    font-size: 9px;
    text-transform: uppercase;
  }

  select {
    width: min(210px, 24vw);
    height: 27px;
    padding: 0 25px 0 8px;
    border: 1px solid #343945;
    border-radius: 5px;
    outline: 0;
    color: #cbd0da;
    background: #111419;
    font-size: 10px;
    text-transform: none;
  }

  select:focus {
    border-color: #6679dd;
  }

  button {
    display: inline-flex;
    height: 27px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 9px;
    border: 0;
    border-radius: 5px;
    color: #aeb5c2;
    background: #252a34;
    cursor: pointer;
    font-size: 10px;
  }

  button:hover:not(:disabled) {
    color: #fff;
    background: #303643;
  }

  button:disabled {
    cursor: default;
    opacity: 0.42;
  }

  .compile-button {
    color: #f4f5ff;
    background: #586bd2;
  }

  .compile-button:hover:not(:disabled) {
    background: #687be0;
  }

  .refresh-button {
    width: 27px;
    padding: 0;
    background: transparent;
  }

  .bundled-status,
  .build-status {
    display: flex;
    align-items: center;
    gap: 5px;
    overflow: hidden;
    color: #70caa7;
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bundled-status {
    margin-left: auto;
  }

  .build-status {
    margin-left: auto;
  }

  .live-warning-count,
  .stale {
    padding: 3px 6px;
    border: 1px solid #675b36;
    border-radius: 4px;
    color: #ddc277;
    font-size: 9px;
    white-space: nowrap;
  }

  .latex-content {
    position: relative;
    min-width: 0;
    min-height: 0;
  }

  .live-scroll {
    width: 100%;
    height: 100%;
    overflow: auto;
    background: #16191f;
  }

  .latex-document {
    width: min(850px, calc(100% - 48px));
    min-height: calc(100% - 44px);
    margin: 22px auto;
    padding: 52px clamp(28px, 7vw, 76px) 90px;
    overflow-wrap: anywhere;
    border: 1px solid #303541;
    color: #d8dbe3;
    background: #1b1e25;
    box-shadow: 0 8px 32px rgb(0 0 0 / 24%);
    font-family: Georgia, "Times New Roman", serif;
    font-size: var(--latex-font-size);
    line-height: 1.65;
  }

  .latex-document :global(.latex-title) {
    margin: 0 0 3.2em;
    text-align: center;
  }

  .latex-document :global(.latex-title h1) {
    margin: 0 0 0.55em;
    font-size: 2em;
    line-height: 1.2;
  }

  .latex-document :global(.latex-body > :first-child) {
    margin-top: 0;
  }

  .latex-document :global(.latex-author),
  .latex-document :global(.latex-date) {
    margin: 0.25em 0;
    color: #aeb4c0;
  }

  .latex-document :global(h1),
  .latex-document :global(h2),
  .latex-document :global(h3),
  .latex-document :global(h4),
  .latex-document :global(h5),
  .latex-document :global(h6) {
    color: #f0f1f5;
    line-height: 1.25;
  }

  .latex-document :global(h1) {
    margin: 1.8em 0 0.75em;
    font-size: 1.8em;
  }

  .latex-document :global(h2) {
    margin: 1.7em 0 0.65em;
    padding-bottom: 0.2em;
    border-bottom: 1px solid #343945;
    font-size: 1.45em;
  }

  .latex-document :global(h3) {
    margin: 1.5em 0 0.55em;
    font-size: 1.2em;
  }

  .latex-document :global(h4),
  .latex-document :global(h5),
  .latex-document :global(h6) {
    margin: 1.3em 0 0.5em;
    font-size: 1em;
  }

  .latex-document :global(p) {
    margin: 0 0 1em;
  }

  .latex-document :global(ul),
  .latex-document :global(ol) {
    margin: 0 0 1.1em;
    padding-left: 1.8em;
  }

  .latex-document :global(li + li) {
    margin-top: 0.32em;
  }

  .latex-document :global(blockquote),
  .latex-document :global(.latex-abstract) {
    margin: 1.4em 0;
    padding: 0.9em 1.1em;
    border-left: 3px solid #6f7dc2;
    color: #c6cad4;
    background: #171a20;
  }

  .latex-document :global(.latex-center) {
    text-align: center;
  }

  .latex-document :global(code) {
    padding: 0.12em 0.3em;
    border-radius: 3px;
    color: #e0bf84;
    background: #12151a;
    font-family: var(--font-mono);
    font-size: 0.86em;
  }

  .latex-document :global(.latex-code) {
    margin: 1.2em 0;
    padding: 0.9em 1em;
    overflow: auto;
    border: 1px solid #303541;
    border-radius: 6px;
    background: #12151a;
    line-height: 1.5;
  }

  .latex-document :global(.latex-code code) {
    padding: 0;
    background: transparent;
  }

  .latex-document :global(.latex-table-wrap) {
    max-width: 100%;
    margin: 1.35em 0;
    overflow-x: auto;
  }

  .latex-document :global(table) {
    width: max-content;
    min-width: 45%;
    border-spacing: 0;
    border-collapse: collapse;
  }

  .latex-document :global(td),
  .latex-document :global(th) {
    padding: 0.4em 0.65em;
    border: 1px solid #3a404c;
  }

  .latex-document :global(th) {
    color: #eef0f5;
    background: #20242c;
    font-weight: 650;
  }

  .latex-document :global(.latex-number) {
    margin-right: 0.55em;
    color: #aeb4c0;
    font-variant-numeric: tabular-nums;
  }

  .latex-document :global(.latex-part) {
    margin-top: 2.4em;
    text-align: center;
  }

  .latex-document :global(.latex-part .latex-number) {
    display: block;
    margin: 0 0 0.3em;
    font-size: 0.6em;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .latex-document :global(.latex-toc) {
    margin: 0 0 2.2em;
    padding: 1em 1.2em;
    border: 1px solid #303541;
    border-radius: 6px;
    background: #171a20;
  }

  .latex-document :global(.latex-toc-title),
  .latex-document :global(.latex-abstract-title),
  .latex-document :global(.latex-bibliography-title) {
    margin: 0 0 0.6em;
    border: 0;
    font-size: 1.15em;
  }

  .latex-document :global(.latex-toc ul) {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .latex-document :global(.latex-toc li) {
    margin: 0.2em 0;
    padding-left: calc((var(--toc-depth, 2) - 2) * 1.4em);
  }

  .latex-document :global(.latex-toc-level-1) {
    --toc-depth: 1;
    margin-top: 0.6em;
    font-weight: 700;
  }

  .latex-document :global(.latex-toc-level-3) {
    --toc-depth: 3;
    font-size: 0.95em;
  }

  .latex-document :global(.latex-toc-level-4) {
    --toc-depth: 4;
    color: #aeb4c0;
    font-size: 0.9em;
  }

  .latex-document :global(dl) {
    margin: 0 0 1.1em;
  }

  .latex-document :global(dt) {
    font-weight: 700;
  }

  .latex-document :global(dd) {
    margin: 0.15em 0 0.6em 1.6em;
  }

  .latex-document :global(.latex-labeled) {
    list-style: none;
    margin-left: -1.4em;
  }

  .latex-document :global(.latex-item-label) {
    display: inline-block;
    min-width: 1.4em;
    margin-right: 0.35em;
    font-weight: 600;
  }

  .latex-document :global(.latex-bibliography) {
    padding-left: 2.6em;
  }

  .latex-document :global(.latex-bibliography li) {
    margin-bottom: 0.55em;
  }

  .latex-document :global(.latex-footnote) {
    margin-left: 0.08em;
    color: #9ba9f4;
    font-size: 0.7em;
    font-weight: 700;
  }

  .latex-document :global(.latex-footnotes) {
    margin-top: 2.4em;
    padding-top: 0.8em;
    border-top: 1px solid #3a404c;
    color: #aeb4c0;
    font-size: 0.85em;
  }

  .latex-document :global(.latex-footnotes ol) {
    margin: 0;
    padding-left: 1.6em;
  }

  .latex-document :global(.latex-theorem),
  .latex-document :global(.latex-proof) {
    margin: 1.2em 0;
  }

  .latex-document :global(.latex-theorem) {
    font-style: italic;
  }

  .latex-document :global(.latex-theorem-definition),
  .latex-document :global(.latex-theorem-example),
  .latex-document :global(.latex-theorem-remark),
  .latex-document :global(.latex-theorem-note),
  .latex-document :global(.latex-theorem-exercise),
  .latex-document :global(.latex-theorem-solution) {
    font-style: normal;
  }

  .latex-document :global(.latex-theorem-title) {
    font-style: normal;
  }

  .latex-document :global(.latex-theorem p),
  .latex-document :global(.latex-proof p) {
    display: inline;
  }

  .latex-document :global(.latex-theorem p + p),
  .latex-document :global(.latex-proof p + p) {
    display: block;
    margin-top: 0.6em;
  }

  .latex-document :global(.latex-qed) {
    float: right;
    margin-left: 0.5em;
  }

  .latex-document :global(.latex-note) {
    padding: 0.6em 0.9em;
    border: 1px dashed #596174;
    border-radius: 5px;
    color: #aeb4c0;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 0.85em;
  }

  .latex-document :global(.latex-pagebreak) {
    height: 0;
    margin: 2.2em 0;
    border: 0;
    border-top: 1px dashed #4a5060;
  }

  .latex-document :global(.latex-flushleft) {
    text-align: left;
  }

  .latex-document :global(.latex-flushright) {
    text-align: right;
  }

  .latex-document :global(.latex-verse) {
    font-style: italic;
  }

  .latex-document :global(.latex-frame) {
    margin: 1.4em 0;
    padding: 1em 1.2em 0.6em;
    border: 1px solid #303541;
    border-radius: 6px;
    background: #171a20;
  }

  .latex-document :global(.latex-frametitle) {
    margin: 0 0 0.6em;
    font-size: 1.25em;
  }

  .latex-document :global(.latex-block) {
    margin: 1em 0;
    padding: 0.7em 0.9em;
    border-left: 3px solid #6f7dc2;
    background: #1f2330;
  }

  .latex-document :global(.latex-alertblock) {
    border-left-color: #df7c82;
  }

  .latex-document :global(.latex-exampleblock) {
    border-left-color: #56c49e;
  }

  .latex-document :global(.latex-block-title) {
    display: block;
    margin-bottom: 0.3em;
  }

  .latex-document :global(.latex-alert) {
    color: #f09499;
  }

  .latex-document :global(.latex-structure) {
    color: #9ba9f4;
  }

  .latex-document :global(.latex-todo) {
    padding: 0 0.25em;
    background: #6d5a34;
    color: #fff3d6;
  }

  .latex-document :global(.latex-marginpar) {
    color: #929aab;
    font-size: 0.85em;
  }

  .latex-document :global(.latex-uppercase) {
    text-transform: uppercase;
  }

  .latex-document :global(.latex-sans) {
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .latex-document :global(.latex-size-small) { font-size: 0.9em; }
  .latex-document :global(.latex-size-footnote) { font-size: 0.8em; }
  .latex-document :global(.latex-size-script) { font-size: 0.7em; }
  .latex-document :global(.latex-size-tiny) { font-size: 0.6em; }
  .latex-document :global(.latex-size-large) { font-size: 1.2em; }
  .latex-document :global(.latex-size-Large) { font-size: 1.44em; }
  .latex-document :global(.latex-size-LARGE) { font-size: 1.73em; }
  .latex-document :global(.latex-size-huge) { font-size: 2.07em; }
  .latex-document :global(.latex-size-Huge) { font-size: 2.49em; }

  .latex-document :global(.latex-caption) {
    color: #aeb4c0;
    text-align: center;
    font-size: 0.9em;
  }

  .latex-document :global(.latex-link) {
    color: #9ba9f4;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.18em;
  }

  .latex-document :global(.latex-reference) {
    color: #9ba9f4;
  }

  .latex-document :global(.latex-smallcaps) {
    font-variant: small-caps;
  }

  .latex-document :global(.latex-image-placeholder) {
    display: inline-block;
    padding: 0.45em 0.65em;
    border: 1px dashed #596174;
    border-radius: 4px;
    color: #929aab;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 0.8em;
  }

  .latex-document :global(.katex-display) {
    margin: 1.35em 0;
    padding: 0.3em 0;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .live-warnings {
    width: min(850px, calc(100% - 48px));
    margin: -10px auto 28px;
    border: 1px solid #5d5435;
    border-radius: 6px;
    color: #c8b979;
    background: #262219;
    font-size: 10px;
  }

  .live-warnings summary {
    display: flex;
    min-height: 32px;
    align-items: center;
    gap: 6px;
    padding: 0 9px;
    cursor: pointer;
  }

  .live-warnings ul {
    margin: 0;
    padding: 8px 12px 10px 28px;
    border-top: 1px solid #4d462f;
    line-height: 1.5;
  }

  .latex-state {
    display: flex;
    height: 100%;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 9px;
    padding: 30px;
    color: #798294;
    text-align: center;
  }

  .latex-state strong {
    color: #c1c6d1;
    font-size: 13px;
  }

  .latex-state p {
    max-width: 620px;
    margin: 0 0 5px;
    font-size: 11px;
    line-height: 1.65;
  }

  .latex-state small {
    margin-top: 7px;
    color: #626b7a;
    font-size: 9px;
  }

  .no-engine > :global(svg),
  .build-error > :global(svg) {
    color: #d89a6f;
  }

  .ready > :global(svg) {
    color: #8494e8;
  }

  .build-error strong {
    color: #e6a4a8;
  }

  .build-log {
    position: absolute;
    z-index: 3;
    right: 10px;
    bottom: 10px;
    width: min(720px, calc(100% - 20px));
    max-height: 48%;
    overflow: hidden;
    border: 1px solid #3a3f4b;
    border-radius: 7px;
    color: #b9bfca;
    background: #171a20;
    box-shadow: 0 7px 30px rgb(0 0 0 / 35%);
  }

  .build-log summary {
    display: flex;
    height: 32px;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    cursor: pointer;
    font-size: 10px;
    list-style: none;
  }

  .build-log pre {
    max-height: calc(48vh - 32px);
    margin: 0;
    padding: 10px;
    overflow: auto;
    border-top: 1px solid #303540;
    color: #b7bdc8;
    background: #101216;
    font-family: var(--font-mono);
    font-size: 10px;
    line-height: 1.45;
    white-space: pre-wrap;
  }

  .spinner {
    display: inline-block;
    width: 13px;
    height: 13px;
    border: 2px solid rgb(255 255 255 / 35%);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 700ms linear infinite;
  }

  .spinner.large {
    width: 23px;
    height: 23px;
    color: #8494e8;
  }

  .spinning {
    animation: spin 700ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .latex-preview.light {
    color: #2d323d;
    background: #fff;
  }

  .light .latex-toolbar {
    border-color: #dfe2e8;
    background: #f6f7f9;
  }

  .light .view-switch {
    border-color: #d7dae2;
    background: #e9ebf0;
  }

  .light .view-switch button.active {
    color: #283878;
    background: #dbe1ff;
  }

  .light select {
    border-color: #d3d6de;
    color: #2e3440;
    background: #fff;
  }

  .light .live-scroll {
    background: #e8eaef;
  }

  .light .latex-document {
    border-color: #d4d7de;
    color: #30343c;
    background: #fff;
    box-shadow: 0 8px 28px rgb(35 40 52 / 13%);
  }

  .light .latex-document :global(h1),
  .light .latex-document :global(h2),
  .light .latex-document :global(h3),
  .light .latex-document :global(h4),
  .light .latex-document :global(h5),
  .light .latex-document :global(h6) {
    color: #171a20;
    border-color: #dfe2e8;
  }

  .light .latex-document :global(.latex-author),
  .light .latex-document :global(.latex-date),
  .light .latex-document :global(.latex-caption) {
    color: #626976;
  }

  .light .latex-document :global(blockquote),
  .light .latex-document :global(.latex-abstract),
  .light .latex-document :global(.latex-code),
  .light .latex-document :global(code) {
    border-color: #d8dbe2;
    color: #4b515d;
    background: #f5f6f8;
  }

  .light .latex-document :global(td),
  .light .latex-document :global(th) {
    border-color: #d2d6de;
  }

  .light .latex-document :global(th) {
    color: #202530;
    background: #eef0f4;
  }

  .light .latex-document :global(.latex-number),
  .light .latex-document :global(.latex-footnotes),
  .light .latex-document :global(.latex-note),
  .light .latex-document :global(.latex-marginpar) {
    color: #626976;
  }

  .light .latex-document :global(.latex-toc),
  .light .latex-document :global(.latex-frame),
  .light .latex-document :global(.latex-note) {
    border-color: #d8dbe2;
    background: #f5f6f8;
  }

  .light .latex-document :global(.latex-block) {
    background: #eef0f6;
  }

  .light .latex-document :global(.latex-footnote),
  .light .latex-document :global(.latex-structure) {
    color: #4358bd;
  }

  .light .latex-document :global(.latex-alert) {
    color: #a83a41;
  }

  .light .latex-document :global(.latex-todo) {
    color: #4b3a00;
    background: #ffe9a8;
  }

  .light .live-warnings {
    border-color: #ded29e;
    color: #756321;
    background: #fffbea;
  }

  @media (max-width: 720px) {
    .bundled-status,
    .latex-toolbar label > span,
    .compile-button > span,
    .live-warning-count {
      display: none;
    }

    select {
      width: min(180px, 32vw);
    }

    .latex-document,
    .live-warnings {
      width: calc(100% - 24px);
    }

    .latex-document {
      margin: 12px auto;
      padding: 32px 22px 70px;
    }
  }
</style>
