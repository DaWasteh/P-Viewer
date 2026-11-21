<script lang="ts">
  import { Columns2, Eye, LoaderCircle, Pencil, TriangleAlert, X } from "@lucide/svelte";
  import EditorPane from "$lib/editor/EditorPane.svelte";
  import type { EditorSession } from "$lib/editor/session";
  import PreviewPane from "$lib/preview/PreviewPane.svelte";
  import { PreviewSyncController, type SyncMode } from "$lib/preview/sync";
  import type { AppSettings } from "$lib/settings/settings";
  import { fileIconUrl } from "./FileIconRegistry";
  import { clampSplitRatio, tabIsDirty, type DocumentTab } from "./tabs";
  import type { ViewMode } from "./types";

  interface Props {
    tab: DocumentTab;
    focused: boolean;
    multiPane: boolean;
    settings: AppSettings;
    activeTheme: "dark" | "light";
    busy: boolean;
    installingUpdate: boolean;
    desktop: boolean;
    session: EditorSession;
    previewScrollMemory: { top: number };
    onFocus: () => void;
    onClosePane: () => void;
    onModeChange: (mode: ViewMode) => void;
    onSplitRatioChange: (ratio: number) => void;
    onContentChange: (content: string) => void;
    onCursorChange: (position: { line: number; column: number; selected: number }) => void;
    onOpenPath: (path: string) => void;
    onRetryRestore: () => void;
    onLocateRestore: () => void;
    onCloseTab: () => void;
    onKeepRecovered: () => void;
    onUseDiskVersion: () => void;
    onDismissNotice: () => void;
  }

  let {
    tab,
    focused,
    multiPane,
    settings,
    activeTheme,
    busy,
    installingUpdate,
    desktop,
    session,
    previewScrollMemory,
    onFocus,
    onClosePane,
    onModeChange,
    onSplitRatioChange,
    onContentChange,
    onCursorChange,
    onOpenPath,
    onRetryRestore,
    onLocateRestore,
    onCloseTab,
    onKeepRecovered,
    onUseDiskVersion,
    onDismissNotice,
  }: Props = $props();

  const document = $derived(tab.document);
  const mode = $derived<ViewMode>(tab.mode ?? "edit");
  const dirty = $derived(tabIsDirty(tab));
  const binaryDocument = $derived(Boolean(document.binary));
  const restoring = $derived(Boolean(tab.restore));
  const splitRatio = $derived(clampSplitRatio(tab.splitRatio ?? 0.5));
  const instanceKey = $derived(`${tab.id}:${tab.revision}`);

  // Each mounted pane owns its own editor ↔ preview sync controller so two
  // side-by-side Markdown documents never interfere with each other.
  const previewSync = new PreviewSyncController();
  const syncAvailable = $derived(
    mode === "split" && document.fileType.kind === "markdown" && !binaryDocument && !restoring,
  );
  const effectiveSyncMode = $derived.by((): SyncMode => {
    const configured = settings.previewSyncMode;
    const toggle = tab.previewSync;
    if (toggle === false) return "off";
    if (toggle === true) return configured === "off" ? "bidirectional" : configured;
    return configured;
  });
  $effect(() => {
    previewSync.configure({
      active: syncAvailable,
      mode: effectiveSyncMode,
      clickNavigation: settings.previewClickNavigation,
    });
  });

  const formattingDialect = $derived.by((): "markdown" | "html" | null => {
    const kind = document.fileType.kind;
    if (settings.formattingToolbar === "never") return null;
    if (kind === "html") return "html";
    if (kind === "markdown") return "markdown";
    return settings.formattingToolbar === "always" ? "markdown" : null;
  });

  let workspace = $state<HTMLDivElement | null>(null);
  let resizingSplit = $state(false);

  function startSplitResize(event: PointerEvent): void {
    if (event.button !== 0 || !workspace) return;
    event.preventDefault();
    const divider = event.currentTarget as HTMLElement;
    divider.setPointerCapture(event.pointerId);
    resizingSplit = true;
    const bounds = workspace.getBoundingClientRect();
    const move = (moveEvent: PointerEvent) => {
      onSplitRatioChange(clampSplitRatio((moveEvent.clientX - bounds.left) / bounds.width));
    };
    const end = () => {
      resizingSplit = false;
      divider.removeEventListener("pointermove", move);
      divider.removeEventListener("pointerup", end);
      divider.removeEventListener("pointercancel", end);
    };
    divider.addEventListener("pointermove", move);
    divider.addEventListener("pointerup", end);
    divider.addEventListener("pointercancel", end);
  }

  function handleSplitKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? 0.1 : 0.02;
    if (event.key === "ArrowLeft") onSplitRatioChange(clampSplitRatio(splitRatio - step));
    else if (event.key === "ArrowRight") onSplitRatioChange(clampSplitRatio(splitRatio + step));
    else if (event.key === "Home") onSplitRatioChange(0.2);
    else if (event.key === "End") onSplitRatioChange(0.8);
    else if (event.key === "Enter") onSplitRatioChange(0.5);
    else return;
    event.preventDefault();
  }
</script>

<section
  class="document-pane"
  class:multi-pane={multiPane}
  class:focused={focused}
  data-pane-tab-id={tab.id}
  aria-label={document.name}
  onpointerdown={onFocus}
  onfocusin={onFocus}
>
  {#if multiPane}
    <header class="pane-header">
      <div class="pane-title" title={document.path || document.name}>
        <img class="pane-file-icon" src={fileIconUrl(document.name)} alt="" width="14" height="14" draggable="false" />
        <span class="pane-name">{document.name}</span>
        {#if dirty}<span class="pane-dirty" title="Ungespeicherte Änderungen" aria-label="Ungespeichert">●</span>{/if}
      </div>

      <div class="pane-controls">
        <div class="pane-mode-switch" role="group" aria-label={`Ansichtsmodus für ${document.name}`}>
          <button
            class:active={mode === "edit" && !binaryDocument}
            aria-pressed={mode === "edit" && !binaryDocument}
            aria-label={`Edit (${document.name})`}
            title="Edit"
            disabled={binaryDocument}
            onclick={() => onModeChange("edit")}
          >
            <Pencil size={12} aria-hidden="true" />
            <span>Edit</span>
          </button>
          <button
            class:active={mode === "view" || binaryDocument}
            aria-pressed={mode === "view" || binaryDocument}
            aria-label={`View (${document.name})`}
            title="View"
            disabled={binaryDocument}
            onclick={() => onModeChange("view")}
          >
            <Eye size={12} aria-hidden="true" />
            <span>View</span>
          </button>
          <button
            class:active={mode === "split" && !binaryDocument}
            aria-pressed={mode === "split" && !binaryDocument}
            aria-label={`Split (${document.name})`}
            title="Split"
            disabled={binaryDocument}
            onclick={() => onModeChange("split")}
          >
            <Columns2 size={12} aria-hidden="true" />
            <span>Split</span>
          </button>
        </div>

        <button
          class="pane-close"
          aria-label={`„${document.name}“ aus Splitscreen entfernen`}
          title="Aus Splitscreen entfernen (Tab bleibt offen)"
          onpointerdown={(event) => event.stopPropagation()}
          onclick={(event) => {
            event.stopPropagation();
            onClosePane();
          }}
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>
    </header>
  {/if}

  {#if tab.notice}
    <div class="notice-banner" role="status">
      <TriangleAlert size={14} aria-hidden="true" />
      {#if tab.notice.kind === "external-change"}
        <span>„{document.name}“ wurde seit der letzten Sitzung außerhalb von P-Viewer geändert. Angezeigt werden deine wiederhergestellten, ungespeicherten Änderungen.</span>
        <button onclick={onKeepRecovered}>Wiederhergestellte Version behalten</button>
        <button onclick={onUseDiskVersion}>Datenträgerversion verwenden</button>
      {:else}
        <span>Die Datei „{document.name}“ wurde nicht gefunden. Deine ungespeicherten Änderungen wurden wiederhergestellt – mit „Speichern unter“ sichern.</span>
        <button onclick={onDismissNotice}>Ausblenden</button>
      {/if}
    </div>
  {/if}

  <div
    id={!multiPane || focused ? "document-workspace" : undefined}
    bind:this={workspace}
    class:split={mode === "split" && !binaryDocument && !restoring}
    class:resizing={resizingSplit}
    class="workspace"
    style={mode === "split" && !binaryDocument && !restoring ? `grid-template-columns: minmax(0, ${splitRatio}fr) 1px minmax(0, ${1 - splitRatio}fr)` : undefined}
    role="tabpanel"
    aria-label={document.name}
  >
    {#if tab.restore}
      {@const restore = tab.restore}
      <div class="restore-panel" class:light={activeTheme === "light"}>
        {#if restore.state === "error"}
          <TriangleAlert size={22} aria-hidden="true" />
          <strong>{restore.unavailable ? "Netzwerkdatei nicht erreichbar" : "Datei konnte nicht geöffnet werden"}</strong>
          <span class="restore-path">{document.path}</span>
          <small>{restore.error}</small>
          <div class="restore-actions">
            <button onclick={onRetryRestore}>Erneut versuchen</button>
            <button onclick={onLocateRestore} disabled={!desktop || busy}>Datei suchen …</button>
            <button onclick={onCloseTab}>Tab schließen</button>
          </div>
        {:else}
          <LoaderCircle class="spinning" size={20} aria-hidden="true" />
          <span>„{document.name}“ wird geladen …</span>
        {/if}
      </div>
    {:else if binaryDocument}
      <div class="pane viewer-pane" aria-label="Betrachter">
        {#key instanceKey}
          <PreviewPane
            content=""
            fileName={document.name}
            path={document.path}
            fileType={document.fileType}
            binary={document.binary}
            theme={activeTheme}
            editorFontSize={settings.editorFontSize}
            previewFontSize={settings.previewFontSize}
            wordWrap={settings.wordWrap}
            scrollMemory={previewScrollMemory}
            {onOpenPath}
          />
        {/key}
      </div>
    {:else}
      <div class:hidden={mode === "view"} class="pane editor-pane" aria-label="Editor">
        {#key instanceKey}
          <EditorPane
            value={document.content}
            {session}
            fileName={document.name}
            readOnly={busy || installingUpdate}
            theme={activeTheme}
            fontSize={settings.editorFontSize}
            wordWrap={settings.wordWrap && (document.fileType.kind === "text" || document.fileType.kind === "markdown")}
            spellcheck={settings.spellcheck && (document.fileType.kind === "text" || document.fileType.kind === "markdown")}
            formatting={formattingDialect}
            documentPath={document.path}
            sync={previewSync}
            onChange={onContentChange}
            {onCursorChange}
          />
        {/key}
      </div>

      {#if mode === "split"}
        <div
          class="split-divider"
          role="slider"
          tabindex="0"
          aria-orientation="horizontal"
          aria-label="Breite von Editor und Vorschau"
          aria-valuetext={`Editor ${Math.round(splitRatio * 100)} %, Vorschau ${100 - Math.round(splitRatio * 100)} %`}
          aria-valuemin={20}
          aria-valuemax={80}
          aria-valuenow={Math.round(splitRatio * 100)}
          title="Ziehen, um die Aufteilung zu ändern (Doppelklick: 50 / 50)"
          onpointerdown={startSplitResize}
          ondblclick={() => onSplitRatioChange(0.5)}
          onkeydown={handleSplitKey}
        ></div>
      {/if}

      {#if mode === "view" || mode === "split"}
        <div class="pane viewer-pane" aria-label="Leseansicht">
          {#key instanceKey}
            <PreviewPane
              content={document.content}
              fileName={document.name}
              path={document.path}
              fileType={document.fileType}
              theme={activeTheme}
              editorFontSize={settings.editorFontSize}
              previewFontSize={settings.previewFontSize}
              wordWrap={settings.wordWrap}
              scrollMemory={previewScrollMemory}
              sync={previewSync}
              {onOpenPath}
            />
          {/key}
        </div>
      {/if}
    {/if}
  </div>
</section>

<style>
  .document-pane {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--bg);
  }

  .pane-header {
    position: relative;
    container-type: inline-size;
    display: flex;
    flex: 0 0 31px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    padding: 0 6px 0 10px;
    border-bottom: 1px solid var(--border);
    color: var(--text-muted);
    background: var(--chrome);
    font-size: 11px;
  }

  .pane-header::before {
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    height: 2px;
    background: transparent;
    content: "";
  }

  .document-pane.multi-pane.focused .pane-header {
    color: var(--text);
    background: var(--surface);
  }

  .document-pane.multi-pane.focused .pane-header::before {
    background: var(--accent);
  }

  .pane-title {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }

  .pane-file-icon {
    flex: 0 0 14px;
    width: 14px;
    height: 14px;
    -webkit-user-drag: none;
  }

  .pane-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .pane-dirty {
    flex: 0 0 auto;
    color: var(--accent-strong);
    font-size: 8px;
  }

  .pane-controls {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;
  }

  .pane-mode-switch {
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--inset);
  }

  .pane-mode-switch button {
    display: flex;
    height: 20px;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
    border: 0;
    border-radius: 4px;
    color: var(--text-muted);
    background: transparent;
    cursor: pointer;
    font-size: 10px;
  }

  .pane-mode-switch button:hover:not(:disabled),
  .pane-mode-switch button.active {
    color: var(--text);
  }

  .pane-mode-switch button.active {
    background: var(--surface-raised);
    box-shadow: 0 1px 3px rgb(0 0 0 / 22%);
  }

  .pane-mode-switch button:disabled {
    cursor: default;
    opacity: 0.4;
  }

  .pane-close {
    display: grid;
    width: 22px;
    height: 22px;
    place-items: center;
    border: 0;
    border-radius: 4px;
    color: var(--text-muted);
    background: transparent;
    cursor: pointer;
  }

  .pane-close:hover {
    color: var(--text);
    background: var(--surface-hover);
  }

  .pane-mode-switch button:focus-visible,
  .pane-close:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .workspace {
    display: grid;
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
  }

  .workspace.split {
    position: relative;
    grid-template-columns: minmax(0, 1fr) 1px minmax(0, 1fr);
  }

  .workspace.resizing {
    cursor: col-resize;
    user-select: none;
  }

  .workspace.resizing :global(iframe) {
    pointer-events: none;
  }

  .split-divider {
    position: relative;
    z-index: 3;
    background: var(--border-strong);
    cursor: col-resize;
  }

  .split-divider::before {
    position: absolute;
    inset: 0 -4px;
    content: "";
  }

  .split-divider:hover,
  .split-divider:focus-visible,
  .resizing .split-divider {
    outline: none;
    background: var(--accent);
  }

  .pane {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--bg);
  }

  .pane.hidden {
    display: none;
  }

  .restore-panel {
    display: flex;
    grid-column: 1 / -1;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 9px;
    padding: 24px;
    color: var(--text-muted);
    background: var(--bg);
    font-size: 12px;
    text-align: center;
  }

  .restore-panel strong {
    color: var(--text);
    font-size: 13px;
  }

  .restore-path {
    max-width: 90%;
    overflow-wrap: anywhere;
    font-family: var(--mono);
    font-size: 11px;
  }

  .restore-panel small {
    max-width: 620px;
    color: var(--text-faint);
    font-size: 11px;
  }

  .restore-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 7px;
    margin-top: 6px;
  }

  .restore-actions button,
  .notice-banner button {
    height: 27px;
    padding: 0 10px;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    color: var(--text);
    background: var(--surface-raised);
    cursor: pointer;
    font-size: 11px;
  }

  .restore-actions button:hover:not(:disabled),
  .notice-banner button:hover {
    background: var(--surface-hover);
  }

  .restore-actions button:disabled {
    cursor: default;
    opacity: 0.45;
  }

  .restore-panel :global(.spinning) {
    animation: spin 700ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .notice-banner {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 10px;
    padding: 7px 12px;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    background: color-mix(in srgb, #e6bd72 14%, var(--surface));
    font-size: 11px;
  }

  .notice-banner > :global(svg) {
    color: #e6bd72;
  }

  .notice-banner span {
    flex: 1 1 240px;
  }

  @container (max-width: 340px) {
    .pane-mode-switch span {
      display: none;
    }
  }
</style>
