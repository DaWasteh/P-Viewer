<script lang="ts">
  import { tick } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { ChevronDown, ChevronsDownUp, ChevronsUpDown, ListTree } from "@lucide/svelte";
  import { resolveDocumentReference } from "$lib/files/paths";
  import "katex/dist/katex.min.css";
  import "highlight.js/styles/github-dark-dimmed.css";
  import {
    extractMarkdownHeadings,
    renderMarkdown,
    type MarkdownHeading,
  } from "./markdown";

  interface Props {
    content: string;
    path?: string;
    fontSize?: number;
    theme?: "dark" | "light";
    onOpenPath?: (path: string) => void;
  }

  interface LocalImagePayload {
    dataUrl: string;
    path: string;
  }

  let {
    content,
    path = "",
    fontSize = 16,
    theme = "dark",
    onOpenPath = () => undefined,
  }: Props = $props();

  let rendered = $state("");
  let headings = $state<MarkdownHeading[]>([]);
  let renderError = $state("");
  let showOutline = $state(true);
  let article = $state.raw<HTMLElement | null>(null);

  $effect(() => {
    const source = content;
    const timer = window.setTimeout(() => {
      try {
        rendered = renderMarkdown(source);
        headings = extractMarkdownHeadings(source);
        renderError = "";
      } catch (error) {
        renderError = error instanceof Error ? error.message : String(error);
      }
    }, 120);

    return () => window.clearTimeout(timer);
  });

  $effect(() => {
    rendered;
    path;
    if (!article) return;
    void tick().then(decorateDocument);
  });

  function isHeading(element: Element): element is HTMLHeadingElement {
    return /^H[1-6]$/.test(element.tagName);
  }

  function headingLevel(heading: HTMLHeadingElement): number {
    return Number(heading.tagName.slice(1));
  }

  function decorateDocument(): void {
    if (!article) return;
    article.onclick = handleArticleClick;
    for (const heading of article.querySelectorAll<HTMLHeadingElement>("h1, h2, h3, h4, h5, h6")) {
      if (heading.querySelector(":scope > .heading-fold")) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "heading-fold";
      button.setAttribute("aria-label", `Abschnitt ${heading.textContent ?? ""} einklappen`);
      button.setAttribute("aria-expanded", "true");
      button.innerHTML = "<span aria-hidden=\"true\">⌄</span>";
      heading.prepend(button);
    }
    updateFoldVisibility();
    void resolveLocalImages();
  }

  async function resolveLocalImages(): Promise<void> {
    if (!article || !path || !("__TAURI_INTERNALS__" in window)) return;
    const currentArticle = article;
    const images = Array.from(currentArticle.querySelectorAll<HTMLImageElement>("img[src]"));

    await Promise.all(
      images.map(async (image) => {
        const source = image.getAttribute("src") ?? "";
        if (!source || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(source)) return;
        if (image.dataset.localSource === source) return;
        image.dataset.localSource = source;
        image.classList.add("local-image-loading");
        try {
          const payload = await invoke<LocalImagePayload>("read_local_image", {
            documentPath: path,
            source,
          });
          if (!image.isConnected || image.dataset.localSource !== source) return;
          image.src = payload.dataUrl;
          image.title = payload.path;
          image.classList.remove("local-image-loading", "local-image-error");
        } catch (error) {
          if (!image.isConnected || image.dataset.localSource !== source) return;
          image.classList.remove("local-image-loading");
          image.classList.add("local-image-error");
          image.title = error instanceof Error ? error.message : String(error);
        }
      }),
    );
  }

  function updateFoldVisibility(): void {
    if (!article) return;
    const collapsedLevels: number[] = [];

    for (const element of Array.from(article.children)) {
      if (isHeading(element)) {
        const level = headingLevel(element);
        while (
          collapsedLevels.length > 0 &&
          collapsedLevels[collapsedLevels.length - 1] >= level
        ) {
          collapsedLevels.pop();
        }
        element.hidden = collapsedLevels.length > 0;
        const button = element.querySelector<HTMLButtonElement>(":scope > .heading-fold");
        const collapsed = element.dataset.collapsed === "true";
        button?.setAttribute("aria-expanded", String(!collapsed));
        if (collapsed) collapsedLevels.push(level);
      } else {
        (element as HTMLElement).hidden = collapsedLevels.length > 0;
      }
    }
  }

  function setAllCollapsed(collapsed: boolean): void {
    if (!article) return;
    for (const heading of article.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")) {
      if (collapsed) heading.dataset.collapsed = "true";
      else delete heading.dataset.collapsed;
    }
    updateFoldVisibility();
  }

  async function openHeading(id: string): Promise<void> {
    setAllCollapsed(false);
    await tick();
    const target = article?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleArticleClick(event: MouseEvent): void {
    const target = event.target as Element;
    const foldButton = target.closest<HTMLButtonElement>(".heading-fold");
    if (foldButton) {
      const heading = foldButton.parentElement;
      if (heading && isHeading(heading)) {
        if (heading.dataset.collapsed === "true") delete heading.dataset.collapsed;
        else heading.dataset.collapsed = "true";
        updateFoldVisibility();
      }
      return;
    }

    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (href.startsWith("#")) {
      event.preventDefault();
      void openHeading(href.slice(1));
      return;
    }

    if (/^(https?:|mailto:)/i.test(href)) {
      event.preventDefault();
      if ("__TAURI_INTERNALS__" in window) {
        void import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(href));
      } else {
        window.open(href, "_blank", "noopener,noreferrer");
      }
      return;
    }

    event.preventDefault();
    const resolved = resolveDocumentReference(path, href);
    if (resolved) onOpenPath(resolved);
  }
</script>

<div
  class:light={theme === "light"}
  class:outline-hidden={!showOutline || headings.length === 0}
  class="markdown-preview"
  style={`--preview-font-size: ${fontSize}px`}
>
  <div class="preview-toolbar">
    <button class:active={showOutline} title="Gliederung ein-/ausblenden" onclick={() => (showOutline = !showOutline)}>
      <ListTree size={15} aria-hidden="true" />
      <span>Gliederung</span>
    </button>
    <span class="separator"></span>
    <button title="Alle Abschnitte aufklappen" onclick={() => setAllCollapsed(false)}>
      <ChevronsUpDown size={15} aria-hidden="true" />
      <span>Aufklappen</span>
    </button>
    <button title="Alle Abschnitte einklappen" onclick={() => setAllCollapsed(true)}>
      <ChevronsDownUp size={15} aria-hidden="true" />
      <span>Einklappen</span>
    </button>
  </div>

  <div class="preview-grid">
    {#if showOutline && headings.length > 0}
      <aside class="outline" aria-label="Dokumentgliederung">
        <div class="outline-title">INHALT</div>
        {#each headings as heading}
          <button
            style={`--heading-depth: ${heading.depth}`}
            title={heading.text}
            onclick={() => void openHeading(heading.id)}
          >
            <ChevronDown size={11} aria-hidden="true" />
            <span>{heading.text}</span>
          </button>
        {/each}
      </aside>
    {/if}

    <div class="article-scroll">
      {#if renderError}
        <div class="render-error" role="alert">
          <strong>Markdown konnte nicht gerendert werden.</strong>
          <span>{renderError}</span>
        </div>
      {:else if content.trim()}
        <!-- The unified pipeline removes raw HTML and sanitizes the HAST before this point. -->
        <article class="markdown-body" bind:this={article}>{@html rendered}</article>
      {:else}
        <div class="empty-preview">
          <strong>Leeres Markdown-Dokument</strong>
          <span>Überschriften, Tabellen, Formeln und Aufgaben erscheinen hier.</span>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .markdown-preview {
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

  .separator {
    width: 1px;
    height: 18px;
    margin: 0 3px;
    background: #30343e;
  }

  .preview-grid {
    display: grid;
    min-width: 0;
    min-height: 0;
    grid-template-columns: 205px minmax(0, 1fr);
  }

  .outline-hidden .preview-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .outline {
    overflow: auto;
    padding: 13px 8px 30px;
    border-right: 1px solid #292d36;
    background: #13161b;
  }

  .outline-title {
    padding: 0 8px 8px;
    color: #656e7e;
    font-size: 9px;
    font-weight: 750;
    letter-spacing: 0.14em;
  }

  .outline button {
    display: flex;
    width: 100%;
    height: 26px;
    align-items: center;
    gap: 3px;
    padding: 0 6px 0 calc(4px + (var(--heading-depth) - 1) * 9px);
    overflow: hidden;
    border: 0;
    border-radius: 4px;
    color: #9098a8;
    background: transparent;
    cursor: pointer;
    text-align: left;
    white-space: nowrap;
  }

  .outline button:hover {
    color: #e0e3ea;
    background: #20242c;
  }

  .outline button span {
    overflow: hidden;
    font-size: 10px;
    text-overflow: ellipsis;
  }

  .article-scroll {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    scroll-behavior: smooth;
  }

  .markdown-body {
    width: min(860px, calc(100% - 48px));
    min-height: 100%;
    margin: 0 auto;
    padding: 38px 0 110px;
    color: #d5d8e1;
    font-size: var(--preview-font-size);
    line-height: 1.72;
    overflow-wrap: anywhere;
  }

  /* Author display rules (notably table { display: block }) must not defeat folding. */
  .markdown-body :global([hidden]) {
    display: none !important;
  }

  .markdown-body :global(h1),
  .markdown-body :global(h2),
  .markdown-body :global(h3),
  .markdown-body :global(h4),
  .markdown-body :global(h5),
  .markdown-body :global(h6) {
    position: relative;
    scroll-margin-top: 22px;
    color: #f0f1f5;
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 1.28;
  }

  .markdown-body :global(h1) {
    margin: 0 0 0.65em;
    padding-bottom: 0.35em;
    border-bottom: 1px solid #303540;
    font-size: 2.15em;
  }

  .markdown-body :global(h2) {
    margin: 1.8em 0 0.65em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid #292e38;
    font-size: 1.55em;
  }

  .markdown-body :global(h3) {
    margin: 1.55em 0 0.55em;
    font-size: 1.25em;
  }

  .markdown-body :global(h4),
  .markdown-body :global(h5),
  .markdown-body :global(h6) {
    margin: 1.35em 0 0.5em;
    font-size: 1.05em;
  }

  .markdown-body :global(.heading-fold) {
    position: absolute;
    right: 100%;
    top: 0.15em;
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border: 0;
    border-radius: 5px;
    color: #697283;
    background: transparent;
    cursor: pointer;
    font-size: 16px;
    transform: rotate(0deg);
  }

  .markdown-body :global(.heading-fold:hover) {
    color: #cbd0dc;
    background: #222630;
  }

  .markdown-body :global(.heading-fold[aria-expanded="false"] span) {
    display: inline-block;
    transform: rotate(-90deg);
  }

  .markdown-body :global(p) {
    margin: 0 0 1em;
  }

  .markdown-body :global(a) {
    color: #91a2ff;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.2em;
  }

  .markdown-body :global(a:hover) {
    color: #bac4ff;
  }

  .markdown-body :global(ul),
  .markdown-body :global(ol) {
    margin: 0 0 1em;
    padding-left: 1.65em;
  }

  .markdown-body :global(li + li) {
    margin-top: 0.3em;
  }

  .markdown-body :global(input[type="checkbox"]) {
    width: 1em;
    height: 1em;
    margin: 0 0.45em 0 -1.4em;
    accent-color: #7183e7;
    vertical-align: -0.1em;
  }

  .markdown-body :global(blockquote) {
    margin: 1.2em 0;
    padding: 0.8em 1em;
    border-left: 3px solid #6876bd;
    border-radius: 0 6px 6px 0;
    color: #bbc0cd;
    background: #181c25;
  }

  .markdown-body :global(blockquote > :last-child),
  .markdown-body :global(.callout > :last-child) {
    margin-bottom: 0;
  }

  .markdown-body :global(.callout) {
    margin: 1.2em 0;
    padding: 0.9em 1em;
    border: 1px solid #34405f;
    border-left: 4px solid #7183e7;
    border-radius: 7px;
    background: #171c29;
  }

  .markdown-body :global(.callout::before) {
    display: block;
    margin-bottom: 0.35em;
    color: #9aa9fa;
    content: "Hinweis";
    font-size: 0.78em;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .markdown-body :global(.callout-tip) {
    border-color: #2f695a;
    border-left-color: #56c49e;
    background: #14231f;
  }

  .markdown-body :global(.callout-tip::before) {
    color: #69d1af;
    content: "Tipp";
  }

  .markdown-body :global(.callout-important::before) {
    content: "Wichtig";
  }

  .markdown-body :global(.callout-warning),
  .markdown-body :global(.callout-caution) {
    border-color: #71464a;
    border-left-color: #df7c82;
    background: #291a1e;
  }

  .markdown-body :global(.callout-warning::before) {
    color: #f09499;
    content: "Warnung";
  }

  .markdown-body :global(.callout-caution::before) {
    color: #f09499;
    content: "Achtung";
  }

  .markdown-body :global(code) {
    padding: 0.14em 0.35em;
    border: 1px solid #303540;
    border-radius: 4px;
    color: #e4c58b;
    background: #1c2028;
    font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
    font-size: 0.88em;
  }

  .markdown-body :global(pre) {
    margin: 1.2em 0;
    padding: 1em 1.1em;
    overflow: auto;
    border: 1px solid #2b303a;
    border-radius: 7px;
    background: #16191f;
    line-height: 1.55;
  }

  .markdown-body :global(pre code) {
    padding: 0;
    border: 0;
    color: inherit;
    background: transparent;
    font-size: 0.85em;
  }

  .markdown-body :global(table) {
    display: block;
    width: max-content;
    max-width: 100%;
    margin: 1.25em 0;
    overflow-x: auto;
    border-spacing: 0;
    border-collapse: collapse;
  }

  .markdown-body :global(th),
  .markdown-body :global(td) {
    padding: 0.45em 0.75em;
    border: 1px solid #353a45;
    text-align: left;
  }

  .markdown-body :global(th) {
    color: #eef0f5;
    background: #20242c;
    font-weight: 650;
  }

  .markdown-body :global(tr:nth-child(2n)) {
    background: #171a20;
  }

  .markdown-body :global(hr) {
    height: 1px;
    margin: 2em 0;
    border: 0;
    background: #343943;
  }

  .markdown-body :global(img) {
    max-width: 100%;
    border-radius: 6px;
  }

  .markdown-body :global(img.local-image-loading) {
    min-width: 120px;
    min-height: 54px;
    opacity: 0.45;
    background: #20242c;
  }

  .markdown-body :global(img.local-image-error) {
    min-width: 120px;
    min-height: 42px;
    border: 1px dashed #74444a;
    background: #281b1e;
  }

  .markdown-body :global(.katex-display) {
    margin: 1.4em 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0.35em 0;
  }

  .render-error,
  .empty-preview {
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

  .render-error strong {
    color: #ef9a9f;
  }

  .render-error span,
  .empty-preview span {
    max-width: 580px;
    font-size: 12px;
  }

  .empty-preview strong {
    color: #aab0bd;
    font-size: 13px;
  }

  .markdown-preview.light {
    color: #2b303a;
    background: #fff;
  }

  .light .preview-toolbar,
  .light .outline {
    border-color: #dfe2e8;
    background: #f6f7f9;
  }

  .light .preview-toolbar button:hover,
  .light .preview-toolbar button.active,
  .light .outline button:hover {
    color: #242935;
    background: #e8eaf0;
  }

  .light .markdown-body {
    color: #303641;
  }

  .light .markdown-body :global(h1),
  .light .markdown-body :global(h2),
  .light .markdown-body :global(h3),
  .light .markdown-body :global(h4),
  .light .markdown-body :global(h5),
  .light .markdown-body :global(h6) {
    color: #161a22;
    border-color: #dfe2e8;
  }

  .light .markdown-body :global(code) {
    border-color: #d8dbe2;
    color: #865d1f;
    background: #f1f2f5;
  }

  .light .markdown-body :global(pre),
  .light .markdown-body :global(blockquote),
  .light .markdown-body :global(.callout) {
    border-color: #d9dce5;
    background: #f5f6f8;
  }

  .light .markdown-body :global(th),
  .light .markdown-body :global(td) {
    border-color: #d7dae2;
  }

  .light .markdown-body :global(th) {
    color: #202530;
    background: #eef0f4;
  }

  .light .markdown-body :global(tr:nth-child(2n)) {
    background: #f7f8fa;
  }

  .light .markdown-body :global(hr) {
    background: #d8dbe2;
  }

  @media (max-width: 850px) {
    .preview-grid {
      grid-template-columns: 165px minmax(0, 1fr);
    }

    .markdown-body {
      width: calc(100% - 38px);
    }
  }
</style>
