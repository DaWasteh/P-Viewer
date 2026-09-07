<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { boundedPdfScale, MAX_PDF_BASE64_CHARACTERS } from "./pdfLimits";
  import { Minus, Plus, RotateCcw } from "@lucide/svelte";
  import type {
    PDFDocumentLoadingTask,
    PDFDocumentProxy,
    RenderTask,
  } from "pdfjs-dist";

  interface Props {
    pdfBase64: string;
  }

  let { pdfBase64 }: Props = $props();

  let container: HTMLDivElement;
  let loading = $state(true);
  let errorMessage = $state("");
  let pageCount = $state(0);
  let currentPage = $state(1);
  let renderGeneration = 0;
  let zoom = $state(1);
  let pdfDocument = $state.raw<PDFDocumentProxy | null>(null);
  let loadingTask = $state.raw<PDFDocumentLoadingTask | null>(null);
  let generation = 0;
  let resizeTimer: number | undefined;
  const renderTasks = new Set<RenderTask>();

  onMount(() => {
    const scheduleRender = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (pdfDocument) void renderPages(pdfDocument);
      }, 180);
    };
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleRender);
    if (observer) observer.observe(container);
    else window.addEventListener("resize", scheduleRender);

    return () => {
      generation += 1;
      renderGeneration += 1;
      observer?.disconnect();
      window.removeEventListener("resize", scheduleRender);
      window.clearTimeout(resizeTimer);
      for (const task of renderTasks) task.cancel();
      renderTasks.clear();
      void pdfDocument?.cleanup();
      void loadingTask?.destroy();
    };
  });

  $effect(() => {
    const encoded = pdfBase64;
    if (!container) return;
    untrack(() => void loadPdf(encoded));
  });

  $effect(() => {
    zoom;
    currentPage;
    const loaded = untrack(() => pdfDocument);
    if (loaded) void renderPages(loaded);
  });

  function decodeBase64(value: string): Uint8Array {
    if (value.length > MAX_PDF_BASE64_CHARACTERS) throw new Error("PDF überschreitet das Vorschau-Größenlimit.");
    const binary = window.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  async function loadPdf(encoded: string): Promise<void> {
    const currentGeneration = ++generation;
    renderGeneration += 1;
    loading = true;
    errorMessage = "";
    pageCount = 0;
    currentPage = 1;
    container.replaceChildren();

    try {
      for (const task of renderTasks) task.cancel();
      renderTasks.clear();
      await pdfDocument?.cleanup();
      await loadingTask?.destroy();
      if (currentGeneration !== generation) return;
      pdfDocument = null;
      loadingTask = null;

      const [pdfjs, workerModule] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]);
      if (currentGeneration !== generation) return;

      pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
      const task = pdfjs.getDocument({
        data: decodeBase64(encoded),
        enableXfa: false,
        useWasm: true,
      });
      loadingTask = task;
      const loaded = await task.promise;
      if (currentGeneration !== generation) {
        await task.destroy();
        return;
      }

      pdfDocument = loaded;
      pageCount = loaded.numPages;
      await renderPages(loaded);
    } catch (error) {
      if (currentGeneration !== generation) return;
      errorMessage = error instanceof Error ? error.message : String(error);
      loading = false;
    }
  }

  async function renderPages(pdf: PDFDocumentProxy): Promise<void> {
    const currentGeneration = ++renderGeneration;
    const selectedPage = currentPage;
    loading = true;
    errorMessage = "";
    for (const task of renderTasks) task.cancel();
    renderTasks.clear();
    container.replaceChildren();

    try {
      const availableWidth = Math.max(240, container.clientWidth - 38);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      // Keep one bounded bitmap resident, regardless of document page count.
      for (const pageNumber of [selectedPage]) {
        if (currentGeneration !== renderGeneration) return;
        const page = await pdf.getPage(pageNumber);
        if (currentGeneration !== renderGeneration) return;
        const natural = page.getViewport({ scale: 1 });
        const fitScale = boundedPdfScale(natural.width, natural.height, (availableWidth / natural.width) * zoom);
        const cssViewport = page.getViewport({ scale: fitScale });
        const renderScale = boundedPdfScale(natural.width, natural.height, fitScale * pixelRatio);
        const renderViewport = page.getViewport({ scale: renderScale });

        const wrapper = document.createElement("section");
        wrapper.className = "pdf-page";
        wrapper.setAttribute("aria-label", `PDF-Seite ${pageNumber}`);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(renderViewport.width));
        canvas.height = Math.max(1, Math.floor(renderViewport.height));
        canvas.style.width = `${Math.floor(cssViewport.width)}px`;
        canvas.style.height = `${Math.floor(cssViewport.height)}px`;
        wrapper.append(canvas);
        container.append(wrapper);

        const renderTask = page.render({ canvas, viewport: renderViewport });
        renderTasks.add(renderTask);
        await renderTask.promise;
        renderTasks.delete(renderTask);
        page.cleanup();
      }
      if (currentGeneration === renderGeneration) loading = false;
    } catch (error) {
      if (currentGeneration !== renderGeneration) return;
      const name = error instanceof Error ? error.name : "";
      if (name !== "RenderingCancelledException") {
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      loading = false;
    }
  }

  function updateZoom(next: number): void {
    zoom = Math.min(2.5, Math.max(0.5, Number(next.toFixed(2))));
  }
</script>

<div class="pdf-viewer">
  <div class="pdf-toolbar">
    <button title="Verkleinern" onclick={() => updateZoom(zoom - 0.1)} disabled={zoom <= 0.5}>
      <Minus size={15} aria-hidden="true" />
    </button>
    <span>{Math.round(zoom * 100)} %</span>
    <button title="Vergrößern" onclick={() => updateZoom(zoom + 0.1)} disabled={zoom >= 2.5}>
      <Plus size={15} aria-hidden="true" />
    </button>
    <button title="An Breite anpassen" onclick={() => (zoom = 1)}>
      <RotateCcw size={14} aria-hidden="true" />
    </button>
    {#if pageCount > 0}
      <button aria-label="Vorherige PDF-Seite" disabled={currentPage <= 1} onclick={() => currentPage -= 1}>‹</button>
      <label>Seite <input aria-label="PDF-Seite" type="number" min="1" max={pageCount} value={currentPage} onchange={(event) => { currentPage = Math.max(1, Math.min(pageCount, Math.trunc(Number(event.currentTarget.value)) || 1)); }} /></label>
      <button aria-label="Nächste PDF-Seite" disabled={currentPage >= pageCount} onclick={() => currentPage += 1}>›</button>
      <span class="pages">von {pageCount}</span>
    {/if}
  </div>

  <div class="canvas-scroll" bind:this={container}></div>

  {#if loading}
    <div class="pdf-state" aria-live="polite">
      <span class="spinner"></span>
      <span>PDF wird dargestellt …</span>
    </div>
  {/if}

  {#if errorMessage}
    <div class="pdf-state error" role="alert">
      <strong>PDF-Vorschau fehlgeschlagen</strong>
      <span>{errorMessage}</span>
    </div>
  {/if}
</div>

<style>
  .pdf-viewer {
    position: relative;
    display: grid;
    min-width: 0;
    min-height: 0;
    width: 100%;
    height: 100%;
    grid-template-rows: 34px minmax(0, 1fr);
    background: #292c33;
  }

  .pdf-toolbar {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0 8px;
    border-bottom: 1px solid #373b45;
    color: #a1a8b5;
    background: #1c1f25;
    font-size: 10px;
  }

  .pdf-toolbar button {
    display: grid;
    width: 26px;
    height: 25px;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 5px;
    color: #a1a8b5;
    background: transparent;
    cursor: pointer;
  }

  .pdf-toolbar button:hover:not(:disabled) {
    color: #f0f1f4;
    background: #2b3039;
  }

  .pdf-toolbar button:disabled {
    opacity: 0.35;
  }

  .pdf-toolbar input { width: 56px; color: inherit; background: transparent; border: 1px solid #525967; border-radius: 4px; }

  .pages {
    margin-left: auto;
  }

  .canvas-scroll {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 18px 18px 70px;
  }

  .canvas-scroll :global(.pdf-page) {
    width: fit-content;
    margin: 0 auto 16px;
    background: #fff;
    box-shadow: 0 3px 18px rgb(0 0 0 / 35%);
  }

  .canvas-scroll :global(canvas) {
    display: block;
    max-width: none;
  }

  .pdf-state {
    position: absolute;
    inset: 34px 0 0;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 9px;
    color: #a5acb9;
    background: rgb(34 37 43 / 72%);
    -webkit-backdrop-filter: blur(2px);
    backdrop-filter: blur(2px);
    font-size: 11px;
  }

  .pdf-state.error {
    color: #e9b3b7;
    text-align: center;
  }

  .pdf-state.error span {
    max-width: 560px;
    padding: 0 20px;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid #525967;
    border-top-color: #8796ed;
    border-radius: 50%;
    animation: spin 700ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
