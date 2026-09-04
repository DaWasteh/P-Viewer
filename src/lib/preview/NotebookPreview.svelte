<script lang="ts">
  import { Eye, EyeOff, Hash } from "@lucide/svelte";
  import "katex/dist/katex.min.css";
  import "highlight.js/styles/github-dark-dimmed.css";
  import "./markdown-body.css";
  import { renderMarkdown } from "./markdown";
  import { parseNotebook, type NotebookDocument, type NotebookOutput } from "./notebook";

  interface Props {
    content: string;
    fileName: string;
    fontSize?: number;
    theme?: "dark" | "light";
  }

  let { content, fileName, fontSize = 16, theme = "dark" }: Props = $props();

  let notebook = $state<NotebookDocument | null>(null);
  let parseError = $state("");
  let showOutputs = $state(true);
  let showCounts = $state(true);

  const codeCellCount = $derived(notebook?.cells.filter((cell) => cell.type === "code").length ?? 0);

  $effect(() => {
    const source = content;
    const timer = window.setTimeout(() => {
      if (!source.trim()) {
        notebook = null;
        parseError = "";
        return;
      }
      try {
        notebook = parseNotebook(source);
        parseError = "";
      } catch (error) {
        notebook = null;
        parseError = error instanceof Error ? error.message : String(error);
      }
    }, 120);
    return () => window.clearTimeout(timer);
  });

  function safeFence(language: string): string {
    return /^[a-z0-9_+-]{1,32}$/i.test(language) ? language : "text";
  }

  function renderCode(source: string, language: string): string {
    // Reuse the sanitized Markdown pipeline so highlighting stays within the same boundary.
    const fence = "`".repeat(Math.max(3, longestBacktickRun(source) + 1));
    return renderMarkdown(`${fence}${safeFence(language)}\n${source}\n${fence}`);
  }

  function longestBacktickRun(source: string): number {
    let longest = 0;
    for (const match of source.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
    return longest;
  }

  function renderMarkdownCell(source: string): string {
    return renderMarkdown(source);
  }

  function outputLabel(output: NotebookOutput): string {
    switch (output.kind) {
      case "stream":
        return output.name;
      case "error":
        return "Fehler";
      case "image":
        return "Bild";
      case "json":
        return "JSON";
      case "html-only":
        return "HTML";
      default:
        return "";
    }
  }
</script>

<div class:light={theme === "light"} class="notebook-preview" style={`--preview-font-size: ${fontSize}px`}>
  <div class="preview-toolbar">
    <button class:active={showOutputs} title="Zellenausgaben ein-/ausblenden" onclick={() => (showOutputs = !showOutputs)}>
      {#if showOutputs}<Eye size={15} aria-hidden="true" />{:else}<EyeOff size={15} aria-hidden="true" />{/if}
      <span>Ausgaben</span>
    </button>
    <button class:active={showCounts} title="Ausführungszähler ein-/ausblenden" onclick={() => (showCounts = !showCounts)}>
      <Hash size={15} aria-hidden="true" />
      <span>Zähler</span>
    </button>
    {#if notebook}
      <span class="notebook-stats" title={`nbformat ${notebook.nbformat || "?"}`}>
        {notebook.kernel || notebook.language} · {notebook.cells.length} {notebook.cells.length === 1 ? "Zelle" : "Zellen"} · {codeCellCount} Code
      </span>
    {/if}
  </div>

  <div class="notebook-scroll">
    {#if parseError}
      <div class="notebook-state error" role="alert">
        <strong>Notebook konnte nicht gelesen werden</strong>
        <span>{parseError}</span>
      </div>
    {:else if notebook}
      <div class="cells">
        {#if notebook.truncatedCells}
          <div class="notebook-notice" role="status">Nur die ersten {notebook.cells.length} Zellen werden dargestellt.</div>
        {/if}
        {#each notebook.cells as cell, index (index)}
          <section class={`cell cell-${cell.type}`} aria-label={`${cell.type}-Zelle ${index + 1}`}>
            {#if showCounts}
              <div class="cell-gutter" aria-hidden="true">
                {#if cell.type === "code"}[{cell.executionCount ?? " "}]{/if}
              </div>
            {/if}
            <div class="cell-body">
              {#if cell.type === "markdown"}
                <!-- renderMarkdown sanitizes the HAST; raw HTML never reaches this point. -->
                <article class:light={theme === "light"} class="markdown-body">{@html renderMarkdownCell(cell.source)}</article>
              {:else if cell.type === "code"}
                <!-- The code cell is rendered through the same sanitized Markdown pipeline. -->
                <div class:light={theme === "light"} class="markdown-body code-cell">{@html renderCode(cell.source, notebook.language)}</div>
                {#if showOutputs && cell.outputs.length > 0}
                  <div class="outputs">
                    {#each cell.outputs as output}
                      <div class={`output output-${output.kind}`}>
                        {#if outputLabel(output)}<span class="output-label">{outputLabel(output)}</span>{/if}
                        {#if output.kind === "stream" || output.kind === "text" || output.kind === "json"}
                          <pre>{output.text}</pre>
                        {:else if output.kind === "markdown"}
                          <article class:light={theme === "light"} class="markdown-body">{@html renderMarkdownCell(output.source)}</article>
                        {:else if output.kind === "image"}
                          <img src={output.dataUrl} alt={output.alt} loading="lazy" decoding="async" />
                        {:else if output.kind === "error"}
                          <pre><strong>{output.name}</strong>{output.value ? `: ${output.value}` : ""}{"\n"}{output.traceback}</pre>
                        {:else}
                          <span class="output-blocked">HTML-Ausgaben werden aus Sicherheitsgründen nicht dargestellt.</span>
                        {/if}
                      </div>
                    {/each}
                    {#if cell.omittedOutputs > 0}
                      <div class="output output-notice">{cell.omittedOutputs} weitere Ausgaben ausgeblendet.</div>
                    {/if}
                  </div>
                {/if}
              {:else}
                <pre class="raw-cell">{cell.source}</pre>
              {/if}
            </div>
          </section>
        {/each}
      </div>
    {:else}
      <div class="notebook-state">
        <strong>Leeres Notebook</strong>
        <span>Markdown- und Code-Zellen aus {fileName} erscheinen hier mit ihren Ausgaben.</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .notebook-preview {
    display: grid;
    min-width: 0;
    min-height: 0;
    width: 100%;
    height: 100%;
    grid-template-rows: 36px minmax(0, 1fr);
    color: #d8dbe4;
    background: #111318;
  }

  .preview-toolbar {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0 8px;
    border-bottom: 1px solid #292d36;
    background: #171a20;
  }

  .preview-toolbar button {
    display: flex;
    height: 27px;
    align-items: center;
    gap: 5px;
    padding: 0 7px;
    border: 0;
    border-radius: 5px;
    color: #929aa9;
    background: transparent;
    cursor: pointer;
    font-size: 10px;
  }

  .preview-toolbar button:hover,
  .preview-toolbar button.active {
    color: #e1e4eb;
    background: #242833;
  }

  .notebook-stats {
    overflow: hidden;
    margin-left: auto;
    color: #697283;
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .notebook-scroll {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    scroll-behavior: smooth;
  }

  .cells {
    display: grid;
    width: min(920px, calc(100% - 40px));
    gap: 14px;
    margin: 0 auto;
    padding: 28px 0 110px;
    font-size: var(--preview-font-size);
  }

  .notebook-notice,
  .output-notice {
    padding: 7px 12px;
    border: 1px solid #5d5435;
    border-radius: 6px;
    color: #ddc277;
    background: #262219;
    font-size: 10px;
  }

  .cell {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
  }

  .cell-gutter {
    min-width: 46px;
    padding-top: 12px;
    color: #6b7383;
    font-family: var(--font-mono);
    font-size: 0.72em;
    text-align: right;
    white-space: pre;
  }

  .cell-body {
    min-width: 0;
  }

  .cell-markdown .cell-body {
    padding: 4px 6px;
  }

  .cell-code .cell-body {
    border: 1px solid #2b303a;
    border-radius: 8px;
    background: #14171d;
  }

  .code-cell :global(pre) {
    margin: 0;
    border: 0;
    border-radius: 8px 8px 0 0;
    background: #16191f;
  }

  .code-cell :global(pre:only-child) {
    border-radius: 8px;
  }

  .outputs {
    display: grid;
    gap: 6px;
    padding: 10px 12px 12px;
    border-top: 1px solid #262a33;
  }

  .output {
    position: relative;
    min-width: 0;
  }

  .output-label {
    position: absolute;
    top: 4px;
    right: 6px;
    color: #5f6878;
    font-size: 0.65em;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .output pre {
    margin: 0;
    padding: 6px 8px;
    overflow: auto;
    color: #cfd4de;
    font-family: var(--font-mono);
    font-size: 0.85em;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .output-stderr pre {
    color: #f0c46f;
    background: #26201a;
    border-radius: 5px;
  }

  .output-error pre {
    color: #f09499;
    background: #291a1e;
    border-radius: 5px;
  }

  .output img {
    max-width: 100%;
    border-radius: 5px;
    background: #fff;
  }

  .output-blocked {
    color: #8f97a6;
    font-size: 0.8em;
  }

  .output .markdown-body {
    padding: 4px 8px;
  }

  .raw-cell {
    margin: 0;
    padding: 10px 12px;
    border: 1px dashed #3a3f4b;
    border-radius: 8px;
    color: #aab0bd;
    font-family: var(--font-mono);
    font-size: 0.85em;
    white-space: pre-wrap;
  }

  .notebook-state {
    display: flex;
    min-height: 100%;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
    padding: 24px;
    color: #737c8d;
    text-align: center;
  }

  .notebook-state strong {
    color: #aab0bd;
    font-size: 13px;
  }

  .notebook-state.error strong {
    color: #ef9a9f;
  }

  .notebook-state span {
    max-width: 580px;
    font-size: 12px;
  }

  .notebook-preview.light {
    color: #2b303a;
    background: #fff;
  }

  .light .preview-toolbar {
    border-color: #dfe2e8;
    background: #f6f7f9;
  }

  .light .preview-toolbar button:hover,
  .light .preview-toolbar button.active {
    color: #242935;
    background: #e8eaf0;
  }

  .light .cell-gutter {
    color: #8790a2;
  }

  .light .cell-code .cell-body {
    border-color: #d9dce5;
    background: #f8f9fb;
  }

  .light .code-cell :global(pre) {
    background: #f3f4f7;
  }

  .light .outputs {
    border-color: #e1e4ea;
  }

  .light .output pre {
    color: #303641;
  }

  .light .output-stderr pre {
    color: #8e6716;
    background: #fcf7ea;
  }

  .light .output-error pre {
    color: #a83a41;
    background: #fcefef;
  }

  .light .raw-cell {
    border-color: #cfd3dc;
    color: #4c5361;
  }

  .light .notebook-notice,
  .light .output-notice {
    border-color: #ded29e;
    color: #756321;
    background: #fffbea;
  }
</style>
