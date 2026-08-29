<script lang="ts">
  import { onMount } from "svelte";
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
  let zoom = $state(1);
  let pdfDocument = $state.raw<PDFDocumentProxy | null>(null);
  let loadingTask = $state.raw<PDFDocumentLoadingTask | null>(null);
  let generation = 0;
  let resizeTimer: number | undefined;
  const renderTasks = new Set<RenderTask>();

  onMount(() => {
    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (pdfDocument) void renderPages(pdfDocument);
      }, 180);
    });
    observer.observe(container);

    return () => {
      generation += 1;
      observer.disconnect();
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
    void loadPdf(encoded);
  });

  $effect(() => {
    zoom;
    if (pdfDocument) void renderPages(pdfDocument);
  });

  function decodeBase64(value: string): Uint8Array {
    const binary = window.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  async function loadPdf(encoded: string): Promise<void> {
    const currentGeneration = ++generation;
    loading = true;
    errorMessage = "";
    pageCount = 0;
    container.replaceChildren();

    try {
      for (const task of renderTasks) task.cancel();
      renderTasks.clear();
      await pdfDocument?.cleanup();
      await loadingTask?.destroy();
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
    const currentGeneration = ++generation;
    loading = true;
    for (const task of renderTasks) task.cancel();
    renderTasks.clear();
    container.replaceChildren();

    try {
      const availableWidth = Math.max(240, container.clientWidth - 38);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (currentGeneration !== generation) return;
        const page = await pdf.getPage(pageNumber);
        const natural = page.getViewport({ scale: 1 });
        const fitScale = (availableWidth / natural.width) * zoom;
        const cssViewport = page.getViewport({ scale: fitScale });
        const renderViewport = page.getViewport({ scale: fitScale * pixelRatio });

        const wrapper = document.createElement("section");
        wrapper.className = "pdf-page";
        wrapper.setAttribute("aria-label", `PDF-Seite ${pageNumber}`);
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = `${Math.floor(cssViewport.width)}px`;
        canvas.style.height = `${Math.floor(cssViewport.height)}px`;
        wrapper.append(canvas);
        container.append(wrapper);

        const renderTask = page.render({ canvas, viewport: renderViewport });
        renderTasks.add(renderTask);
        await renderTask.promise;
        renderTasks.delete(renderTask);
      }
      if (currentGeneration === generation) loading = false;
    } catch (error) {
      if (currentGeneration !== generation) return;
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
    {#if pageCount > 0}<span class="pages">{pageCount} {pageCount === 1 ? "Seite" : "Seiten"}</span>{/if}
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
