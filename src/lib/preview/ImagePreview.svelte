<script lang="ts">
  import { Grid2x2, Maximize2, Minus, Plus, RotateCcw, ShieldCheck } from "@lucide/svelte";

  interface Props {
    fileName: string;
    binary?: { mime: string; base64: string } | null;
    theme?: "dark" | "light";
  }

  let { fileName, binary = null, theme = "dark" }: Props = $props();

  // `fit` scales large images down to the pane; a numeric zoom is relative to
  // the natural pixel size, like an image viewer.
  let zoom = $state<number | "fit">("fit");
  let checkerboard = $state(true);
  let naturalWidth = $state(0);
  let naturalHeight = $state(0);
  let loadError = $state(false);
  let animated = $state(false);

  const source = $derived(binary ? `data:${binary.mime};base64,${binary.base64}` : "");
  const zoomLabel = $derived(zoom === "fit" ? "Einpassen" : `${Math.round(zoom * 100)} %`);

  $effect(() => {
    source;
    naturalWidth = 0;
    naturalHeight = 0;
    loadError = false;
    zoom = "fit";
    animated = /^image\/(?:gif|apng)$/.test(binary?.mime ?? "") || /\.apng$/i.test(fileName);
  });

  function step(direction: 1 | -1): void {
    const current = zoom === "fit" ? 1 : zoom;
    const next = direction > 0 ? current * 1.25 : current / 1.25;
    zoom = Math.min(16, Math.max(0.05, Number(next.toFixed(3))));
  }

  function handleLoad(event: Event): void {
    const image = event.currentTarget as HTMLImageElement;
    naturalWidth = image.naturalWidth;
    naturalHeight = image.naturalHeight;
    loadError = false;
  }
</script>

<div class:light={theme === "light"} class="image-preview">
  <div class="preview-toolbar" id="image-preview-security">
    <button class="zoom-button" title="Verkleinern" onclick={() => step(-1)} disabled={zoom !== "fit" && zoom <= 0.05}>
      <Minus size={14} aria-hidden="true" />
    </button>
    <span class="zoom-value" aria-live="polite">{zoomLabel}</span>
    <button class="zoom-button" title="Vergrößern" onclick={() => step(1)} disabled={zoom !== "fit" && zoom >= 16}>
      <Plus size={14} aria-hidden="true" />
    </button>
    <button class="zoom-button" title="Originalgröße (100 %)" onclick={() => (zoom = 1)} disabled={zoom === 1}>
      <RotateCcw size={13} aria-hidden="true" />
    </button>
    <button class="zoom-button" title="In die Ansicht einpassen" onclick={() => (zoom = "fit")} disabled={zoom === "fit"}>
      <Maximize2 size={13} aria-hidden="true" />
    </button>
    <button class:active={checkerboard} class="toggle-button" title="Transparenzraster ein-/ausblenden" onclick={() => (checkerboard = !checkerboard)}>
      <Grid2x2 size={14} aria-hidden="true" />
      <span>Raster</span>
    </button>
    <span class="security-note" title="Das Bild wird direkt aus der Datei decodiert; Skripte oder Netzwerkzugriffe sind nicht möglich.">
      <ShieldCheck size={13} aria-hidden="true" />
      <span>Schreibgeschützte Bildansicht</span>
      {#if naturalWidth > 0}
        <span class="dimensions">· {naturalWidth.toLocaleString("de-DE")} × {naturalHeight.toLocaleString("de-DE")} px{animated ? " · animiert" : ""}</span>
      {/if}
    </span>
  </div>

  {#if !source}
    <div class="preview-message">
      <strong>Kein Bildinhalt</strong>
      <span>Die Bilddaten konnten nicht übernommen werden.</span>
    </div>
  {:else if loadError}
    <div class="preview-message error" role="alert">
      <strong>Bild kann nicht dargestellt werden</strong>
      <span>Das Format wird von dieser WebView nicht decodiert oder die Datei ist beschädigt.</span>
    </div>
  {:else}
    <div class:checkerboard class:fit={zoom === "fit"} class="canvas">
      <img
        src={source}
        alt={fileName}
        decoding="async"
        draggable="false"
        style={zoom === "fit" ? "" : `width: ${Math.max(1, Math.round(naturalWidth * zoom))}px; height: ${Math.max(1, Math.round(naturalHeight * zoom))}px;`}
        class:pixelated={zoom !== "fit" && zoom >= 3}
        onload={handleLoad}
        onerror={() => (loadError = true)}
      />
    </div>
  {/if}
</div>

<style>
  .image-preview {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: 100%;
    height: 100%;
    color: #e7e9ef;
    background: #111318;
  }

  .image-preview.light {
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

  .zoom-button {
    width: 26px;
    padding: 0;
    justify-content: center;
  }

  .zoom-button:hover:not(:disabled),
  .toggle-button:hover,
  .toggle-button.active {
    color: #f1f3ff;
    background: #242833;
  }

  .zoom-button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .zoom-value {
    min-width: 62px;
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

  .light .zoom-button:hover:not(:disabled),
  .light .toggle-button:hover,
  .light .toggle-button.active {
    color: #242935;
    background: #e8eaf0;
  }

  .canvas {
    display: grid;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 24px;
    place-items: safe center;
    background: #111318;
  }

  .light .canvas {
    background: #fff;
  }

  .canvas.checkerboard {
    background-color: #242833;
    background-image:
      linear-gradient(45deg, #1c2028 25%, transparent 25%),
      linear-gradient(-45deg, #1c2028 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #1c2028 75%),
      linear-gradient(-45deg, transparent 75%, #1c2028 75%);
    background-size: 20px 20px;
    background-position:
      0 0,
      0 10px,
      10px -10px,
      -10px 0;
  }

  .light .canvas.checkerboard {
    background-color: #f6f7fa;
    background-image:
      linear-gradient(45deg, #e6e8ee 25%, transparent 25%),
      linear-gradient(-45deg, #e6e8ee 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #e6e8ee 75%),
      linear-gradient(-45deg, transparent 75%, #e6e8ee 75%);
  }

  img {
    display: block;
    max-width: none;
    box-shadow: 0 2px 14px rgb(0 0 0 / 30%);
  }

  .canvas.fit img {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
  }

  img.pixelated {
    image-rendering: pixelated;
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
