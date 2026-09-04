<script lang="ts">
  import { Code2, Grid2x2, Image, Minus, Plus, RotateCcw, ShieldCheck } from "@lucide/svelte";
  import EditorPane from "$lib/editor/EditorPane.svelte";
  import { renderSvgPreview, type SvgPreviewResult } from "./svg";

  interface Props {
    content: string;
    fileName: string;
    theme?: "dark" | "light";
    fontSize?: number;
  }

  let { content, fileName, theme = "dark", fontSize = 14 }: Props = $props();

  let view = $state<"image" | "source">("image");
  let zoom = $state(1);
  let checkerboard = $state(true);
  let preview = $state<SvgPreviewResult | null>(null);
  let renderError = $state("");

  $effect(() => {
    const source = content;
    const activeTheme = theme;
    const activeZoom = zoom;
    const activeCheckerboard = checkerboard;
    const timer = window.setTimeout(() => {
      if (!source.trim()) {
        preview = null;
        renderError = "";
        return;
      }
      try {
        preview = renderSvgPreview(source, {
          theme: activeTheme,
          zoom: activeZoom,
          checkerboard: activeCheckerboard,
        });
        renderError = "";
      } catch (error) {
        preview = null;
        renderError = error instanceof Error ? error.message : String(error);
      }
    }, 140);
    return () => window.clearTimeout(timer);
  });

  function updateZoom(next: number): void {
    zoom = Math.min(8, Math.max(0.1, Number(next.toFixed(2))));
  }

  function dimensionLabel(result: SvgPreviewResult): string {
    if (result.width && result.height) return `${result.width} × ${result.height}`;
    if (result.viewBox) return `viewBox ${result.viewBox}`;
    return "ohne feste Größe";
  }
</script>

<div class:light={theme === "light"} class="svg-preview">
  <div class="preview-toolbar" id="svg-preview-security">
    <div class="view-switch" aria-label="SVG-Ansicht">
      <button class:active={view === "image"} aria-pressed={view === "image"} onclick={() => (view = "image")}>
        <Image size={14} aria-hidden="true" /> Bild
      </button>
      <button class:active={view === "source"} aria-pressed={view === "source"} onclick={() => (view = "source")}>
        <Code2 size={14} aria-hidden="true" /> Quelltext
      </button>
    </div>
    {#if view === "image"}
      <button class="zoom-button" title="Verkleinern" onclick={() => updateZoom(zoom / 1.25)} disabled={zoom <= 0.1}>
        <Minus size={14} aria-hidden="true" />
      </button>
      <span class="zoom-value">{Math.round(zoom * 100)} %</span>
      <button class="zoom-button" title="Vergrößern" onclick={() => updateZoom(zoom * 1.25)} disabled={zoom >= 8}>
        <Plus size={14} aria-hidden="true" />
      </button>
      <button class="zoom-button" title="Originalgröße" onclick={() => (zoom = 1)}>
        <RotateCcw size={13} aria-hidden="true" />
      </button>
      <button class:active={checkerboard} class="toggle-button" title="Transparenzraster ein-/ausblenden" onclick={() => (checkerboard = !checkerboard)}>
        <Grid2x2 size={14} aria-hidden="true" />
        <span>Raster</span>
      </button>
    {/if}
    <span class="security-note" title="Skripte, externe Ressourcen und Netzwerkzugriffe sind in der Bildvorschau blockiert.">
      <ShieldCheck size={13} aria-hidden="true" />
      <span>Sichere Bildvorschau</span>
      {#if preview}<span class="dimensions">· {dimensionLabel(preview)}</span>{/if}
    </span>
  </div>

  {#if view === "source"}
    <EditorPane value={content} {fileName} readOnly {theme} {fontSize} wordWrap={false} />
  {:else if renderError}
    <div class="preview-message error" role="alert">
      <strong>SVG-Vorschau nicht verfügbar</strong>
      <span>{renderError}</span>
    </div>
  {:else if preview}
    <iframe
      title={`Sichere SVG-Vorschau: ${fileName}`}
      aria-describedby="svg-preview-security"
      sandbox=""
      referrerpolicy="no-referrer"
      srcdoc={preview.document}
    ></iframe>
  {:else}
    <div class="preview-message">
      <strong>Leeres SVG-Dokument</strong>
      <span>Die Grafik erscheint hier, sobald ein &lt;svg&gt;-Element vorhanden ist.</span>
    </div>
  {/if}
</div>

<style>
  .svg-preview {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: 100%;
    height: 100%;
    color: #e7e9ef;
    background: #111318;
  }

  .svg-preview.light {
    color: #242933;
    background: #fff;
  }

  .preview-toolbar {
    display: flex;
    min-width: 0;
    min-height: 38px;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-bottom: 1px solid #2a2e38;
    color: #aab1c0;
    background: #171a20;
    font-size: 11px;
  }

  .light .preview-toolbar {
    border-color: #d9dce3;
    color: #646c7a;
    background: #f2f3f6;
  }

  .view-switch {
    display: flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid #303642;
    border-radius: 6px;
    background: #111419;
  }

  .view-switch button,
  .zoom-button,
  .toggle-button {
    display: inline-flex;
    height: 25px;
    align-items: center;
    gap: 5px;
    padding: 0 8px;
    border: 0;
    border-radius: 5px;
    color: #aeb5c2;
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 10px;
  }

  .view-switch button:hover,
  .zoom-button:hover:not(:disabled),
  .toggle-button:hover,
  .toggle-button.active {
    color: #f1f3ff;
    background: #242833;
  }

  .view-switch button.active {
    color: #f1f3ff;
    background: #303a68;
  }

  .zoom-button {
    width: 26px;
    padding: 0;
    justify-content: center;
  }

  .zoom-button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .zoom-value {
    min-width: 40px;
    font-family: var(--font-mono);
    font-size: 10px;
    text-align: center;
  }

  .security-note {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 5px;
    margin-left: auto;
    overflow: hidden;
    white-space: nowrap;
  }

  .security-note .dimensions {
    overflow: hidden;
    color: #7f8797;
    text-overflow: ellipsis;
  }

  .light .view-switch {
    border-color: #d7dae2;
    background: #e9ebf0;
  }

  .light .view-switch button.active {
    color: #283878;
    background: #dbe1ff;
  }

  .light .view-switch button:hover,
  .light .zoom-button:hover:not(:disabled),
  .light .toggle-button:hover,
  .light .toggle-button.active {
    color: #242935;
    background: #e8eaf0;
  }

  iframe {
    width: 100%;
    height: 100%;
    border: 0;
    background: #111318;
  }

  .light iframe {
    background: #fff;
  }

  .preview-message {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 7px;
    padding: 24px;
    color: #969eae;
    text-align: center;
  }

  .preview-message strong {
    color: #aab0bd;
    font-size: 13px;
  }

  .preview-message span {
    max-width: 580px;
    font-size: 12px;
  }

  .preview-message.error strong {
    color: #e6a0a5;
  }

  .light .preview-message {
    color: #697180;
  }

  @media (max-width: 720px) {
    .security-note > span:not(.dimensions),
    .toggle-button span {
      display: none;
    }
  }
</style>
