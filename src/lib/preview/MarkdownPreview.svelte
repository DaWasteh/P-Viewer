<script lang="ts">
  import { tick, onMount } from "svelte";
  import { ChevronDown, ChevronsDownUp, ChevronsUpDown, ListTree } from "@lucide/svelte";
  import { isRelativeImageSource, readLocalImages } from "$lib/files/localImages";
  import { resolveDocumentReference } from "$lib/files/paths";
  import { rememberScroll } from "./scrollMemory";
  import { collectAnchors, type PreviewSyncController, type SourceAnchor } from "./sync";
  import "katex/dist/katex.min.css";
  import "highlight.js/styles/github-dark-dimmed.css";
  import "./markdown-body.css";
  import {
    decodeMarkdownFragment,
    renderMarkdownDocument,
    type MarkdownHeading,
  } from "./markdown";

  interface Props {
    content: string;
    path?: string;
    fontSize?: number;
    theme?: "dark" | "light";
    scrollMemory?: { top: number };
    /** Split view synchronisation with the editor (issue #2). */
    sync?: PreviewSyncController;
    onOpenPath?: (path: string) => void;
  }

  let {
    content,
    path = "",
    fontSize = 16,
    theme = "dark",
    scrollMemory,
    sync,
    onOpenPath = () => undefined,
  }: Props = $props();

  let rendered = $state("");
  let headings = $state<MarkdownHeading[]>([]);
  let renderError = $state("");
  let showOutline = $state(false);
  let previewHost: HTMLDivElement;
  let articleScroll: HTMLDivElement;
  onMount(() => {
    const observer = new ResizeObserver(([entry]) => {
      showOutline = entry.contentRect.width >= 720;
      invalidateAnchors();
    });
    observer.observe(previewHost);
    return () => observer.disconnect();
  });

  // Source anchors are measured once per layout, never on every scroll event.
  let anchorCache: SourceAnchor[] | null = null;
  function invalidateAnchors(): void {
    anchorCache = null;
    sync?.previewChanged();
  }

  $effect(() => {
    const controller = sync;
    if (!controller || !articleScroll) return;
    return controller.attachPreview({
      scroller: articleScroll,
      anchors: () => (anchorCache ??= article ? collectAnchors(article, articleScroll) : []),
      flashLine,
    });
  });

  $effect(() => {
    const current = article;
    if (!current) return;
    // Images and other late layout changes move everything below them.
    const observer = new ResizeObserver(() => invalidateAnchors());
    observer.observe(current);
    const loaded = () => invalidateAnchors();
    current.addEventListener("load", loaded, true);
    return () => {
      observer.disconnect();
      current.removeEventListener("load", loaded, true);
    };
  });

  /** The deepest rendered element that covers a source line. */
  function elementForLine(line: number): HTMLElement | null {
    let best: HTMLElement | null = null;
    for (const element of article?.querySelectorAll<HTMLElement>("[data-source-start]") ?? []) {
      const start = Number(element.dataset.sourceStart);
      const end = Number(element.dataset.sourceEnd ?? start);
      if (start <= line && line <= end && element.getClientRects().length > 0) best = element;
      else if (start > line) break;
    }
    return best;
  }

  function flashLine(line: number): void {
    const element = elementForLine(Math.floor(line));
    if (!element) return;
    element.classList.remove("sync-flash");
    void element.offsetWidth;
    element.classList.add("sync-flash");
    window.setTimeout(() => element.classList.remove("sync-flash"), 700);
  }

  const INTERACTIVE = "a[href], button, input, select, textarea, label, summary, details, [contenteditable='true']";

  /** Preview → editor: plain clicks when enabled, Strg/Cmd+click always. */
  function navigateFromClick(event: MouseEvent, target: Element): boolean {
    if (!sync) return false;
    const forced = event.ctrlKey || event.metaKey;
    if (!forced && (!sync.clickNavigationEnabled || target.closest(INTERACTIVE))) return false;
    // Selecting text to copy it must not move the editor.
    if (!forced && window.getSelection()?.isCollapsed === false) return false;
    const source = target.closest<HTMLElement>("[data-source-start]");
    if (!source) return false;
    const line = Number(source.dataset.sourceStart);
    if (!Number.isFinite(line) || !sync.navigateToSource(line)) return false;
    event.preventDefault();
    return true;
  }
  let article = $state.raw<HTMLElement | null>(null);

  $effect(() => {
    const source = content;
    const timer = window.setTimeout(() => {
      try {
        const result = renderMarkdownDocument(source);
        rendered = result.html;
        headings = result.headings;
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
    for (const heading of article.querySelectorAll<HTMLHeadingElement>(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6")) {
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
    if (!article) return;
    // A <picture> source wins over its <img>, but a relative one cannot load
    // from the app origin; dropping it lets the resolved <img> show instead.
    for (const source of article.querySelectorAll<HTMLSourceElement>("picture > source[srcset]")) {
      const candidate = source.getAttribute("srcset")?.trim().split(/\s+/)[0] ?? "";
      if (isRelativeImageSource(candidate)) source.remove();
    }
    if (!path) return;
    const currentArticle = article;
    const currentPath = path;
    const images = Array.from(currentArticle.querySelectorAll<HTMLImageElement>("img"));
    const pending = images
      .map((image) => ({ image, source: image.dataset.localSource ?? image.getAttribute("src") ?? "" }))
      .filter(({ image, source }) => isRelativeImageSource(source) && (image.dataset.localSource !== source || image.dataset.localPath !== currentPath));
    if (pending.length === 0) return;

    for (const { image, source } of pending) {
      image.dataset.localSource = source;
      image.dataset.localPath = currentPath;
      image.removeAttribute("src");
      image.classList.add("local-image-loading");
    }

    try {
      const payloads = await readLocalImages(currentPath, pending.map(({ source }) => source));
      const bySource = new Map(payloads.map((payload) => [payload.source, payload]));
      for (const { image, source } of pending) {
        if (!image.isConnected || path !== currentPath || image.dataset.localPath !== currentPath || image.dataset.localSource !== source) continue;
        const payload = bySource.get(source);
        image.classList.remove("local-image-loading");
        if (payload?.dataUrl) {
          image.src = payload.dataUrl;
          image.title = payload.path ?? source;
          image.classList.remove("local-image-error");
        } else {
          image.removeAttribute("src");
          image.classList.add("local-image-error");
          image.title = payload?.error ?? "Lokales Bild konnte nicht geladen werden.";
        }
      }
    } catch (error) {
      for (const { image, source } of pending) {
        if (!image.isConnected || path !== currentPath || image.dataset.localPath !== currentPath || image.dataset.localSource !== source) continue;
        image.removeAttribute("src");
        image.classList.remove("local-image-loading");
        image.classList.add("local-image-error");
        image.title = error instanceof Error ? error.message : String(error);
      }
    }
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
    invalidateAnchors();
  }

  function setAllCollapsed(collapsed: boolean): void {
    if (!article) return;
    for (const heading of article.querySelectorAll<HTMLElement>(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6")) {
      if (collapsed) heading.dataset.collapsed = "true";
      else delete heading.dataset.collapsed;
    }
    updateFoldVisibility();
  }

  /** Heading ids first, then ids and anchor names from raw HTML, which carry GitHub's `user-content-` prefix. */
  function fragmentTarget(id: string): HTMLElement | undefined {
    const elements = Array.from(article?.querySelectorAll<HTMLElement>("[id], a[name]") ?? []);
    for (const candidate of [id, `user-content-${id}`]) {
      const match = elements.find((element) => element.id === candidate || element.getAttribute("name") === candidate);
      if (match) return match;
    }
    return undefined;
  }

  async function openHeading(id: string): Promise<void> {
    setAllCollapsed(false);
    await tick();
    fragmentTarget(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
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

    if ((event.ctrlKey || event.metaKey) && navigateFromClick(event, target)) return;
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor) {
      navigateFromClick(event, target);
      return;
    }
    const href = anchor.getAttribute("href") ?? "";
    if (href.startsWith("#")) {
      event.preventDefault();
      void openHeading(decodeMarkdownFragment(href.slice(1)));
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
  bind:this={previewHost}
  style={`--preview-font-size: ${fontSize}px`}
>
  <div class="preview-toolbar">
    <button class:active={showOutline} aria-pressed={showOutline} title="Gliederung ein-/ausblenden" onclick={() => (showOutline = !showOutline)}>
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

    <div class="article-scroll" bind:this={articleScroll} use:rememberScroll={scrollMemory}>
      {#if renderError}
        <div class="render-error" role="alert">
          <strong>Markdown konnte nicht gerendert werden.</strong>
          <span>{renderError}</span>
        </div>
      {:else if content.trim()}
        <!-- The unified pipeline parses raw HTML and sanitizes the HAST (rehype-sanitize) before this point. -->
        <article class:light={theme === "light"} class="markdown-body" bind:this={article}>{@html rendered}</article>
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
    container-type: inline-size;
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

  .markdown-body :global(.sync-flash) {
    animation: sync-flash 650ms ease-out;
  }

  @keyframes sync-flash {
    from {
      background-color: rgb(113 131 231 / 28%);
      box-shadow: 0 0 0 4px rgb(113 131 231 / 28%);
    }
  }

  .markdown-body {
    width: min(860px, calc(100% - 48px));
    min-height: 100%;
    margin: 0 auto;
    padding: 38px 0 110px;
    font-size: var(--preview-font-size);
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

  .light .separator {
    background: #d8dbe2;
  }

  @container (max-width: 600px) {
    .preview-grid {
      grid-template-columns: 165px minmax(0, 1fr);
    }

    .markdown-body {
      width: calc(100% - 38px);
    }
  }
</style>
