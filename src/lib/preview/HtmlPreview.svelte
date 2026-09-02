<script lang="ts">
  import { ExternalLink, ImageOff, ShieldCheck, TriangleAlert } from "@lucide/svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { onDestroy } from "svelte";
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
  let fullPreviewDialog: HTMLDialogElement;
  let fullPreviewToken = $state("");
  let fullPreviewBusy = $state(false);
  let fullPreviewError = $state("");
  let fullPreviewIdentity = "";
  let fullPreviewLastContent = "";
  let fullPreviewUpdateGeneration = 0;
  let fullPreviewUpdateChain: Promise<void> = Promise.resolve();
  let renderRequest = 0;

  async function requestFullPreview(): Promise<void> {
    fullPreviewError = "";
    if (fullPreviewToken) {
      fullPreviewBusy = true;
      try {
        const isOpen = await invoke<boolean>("focus_full_html_preview", {
          token: fullPreviewToken,
        });
        if (isOpen) return;
        fullPreviewToken = "";
      } catch (error) {
        fullPreviewError = error instanceof Error ? error.message : String(error);
        return;
      } finally {
        fullPreviewBusy = false;
      }
    }
    fullPreviewDialog.showModal();
  }

  function handleFullPreviewSubmit(event: SubmitEvent): void {
    const submitter = event.submitter as HTMLButtonElement | null;
    if (submitter?.value !== "confirm") return;
    event.preventDefault();
    fullPreviewDialog.close();
    void openFullPreview();
  }

  async function openFullPreview(): Promise<void> {
    const documentPath = path;
    const activeFileName = fileName;
    const source = content;
    fullPreviewBusy = true;
    fullPreviewError = "";
    try {
      const session = await invoke<{ token: string }>("open_full_html_preview", {
        documentPath,
        fileName: activeFileName,
        content: source,
      });
      fullPreviewIdentity = `${documentPath}\u0000${activeFileName}`;
      fullPreviewLastContent = source;
      fullPreviewToken = session.token;
    } catch (error) {
      fullPreviewError = error instanceof Error ? error.message : String(error);
    } finally {
      fullPreviewBusy = false;
    }
  }

  async function closeFullPreview(token = fullPreviewToken): Promise<void> {
    if (!token) return;
    if (token === fullPreviewToken) fullPreviewToken = "";
    fullPreviewUpdateGeneration += 1;
    try {
      await invoke("close_full_html_preview", { token });
    } catch {
      // The native window may already have been closed by the user.
    }
  }

  $effect(() => {
    const token = fullPreviewToken;
    const source = content;
    const documentPath = path;
    const activeFileName = fileName;
    if (!token) return;

    if (`${documentPath}\u0000${activeFileName}` !== fullPreviewIdentity) {
      void closeFullPreview(token);
      return;
    }
    if (source === fullPreviewLastContent) return;

    const generation = ++fullPreviewUpdateGeneration;
    const timer = window.setTimeout(() => {
      const update = async (): Promise<void> => {
        if (generation !== fullPreviewUpdateGeneration || token !== fullPreviewToken) return;
        try {
          const isOpen = await invoke<boolean>("update_full_html_preview", {
            token,
            documentPath,
            fileName: activeFileName,
            content: source,
          });
          if (generation !== fullPreviewUpdateGeneration || token !== fullPreviewToken) return;
          if (isOpen) {
            fullPreviewLastContent = source;
            fullPreviewError = "";
          } else {
            fullPreviewToken = "";
          }
        } catch (error) {
          if (generation !== fullPreviewUpdateGeneration || token !== fullPreviewToken) return;
          fullPreviewError = error instanceof Error ? error.message : String(error);
        }
      };
      fullPreviewUpdateChain = fullPreviewUpdateChain.then(update, update);
    }, 220);

    return () => window.clearTimeout(timer);
  });

  onDestroy(() => {
    const token = fullPreviewToken;
    if (token) void closeFullPreview(token);
  });

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
    <span class="preview-description">Skripte, Navigation, Formulare und externe Netzwerkzugriffe sind deaktiviert.</span>
    {#if resolvedImages > 0}
      <span class="image-status">{resolvedImages} lokale {resolvedImages === 1 ? "Grafik" : "Grafiken"}</span>
    {/if}
    {#if blockedResources > 0}
      <span class="blocked-status" title="Nicht erlaubte oder nicht lesbare Ressourcen wurden nicht geladen">
        <ImageOff size={13} aria-hidden="true" />
        {blockedResources} blockiert
      </span>
    {/if}
    {#if fullPreviewError}
      <span class="full-preview-error" role="alert" title={fullPreviewError}>
        {fullPreviewError}
      </span>
    {/if}
    <button
      type="button"
      class="full-preview-button"
      aria-haspopup={fullPreviewToken ? undefined : "dialog"}
      disabled={fullPreviewBusy}
      onclick={() => void requestFullPreview()}
    >
      <ExternalLink size={13} aria-hidden="true" />
      {#if fullPreviewBusy}
        Wird geöffnet …
      {:else if fullPreviewToken}
        Vollständiges Fenster anzeigen
      {:else}
        Vollständig öffnen
      {/if}
    </button>
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

<dialog
  class="full-preview-dialog"
  class:light={theme === "light"}
  bind:this={fullPreviewDialog}
  aria-labelledby="full-preview-title"
>
  <form method="dialog" onsubmit={handleFullPreviewSubmit}>
    <header>
      <TriangleAlert size={22} aria-hidden="true" />
      <div>
        <h2 id="full-preview-title">Aktive HTML-Inhalte ausführen?</h2>
        <p>Nur für HTML-Dateien öffnen, deren Herkunft und Inhalt du vertraust.</p>
      </div>
    </header>
    <ul>
      <li>Skripte, Styles, Formulare, Medien und Web-Ressourcen werden unverändert ausgeführt.</li>
      <li>Relative lokale Dateien werden ausschließlich aus dem Ordner des Dokuments geladen.</li>
      <li>
        Die Darstellung läuft inkognito in einem separaten Ursprung ohne P-Viewer-Berechtigungen;
        Popups, Downloads und Navigation aus dem Vorschaufenster bleiben blockiert.
      </li>
      <li>Aktive Inhalte können trotzdem Netzwerkzugriffe ausführen und viel Rechenleistung verbrauchen.</li>
    </ul>
    <div class="dialog-actions">
      <button type="submit" value="cancel">Abbrechen</button>
      <button type="submit" value="confirm" class="confirm-active">Isoliert öffnen</button>
    </div>
  </form>
</dialog>

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

  .preview-description,
  .full-preview-error {
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

  .full-preview-error {
    max-width: 240px;
    color: #ef9ea5;
  }

  .light .full-preview-error {
    color: #a34049;
  }

  .full-preview-button {
    display: inline-flex;
    flex: 0 0 auto;
    min-height: 28px;
    align-items: center;
    gap: 5px;
    margin-left: auto;
    padding: 4px 8px;
    border: 1px solid #465079;
    border-radius: 5px;
    color: #dce2ff;
    background: #293252;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }

  .full-preview-button:hover:not(:disabled) {
    border-color: #6d7dba;
    background: #35416b;
  }

  .full-preview-button:focus-visible {
    outline: 2px solid #8d9ee8;
    outline-offset: 2px;
  }

  .full-preview-button:disabled {
    opacity: 0.62;
    cursor: wait;
  }

  .light .full-preview-button {
    border-color: #aeb8df;
    color: #2d3e8f;
    background: #e6eafd;
  }

  .light .full-preview-button:hover:not(:disabled) {
    border-color: #7d8dc9;
    background: #dce2fb;
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

  .full-preview-dialog {
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    padding: 0;
    overflow: auto;
    border: 1px solid #424958;
    border-radius: 10px;
    color: #edf0f7;
    background: #191c23;
    box-shadow: 0 18px 70px rgb(0 0 0 / 55%);
  }

  .full-preview-dialog::backdrop {
    background: rgb(4 6 10 / 72%);
    backdrop-filter: blur(2px);
  }

  .full-preview-dialog.light {
    border-color: #c7cbd5;
    color: #242933;
    background: #fff;
  }

  .full-preview-dialog form {
    display: grid;
    gap: 18px;
    padding: 22px;
  }

  .full-preview-dialog header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    color: #f0b66c;
  }

  .full-preview-dialog header > div {
    min-width: 0;
  }

  .full-preview-dialog h2 {
    margin: 0;
    color: #f4f6fb;
    font-size: 18px;
    line-height: 1.3;
  }

  .full-preview-dialog.light h2 {
    color: #242933;
  }

  .full-preview-dialog p {
    margin: 5px 0 0;
    color: #b8becb;
    font-size: 13px;
    line-height: 1.45;
  }

  .full-preview-dialog.light p {
    color: #626a78;
  }

  .full-preview-dialog ul {
    display: grid;
    gap: 8px;
    margin: 0;
    padding-left: 20px;
    color: #c8ceda;
    font-size: 13px;
    line-height: 1.48;
  }

  .full-preview-dialog.light ul {
    color: #4f5765;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 9px;
  }

  .dialog-actions button {
    min-height: 34px;
    padding: 6px 12px;
    border: 1px solid #4a5160;
    border-radius: 6px;
    color: #e4e7ed;
    background: #292d36;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }

  .dialog-actions button:hover {
    background: #343945;
  }

  .dialog-actions button:focus-visible {
    outline: 2px solid #8d9ee8;
    outline-offset: 2px;
  }

  .dialog-actions .confirm-active {
    border-color: #a66a31;
    color: #fff5e8;
    background: #8c4e1f;
  }

  .dialog-actions .confirm-active:hover {
    background: #a65d24;
  }

  .light .dialog-actions button {
    border-color: #c5cad4;
    color: #303643;
    background: #eef0f4;
  }

  .light .dialog-actions .confirm-active {
    border-color: #a96424;
    color: #fff;
    background: #a45d20;
  }

  @media (max-width: 720px) {
    .preview-description,
    .image-status,
    .blocked-status {
      display: none;
    }

    .full-preview-button {
      margin-left: auto;
    }
  }
</style>
