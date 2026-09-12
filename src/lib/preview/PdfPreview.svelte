<script lang="ts">
  import PdfViewer from "./PdfViewer.svelte";
  import { MAX_PDF_BASE64_CHARACTERS } from "./pdfLimits";

  interface Props {
    fileName: string;
    binary?: { mime: string; base64: string } | null;
    theme?: "dark" | "light";
  }

  let { fileName, binary = null, theme = "dark" }: Props = $props();

  const tooLarge = $derived((binary?.base64.length ?? 0) > MAX_PDF_BASE64_CHARACTERS);
</script>

<div class:light={theme === "light"} class="pdf-preview">
  {#if !binary}
    <div class="preview-message">
      <strong>Kein PDF-Inhalt</strong>
      <span>Die Dokumentdaten konnten nicht übernommen werden.</span>
    </div>
  {:else if tooLarge}
    <div class="preview-message error" role="alert">
      <strong>PDF zu groß für die Vorschau</strong>
      <span>{fileName} überschreitet das Größenlimit der integrierten PDF-Ansicht.</span>
    </div>
  {:else}
    <!-- PDF.js parses the bytes in a worker; no document script ever runs. -->
    <PdfViewer pdfBase64={binary.base64} />
  {/if}
</div>

<style>
  .pdf-preview {
    display: grid;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    color: #e7e9ef;
    background: #292c33;
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
</style>
