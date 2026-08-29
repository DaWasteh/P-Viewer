<script lang="ts">
  import { ImageOff, ShieldCheck } from "@lucide/svelte";
  import { readLocalImages } from "$lib/files/localImages";
  import { renderHtmlPreview } from "./html";

  interface Props {
    content: string;
    fileName: string;
    path?: string;
    theme?: "dark" | "light";
    fontSize?: number;
  }

  let {
    content,
    fileName,
    path = "",
    theme = "dark",
    fontSize = 16,
  }: Props = $props();

  let previewDocument = $state("");
  let renderError = $state("");
  let blockedResources = $state(0);
  let resolvedImages = $state(0);
  let loading = $state(true);
  let renderRequest = 0;

  $effect(() => {
    const source = content;
    const documentPath = path;
    const activeTheme = theme;
    const activeFontSize = fontSize;
    const request = ++renderRequest;
    loading = true;

    const timer = window.setTimeout(() => {
      void renderHtmlPreview(
        source,
        activeTheme,
        documentPath
          ? (sources) => readLocalImages(documentPath, sources)
          : undefined,
        activeFontSize,
      )
        .then((result) => {
          if (request !== renderRequest) return;
          previewDocument = result.document;
          blockedResources = result.blockedResources;
          resolvedImages = result.resolvedImages;
          renderError = "";
        })
        .catch((error) => {
          if (request !== renderRequest) return;
          previewDocument = "";
          blockedResources = 0;
          resolvedImages = 0;
          renderError = error instanceof Error ? error.message : String(error);
        })
        .finally(() => {
          if (request === renderRequest) loading = false;
        });
    }, 140);

    return () => {
      window.clearTimeout(timer);
      if (request === renderRequest) renderRequest += 1;
    };
  });
</script>

<div class:light={theme === "light"} class="html-preview">
  <div class="preview-toolbar" id="html-preview-security">
    <ShieldCheck size={15} aria-hidden="true" />
    <strong>Sichere HTML-Vorschau</strong>
    <span>Skripte, Navigation, Formulare und externe Netzwerkzugriffe sind deaktiviert.</span>
    {#if resolvedImages > 0}
      <span class="image-status">{resolvedImages} lokale {resolvedImages === 1 ? "Grafik" : "Grafiken"}</span>
    {/if}
    {#if blockedResources > 0}
      <span class="blocked-status" title="Nicht erlaubte oder nicht lesbare Ressourcen wurden nicht geladen">
        <ImageOff size={13} aria-hidden="true" />
        {blockedResources} blockiert
      </span>
    {/if}
  </div>

  {#if renderError}
    <div class="preview-message error" role="alert">
      <strong>HTML-Vorschau nicht verfügbar</strong>
      <span>{renderError}</span>
    </div>
  {:else if loading || !previewDocument}
    <div class="preview-message" role="status">Sichere Vorschau wird aufgebaut …</div>
  {:else}
    <iframe
      title={`Sichere HTML-Vorschau: ${fileName}`}
      aria-describedby="html-preview-security"
      sandbox=""
      referrerpolicy="no-referrer"
      srcdoc={previewDocument}
    ></iframe>
  {/if}
</div>

<style>
  .html-preview {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: 100%;
    height: 100%;
    color: #e7e9ef;
    background: #111318;
  }

  .html-preview.light {
    color: #242933;
    background: #fff;
  }

  .preview-toolbar {
    display: flex;
    min-width: 0;
    min-height: 38px;
    align-items: center;
    gap: 7px;
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

  .preview-toolbar strong {
    flex: 0 0 auto;
    color: inherit;
    font-size: 11px;
  }

  .preview-toolbar > span:not(.image-status, .blocked-status) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .image-status,
  .blocked-status {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    padding: 2px 6px;
    border-radius: 999px;
    color: #aab5f4;
    background: #242a42;
  }

  .blocked-status {
    margin-left: 0;
    color: #e7b27b;
    background: #3b2d20;
  }

  .light .image-status {
    color: #4358bd;
    background: #e3e7fb;
  }

  .light .blocked-status {
    color: #8c551f;
    background: #f8ead9;
  }

  iframe {
    width: 100%;
    height: 100%;
    border: 0;
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

  .preview-message.error {
    color: #e6a0a5;
  }

  .light .preview-message {
    color: #697180;
  }

  .light .preview-message.error {
    color: #a34049;
  }

  @media (max-width: 720px) {
    .preview-toolbar > span:not(.image-status, .blocked-status) {
      display: none;
    }
  }
</style>
