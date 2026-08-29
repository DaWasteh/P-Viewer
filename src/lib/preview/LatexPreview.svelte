<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { AlertTriangle, CheckCircle2, Play, RefreshCw, Terminal } from "@lucide/svelte";
  import PdfViewer from "./PdfViewer.svelte";

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
  }

  let { content, path, fileName, theme = "dark" }: Props = $props();

  let engines = $state<LatexEngineInfo[]>([]);
  let selectedEngine = $state("auto");
  let checking = $state(true);
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

  onMount(() => {
    void detectEngines();
  });

  async function detectEngines(): Promise<void> {
    checking = true;
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
      <span class="build-status success"><CheckCircle2 size={13} />{result.engineLabel} · {durationLabel(result.durationMs)}</span>
    {/if}
    {#if previewStale}<span class="stale">Vorschau ist älter als der Text</span>{/if}
  </div>

  <div class="latex-content">
    {#if result?.success && result.pdfBase64}
      <PdfViewer pdfBase64={result.pdfBase64} />
    {:else if checking}
      <div class="latex-state">
        <span class="spinner large"></span>
        <strong>LaTeX-Umgebung wird geprüft</strong>
      </div>
    {:else if availableEngines.length === 0}
      <div class="latex-state no-engine">
        <AlertTriangle size={30} strokeWidth={1.5} aria-hidden="true" />
        <strong>Kein LaTeX-Compiler gefunden</strong>
        <p>
          Installiere MiKTeX oder TeX Live unter Windows, MacTeX unter macOS oder
          TeX Live unter Linux. P-Viewer bevorzugt <code>latexmk</code> und
          unterstützt außerdem Tectonic, LuaLaTeX, XeLaTeX und pdfLaTeX.
        </p>
        <button onclick={() => void detectEngines()}>
          <RefreshCw size={14} aria-hidden="true" /> Erneut suchen
        </button>
        <small>Aus Sicherheitsgründen bleibt Shell-Escape deaktiviert.</small>
      </div>
    {:else if errorMessage}
      <div class="latex-state build-error" role="alert">
        <AlertTriangle size={28} strokeWidth={1.5} aria-hidden="true" />
        <strong>LaTeX-Build fehlgeschlagen</strong>
        <p>{errorMessage}</p>
        <button onclick={() => void compile()}><Play size={13} /> Erneut bauen</button>
      </div>
    {:else}
      <div class="latex-state ready">
        <Play size={28} strokeWidth={1.4} aria-hidden="true" />
        <strong>{fileName} als PDF darstellen</strong>
        <p>Der Build läuft lokal, ohne Shell-Escape, und schreibt seine Hilfsdateien in einen temporären Ordner.</p>
        <button onclick={() => void compile()}><Play size={13} fill="currentColor" /> PDF bauen</button>
      </div>
    {/if}

    {#if result?.log}
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

  .build-status {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-left: auto;
    overflow: hidden;
    color: #70caa7;
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

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

  .latex-state code {
    padding: 2px 4px;
    border-radius: 3px;
    color: #d7ba83;
    background: #20242c;
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
    font-family: "Cascadia Code", Consolas, monospace;
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

  .light select {
    border-color: #d3d6de;
    color: #2e3440;
    background: #fff;
  }
</style>
