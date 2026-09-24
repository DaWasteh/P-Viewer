<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { captureEditorView, type EditorSession } from "$lib/editor/session";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import type { Window as TauriWindow } from "@tauri-apps/api/window";
  import {
    AppWindow,
    CircleArrowUp,
    Columns2,
    ArrowDownUp,
    ChevronDown,
    Eye,
    FileOutput,
    FilePlus2,
    FileText,
    FolderOpen,
    LoaderCircle,
    Pencil,
    Save,
    Search,
    Settings2,
    TriangleAlert,
  } from "@lucide/svelte";
  import EditorPane from "$lib/editor/EditorPane.svelte";
  import PreviewPane from "$lib/preview/PreviewPane.svelte";
  import { PreviewSyncController, type SyncMode } from "$lib/preview/sync";
  import { openBatch, openFind, openReplacePanel } from "$lib/editor/findReplace";
  import ContextMenu, { type MenuEntry } from "$lib/ContextMenu.svelte";
  import DocumentTabs, { type TabDropPoint } from "$lib/files/DocumentTabs.svelte";
  import CloseTabsDialog, {
    type BulkChoice,
    type CloseDialogRequest,
    type ReviewChoice,
  } from "$lib/files/CloseTabsDialog.svelte";
  import FileTypeSelector from "$lib/files/FileTypeSelector.svelte";
  import {
    chooseAndOpenDocument,
    confirmDiscardChanges,
    confirmDiscardDocuments,
    confirmReload,
    createUntitledDocument,
    documentWeight,
    openDocumentPath,
    saveDocument,
  } from "$lib/files/documents";
  import { currentRuntimeInfo } from "$lib/debug/runtime";
  import { countLines, countWords, detectFileType } from "$lib/files/fileTypes";
  import {
    bulkCloseTargets,
    clampSplitRatio,
    documentIsDirty,
    extensionOfName,
    findTabByPath,
    insertionIndex,
    isPristineUntitled,
    logicalInsertionIndex,
    moveTab,
    newRecoveryId,
    nextUntitledName,
    normalizePinnedOrder,
    parseTabTransfer,
    reorderTabs,
    serializeRestoreTransfer,
    serializeTabTransfer,
    setTabPinned,
    sortTabs,
    tabIsDirty,
    type BulkClose,
    type DocumentTab,
    type TabMove,
    type TabNotice,
    type TabSort,
    type TabViewState,
  } from "$lib/files/tabs";
  import {
    clearStoredSession,
    readRecovery,
    removeRecovery,
    resumeSessionStorage,
    sessionTabFor,
    storeWindowSession,
    takeRestoredSessions,
    writeRecovery,
    type SessionTab,
    type WindowSession,
  } from "$lib/files/session";
  import type { OpenDocument, ViewMode } from "$lib/files/types";
  import { APP_VERSION } from "$lib/version";
  import SettingsPanel from "$lib/settings/SettingsPanel.svelte";
  import UpdatePanel from "$lib/update/UpdatePanel.svelte";
  import {
    DEFAULT_SETTINGS,
    loadSettings,
    nativeThemeFor,
    preferredViewMode,
    resetSettings,
    saveSettings,
    type AppSettings,
  } from "$lib/settings/settings";

  const editorSessions = new Map<string, EditorSession>();
  function editorSession(key: string): EditorSession {
    let session = editorSessions.get(key);
    if (!session) { session = {}; editorSessions.set(key, session); }
    return session;
  }
  /** Preview scroll offsets per tab; plain objects, so scrolling never re-renders the page. */
  const previewMemories = new Map<string, { top: number }>();
  function previewMemory(tabId: string): { top: number } {
    let memory = previewMemories.get(tabId);
    if (!memory) { memory = { top: 0 }; previewMemories.set(tabId, memory); }
    return memory;
  }
  const sessionKey = (tab: Pick<DocumentTab, "id" | "revision">) => `${tab.id}:${tab.revision}`;

  let tabSequence = 0;
  const MAX_TABS = 100;
  const MAX_TAB_WEIGHT = 64_000_000;
  /** Recently closed tabs kept for Strg/Cmd+Umschalt+T. */
  const CLOSED_TAB_HISTORY = 20;
  const SESSION_SAVE_DELAY = 600;
  const RECOVERY_DELAY = 1_000;
  /** A restored file that does not answer in time (offline share) is marked unavailable. */
  const RESTORE_TIMEOUT = 15_000;
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  /** A tab queued for this window by another P-Viewer window (see windows.rs). */
  interface QueuedTab {
    tab: string;
    dropX: number | null;
    dropY: number | null;
  }
  interface TabMoveResult {
    moved: boolean;
    window: string | null;
    created: boolean;
  }
  interface ClosedTab {
    state: SessionTab;
    /** Unsaved untitled text, so reopening never loses what was just closed. */
    document?: OpenDocument;
  }

  function createTab(document: OpenDocument, mode: ViewMode = "edit", extras: Partial<DocumentTab> = {}): DocumentTab {
    tabSequence += 1;
    return { id: `tab-${tabSequence}`, document, revision: 0, mode, recoveryId: newRecoveryId(), ...extras };
  }

  /** A tab that can be replaced by the next opened document without losing anything. */
  function isReplaceable(tab: DocumentTab | undefined): boolean {
    return Boolean(tab && !tab.restore && isPristineUntitled(tab.document));
  }

  const initialTab = createTab(createUntitledDocument());
  let tabs = $state<DocumentTab[]>([initialTab]);
  let activeTabId = $state(initialTab.id);
  function setMode(next: ViewMode): void {
    if (!binaryDocument) activeTab!.mode = next;
  }
  let settingsLoadPromise: Promise<void> = Promise.resolve();
  let busy = $state(false);
  let installingUpdate = $state(false);
  let pendingOpens = $state<Array<{ path: string; replacePristine: boolean }>>([]);
  $effect(() => {
    if (!settingsReady || busy || installingUpdate || settingsOpen || updateOpen || pendingOpens.length === 0) return;
    untrack(() => {
      const next = pendingOpens.shift();
      if (next) void openDroppedDocument(next.path, next.replacePristine);
    });
  });
  let errorMessage = $state("");
  let dragActive = $state(false);
  let cursorLine = $state(1);
  let cursorColumn = $state(1);
  let selectedCharacters = $state(0);
  let settings = $state<AppSettings>({ ...DEFAULT_SETTINGS });
  let settingsOpen = $state(false);
  let updateOpen = $state(false);
  let settingsReady = $state(false);
  let contextMenu = $state<{ tabId: string; x: number; y: number } | null>(null);
  let closeDialog = $state<CloseDialogRequest | null>(null);
  let closedTabs: ClosedTab[] = [];
  let closedTabCount = $state(0);
  let toast = $state<{ message: string; count: number } | null>(null);
  let toastTimer = 0;
  const desktop =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  // The native window starts hidden (windows.rs). It is revealed once the stored
  // theme is applied and the documents queued for start-up are open, so the
  // user never sees a blank or wrongly themed frame; Rust shows it anyway after
  // a timeout, so a slow document only delays the reveal, never blocks it.
  let startupPulled = $state(!desktop);
  let revealed = false;
  $effect(() => {
    if (!desktop || revealed) return;
    if (!settingsReady || !startupPulled || busy || pendingOpens.length > 0) return;
    revealed = true;
    untrack(() => void revealWindow());
  });
  let systemDark = $state(true);
  let runtimeInfo = $state(currentRuntimeInfo());
  let appWindow = $state.raw<TauriWindow | null>(null);
  // Set when this code decided the window may close, so the close-requested
  // handler lets the native close through without asking again.
  let windowCloseApproved = false;
  /** The window closes because its last tab was closed: the stored session is empty. */
  let lastTabClosed = false;

  const activeTab = $derived(tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]);
  const mode = $derived(activeTab?.mode ?? "edit");
  const document = $derived(activeTab!.document);
  const dirty = $derived(tabIsDirty(activeTab!));
  // Images and PDF are read-only viewers without an editor or save path.
  const binaryDocument = $derived(Boolean(document.binary));
  /** The active tab was restored from the session and its file is not loaded yet. */
  const restoring = $derived(Boolean(activeTab?.restore));
  const splitRatio = $derived(clampSplitRatio(activeTab?.splitRatio ?? 0.5));
  const dirtyCount = $derived(tabs.filter((tab) => tabIsDirty(tab)).length);
  const tabItems = $derived(
    tabs.map((tab) => ({
      id: tab.id,
      name: tab.document.name,
      path: tab.document.path,
      dirty: tabIsDirty(tab),
      pinned: Boolean(tab.pinned),
      readOnly: Boolean(tab.document.readOnly),
    })),
  );
  const lineCount = $derived(countLines(document.content));
  const wordCount = $derived(countWords(document.content));
  const activeTheme = $derived(
    settings.theme === "system" ? (systemDark ? "dark" : "light") : settings.theme,
  );
  const persistSession = $derived(desktop && settingsReady && settings.startupBehavior === "restore");
  const keepRecovery = $derived(persistSession && settings.restoreOptions.unsaved);
  const extraRows = $derived((errorMessage ? 1 : 0) + (activeTab?.notice ? 1 : 0));

  // Editor ↔ preview synchronisation (issue #2): only the split view of a
  // Markdown document runs it. The toolbar toggle is kept per tab.
  const previewSync = new PreviewSyncController();
  const syncAvailable = $derived(mode === "split" && document.fileType.kind === "markdown" && !binaryDocument && !restoring);
  const effectiveSyncMode = $derived.by((): SyncMode => {
    const configured = settings.previewSyncMode;
    const toggle = activeTab?.previewSync;
    if (toggle === false) return "off";
    if (toggle === true) return configured === "off" ? "bidirectional" : configured;
    return configured;
  });
  $effect(() => {
    previewSync.configure({ active: syncAvailable, mode: effectiveSyncMode, clickNavigation: settings.previewClickNavigation });
  });

  // Find and replace is reachable from the toolbar, not only by shortcut.
  let searchMenu = $state<{ x: number; y: number } | null>(null);
  const searchAvailable = $derived(!binaryDocument && !restoring);

  async function startSearch(kind: "find" | "replace" | "batch"): Promise<void> {
    if (!searchAvailable || !activeTab) return;
    // The editor is hidden in View: switch to Split so the results stay visible.
    if (mode === "view") {
      setMode("split");
      await tick();
    }
    const view = editorSessions.get(sessionKey(activeTab))?.view;
    if (!view) return;
    view.focus();
    if (kind === "find") openFind(view);
    else if (kind === "replace") openReplacePanel(view);
    else openBatch(view);
  }

  function searchMenuEntries(): MenuEntry[] {
    const primary = isMac ? "Cmd" : "Strg";
    return [
      { label: "Suchen", shortcut: `${primary}+F`, action: () => void startSearch("find") },
      { label: "Ersetzen", shortcut: isMac ? "Cmd+Alt+F" : "Strg+H", action: () => void startSearch("replace") },
      { separator: true },
      { label: "Mehrfach ersetzen und Makros …", shortcut: `${primary}+Umschalt+H`, action: () => void startSearch("batch") },
    ];
  }

  function togglePreviewSync(): void {
    if (!activeTab) return;
    activeTab.previewSync = effectiveSyncMode === "off";
  }
  /**
   * Formatting toolbar above the editor (issue #1): "auto" offers it for
   * Markdown and HTML only, "always" falls back to Markdown syntax elsewhere.
   */
  const formattingDialect = $derived.by((): "markdown" | "html" | null => {
    const kind = document.fileType.kind;
    if (settings.formattingToolbar === "never") return null;
    if (kind === "html") return "html";
    if (kind === "markdown") return "markdown";
    return settings.formattingToolbar === "always" ? "markdown" : null;
  });

  $effect(() => {
    if (!appWindow) return;
    const title = `${dirty ? "● " : ""}${document.name} — P-Viewer`;
    void appWindow.setTitle(title).catch((error) => {
      console.warn("Fenstertitel konnte nicht aktualisiert werden.", error);
    });
  });

  $effect(() => {
    if (typeof window === "undefined") return;
    window.document.documentElement.dataset.theme = activeTheme;
    window.document.documentElement.style.colorScheme = activeTheme;
    const themePreference = settings.theme;
    const nativeTheme = nativeThemeFor(themePreference);
    void appWindow
      ?.setTheme(nativeTheme)
      .then(() => {
        if (themePreference === "system") {
          systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        }
      })
      .catch((error) => {
        console.warn("Native Fensterdarstellung konnte nicht aktualisiert werden.", error);
      });
  });

  $effect(() => {
    if (typeof window === "undefined") return;
    if (settings.debugMode) {
      window.document.documentElement.dataset.debug = "true";
      const diagnostics = {
        version: APP_VERSION,
        platform: runtimeInfo.platform,
        engine: runtimeInfo.engine,
        document: document.name,
        fileType: document.fileType,
        characters: document.content.length,
        tabs: tabs.length,
        mode,
        dirty,
      };
      const timer = window.setTimeout(() => {
        console.debug("[P-Viewer Debug]", diagnostics);
      }, 180);
      return () => window.clearTimeout(timer);
    }
    delete window.document.documentElement.dataset.debug;
  });

  $effect(() => {
    if (settings.debugMode && errorMessage) {
      console.error("[P-Viewer Debug]", errorMessage);
    }
  });

  $effect(() => {
    const snapshot = {
      ...settings,
      defaultAppAssociations: [...settings.defaultAppAssociations],
      extensionViewModes: { ...settings.extensionViewModes },
      restoreOptions: { ...settings.restoreOptions },
    };
    if (!settingsReady) return;
    const timer = window.setTimeout(() => {
      void saveSettings(snapshot).catch((error) => {
        errorMessage = `Einstellungen konnten nicht gespeichert werden: ${messageFrom(error)}`;
      });
    }, 180);
    return () => window.clearTimeout(timer);
  });

  // A restored tab loads its file the first time it becomes the active tab.
  $effect(() => {
    const tab = activeTab;
    if (tab?.restore?.state === "pending") untrack(() => void loadRestoredTab(tab));
  });

  onMount(() => {
    runtimeInfo = currentRuntimeInfo();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => (systemDark = media.matches);
    updateSystemTheme();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateSystemTheme);
    } else {
      media.addListener(updateSystemTheme);
    }

    settingsLoadPromise = loadSettings()
      .then((loaded) => {
        settings = loaded;
        activeTab!.mode = preferredViewMode(loaded, document.name);
      })
      .catch((error) => {
        errorMessage = `Einstellungen konnten nicht geladen werden: ${messageFrom(error)}`;
      })
      .finally(() => {
        settingsReady = true;
      });

    return () => {
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", updateSystemTheme);
      } else {
        media.removeListener(updateSystemTheme);
      }
    };
  });

  onMount(() => {
    if (!desktop) return;

    let disposed = false;
    const cleanups: Array<() => void> = [];

    void (async () => {
      // Defaults must be ready before startup files or transferred modes are applied.
      await settingsLoadPromise;
      const [{ getCurrentWindow }, { getCurrentWebview }] = await Promise.all([
        import("@tauri-apps/api/window"),
        import("@tauri-apps/api/webview"),
      ]);
      if (disposed) return;

      appWindow = getCurrentWindow();
      cleanups.push(
        await appWindow.onCloseRequested(async (event) => {
          if (windowCloseApproved) {
            await finalizeSession(false);
            return;
          }
          if (busy || installingUpdate) { event.preventDefault(); return; }
          const dirtyNames = tabs
            .filter((tab) => tabIsDirty(tab))
            .map((tab) => tab.document.name);
          if (dirtyNames.length === 0) {
            await finalizeSession(false);
            return;
          }
          event.preventDefault();
          busy = true;
          try {
            if (await confirmDiscardDocuments(dirtyNames)) {
              await finalizeSession(true);
              await appWindow?.destroy();
            }
          } finally { busy = false; }
        }),
      );
      cleanups.push(
        await getCurrentWebview().onDragDropEvent((event) => {
          const payload = event.payload;
          dragActive = payload.type === "enter" || payload.type === "over";
          if (payload.type === "drop" && payload.paths.length > 0) {
            dragActive = false;
            void openExternalDocuments(payload.paths);
          }
        }),
      );
      // Other windows and second process instances only signal; this window
      // pulls what is queued for it, so nothing is lost if a signal arrives
      // before these listeners exist.
      cleanups.push(
        await listen("open-documents", () => {
          void pullQueuedDocuments();
        }),
      );
      cleanups.push(
        await listen("tabs-transferred", () => {
          void acceptTransferredTabs();
        }),
      );

      // Only the first window of a process receives the previous session.
      await restorePreviousSession();
      sessionReady = true;
      scheduleSessionSave();
      await acceptTransferredTabs();
      await pullQueuedDocuments();
    })()
      .catch((error) => {
        errorMessage = messageFrom(error);
      })
      .finally(() => {
        startupPulled = true;
      });

    // Cursor and scroll positions are only kept in memory while working; they
    // reach the session when the window loses focus and every half minute.
    const flushOnBlur = () => scheduleSessionSave(0);
    const periodic = window.setInterval(() => {
      if (window.document.hasFocus()) scheduleSessionSave(0);
    }, 30_000);
    window.addEventListener("blur", flushOnBlur);

    return () => {
      disposed = true;
      window.clearInterval(periodic);
      window.removeEventListener("blur", flushOnBlur);
      for (const cleanup of cleanups) cleanup();
    };
  });

  function messageFrom(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  async function revealWindow(): Promise<void> {
    await tick();
    try {
      await invoke("reveal_window");
    } catch (error) {
      console.warn("Fenster konnte nicht angezeigt werden.", error);
    }
  }

  // ---------------------------------------------------------------------------
  // Tab state: view capture, session persistence and recovery (issue #4)
  // ---------------------------------------------------------------------------

  /** Cursor, selection, folds and scroll offsets of a tab right now. */
  function captureView(tab: DocumentTab): TabViewState | undefined {
    const editor = captureEditorView(editorSessions.get(sessionKey(tab))) ?? tab.view;
    const preview = previewMemories.get(tab.id)?.top ?? tab.view?.previewScroll;
    if (!editor && !preview) return undefined;
    return { ...editor, ...(preview ? { previewScroll: preview } : {}) };
  }

  /** Makes the next mounted editor and preview of `tab` start from `view`. */
  function seedView(tab: DocumentTab, view: TabViewState | undefined): void {
    if (!view) return;
    editorSessions.set(sessionKey(tab), { restore: view, scrollTop: view.editorScroll });
    if (view.previewScroll) previewMemories.set(tab.id, { top: view.previewScroll });
  }

  let sessionReady = false;
  let sessionTimer = 0;
  let lastFingerprint = "";

  function recoveryAvailable(tab: DocumentTab): boolean {
    if (!keepRecovery) return false;
    if (tab.restore) return tab.restore.hasRecovery;
    return !tab.document.binary && documentIsDirty(tab.document);
  }

  function buildWindowSession(discarded = false): WindowSession {
    const entries = lastTabClosed
      ? []
      : tabs
          .filter((tab) => !isReplaceable(tab))
          .map((tab) => sessionTabFor(tab, captureView(tab), !discarded && recoveryAvailable(tab)));
    return {
      version: 1,
      ...(activeTab && !lastTabClosed ? { activeRecoveryId: activeTab.recoveryId } : {}),
      tabs: entries,
    };
  }

  function scheduleSessionSave(delay = SESSION_SAVE_DELAY): void {
    if (!sessionReady || !persistSession) return;
    window.clearTimeout(sessionTimer);
    sessionTimer = window.setTimeout(() => {
      void storeWindowSession(buildWindowSession()).catch((error) => {
        console.warn("Sitzung konnte nicht gespeichert werden.", error);
      });
    }, delay);
  }

  /** Last write before the window closes; never blocks closing for long. */
  async function finalizeSession(discarded: boolean): Promise<void> {
    window.clearTimeout(sessionTimer);
    window.clearTimeout(recoveryTimer);
    if (!sessionReady) return;
    const work = (async () => {
      if (discarded) {
        await Promise.allSettled(
          tabs.filter((tab) => tabIsDirty(tab)).map((tab) => discardRecovery(tab)),
        );
      }
      if (persistSession) await storeWindowSession(buildWindowSession(discarded));
    })();
    await Promise.race([work.catch(() => undefined), new Promise((resolve) => window.setTimeout(resolve, 1_500))]);
  }

  // Structural changes (order, pinning, modes, split, dirty state, active tab)
  // are saved shortly after they happen; typing alone does not rewrite the file.
  $effect(() => {
    const fingerprint = [
      activeTabId,
      persistSession,
      ...tabs.map((tab) =>
        [tab.id, tab.recoveryId, tab.document.path, tab.document.name, tab.mode, tab.pinned, tab.splitRatio, tab.previewSync, tabIsDirty(tab), tab.revision, tab.restore?.state].join("|"),
      ),
    ].join("\n");
    if (fingerprint === lastFingerprint) return;
    lastFingerprint = fingerprint;
    untrack(() => scheduleSessionSave());
  });

  // Turning session restore off removes what was stored; turning it on resumes.
  let previousStartup: AppSettings["startupBehavior"] | null = null;
  $effect(() => {
    const startup = settings.startupBehavior;
    if (!settingsReady || !desktop) return;
    untrack(() => {
      if (previousStartup !== null && previousStartup !== startup) {
        if (startup === "empty") {
          void clearStoredSession(true, false).catch((error) => (errorMessage = messageFrom(error)));
          recoveryWritten.clear();
        } else {
          void resumeSessionStorage().then(() => scheduleSessionSave(0));
        }
      }
      previousStartup = startup;
    });
  });

  // Unsaved text is mirrored into the recovery store, debounced, so a crash or
  // a killed process loses at most about a second of typing.
  const recoveryWritten = new Map<string, string>();
  /** Recovery ids of tabs moved to another window: that window owns the file now. */
  const handedOver = new Set<string>();
  let recoveryTimer = 0;
  $effect(() => {
    const keep = keepRecovery;
    for (const tab of tabs) {
      if (!tab.restore && !tab.document.binary && documentIsDirty(tab.document)) void tab.document.content;
    }
    void keep;
    untrack(() => {
      window.clearTimeout(recoveryTimer);
      recoveryTimer = window.setTimeout(() => void syncRecovery(), RECOVERY_DELAY);
    });
  });

  async function syncRecovery(): Promise<void> {
    if (!sessionReady) return;
    const wanted = new Map<string, string>();
    if (keepRecovery) {
      for (const tab of tabs) {
        if (!tab.restore && !tab.document.binary && documentIsDirty(tab.document)) wanted.set(tab.recoveryId, tab.document.content);
      }
    }
    for (const [id, content] of wanted) {
      if (recoveryWritten.get(id) === content) continue;
      try {
        await writeRecovery(id, content);
        recoveryWritten.set(id, content);
      } catch (error) {
        console.warn("Wiederherstellungsdaten konnten nicht geschrieben werden.", error);
      }
    }
    for (const id of [...recoveryWritten.keys()]) {
      if (wanted.has(id)) continue;
      recoveryWritten.delete(id);
      if (!handedOver.has(id)) void removeRecovery(id).catch(() => undefined);
    }
  }

  /** Drops the stored unsaved text of a tab whose changes were discarded, saved or closed. */
  async function discardRecovery(tab: DocumentTab): Promise<void> {
    recoveryWritten.delete(tab.recoveryId);
    if (!desktop) return;
    await removeRecovery(tab.recoveryId).catch(() => undefined);
  }

  // ---------------------------------------------------------------------------
  // Session restore
  // ---------------------------------------------------------------------------

  /** Drops what the startup settings say not to bring back. */
  function withRestoreOptions(entry: SessionTab): SessionTab {
    const options = settings.restoreOptions;
    const next: SessionTab = { ...entry };
    if (!options.cursor) delete next.selection;
    if (!options.scroll) {
      delete next.editorScroll;
      delete next.previewScroll;
    }
    if (!options.folds) delete next.folds;
    if (!options.splitWidths) delete next.splitRatio;
    if (!options.mode) next.mode = preferredViewMode(settings, entry.name);
    if (!options.unsaved && entry.hasRecovery) {
      void removeRecovery(entry.recoveryId).catch(() => undefined);
      next.hasRecovery = false;
    }
    return next;
  }

  /** Builds a not yet loaded tab from a stored session entry. */
  function tabFromSession(entry: SessionTab): DocumentTab | null {
    const hasRecovery = Boolean(entry.hasRecovery);
    // An untitled tab without unsaved text has nothing to bring back.
    if (entry.untitled && !hasRecovery) return null;
    const document = createUntitledDocument(entry.name);
    document.path = entry.untitled ? "" : entry.path;
    document.untitled = entry.untitled;
    if (entry.encoding) document.encoding = entry.encoding;
    if (entry.lineEnding) document.lineEnding = entry.lineEnding;
    if (entry.hasBom !== undefined) document.hasBom = entry.hasBom;
    const view: TabViewState = {
      ...(entry.selection ? { selection: entry.selection } : {}),
      ...(entry.editorScroll ? { editorScroll: entry.editorScroll } : {}),
      ...(entry.previewScroll ? { previewScroll: entry.previewScroll } : {}),
      ...(entry.folds ? { folds: entry.folds } : {}),
    };
    const recoveryId = tabs.some((tab) => tab.recoveryId === entry.recoveryId) ? newRecoveryId() : entry.recoveryId;
    return createTab(document, entry.mode, {
      recoveryId,
      pinned: Boolean(entry.pinned),
      splitRatio: entry.splitRatio,
      previewSync: entry.previewSync,
      view,
      restore: { state: "pending", version: entry.version, hasRecovery },
    });
  }

  async function restorePreviousSession(): Promise<void> {
    if (settings.startupBehavior !== "restore") return;
    let sessions: WindowSession[];
    try {
      sessions = await takeRestoredSessions();
    } catch (error) {
      console.warn("Die letzte Sitzung konnte nicht gelesen werden.", error);
      return;
    }
    const [own, ...others] = sessions.filter((session) => session.tabs.length > 0);
    if (!own) return;
    const restored: DocumentTab[] = [];
    for (const entry of own.tabs.slice(0, MAX_TABS)) {
      // One broken entry never costs the rest of the session.
      try {
        if (!entry.untitled && findTabByPath([...tabs, ...restored], entry.path)) continue;
        const tab = tabFromSession(withRestoreOptions(entry));
        if (tab) restored.push(tab);
      } catch (error) {
        console.warn("Ein Tab der letzten Sitzung wurde übersprungen.", error);
      }
    }
    if (restored.length > 0) {
      if (tabs.length === 1 && isReplaceable(tabs[0])) {
        editorSessions.delete(sessionKey(tabs[0]));
        tabs.splice(0, 1, ...restored);
      } else {
        tabs.push(...restored);
      }
      normalizePinnedOrder(tabs);
      const active = restored.find((tab) => tab.recoveryId === own.activeRecoveryId) ?? restored[0];
      activeTabId = active.id;
      // Unsaved text is brought back right away; other tabs load when first shown.
      for (const tab of restored) if (tab.restore?.hasRecovery && tab.id !== active.id) void loadRestoredTab(tab);
    }
    for (const session of others) await restoreWindowElsewhere(session);
  }

  /** Further windows of the previous session reopen as windows of their own. */
  async function restoreWindowElsewhere(session: WindowSession): Promise<void> {
    let target: string | null = null;
    for (const entry of session.tabs) {
      try {
        const result: TabMoveResult = await invoke<TabMoveResult>("move_tab_to_window", {
          tab: serializeRestoreTransfer(withRestoreOptions(entry), entry.mode, entry.recoveryId === session.activeRecoveryId),
          target,
          insideSource: true,
          allowNewWindow: true,
          atCursor: false,
        });
        target = result.window ?? target;
      } catch (error) {
        console.warn("Ein Fenster der letzten Sitzung konnte nicht wiederhergestellt werden.", error);
        return;
      }
    }
  }

  const restoreAttempts = new Map<string, number>();

  function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new RestoreTimeout()), milliseconds);
      promise.then(
        (value) => { window.clearTimeout(timer); resolve(value); },
        (error) => { window.clearTimeout(timer); reject(error); },
      );
    });
  }

  class RestoreTimeout extends Error {
    constructor() {
      super("Die Datei hat nicht rechtzeitig geantwortet. Netzlaufwerk oder Freigabe sind möglicherweise nicht verbunden.");
    }
  }

  /** Loads the file (and any unsaved text) of a restored tab; errors stay on the tab. */
  async function loadRestoredTab(tab: DocumentTab): Promise<void> {
    const restore = tab.restore;
    if (!restore || restore.state === "loading") return;
    const attempt = (restoreAttempts.get(tab.id) ?? 0) + 1;
    restoreAttempts.set(tab.id, attempt);
    tab.restore = { ...restore, state: "loading", error: undefined, unavailable: false };
    const current = () => {
      const candidate = tabs.find((entry) => entry.id === tab.id);
      return candidate?.restore && restoreAttempts.get(tab.id) === attempt ? candidate : null;
    };

    let recovered: string | null = null;
    if (restore.hasRecovery) {
      try {
        recovered = await readRecovery(tab.recoveryId);
      } catch (error) {
        const target = current();
        if (target) target.restore = { ...restore, state: "error", error: messageFrom(error) };
        return;
      }
    }

    if (tab.document.untitled) {
      const target = current();
      if (!target) return;
      const document = createUntitledDocument(target.document.name);
      document.encoding = target.document.encoding;
      document.lineEnding = target.document.lineEnding;
      document.hasBom = target.document.hasBom;
      document.content = recovered ?? "";
      finishRestore(target, document, undefined, true);
      return;
    }

    let disk: OpenDocument | null = null;
    let failure: unknown = null;
    try {
      disk = await withTimeout(openDocumentPath(tab.document.path), RESTORE_TIMEOUT);
    } catch (error) {
      failure = error;
    }
    const target = current();
    if (!target) return;

    if (disk) {
      const changed = Boolean(restore.version && disk.version && restore.version !== disk.version);
      if (recovered !== null && !disk.binary && recovered !== disk.content) {
        const document: OpenDocument = { ...disk, content: recovered };
        let notice: TabNotice | undefined;
        if (changed) {
          // Keep the old version: a plain save now reports the conflict instead of
          // overwriting what changed on disk since the last session.
          document.version = restore.version;
          notice = { kind: "external-change", diskContent: disk.content, diskVersion: disk.version };
        }
        finishRestore(target, document, notice, !changed);
      } else {
        if (recovered !== null) void discardRecovery(target);
        finishRestore(target, disk, undefined, !changed);
      }
      return;
    }

    if (recovered !== null) {
      // The file is gone or unreachable, but its unsaved text is not lost.
      const document: OpenDocument = { ...target.document, content: recovered, savedContent: "", version: restore.version };
      finishRestore(target, document, { kind: "missing" }, false);
      return;
    }
    target.restore = {
      ...restore,
      state: "error",
      error: messageFrom(failure),
      unavailable: failure instanceof RestoreTimeout,
    };
  }

  function finishRestore(tab: DocumentTab, document: OpenDocument, notice: TabNotice | undefined, keepFolds: boolean): void {
    const view = tab.view ? { ...tab.view } : undefined;
    if (view && !keepFolds) delete view.folds;
    editorSessions.delete(sessionKey(tab));
    tab.document = document;
    tab.notice = notice;
    tab.revision += 1;
    seedView(tab, view);
    tab.view = undefined;
    tab.restore = undefined;
  }

  function retryRestoredTab(tabId: string): void {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab?.restore) return;
    tab.restore = { ...tab.restore, state: "pending" };
    void loadRestoredTab(tab);
  }

  /** "Datei suchen …": points a restored tab whose file moved to a new location. */
  async function locateRestoredTab(tabId: string): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const opened = await chooseAndOpenDocument();
      const tab = tabs.find((candidate) => candidate.id === tabId);
      if (!opened || !tab) return;
      const existing = findTabByPath(tabs, opened.path, tabId);
      if (existing) {
        activeTabId = existing.id;
        return;
      }
      restoreAttempts.set(tabId, (restoreAttempts.get(tabId) ?? 0) + 1);
      finishRestore(tab, opened, undefined, false);
    } catch (error) {
      errorMessage = messageFrom(error);
    } finally {
      busy = false;
    }
  }

  function keepRecoveredVersion(tab: DocumentTab): void {
    if (tab.notice?.kind === "external-change") tab.document.version = tab.notice.diskVersion;
    tab.notice = undefined;
  }

  function useDiskVersion(tab: DocumentTab): void {
    const notice = tab.notice;
    if (notice?.kind !== "external-change" || notice.diskContent === undefined) return;
    editorSessions.delete(sessionKey(tab));
    tab.document = { ...tab.document, content: notice.diskContent, savedContent: notice.diskContent, version: notice.diskVersion };
    tab.notice = undefined;
    tab.revision += 1;
    void discardRecovery(tab);
  }

  // ---------------------------------------------------------------------------
  // Opening documents
  // ---------------------------------------------------------------------------

  function showDocument(opened: OpenDocument, replacePristine: boolean): void {
    const existing = findTabByPath(tabs, opened.path);
    if (existing) {
      activeTabId = existing.id;
      return;
    }

    if (!canHostAnotherTab(opened)) {
      throw new Error(`Zu viele offene Dokumente (maximal ${MAX_TABS} Tabs / 64 Millionen Zeichen). Bitte zuerst Tabs schließen.`);
    }
    const current = tabs.find((tab) => tab.id === activeTabId);
    if (replacePristine && current && isReplaceable(current)) {
      editorSessions.delete(sessionKey(current));
      current.document = opened;
      current.mode = preferredViewMode(settings, opened.name);
      current.revision += 1;
      return;
    }

    const tab = createTab(opened, preferredViewMode(settings, opened.name));
    tabs.push(tab);
    activeTabId = tab.id;
  }

  function newDocument(): void {
    if (busy || installingUpdate) return;
    if (tabs.length >= MAX_TABS) { errorMessage = `Maximal ${MAX_TABS} offene Tabs. Bitte zuerst einen Tab schließen.`; return; }
    const name = nextUntitledName(tabs.map((tab) => tab.document));
    const tab = createTab(createUntitledDocument(name), preferredViewMode(settings, name));
    tabs.push(tab);
    activeTabId = tab.id;
    errorMessage = "";
  }

  async function openDocument(): Promise<void> {
    if (busy) return;
    busy = true;
    errorMessage = "";
    try {
      const opened = await chooseAndOpenDocument();
      if (opened) showDocument(opened, true);
    } catch (error) {
      errorMessage = messageFrom(error);
    } finally {
      busy = false;
    }
  }

  function canHostAnotherTab(document: OpenDocument): boolean {
    if (tabs.length >= MAX_TABS) return false;
    const weight = tabs.reduce((size, tab) => size + documentWeight(tab.document), documentWeight(document));
    return weight <= MAX_TAB_WEIGHT;
  }

  async function pullQueuedDocuments(): Promise<void> {
    try {
      const paths = await invoke<string[]>("take_pending_document_paths");
      await openExternalDocuments(paths, true);
    } catch (error) {
      errorMessage = messageFrom(error);
    }
  }

  /** Where a tab dropped at window coordinates belongs in this strip; appended when off the strip. */
  function dropIndexFor(x: number | null, y: number | null): number {
    if (x === null || y === null) return tabs.length;
    const shells = Array.from(window.document.querySelectorAll<HTMLElement>(".tab-list .tab-shell"));
    const strip = window.document.querySelector(".tab-list")?.getBoundingClientRect();
    if (!strip || y < strip.top - 24 || y > strip.bottom + 24) return tabs.length;
    const visibleIndex = insertionIndex(x, shells.map((shell) => shell.getBoundingClientRect()));
    return logicalInsertionIndex(tabs.map((tab) => tab.id), shells.map((shell) => shell.dataset.shellId ?? ""), null, visibleIndex);
  }

  async function acceptTransferredTabs(): Promise<void> {
    let queued: QueuedTab[];
    try {
      queued = await invoke<QueuedTab[]>("take_transferred_tabs");
    } catch (error) {
      errorMessage = messageFrom(error);
      return;
    }
    for (const entry of queued) {
      const transfer = parseTabTransfer(entry.tab);
      if (!transfer) {
        errorMessage = "Ein aus einem anderen Fenster übergebener Tab war beschädigt und wurde verworfen.";
        continue;
      }
      const incoming = transfer.document;
      const state = transfer.state;
      const path = incoming ? incoming.path : state?.untitled ? "" : state?.path ?? "";
      const existing = path ? findTabByPath(tabs, path) : undefined;
      const incomingDirty = incoming ? documentIsDirty(incoming) : Boolean(state?.hasRecovery);
      const onlyPristine = tabs.length === 1 && isReplaceable(tabs[0]);
      if (existing && !incomingDirty) {
        // Same file already open here and nothing unsaved travels with it.
        activeTabId = existing.id;
        continue;
      }
      if (!onlyPristine && (existing || (incoming ? !canHostAnotherTab(incoming) : tabs.length >= MAX_TABS))) {
        // Never drop a document: bounce it into a fresh window instead.
        try {
          await invoke("move_tab_to_window", { tab: entry.tab, target: null, insideSource: true, allowNewWindow: true, atCursor: false });
        } catch (error) {
          errorMessage = messageFrom(error);
        }
        continue;
      }
      let tab: DocumentTab | null;
      if (incoming) {
        const recoveryId = state && !tabs.some((candidate) => candidate.recoveryId === state.recoveryId) ? state.recoveryId : newRecoveryId();
        tab = createTab(incoming, transfer.mode, {
          recoveryId,
          pinned: state?.pinned,
          splitRatio: state?.splitRatio,
          previewSync: state?.previewSync,
        });
        seedView(tab, state ? { selection: state.selection, editorScroll: state.editorScroll, previewScroll: state.previewScroll, folds: state.folds } : undefined);
      } else {
        tab = state?.name
          ? tabFromSession({ ...state, path, name: state.name, untitled: state.untitled ?? !path, mode: transfer.mode })
          : null;
        if (!tab) continue;
      }
      // A tab of a restored window only takes focus when it was the active one
      // or when this window has nothing else to show yet.
      const takeFocus = Boolean(incoming || transfer.active || onlyPristine || isReplaceable(activeTab));
      if (onlyPristine) {
        editorSessions.delete(sessionKey(tabs[0]));
        tabs.splice(0, 1, tab);
      } else {
        tabs.splice(dropIndexFor(entry.dropX, entry.dropY), 0, tab);
      }
      normalizePinnedOrder(tabs);
      if (takeFocus) activeTabId = tab.id;
      if (tab.restore?.hasRecovery && activeTabId !== tab.id) void loadRestoredTab(tab);
      cursorLine = 1;
      cursorColumn = 1;
      selectedCharacters = 0;
      errorMessage = "";
    }
  }

  async function openNewWindow(): Promise<void> {
    if (busy || installingUpdate) return;
    if (!desktop) { errorMessage = "Weitere Fenster sind nur in der P-Viewer-Desktop-App verfügbar."; return; }
    try {
      await invoke<string>("open_new_window");
    } catch (error) {
      errorMessage = messageFrom(error);
    }
  }

  function reorderTab(tabId: string, index: number): void {
    if (busy) return;
    reorderTabs(tabs, tabId, index);
  }

  /** Serialized form of a tab for another window, including its view state. */
  function transferPayload(tab: DocumentTab): string {
    const state = sessionTabFor(tab, captureView(tab), tab.restore ? tab.restore.hasRecovery : false);
    return tab.restore
      ? serializeRestoreTransfer(state, tab.mode ?? "edit", true)
      : serializeTabTransfer(tab.document, tab.mode ?? "edit", state);
  }

  /** Hands a tab to the window under the pointer or to a new window. */
  async function transferTab(tabId: string, insideWindow: boolean, atCursor: boolean): Promise<void> {
    if (busy || installingUpdate || !desktop) return;
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return;
    const onlyTab = tabs.length === 1;
    // The only tab dropped over its own window has nowhere else to go.
    if (onlyTab && insideWindow) return;
    busy = true;
    errorMessage = "";
    try {
      const result = await invoke<TabMoveResult>("move_tab_to_window", {
        tab: transferPayload(tab),
        target: null,
        insideSource: insideWindow,
        allowNewWindow: !onlyTab,
        atCursor,
      });
      if (result.moved) {
        // The receiving window now owns the tab's recovery text.
        recoveryWritten.delete(tab.recoveryId);
        handedOver.add(tab.recoveryId);
        removeTab(tabId);
      }
    } catch (error) {
      errorMessage = messageFrom(error);
    } finally {
      busy = false;
    }
  }

  function detachTab(tabId: string, point: TabDropPoint): Promise<void> {
    return transferTab(tabId, point.insideWindow, true);
  }

  async function openExternalDocuments(
    paths: readonly string[],
    replacePristine = true,
  ): Promise<void> {
    for (let index = 0; index < paths.length; index += 1) {
      const path = paths[index];
      if (pendingOpens.some((entry) => entry.path === path)) continue;
      if (pendingOpens.length >= 64) { errorMessage = "Öffnen-Warteschlange voll. Bitte weitere Dateien später öffnen."; break; }
      pendingOpens.push({ path, replacePristine: replacePristine && index === 0 });
    }
  }

  async function openDroppedDocument(
    path: string,
    replacePristine = true,
  ): Promise<void> {
    if (busy) return;
    const existing = findTabByPath(tabs, path);
    if (existing) {
      activeTabId = existing.id;
      return;
    }

    busy = true;
    errorMessage = "";
    try {
      showDocument(await openDocumentPath(path), replacePristine);
    } catch (error) {
      errorMessage = messageFrom(error);
    } finally {
      busy = false;
    }
  }

  function focusDocumentTab(tabId: string): void {
    requestAnimationFrame(() => {
      window.document
        .querySelector<HTMLButtonElement>(`[data-tab-id="${tabId}"]`)
        ?.focus();
    });
  }

  // ---------------------------------------------------------------------------
  // Closing tabs, closed tab history (issue #4)
  // ---------------------------------------------------------------------------

  function closedEntryFor(tab: DocumentTab): ClosedTab {
    const state = sessionTabFor(tab, captureView(tab), false);
    const keepText = !tab.restore && tab.document.untitled && tab.document.content !== "";
    return keepText ? { state, document: { ...tab.document } } : { state };
  }

  function rememberClosed(entries: ClosedTab[]): void {
    const useful = entries.filter((entry) => entry.document || !entry.state.untitled);
    if (useful.length === 0) return;
    closedTabs = [...closedTabs, ...useful].slice(-CLOSED_TAB_HISTORY);
    closedTabCount = closedTabs.length;
    showToast(
      useful.length === 1 ? `„${useful[0].state.name}“ geschlossen` : `${useful.length} Tabs geschlossen`,
      useful.length,
    );
  }

  function showToast(message: string, count: number): void {
    window.clearTimeout(toastTimer);
    toast = { message, count };
    toastTimer = window.setTimeout(() => (toast = null), 6_000);
  }

  async function closeTab(tabId: string): Promise<string | null> {
    if (busy) return null;
    let index = tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) return null;

    const closing = tabs[index];
    if (tabIsDirty(closing)) {
      busy = true;
      let accepted = false;
      try {
        accepted = await confirmDiscardChanges(closing.document.name);
      } catch (error) {
        errorMessage = messageFrom(error);
      } finally {
        busy = false;
      }
      if (!accepted) return null;
      index = tabs.findIndex((tab) => tab.id === tabId);
      if (index < 0) return null;
    }

    const entry = closedEntryFor(closing);
    const windowStays = tabs.length > 1;
    void discardRecovery(closing);
    removeTab(tabId);
    if (windowStays) rememberClosed([entry]);
    return activeTabId;
  }

  function askBulkClose(names: string[]): Promise<BulkChoice> {
    return new Promise((resolve) => {
      closeDialog = { kind: "bulk", names, resolve: (choice) => { closeDialog = null; resolve(choice); } };
    });
  }

  function askReview(name: string, position: number, total: number): Promise<ReviewChoice> {
    return new Promise((resolve) => {
      closeDialog = { kind: "review", name, position, total, resolve: (choice) => { closeDialog = null; resolve(choice); } };
    });
  }

  /** Saves a tab that is about to close; false aborts the close. */
  async function saveTabForClose(tabId: string): Promise<boolean> {
    let tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return true;
    if (tab.restore) {
      await loadRestoredTab(tab);
      tab = tabs.find((candidate) => candidate.id === tabId);
      if (!tab || tab.restore) {
        errorMessage = `„${tab?.document.name ?? "Dokument"}“ konnte nicht geladen und daher nicht gespeichert werden.`;
        return false;
      }
    }
    try {
      const saved = await saveDocument(tab.document, false, (path) => validateSavePath(tabId, path));
      if (!saved) return false;
      tab.document = saved;
      return true;
    } catch (error) {
      activeTabId = tabId;
      errorMessage = messageFrom(error);
      return false;
    }
  }

  /**
   * Bulk close with one decision for all unsaved tabs. Nothing unsaved is ever
   * dropped silently: saving, reviewing one by one or an explicit "discard all"
   * are the only ways past the dialog.
   */
  async function closeTabs(ids: readonly string[], keepId?: string): Promise<void> {
    if (busy || ids.length === 0) return;
    const targets = tabs.filter((tab) => ids.includes(tab.id));
    const dirtyTabs = targets.filter((tab) => tabIsDirty(tab));
    const skipped = new Set<string>();
    busy = true;
    try {
      if (dirtyTabs.length > 0) {
        const choice = await askBulkClose(dirtyTabs.map((tab) => tab.document.name));
        if (choice === "cancel") return;
        if (choice === "save") {
          for (const tab of dirtyTabs) if (!(await saveTabForClose(tab.id))) return;
        } else if (choice === "review") {
          for (let index = 0; index < dirtyTabs.length; index += 1) {
            const tab = dirtyTabs[index];
            activeTabId = tab.id;
            const decision = await askReview(tab.document.name, index + 1, dirtyTabs.length);
            if (decision === "cancel") return;
            if (decision === "skip") skipped.add(tab.id);
            if (decision === "save" && !(await saveTabForClose(tab.id))) return;
          }
        }
      }
    } finally {
      busy = false;
    }

    const closing = tabs.filter((tab) => ids.includes(tab.id) && !skipped.has(tab.id));
    if (closing.length === 0) return;
    const entries = closing.map(closedEntryFor);
    if (closing.length === tabs.length) {
      // "Alle schließen" keeps the window: a fresh document replaces the last tab.
      const replacement = createTab(createUntitledDocument(), preferredViewMode(settings, "Unbenannt.txt"));
      tabs.push(replacement);
      activeTabId = replacement.id;
    }
    for (const tab of closing) {
      void discardRecovery(tab);
      removeTab(tab.id);
    }
    if (keepId && tabs.some((tab) => tab.id === keepId)) activeTabId = keepId;
    rememberClosed(entries);
  }

  /** Removes a tab whose fate is settled; closing the last one closes this window. */
  function removeTab(tabId: string): void {
    const index = tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) return;
    const removed = tabs[index];
    editorSessions.delete(sessionKey(removed));
    previewMemories.delete(removed.id);
    restoreAttempts.delete(removed.id);
    if (tabs.length === 1) {
      if (appWindow) {
        // Keep the tab mounted until the window is gone; nothing may render
        // an empty tab list in between. A regular close (not destroy) lets the
        // native side record the window geometry before the window goes away.
        windowCloseApproved = true;
        lastTabClosed = true;
        void appWindow.close().catch((error) => {
          windowCloseApproved = false;
          lastTabClosed = false;
          errorMessage = `Fenster konnte nicht geschlossen werden: ${messageFrom(error)}`;
        });
        return;
      }
      const replacementDocument = createUntitledDocument();
      const replacement = createTab(replacementDocument, preferredViewMode(settings, replacementDocument.name));
      tabs.splice(0, 1, replacement);
      activeTabId = replacement.id;
    } else {
      const nextActiveId = tabs[index + 1]?.id ?? tabs[index - 1]?.id;
      tabs.splice(index, 1);
      if (activeTabId === tabId) activeTabId = nextActiveId;
    }

    cursorLine = 1;
    cursorColumn = 1;
    selectedCharacters = 0;
    errorMessage = "";
    focusDocumentTab(activeTabId);
  }

  /** Strg/Cmd+Umschalt+T and "Rückgängig": reopens the most recently closed tabs. */
  async function reopenClosedTab(count = 1): Promise<void> {
    if (busy) return;
    for (let reopened = 0; reopened < count; reopened += 1) {
      const entry = closedTabs.pop();
      closedTabCount = closedTabs.length;
      if (!entry) break;
      if (tabs.length >= MAX_TABS) { errorMessage = `Maximal ${MAX_TABS} offene Tabs. Bitte zuerst einen Tab schließen.`; closedTabs.push(entry); closedTabCount = closedTabs.length; break; }
      const existing = entry.state.untitled ? undefined : findTabByPath(tabs, entry.state.path);
      if (existing) {
        activeTabId = existing.id;
        continue;
      }
      const view: TabViewState = { selection: entry.state.selection, editorScroll: entry.state.editorScroll, previewScroll: entry.state.previewScroll, folds: entry.state.folds };
      let tab: DocumentTab | null;
      if (entry.document) {
        const name = tabs.some((candidate) => candidate.document.name === entry.document!.name) ? nextUntitledName(tabs.map((candidate) => candidate.document)) : entry.document.name;
        tab = createTab({ ...entry.document, name }, entry.state.mode, { pinned: entry.state.pinned, splitRatio: entry.state.splitRatio, previewSync: entry.state.previewSync });
        seedView(tab, view);
      } else {
        tab = tabFromSession({ ...entry.state, hasRecovery: false, recoveryId: newRecoveryId() });
      }
      if (!tab) continue;
      if (tabs.length === 1 && isReplaceable(tabs[0])) {
        editorSessions.delete(sessionKey(tabs[0]));
        tabs.splice(0, 1, tab);
      } else {
        tabs.push(tab);
      }
      normalizePinnedOrder(tabs);
      activeTabId = tab.id;
    }
    toast = null;
  }

  function activateTab(tabId: string): void {
    if (busy || tabId === activeTabId || !tabs.some((tab) => tab.id === tabId)) return;
    activeTabId = tabId;
    cursorLine = 1;
    cursorColumn = 1;
    selectedCharacters = 0;
    scheduleSessionSave();
  }

  function cycleTab(direction: -1 | 1): void {
    if (busy || tabs.length < 2) return;
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    activateTab(tabs[nextIndex].id);
  }

  // ---------------------------------------------------------------------------
  // Tab context menu (issue #4): every action targets the right-clicked tab
  // ---------------------------------------------------------------------------

  function openTabContextMenu(tabId: string, x: number, y: number): void {
    if (busy || !tabs.some((tab) => tab.id === tabId)) return;
    contextMenu = { tabId, x, y };
  }

  async function copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = window.document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      window.document.body.append(area);
      area.select();
      window.document.execCommand("copy");
      area.remove();
    }
  }

  async function revealInFileManager(path: string): Promise<void> {
    try {
      const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
      await revealItemInDir(path);
    } catch (error) {
      errorMessage = `Datei konnte nicht angezeigt werden: ${messageFrom(error)}`;
    }
  }

  async function openTerminalAt(path: string): Promise<void> {
    try {
      await invoke("open_terminal_at", { path });
    } catch (error) {
      errorMessage = messageFrom(error);
    }
  }

  /** Reads the file again from disk; unsaved changes are only dropped after confirmation. */
  async function reloadTab(tabId: string): Promise<void> {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab || busy || tab.document.untitled || !tab.document.path) return;
    if (tab.restore) {
      retryRestoredTab(tabId);
      return;
    }
    busy = true;
    errorMessage = "";
    try {
      if (tabIsDirty(tab) && !(await confirmReload(tab.document.name))) return;
      const view = captureView(tab);
      const reloaded = await openDocumentPath(tab.document.path);
      editorSessions.delete(sessionKey(tab));
      tab.document = reloaded;
      tab.notice = undefined;
      tab.revision += 1;
      seedView(tab, view ? { ...view, folds: undefined } : undefined);
      void discardRecovery(tab);
    } catch (error) {
      errorMessage = messageFrom(error);
    } finally {
      busy = false;
    }
  }

  function applyTabOrder(change: () => boolean | void): void {
    if (busy) return;
    change();
  }

  const fileManagerName = isMac ? "Im Finder anzeigen" : /Windows/.test(typeof navigator !== "undefined" ? navigator.userAgent : "") ? "Im Explorer anzeigen" : "Im Dateimanager anzeigen";

  function tabMenu(tabId: string): MenuEntry[] {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return [];
    const index = tabs.indexOf(tab);
    const hasFile = Boolean(tab.document.path) && !tab.document.untitled;
    const targets = (kind: BulkClose) => bulkCloseTargets(tabs, tabId, kind);
    const group = tabs.filter((candidate) => Boolean(candidate.pinned) === Boolean(tab.pinned));
    const groupIndex = group.indexOf(tab);
    const extension = extensionOfName(tab.document.name);
    const primary = isMac ? "Cmd" : "Strg";
    const move = (kind: TabMove) => () => applyTabOrder(() => moveTab(tabs, tabId, kind));
    const sort = (kind: TabSort) => () => applyTabOrder(() => sortTabs(tabs, kind));
    const close = (kind: BulkClose) => () => void closeTabs(targets(kind), kind === "others" || kind === "folder" ? tabId : undefined);
    return [
      { label: "Schließen", shortcut: `${primary}+W`, action: () => void closeTab(tabId) },
      { label: "Andere schließen", disabled: targets("others").length === 0, action: close("others") },
      { label: "Rechts schließen", disabled: targets("right").length === 0, action: close("right") },
      { label: "Links schließen", disabled: targets("left").length === 0, action: close("left") },
      { label: "Alle schließen", action: close("all") },
      { label: "Gespeicherte schließen", disabled: targets("saved").length === 0, title: "Schließt nur Tabs ohne ungespeicherte Änderungen", action: close("saved") },
      {
        label: "Weitere schließen",
        children: [
          { label: extension ? `Alle .${extension}-Tabs schließen` : "Alle Tabs ohne Endung schließen", disabled: targets("extension").length === 0, action: close("extension") },
          { label: "Andere Tabs aus diesem Ordner schließen", disabled: targets("folder").length === 0, title: "Nur genau dieser Ordner, ohne Unterordner", action: close("folder") },
        ],
      },
      { separator: true },
      { label: tab.pinned ? "Loslösen" : "Anheften", action: () => applyTabOrder(() => setTabPinned(tabs, tabId, !tab.pinned)) },
      { label: "Duplizieren", disabled: true, title: "Zwei Ansichten derselben Datei würden konkurrierende Fassungen erzeugen; P-Viewer bietet das daher noch nicht an." },
      { label: "In neues Fenster verschieben", disabled: !desktop || tabs.length < 2, action: () => void transferTab(tabId, true, false) },
      { label: "Geschlossenen Tab wieder öffnen", shortcut: `${primary}+Umschalt+T`, disabled: closedTabCount === 0, action: () => void reopenClosedTab() },
      { separator: true },
      {
        label: "Verschieben",
        children: [
          { label: "Nach links", disabled: groupIndex <= 0, action: move("left") },
          { label: "Nach rechts", disabled: groupIndex >= group.length - 1, action: move("right") },
          { label: "An den Anfang", disabled: groupIndex <= 0, action: move("start") },
          { label: "Ans Ende", disabled: groupIndex >= group.length - 1, action: move("end") },
        ],
      },
      {
        label: "Tabs sortieren",
        disabled: tabs.length < 2,
        children: [
          { label: "Nach Name", action: sort("name") },
          { label: "Nach Dateityp", action: sort("type") },
          { label: "Nach Ordner", action: sort("folder") },
        ],
      },
      {
        label: "Kopieren",
        children: [
          { label: "Dateiname", action: () => void copyText(tab.document.name) },
          { label: "Vollständiger Pfad", disabled: !hasFile, action: () => void copyText(tab.document.path) },
          { label: "Relativer Pfad", disabled: true, title: "P-Viewer kennt keinen Projektordner, zu dem ein relativer Pfad eindeutig wäre." },
        ],
      },
      { separator: true },
      { label: fileManagerName, disabled: !hasFile || !desktop, action: () => void revealInFileManager(tab.document.path) },
      { label: "Terminal hier öffnen", disabled: !hasFile || !desktop, action: () => void openTerminalAt(tab.document.path) },
      { label: "Neu laden", disabled: !hasFile || !desktop || index < 0, action: () => void reloadTab(tabId) },
    ];
  }

  // ---------------------------------------------------------------------------
  // Saving and editing
  // ---------------------------------------------------------------------------

  function validateSavePath(tabId: string, path: string): void {
    const conflict = findTabByPath(tabs, path, tabId);
    if (!conflict) return;
    throw new Error(
      `„${conflict.document.name}“ ist bereits in einem anderen Tab geöffnet. Wähle einen anderen Speicherort.`,
    );
  }

  async function saveCurrent(forceDialog = false): Promise<boolean> {
    if (busy || activeTab!.restore) return false;
    const tabId = activeTab!.id;
    const source = activeTab!.document;
    busy = true;
    errorMessage = "";
    try {
      const saved = await saveDocument(source, forceDialog, (path) =>
        validateSavePath(tabId, path),
      );
      if (!saved) return false;

      const target = tabs.find((tab) => tab.id === tabId);
      if (target) {
        target.document = saved;
        target.notice = undefined;
      }
      return true;
    } catch (error) {
      errorMessage = messageFrom(error);
      return false;
    } finally {
      busy = false;
    }
  }

  async function saveAllDirtyDocuments(): Promise<boolean> {
    if (busy) return false;
    const dirtyTabIds = tabs
      .filter((tab) => tabIsDirty(tab))
      .map((tab) => tab.id);
    busy = true;
    errorMessage = "";
    try {
      for (const tabId of dirtyTabIds) {
        if (!(await saveTabForClose(tabId))) {
          if (tabs.some((tab) => tab.id === tabId)) activeTabId = tabId;
          return false;
        }
      }
      return true;
    } catch (error) {
      errorMessage = messageFrom(error);
      return false;
    } finally {
      busy = false;
    }
  }

  async function reopenEncoding(encoding: string): Promise<void> {
    if (busy || installingUpdate || document.untitled || activeTab!.restore) return;
    const tab = activeTab!;
    busy = true;
    errorMessage = "";
    try {
      if (documentIsDirty(tab.document) && !await confirmDiscardChanges(tab.document.name)) return;
      const reopened = await openDocumentPath(tab.document.path, encoding || undefined);
      editorSessions.delete(sessionKey(tab));
      tab.document = reopened;
      tab.revision += 1;
    } catch (error) { errorMessage = messageFrom(error); }
    finally { busy = false; }
  }

  function updateContent(content: string): void {
    document.content = content;
  }

  function updateFileType(fileName: string): void {
    if (fileName === document.name || binaryDocument || activeTab!.restore) return;
    document.name = fileName;
    document.fileType = detectFileType(fileName);
    document.metadataDirty = true;
    if (!document.untitled) {
      document.path = "";
      document.untitled = true;
    }
    errorMessage = "";
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

  // ---------------------------------------------------------------------------
  // Split view divider: per-tab ratio, never below 20 % for either side
  // ---------------------------------------------------------------------------

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
      activeTab!.splitRatio = clampSplitRatio((moveEvent.clientX - bounds.left) / bounds.width);
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
    if (event.key === "ArrowLeft") activeTab!.splitRatio = clampSplitRatio(splitRatio - step);
    else if (event.key === "ArrowRight") activeTab!.splitRatio = clampSplitRatio(splitRatio + step);
    else if (event.key === "Home") activeTab!.splitRatio = 0.2;
    else if (event.key === "End") activeTab!.splitRatio = 0.8;
    else if (event.key === "Enter") activeTab!.splitRatio = 0.5;
    else return;
    event.preventDefault();
  }

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------

  function handleShortcut(event: KeyboardEvent): void {
    if (event.defaultPrevented || settingsOpen || updateOpen || busy || installingUpdate || window.document.querySelector("dialog[open]")) return;

    // Direct tab selection: Alt+1…9 (Cmd+1…9 on macOS, where Option types characters).
    // Numpad digits are left alone so Alt codes keep working.
    const digit = /^Digit([1-9])$/.exec(event.code)?.[1];
    const tabChord = isMac ? event.metaKey && !event.ctrlKey && !event.altKey : event.altKey && !event.ctrlKey && !event.metaKey;
    if (digit && tabChord && !event.shiftKey) {
      event.preventDefault();
      const target = digit === "9" ? tabs[tabs.length - 1] : tabs[Number(digit) - 1];
      if (target) activateTab(target.id);
      return;
    }

    const primary = event.ctrlKey || event.metaKey;
    if (!primary) return;

    const key = event.key.toLowerCase();
    if (key === "tab") {
      event.preventDefault();
      cycleTab(event.shiftKey ? -1 : 1);
    } else if (key === "w" && !event.shiftKey) {
      event.preventDefault();
      void closeTab(activeTabId);
    } else if (key === "t" && event.shiftKey) {
      event.preventDefault();
      void reopenClosedTab();
    } else if (key === "n" && event.shiftKey) {
      event.preventDefault();
      void openNewWindow();
    } else if (key === "n") {
      event.preventDefault();
      newDocument();
    } else if (key === "o") {
      event.preventDefault();
      void openDocument();
    } else if (key === "s") {
      event.preventDefault();
      if (!binaryDocument) void saveCurrent(event.shiftKey);
    } else if (key === "e" && event.shiftKey) {
      event.preventDefault();
      setMode("edit");
    } else if (key === "r" && event.shiftKey) {
      event.preventDefault();
      setMode("view");
    } else if (key === "p" && event.shiftKey) {
      event.preventDefault();
      setMode("split");
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
    if (dirtyCount === 0) return;
    event.preventDefault();
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} KiB`;
    return `${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 2 })} MiB`;
  }

  function lineEndingLabel(value: string): string {
    if (value === "crlf") return "CRLF";
    if (value === "cr") return "CR";
    return "LF";
  }
</script>

<svelte:head>
  <title>{document.name} — P-Viewer</title>
</svelte:head>

<svelte:window onkeydown={handleShortcut} onbeforeunload={handleBeforeUnload} />

<main
  class="app-shell"
  class:light={activeTheme === "light"}
  style={`--icon-scale: ${settings.iconSize / DEFAULT_SETTINGS.iconSize}; grid-template-rows: 48px 46px 34px ${"auto ".repeat(extraRows)}minmax(0, 1fr) 28px`}
  aria-busy={busy}
>
  <header class="titlebar">
    <div class="brand-mark" aria-hidden="true">P</div>
    <strong>P-Viewer</strong>
    <div class="document-title" title={document.path || document.name}>
      <FileText size={15} aria-hidden="true" />
      <span>{document.name}</span>
      {#if dirty}<span class="dirty-dot" title="Ungespeicherte Änderungen">●</span>{/if}
    </div>
    <span class="version">v{APP_VERSION}</span>
  </header>

  <nav class="toolbar" aria-label="Dokumentaktionen">
    <div class="tool-group">
      <button class="icon-button" title="Neu (Strg/Cmd+N)" onclick={newDocument} disabled={busy}>
        <FilePlus2 size={17} aria-hidden="true" />
        <span class="sr-only">Neues Dokument</span>
      </button>
      <button class="icon-button" title="Neues Fenster (Strg/Cmd+Umschalt+N)" onclick={() => void openNewWindow()} disabled={busy}>
        <AppWindow size={17} aria-hidden="true" />
        <span class="sr-only">Neues Fenster</span>
      </button>
      <button class="icon-button" title="Öffnen (Strg/Cmd+O)" onclick={() => void openDocument()} disabled={busy}>
        <FolderOpen size={17} aria-hidden="true" />
        <span class="sr-only">Dokument öffnen</span>
      </button>
      <button class="icon-button" title="Speichern (Strg/Cmd+S)" onclick={() => void saveCurrent()} disabled={busy || binaryDocument || restoring || (!dirty && !document.untitled)}>
        <Save size={17} aria-hidden="true" />
        <span class="sr-only">Dokument speichern</span>
      </button>
      <button class="icon-button" title={binaryDocument ? "Bilder und PDF werden nur angezeigt" : "Speichern unter (Strg/Cmd+Umschalt+S)"} onclick={() => void saveCurrent(true)} disabled={busy || binaryDocument || restoring}>
        <FileOutput size={17} aria-hidden="true" />
        <span class="sr-only">Dokument speichern unter</span>
      </button>
    </div>

    <div class="mode-switch" aria-label="Ansichtsmodus">
      <button class:active={mode === "edit" && !binaryDocument} aria-pressed={mode === "edit" && !binaryDocument} onclick={() => setMode("edit")} title="Bearbeiten (Strg/Cmd+Umschalt+E)" disabled={binaryDocument}>
        <Pencil size={15} aria-hidden="true" />
        <span>Edit</span>
      </button>
      <button class:active={mode === "view" || binaryDocument} aria-pressed={mode === "view" || binaryDocument} onclick={() => setMode("view")} title="Ansehen (Strg/Cmd+Umschalt+R)" disabled={binaryDocument}>
        <Eye size={15} aria-hidden="true" />
        <span>View</span>
      </button>
      <button class:active={mode === "split" && !binaryDocument} aria-pressed={mode === "split" && !binaryDocument} onclick={() => setMode("split")} title="Geteilt (Strg/Cmd+Umschalt+P)" disabled={binaryDocument}>
        <Columns2 size={15} aria-hidden="true" />
        <span>Split</span>
      </button>
    </div>

    <button
      class="search-button"
      class:active={Boolean(searchMenu)}
      aria-haspopup="menu"
      aria-expanded={Boolean(searchMenu)}
      title="Suchen und Ersetzen (Strg/Cmd+F, Strg+H)"
      disabled={!searchAvailable}
      onclick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        searchMenu = searchMenu ? null : { x: rect.left, y: rect.bottom + 4 };
      }}
    >
      <Search size={14} aria-hidden="true" />
      <span>Suchen</span>
      <ChevronDown size={11} aria-hidden="true" />
    </button>

    {#if syncAvailable}
      <button
        class="sync-toggle"
        class:active={effectiveSyncMode !== "off"}
        aria-pressed={effectiveSyncMode !== "off"}
        title={effectiveSyncMode === "off" ? "Scroll-Synchronisation für diesen Tab einschalten" : "Scroll-Synchronisation für diesen Tab ausschalten"}
        onclick={togglePreviewSync}
      >
        <ArrowDownUp size={14} aria-hidden="true" />
        <span>Sync {effectiveSyncMode === "off" ? "aus" : "an"}</span>
      </button>
    {/if}

    <FileTypeSelector
      fileName={document.name}
      disabled={busy || binaryDocument || restoring}
      onChange={updateFileType}
    />
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

  <DocumentTabs
    tabs={tabItems}
    activeId={activeTabId}
    disabled={busy}
    onActivate={activateTab}
    onClose={(tabId) => void closeTab(tabId)}
    onNew={newDocument}
    onReorder={reorderTab}
    onDetach={(tabId, point) => void detachTab(tabId, point)}
    onContextMenu={openTabContextMenu}
  />

  {#if errorMessage}
    <div class="error-banner" role="alert">
      <span>{errorMessage}</span>
      <button aria-label="Fehlermeldung schließen" onclick={() => (errorMessage = "")}>×</button>
    </div>
  {/if}

  {#if activeTab?.notice}
    {@const tab = activeTab}
    <div class="notice-banner" role="status">
      <TriangleAlert size={14} aria-hidden="true" />
      {#if tab.notice?.kind === "external-change"}
        <span>„{tab.document.name}“ wurde seit der letzten Sitzung außerhalb von P-Viewer geändert. Angezeigt werden deine wiederhergestellten, ungespeicherten Änderungen.</span>
        <button onclick={() => keepRecoveredVersion(tab)}>Wiederhergestellte Version behalten</button>
        <button onclick={() => useDiskVersion(tab)}>Datenträgerversion verwenden</button>
      {:else}
        <span>Die Datei „{tab.document.name}“ wurde nicht gefunden. Deine ungespeicherten Änderungen wurden wiederhergestellt – mit „Speichern unter“ sichern.</span>
        <button onclick={() => (tab.notice = undefined)}>Ausblenden</button>
      {/if}
    </div>
  {/if}

  <div
    id="document-workspace"
    bind:this={workspace}
    class:split={mode === "split" && !binaryDocument && !restoring}
    class:resizing={resizingSplit}
    class="workspace"
    style={mode === "split" && !binaryDocument && !restoring ? `grid-template-columns: minmax(0, ${splitRatio}fr) 1px minmax(0, ${1 - splitRatio}fr)` : undefined}
    role="tabpanel"
    aria-label={document.name}
  >
    {#if activeTab?.restore}
      {@const restore = activeTab.restore}
      <div class="restore-panel" class:light={activeTheme === "light"}>
        {#if restore.state === "error"}
          <TriangleAlert size={22} aria-hidden="true" />
          <strong>{restore.unavailable ? "Netzwerkdatei nicht erreichbar" : "Datei konnte nicht geöffnet werden"}</strong>
          <span class="restore-path">{document.path}</span>
          <small>{restore.error}</small>
          <div class="restore-actions">
            <button onclick={() => retryRestoredTab(activeTab!.id)}>Erneut versuchen</button>
            <button onclick={() => void locateRestoredTab(activeTab!.id)} disabled={!desktop || busy}>Datei suchen …</button>
            <button onclick={() => void closeTab(activeTab!.id)}>Tab schließen</button>
          </div>
        {:else}
          <LoaderCircle class="spinning" size={20} aria-hidden="true" />
          <span>„{document.name}“ wird geladen …</span>
        {/if}
      </div>
    {:else if binaryDocument}
      <!-- Images and PDF have no editable text: the viewer takes the whole workspace. -->
      <div class="pane viewer-pane" aria-label="Betrachter">
        {#key `${activeTabId}:${activeTab!.revision}`}
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
          scrollMemory={previewMemory(activeTabId)}
          onOpenPath={(path) => void openExternalDocuments([path])}
        />
        {/key}
      </div>
    {:else}
    <div class:hidden={mode === "view"} class="pane editor-pane" aria-label="Editor">
      {#key `${activeTabId}:${activeTab!.revision}`}
        <EditorPane
          value={document.content}
          session={editorSession(`${activeTabId}:${activeTab!.revision}`)}
          fileName={document.name}
          readOnly={busy || installingUpdate}
          theme={activeTheme}
          fontSize={settings.editorFontSize}
          wordWrap={settings.wordWrap && (document.fileType.kind === "text" || document.fileType.kind === "markdown")}
          spellcheck={settings.spellcheck && (document.fileType.kind === "text" || document.fileType.kind === "markdown")}
          formatting={formattingDialect}
          documentPath={document.path}
          sync={previewSync}
          onChange={updateContent}
          onCursorChange={updateCursor}
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
        ondblclick={() => (activeTab!.splitRatio = 0.5)}
        onkeydown={handleSplitKey}
      ></div>
    {/if}

    {#if mode === "view" || mode === "split"}
      <div class="pane viewer-pane" aria-label="Leseansicht">
        {#key `${activeTabId}:${activeTab!.revision}`}
        <PreviewPane
          content={document.content}
          fileName={document.name}
          path={document.path}
          fileType={document.fileType}
          theme={activeTheme}
          editorFontSize={settings.editorFontSize}
          previewFontSize={settings.previewFontSize}
          wordWrap={settings.wordWrap}
          scrollMemory={previewMemory(activeTabId)}
          sync={previewSync}
          onOpenPath={(path) => void openExternalDocuments([path])}
        />
        {/key}
      </div>
    {/if}
    {/if}
  </div>

  {#if dragActive}
    <div class="drop-overlay" aria-hidden="true">
      <FolderOpen size={34} strokeWidth={1.5} />
      <strong>Datei hier öffnen</strong>
    </div>
  {/if}

  <footer class="statusbar">
    {#if binaryDocument}
      <span>{document.fileType.label}</span>
      <span>{formatBytes(document.size)}</span>
      <span>{document.binary?.mime}</span>
      <span>Schreibgeschützt</span>
    {:else}
    <span>{lineCount.toLocaleString("de-DE")} Zeilen</span>
    <span>{wordCount.toLocaleString("de-DE")} Wörter</span>
    <span>Ln {cursorLine}, Sp {cursorColumn}</span>
    {#if selectedCharacters > 0}<span>{selectedCharacters} ausgewählt</span>{/if}
    <label class="encoding-control" title="Datei mit anderer Kodierung neu lesen (keine Konvertierung)">
      <span class="sr-only">Mit Kodierung neu öffnen</span>
      <select disabled={document.untitled || busy || installingUpdate || restoring} value={document.encoding} onchange={(event) => { const selected = event.currentTarget.value; event.currentTarget.value = document.encoding; void reopenEncoding(selected); }}>
        {#each [...new Set([document.encoding, "UTF-8", "UTF-16LE", "UTF-16BE", "windows-1252", "windows-1251", "Shift_JIS", "GB18030", "EUC-KR", "ISO-8859-15"])] as encoding}
          <option value={encoding}>{encoding}</option>
        {/each}
        <option value="">Automatisch erkennen</option>
      </select>{document.hasBom ? " BOM" : ""}
    </label>
    <span>{lineEndingLabel(document.lineEnding)}</span>
    {#if document.readOnly}<span class="warning">Schreibgeschützte Datei</span>{/if}
    {#if document.lossy}<span class="warning">Kodierung mit Ersatzzeichen</span>{/if}
    {/if}
    {#if settings.debugMode}
      <span class="debug-badge" title={runtimeInfo.userAgent}>DEBUG v{APP_VERSION}</span>
      <span title={runtimeInfo.userAgent}>{runtimeInfo.platform} · {runtimeInfo.engine}</span>
      <span>{document.fileType.kind} · {document.content.length.toLocaleString("de-DE")} Zeichen · {tabs.length} Tabs</span>
    {/if}
    <span class="path" title={document.path}>{document.path || "Noch nicht gespeichert"}</span>
  </footer>

  {#if toast}
    <div class="toast" role="status">
      <span>{toast.message}</span>
      <button onclick={() => void reopenClosedTab(toast?.count ?? 1)}>Rückgängig</button>
      <button class="toast-close" aria-label="Hinweis schließen" onclick={() => (toast = null)}>×</button>
    </div>
  {/if}

  {#if contextMenu}
    <ContextMenu
      items={tabMenu(contextMenu.tabId)}
      x={contextMenu.x}
      y={contextMenu.y}
      label="Tab-Aktionen"
      light={activeTheme === "light"}
      onClose={() => (contextMenu = null)}
    />
  {/if}

  {#if searchMenu}
    <ContextMenu
      items={searchMenuEntries()}
      x={searchMenu.x}
      y={searchMenu.y}
      label="Suchen und Ersetzen"
      light={activeTheme === "light"}
      onClose={() => (searchMenu = null)}
    />
  {/if}

  {#if closeDialog}
    <CloseTabsDialog request={closeDialog} light={activeTheme === "light"} />
  {/if}

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
      hasUnsavedChanges={dirtyCount > 0}
      unsavedCount={dirtyCount}
      onSave={saveAllDirtyDocuments}
      onInstalling={(value) => (installingUpdate = value)}
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
    --mono: var(--font-mono);
  }

  .encoding-control select { max-width: 125px; border: 0; color: inherit; background: var(--chrome); font: inherit; cursor: pointer; }

  .app-shell {
    display: grid;
    grid-template-rows: 48px 46px 34px minmax(0, 1fr) 28px;
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

  /* Only UI icons scale with the icon size; KaTeX and document SVGs must stay untouched. */
  .app-shell :global(svg.lucide) {
    transform: scale(var(--icon-scale));
    transform-origin: center;
    transition: transform 120ms ease;
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

  .search-button {
    display: flex;
    height: 30px;
    align-items: center;
    gap: 6px;
    margin-left: -4px;
    padding: 0 9px 0 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-muted);
    background: var(--inset);
    font-size: 11px;
  }

  .search-button:hover:not(:disabled),
  .search-button.active {
    color: var(--text);
  }

  .sync-toggle {
    display: flex;
    height: 30px;
    align-items: center;
    gap: 6px;
    margin-left: -4px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-muted);
    background: var(--inset);
    font-size: 11px;
  }

  .sync-toggle:hover,
  .sync-toggle.active {
    color: var(--text);
  }

  .sync-toggle.active {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
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

  /* A wider invisible grab area around the 1 px line. */
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
  .notice-banner button,
  .toast button:not(.toast-close) {
    height: 27px;
    padding: 0 10px;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    color: var(--text);
    background: var(--surface-raised);
    font-size: 11px;
  }

  .restore-actions button:hover:not(:disabled),
  .notice-banner button:hover,
  .toast button:not(.toast-close):hover {
    background: var(--surface-hover);
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
    flex: 1 1 320px;
  }

  .toast {
    position: fixed;
    z-index: 40;
    right: 14px;
    bottom: 40px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 8px 7px 12px;
    border: 1px solid var(--border-strong);
    border-radius: 7px;
    color: var(--text);
    background: var(--surface-raised);
    box-shadow: 0 6px 20px rgb(0 0 0 / 30%);
    font-size: 11px;
  }

  .toast-close {
    padding: 0 4px;
    color: var(--text-muted);
    background: transparent;
    font-size: 16px;
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

  .debug-badge {
    padding: 2px 5px;
    border: 1px solid #5367d2;
    border-radius: 4px;
    color: #c6ceff;
    background: #26305f;
    font-weight: 750;
    letter-spacing: 0.04em;
  }

  .light .debug-badge {
    border-color: #8290d8;
    color: #33428c;
    background: #e5e9ff;
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
    .search-button span,
    .sync-toggle span,
    .statusbar span:nth-child(2) {
      display: none;
    }

    .mode-switch button {
      padding: 0 8px;
    }
  }
</style>
