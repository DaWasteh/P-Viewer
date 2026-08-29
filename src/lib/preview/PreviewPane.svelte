<script lang="ts">
  import type { Component } from "svelte";
  import EditorPane from "$lib/editor/EditorPane.svelte";
  import type { FileTypeInfo } from "$lib/files/types";

  interface Props {
    content: string;
    fileName: string;
    path: string;
    fileType: FileTypeInfo;
    theme?: "dark" | "light";
    editorFontSize?: number;
    previewFontSize?: number;
    wordWrap?: boolean;
    onOpenPath?: (path: string) => void;
  }

  let {
    content,
    fileName,
    path,
    fileType,
    theme = "dark",
    editorFontSize = 14,
    previewFontSize = 16,
    wordWrap = true,
    onOpenPath = () => undefined,
  }: Props = $props();

  let SpecializedPreview = $state.raw<Component<any> | null>(null);
  let previewLoading = $state(false);
  let previewLoadError = $state("");
  let previewRequest = 0;

  const specialized = $derived(
    fileType.kind === "markdown" ||
      fileType.kind === "json" ||
      fileType.kind === "latex" ||
      fileType.kind === "html",
  );
  const sourceNotice = $derived(
    fileType.language === "astro"
      ? "Astro-Quelltextansicht – Frontmatter und Projektcode werden nicht ausgeführt."
      : fileType.language === "svelte" || fileType.language === "vue"
        ? "Komponenten-Quelltextansicht – Dokumentcode wird nicht ausgeführt."
        : "",
  );

  $effect(() => {
    const kind = fileType.kind;
    const request = ++previewRequest;
    SpecializedPreview = null;
    previewLoadError = "";

    if (kind !== "markdown" && kind !== "json" && kind !== "latex" && kind !== "html") {
      previewLoading = false;
      return;
    }

    previewLoading = true;
    const modulePromise =
      kind === "markdown"
        ? import("./MarkdownPreview.svelte")
        : kind === "json"
          ? import("./JsonPreview.svelte")
          : kind === "latex"
            ? import("./LatexPreview.svelte")
            : import("./HtmlPreview.svelte");

    void modulePromise
      .then((module) => {
        if (request !== previewRequest) return;
        SpecializedPreview = module.default as Component<any>;
      })
      .catch((error) => {
        if (request !== previewRequest) return;
        previewLoadError = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        if (request === previewRequest) previewLoading = false;
      });
  });
</script>

{#if specialized}
  {#if SpecializedPreview}
    <SpecializedPreview
      {content}
      {fileName}
      {path}
      {theme}
      {onOpenPath}
      fontSize={fileType.kind === "markdown" ? previewFontSize : editorFontSize}
    />
  {:else if previewLoadError}
    <div class:light={theme === "light"} class="preview-state error" role="alert">
      <strong>Vorschau konnte nicht geladen werden.</strong>
      <span>{previewLoadError}</span>
    </div>
  {:else if previewLoading}
    <div class:light={theme === "light"} class="preview-state">
      <span class="spinner"></span>
      <span>Formatvorschau wird geladen …</span>
    </div>
  {/if}
{:else if fileType.kind === "code"}
  <div class:with-notice={Boolean(sourceNotice)} class="code-preview">
    {#if sourceNotice}
      <div class:light={theme === "light"} class="source-notice">{sourceNotice}</div>
    {/if}
    <EditorPane
      value={content}
      {fileName}
      readOnly
      {theme}
      fontSize={editorFontSize}
      {wordWrap}
    />
  </div>
{:else}
  <div class:light={theme === "light"} class="text-preview">
    {#if content}
      <pre style={`font-size: ${previewFontSize}px`}>{content}</pre>
    {:else}
      <div class="empty-text">
        <strong>Leeres Textdokument</strong>
        <span>Der Inhalt erscheint hier in einer ruhigen Leseansicht.</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .code-preview {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .code-preview.with-notice {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .source-notice {
    min-height: 34px;
    padding: 8px 12px;
    border-bottom: 1px solid #2a2e38;
    color: #aab1c0;
    background: #171a20;
    font-size: 11px;
  }

  .source-notice.light {
    border-color: #d9dce3;
    color: #646c7a;
    background: #f2f3f6;
  }

  .preview-state,
  .empty-text {
    display: flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
    color: #737c8d;
    background: #111318;
    text-align: center;
  }

  .preview-state.error strong {
    color: #ef9a9f;
  }

  .preview-state.light {
    color: #687181;
    background: #fff;
  }

  .preview-state span,
  .empty-text span {
    max-width: 620px;
    font-size: 11px;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid #484f5d;
    border-top-color: #8796ed;
    border-radius: 50%;
    animation: spin 700ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .text-preview {
    width: 100%;
    height: 100%;
    overflow: auto;
    color: #d6d9e1;
    background: #111318;
  }

  .text-preview pre {
    width: min(900px, calc(100% - 50px));
    min-height: 100%;
    margin: 0 auto;
    padding: 38px 0 100px;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    line-height: 1.75;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .empty-text strong {
    color: #aab0bd;
    font-size: 13px;
  }

  .text-preview.light {
    color: #303641;
    background: #fff;
  }
</style>
