<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import type { Window as TauriWindow } from "@tauri-apps/api/window";
  import {
    CircleArrowUp,
    Columns2,
    Eye,
    FileOutput,
    FilePlus2,
    FileText,
    FolderOpen,
    Pencil,
    Save,
    Settings2,
  } from "@lucide/svelte";
  import EditorPane from "$lib/editor/EditorPane.svelte";
  import PreviewPane from "$lib/preview/PreviewPane.svelte";
  import {
    chooseAndOpenDocument,
    confirmDiscardChanges,
    createUntitledDocument,
    openDocumentPath,
    saveDocument,
  } from "$lib/files/documents";
  import { countLines, countWords } from "$lib/files/fileTypes";
  import type { OpenDocument, ViewMode } from "$lib/files/types";
  import { APP_VERSION } from "$lib/version";
  import SettingsPanel from "$lib/settings/SettingsPanel.svelte";
  import UpdatePanel from "$lib/update/UpdatePanel.svelte";
  import {
    DEFAULT_SETTINGS,
    loadSettings,
    resetSettings,
    saveSettings,
    type AppSettings,
  } from "$lib/settings/settings";

  let document = $state<OpenDocument>(createUntitledDocument());
  let mode = $state<ViewMode>("edit");
  let busy = $state(false);
  let errorMessage = $state("");
  let dragActive = $state(false);
  let documentRevision = $state(0);
  let cursorLine = $state(1);
  let cursorColumn = $state(1);
  let selectedCharacters = $state(0);
  let settings = $state<AppSettings>({ ...DEFAULT_SETTINGS });
  let settingsOpen = $state(false);
  let updateOpen = $state(false);
  let settingsReady = $state(false);
  let systemDark = $state(true);
  let appWindow = $state.raw<TauriWindow | null>(null);

  const dirty = $derived(document.content !== document.savedContent);
  const lineCount = $derived(countLines(document.content));
  const wordCount = $derived(countWords(document.content));
  const activeTheme = $derived(
    settings.theme === "system" ? (systemDark ? "dark" : "light") : settings.theme,
  );
  const desktop =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  $effect(() => {
    if (!appWindow) return;
    const title = `${dirty ? "● " : ""}${document.name} — PandaViewer`;
    void appWindow.setTitle(title).catch((error) => {
      console.warn("Fenstertitel konnte nicht aktualisiert werden.", error);
    });
  });

  $effect(() => {
    if (typeof window === "undefined") return;
    window.document.documentElement.dataset.theme = activeTheme;
    window.document.documentElement.style.colorScheme = activeTheme;
    void appWindow?.setTheme(activeTheme).catch((error) => {
      console.warn("Native Fensterdarstellung konnte nicht aktualisiert werden.", error);
    });
  });

  $effect(() => {
    const snapshot = { ...settings };
    if (!settingsReady) return;
    const timer = window.setTimeout(() => {
      void saveSettings(snapshot).catch((error) => {
        errorMessage = `Einstellungen konnten nicht gespeichert werden: ${messageFrom(error)}`;
      });
    }, 180);
    return () => window.clearTimeout(timer);
  });

  onMount(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => (systemDark = media.matches);
    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);

    void loadSettings()
      .then((loaded) => {
        settings = loaded;
      })
      .catch((error) => {
        errorMessage = `Einstellungen konnten nicht geladen werden: ${messageFrom(error)}`;
      })
      .finally(() => {
        settingsReady = true;
      });

    return () => media.removeEventListener("change", updateSystemTheme);
  });

  onMount(() => {
    if (!desktop) return;

    let disposed = false;
    const cleanups: Array<() => void> = [];

    void (async () => {
      const [{ getCurrentWindow }, { getCurrentWebview }] = await Promise.all([
        import("@tauri-apps/api/window"),
        import("@tauri-apps/api/webview"),
      ]);
      if (disposed) return;

      appWindow = getCurrentWindow();
      cleanups.push(
        await appWindow.onCloseRequested(async (event) => {
          if (!dirty) return;
          event.preventDefault();
          if (await confirmDiscardChanges(document.name)) {
            await appWindow?.destroy();
          }
        }),
      );
      cleanups.push(
        await getCurrentWebview().onDragDropEvent((event) => {
          const payload = event.payload;
          dragActive = payload.type === "enter" || payload.type === "over";
          if (payload.type === "drop" && payload.paths[0]) {
            dragActive = false;
            void openDroppedDocument(payload.paths[0]);
          }
        }),
      );

      const initialPath = await invoke<string | null>("initial_document_path");
      if (initialPath && document.untitled && !dirty) {
        await openDroppedDocument(initialPath);
      }
    })().catch((error) => {
      errorMessage = messageFrom(error);
    });

    return () => {
      disposed = true;
      for (const cleanup of cleanups) cleanup();
    };
  });

  function messageFrom(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  async function mayReplaceDocument(): Promise<boolean> {
    return !dirty || (await confirmDiscardChanges(document.name));
  }

  async function newDocument(): Promise<void> {
    if (!(await mayReplaceDocument())) return;
    document = createUntitledDocument();
    documentRevision += 1;
    mode = "edit";
    errorMessage = "";
  }

  async function openDocument(): Promise<void> {
    if (busy || !(await mayReplaceDocument())) return;
    busy = true;
    errorMessage = "";
    try {
      const opened = await chooseAndOpenDocument();
      if (opened) {
        document = opened;
        documentRevision += 1;
      }
    } catch (error) {
      errorMessage = messageFrom(error);
    } finally {
      busy = false;
    }
  }

  async function openDroppedDocument(path: string): Promise<void> {
    if (busy || !(await mayReplaceDocument())) return;
    busy = true;
    errorMessage = "";
    try {
      document = await openDocumentPath(path);
      documentRevision += 1;
    } catch (error) {
      errorMessage = messageFrom(error);
    } finally {
      busy = false;
    }
  }

  async function saveCurrent(forceDialog = false): Promise<boolean> {
    if (busy) return false;
    busy = true;
    errorMessage = "";
    try {
      const saved = await saveDocument(document, forceDialog);
      if (saved) {
        document = saved;
        return true;
      }
    } catch (error) {
      errorMessage = messageFrom(error);
    } finally {
      busy = false;
    }
    return false;
  }

  function updateContent(content: string): void {
    document.content = content;
  }

  function updateCursor(position: { line: number; column: number; selected: number }): void {
    cursorLine = position.line;
    cursorColumn = position.column;
    selectedCharacters = position.selected;
  }

  function updateSettings(next: AppSettings): void {
    settings = next;
  }

  function restoreSettings(): void {
    settings = resetSettings();
  }

  function handleShortcut(event: KeyboardEvent): void {
    const primary = event.ctrlKey || event.metaKey;
    if (!primary) return;

    const key = event.key.toLowerCase();
    if (key === "n") {
      event.preventDefault();
      void newDocument();
    } else if (key === "o") {
      event.preventDefault();
      void openDocument();
    } else if (key === "s") {
      event.preventDefault();
      void saveCurrent(event.shiftKey);
    } else if (key === "e" && event.shiftKey) {
      event.preventDefault();
      mode = "edit";
    } else if (key === "v" && event.shiftKey) {
      event.preventDefault();
      mode = "view";
    } else if (key === "p" && event.shiftKey) {
      event.preventDefault();
      mode = "split";
    } else if (key === ",") {
      event.preventDefault();
      updateOpen = false;
      settingsOpen = true;
    } else if (key === "u" && event.shiftKey) {
      event.preventDefault();
      settingsOpen = false;
      updateOpen = true;
    }
  }

  function handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (!dirty) return;
    event.preventDefault();
  }

  function lineEndingLabel(value: string): string {
    if (value === "crlf") return "CRLF";
    if (value === "cr") return "CR";
    return "LF";
  }
</script>

<svelte:head>
  <title>{document.name} — PandaViewer</title>
</svelte:head>

<svelte:window onkeydown={handleShortcut} onbeforeunload={handleBeforeUnload} />

<main
  class="app-shell"
  class:has-error={Boolean(errorMessage)}
  class:light={activeTheme === "light"}
  style={`--icon-scale: ${settings.iconSize / DEFAULT_SETTINGS.iconSize}`}
  aria-busy={busy}
>
  <header class="titlebar">
    <div class="brand-mark" aria-hidden="true">P</div>
    <strong>PandaViewer</strong>
    <div class="document-title" title={document.path || document.name}>
      <FileText size={15} aria-hidden="true" />
      <span>{document.name}</span>
      {#if dirty}<span class="dirty-dot" title="Ungespeicherte Änderungen">●</span>{/if}
    </div>
    <span class="version">v{APP_VERSION}</span>
  </header>

  <nav class="toolbar" aria-label="Dokumentaktionen">
    <div class="tool-group">
      <button class="icon-button" title="Neu (Strg/Cmd+N)" onclick={() => void newDocument()}>
        <FilePlus2 size={17} aria-hidden="true" />
        <span class="sr-only">Neues Dokument</span>
      </button>
      <button class="icon-button" title="Öffnen (Strg/Cmd+O)" onclick={() => void openDocument()} disabled={busy}>
        <FolderOpen size={17} aria-hidden="true" />
        <span class="sr-only">Dokument öffnen</span>
      </button>
      <button class="icon-button" title="Speichern (Strg/Cmd+S)" onclick={() => void saveCurrent()} disabled={busy || (!dirty && !document.untitled)}>
        <Save size={17} aria-hidden="true" />
        <span class="sr-only">Dokument speichern</span>
      </button>
      <button class="icon-button" title="Speichern unter (Strg/Cmd+Umschalt+S)" onclick={() => void saveCurrent(true)} disabled={busy}>
        <FileOutput size={17} aria-hidden="true" />
        <span class="sr-only">Dokument speichern unter</span>
      </button>
    </div>

    <div class="mode-switch" aria-label="Ansichtsmodus">
      <button class:active={mode === "edit"} aria-pressed={mode === "edit"} onclick={() => (mode = "edit")} title="Bearbeiten (Strg/Cmd+Umschalt+E)">
        <Pencil size={15} aria-hidden="true" />
        <span>Edit</span>
      </button>
      <button class:active={mode === "view"} aria-pressed={mode === "view"} onclick={() => (mode = "view")} title="Ansehen (Strg/Cmd+Umschalt+V)">
        <Eye size={15} aria-hidden="true" />
        <span>View</span>
      </button>
      <button class:active={mode === "split"} aria-pressed={mode === "split"} onclick={() => (mode = "split")} title="Geteilt (Strg/Cmd+Umschalt+P)">
        <Columns2 size={15} aria-hidden="true" />
        <span>Split</span>
      </button>
    </div>

    <div class="format-pill">{document.fileType.label}</div>
    <button
      class="icon-button settings-button"
      class:active={updateOpen}
      title="Auf Updates prüfen (Strg/Cmd+Umschalt+U)"
      onclick={() => {
        settingsOpen = false;
        updateOpen = true;
      }}
    >
      <CircleArrowUp size={17} aria-hidden="true" />
      <span class="sr-only">Auf Updates prüfen</span>
    </button>
    <button class="icon-button settings-button" class:active={settingsOpen} title="Einstellungen (Strg/Cmd+,)" onclick={() => {
      updateOpen = false;
      settingsOpen = true;
    }}>
      <Settings2 size={17} aria-hidden="true" />
      <span class="sr-only">Einstellungen öffnen</span>
    </button>
  </nav>

  {#if errorMessage}
    <div class="error-banner" role="alert">
      <span>{errorMessage}</span>
      <button aria-label="Fehlermeldung schließen" onclick={() => (errorMessage = "")}>×</button>
    </div>
  {/if}

  <section class:split={mode === "split"} class="workspace">
    <div class:hidden={mode === "view"} class="pane editor-pane" aria-label="Editor">
      {#key documentRevision}
        <EditorPane
          value={document.content}
          fileName={document.name}
          readOnly={false}
          theme={activeTheme}
          fontSize={settings.editorFontSize}
          wordWrap={settings.wordWrap && (document.fileType.kind === "text" || document.fileType.kind === "markdown")}
          spellcheck={settings.spellcheck && (document.fileType.kind === "text" || document.fileType.kind === "markdown")}
          markdownTools={document.fileType.kind === "markdown"}
          onChange={updateContent}
          onCursorChange={updateCursor}
        />
      {/key}
    </div>

    {#if mode === "view" || mode === "split"}
      <div class="pane viewer-pane" aria-label="Leseansicht">
        <PreviewPane
          content={document.content}
          fileName={document.name}
          path={document.path}
          fileType={document.fileType}
          theme={activeTheme}
          editorFontSize={settings.editorFontSize}
          previewFontSize={settings.previewFontSize}
          wordWrap={settings.wordWrap}
          onOpenPath={openDroppedDocument}
        />
      </div>
    {/if}
  </section>

  {#if dragActive}
    <div class="drop-overlay" aria-hidden="true">
      <FolderOpen size={34} strokeWidth={1.5} />
      <strong>Datei hier öffnen</strong>
    </div>
  {/if}

  <footer class="statusbar">
    <span>{lineCount.toLocaleString("de-DE")} Zeilen</span>
    <span>{wordCount.toLocaleString("de-DE")} Wörter</span>
    <span>Ln {cursorLine}, Sp {cursorColumn}</span>
    {#if selectedCharacters > 0}<span>{selectedCharacters} ausgewählt</span>{/if}
    <span>{document.encoding}{document.hasBom ? " BOM" : ""}</span>
    <span>{lineEndingLabel(document.lineEnding)}</span>
    {#if document.lossy}<span class="warning">Kodierung mit Ersatzzeichen</span>{/if}
    <span class="path" title={document.path}>{document.path || "Noch nicht gespeichert"}</span>
  </footer>

  {#if settingsOpen}
    <SettingsPanel
      {settings}
      {activeTheme}
      onChange={updateSettings}
      onClose={() => (settingsOpen = false)}
      onReset={restoreSettings}
    />
  {/if}

  {#if updateOpen}
    <UpdatePanel
      {activeTheme}
      hasUnsavedChanges={dirty}
      onSave={() => saveCurrent()}
      onClose={() => (updateOpen = false)}
    />
  {/if}
</main>

<style>
  :global(:root) {
    --bg: #111318;
    --surface: #171a20;
    --surface-raised: #1d2028;
    --surface-hover: #242833;
    --chrome: #13161b;
    --inset: #12151a;
    --border: #2a2e38;
    --border-strong: #373c49;
    --text: #e7e9ef;
    --text-muted: #9ba2b1;
    --text-faint: #737b8d;
    --status-text: #8991a1;
    --accent: #7183e7;
    --accent-strong: #8796ed;
    --danger: #ef8b91;
    --mono: "Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  }

  .app-shell {
    display: grid;
    grid-template-rows: 48px 46px minmax(0, 1fr) 28px;
    width: 100vw;
    height: 100vh;
    color: var(--text);
    background: var(--bg);
  }

  .app-shell.light {
    --bg: #fbfbfc;
    --surface: #f2f3f6;
    --surface-raised: #ffffff;
    --surface-hover: #e5e7ec;
    --chrome: #f7f8fa;
    --inset: #e9ebf0;
    --border: #d9dce3;
    --border-strong: #c8ccd5;
    --text: #242933;
    --text-muted: #646c7a;
    --text-faint: #8c93a0;
    --status-text: #707887;
    --accent: #5369d8;
    --accent-strong: #435bce;
  }

  .app-shell :global(svg) {
    scale: var(--icon-scale);
    transition: scale 120ms ease;
  }

  .app-shell.has-error {
    grid-template-rows: 48px 46px auto minmax(0, 1fr) 28px;
  }

  .titlebar,
  .toolbar,
  .statusbar {
    display: flex;
    align-items: center;
  }

  .titlebar {
    gap: 9px;
    min-width: 0;
    padding: 0 14px;
    border-bottom: 1px solid var(--border);
    background: var(--chrome);
  }

  .brand-mark {
    display: grid;
    flex: 0 0 26px;
    width: 26px;
    height: 26px;
    place-items: center;
    border-radius: 7px;
    color: #fff;
    background: #5e70d7;
    font-size: 13px;
    font-weight: 800;
  }

  .titlebar strong {
    font-size: 13px;
    letter-spacing: -0.01em;
  }

  .document-title {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 6px;
    margin-left: 18px;
    color: var(--text-muted);
    font-size: 12px;
  }

  .document-title span:not(.dirty-dot) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dirty-dot {
    color: var(--accent-strong);
    font-size: 9px;
  }

  .version {
    margin-left: auto;
    color: var(--text-faint);
    font-size: 11px;
  }

  .toolbar {
    gap: 12px;
    padding: 0 10px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .tool-group,
  .mode-switch {
    display: flex;
    align-items: center;
  }

  .tool-group {
    gap: 2px;
    padding-right: 12px;
    border-right: 1px solid var(--border);
  }

  button {
    border: 0;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  button:disabled {
    cursor: default;
    opacity: 0.38;
  }

  .icon-button {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border-radius: 6px;
    color: var(--text-muted);
    background: transparent;
  }

  .icon-button:hover:not(:disabled),
  .icon-button.active {
    color: var(--text);
    background: var(--surface-hover);
  }

  .settings-button {
    margin-left: -6px;
  }

  .mode-switch {
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--inset);
  }

  .mode-switch button {
    display: flex;
    height: 28px;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border-radius: 5px;
    color: var(--text-muted);
    background: transparent;
    font-size: 11px;
  }

  .mode-switch button:hover,
  .mode-switch button.active {
    color: var(--text);
  }

  .mode-switch button.active {
    background: var(--surface-raised);
    box-shadow: 0 1px 4px rgb(0 0 0 / 24%);
  }

  .format-pill {
    margin-left: auto;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--text-muted);
    font-family: var(--mono);
    font-size: 10px;
  }

  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 7px 12px;
    border-bottom: 1px solid #713e45;
    color: #ffd4d7;
    background: #3a252a;
    font-size: 12px;
  }

  .error-banner button {
    padding: 0 4px;
    color: inherit;
    background: transparent;
    font-size: 18px;
  }

  .workspace {
    display: grid;
    min-width: 0;
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
  }

  .workspace.split {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

  .split .pane + .pane {
    border-left: 1px solid var(--border-strong);
  }

  .drop-overlay {
    position: fixed;
    z-index: 10;
    inset: 58px 12px 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 10px;
    border: 2px dashed #7c8de8;
    border-radius: 12px;
    color: #dfe3ff;
    background: rgb(22 26 37 / 92%);
    pointer-events: none;
  }

  .drop-overlay strong {
    font-size: 13px;
  }

  .light .drop-overlay {
    color: #34427b;
    background: rgb(242 244 251 / 94%);
  }

  .statusbar {
    gap: 13px;
    min-width: 0;
    padding: 0 10px;
    border-top: 1px solid var(--border);
    color: var(--status-text);
    background: var(--chrome);
    font-size: 10px;
  }

  .path {
    overflow: hidden;
    margin-left: auto;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .warning {
    color: #e6bd72;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 720px) {
    .document-title {
      margin-left: 4px;
    }

    .mode-switch span,
    .format-pill,
    .statusbar span:nth-child(2) {
      display: none;
    }

    .mode-switch button {
      padding: 0 8px;
    }
  }
</style>
