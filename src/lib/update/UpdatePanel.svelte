<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { confirm } from "@tauri-apps/plugin-dialog";
  import { relaunch } from "@tauri-apps/plugin-process";
  import {
    AlertTriangle,
    CheckCircle2,
    Download,
    RefreshCw,
    Save,
    ShieldCheck,
    X,
  } from "@lucide/svelte";

  interface UpdaterConfiguration {
    configured: boolean;
    currentVersion: string;
    endpointHost?: string | null;
    error?: string | null;
  }

  interface UpdateCheckResult {
    configured: boolean;
    currentVersion: string;
    available: boolean;
    version?: string | null;
    date?: string | null;
    body?: string | null;
  }

  interface UpdateProgress {
    downloaded: number;
    total?: number | null;
    finished: boolean;
  }

  interface Props {
    activeTheme: "dark" | "light";
    hasUnsavedChanges: boolean;
    unsavedCount?: number;
    onSave: () => Promise<boolean>;
    onClose: () => void;
  }

  let {
    activeTheme,
    hasUnsavedChanges,
    unsavedCount = hasUnsavedChanges ? 1 : 0,
    onSave,
    onClose,
  }: Props = $props();

  let configuration = $state<UpdaterConfiguration | null>(null);
  let checkResult = $state<UpdateCheckResult | null>(null);
  let checking = $state(true);
  let installing = $state(false);
  let progress = $state<UpdateProgress | null>(null);
  let errorMessage = $state("");

  const progressPercent = $derived(
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null,
  );

  onMount(() => {
    let unlisten: UnlistenFn | null = null;
    void listen<UpdateProgress>("p-viewer://update-progress", (event) => {
      progress = event.payload;
    }).then((cleanup) => {
      unlisten = cleanup;
    });
    void initialize();
    return () => unlisten?.();
  });

  async function initialize(): Promise<void> {
    checking = true;
    errorMessage = "";
    try {
      configuration = await invoke<UpdaterConfiguration>("updater_configuration");
      if (configuration.error) {
        errorMessage = configuration.error;
      } else if (configuration.configured) {
        await checkNow();
      }
    } catch (error) {
      errorMessage = messageFrom(error);
    } finally {
      checking = false;
    }
  }

  async function checkNow(): Promise<void> {
    checking = true;
    errorMessage = "";
    try {
      checkResult = await invoke<UpdateCheckResult>("check_for_update");
    } catch (error) {
      errorMessage = messageFrom(error);
    } finally {
      checking = false;
    }
  }

  async function installUpdate(): Promise<void> {
    if (installing || !checkResult?.available || hasUnsavedChanges) return;
    const accepted = await confirm(
      `P-Viewer ${checkResult.version ?? ""} wird signiert geprüft, installiert und die App anschließend neu gestartet.`,
      {
        title: "Update installieren?",
        kind: "info",
        okLabel: "Installieren",
        cancelLabel: "Abbrechen",
      },
    );
    if (!accepted) return;

    installing = true;
    progress = { downloaded: 0, total: null, finished: false };
    errorMessage = "";
    try {
      await invoke("download_and_install_update");
      await relaunch();
    } catch (error) {
      errorMessage = messageFrom(error);
      installing = false;
    }
  }

  async function saveBeforeUpdate(): Promise<void> {
    await onSave();
  }

  function messageFrom(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
  }

  function handleBackdrop(event: MouseEvent): void {
    if (!installing && event.target === event.currentTarget) onClose();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!installing && event.key === "Escape") onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="update-backdrop" role="presentation" onclick={handleBackdrop}>
  <div class:light={activeTheme === "light"} class="update-panel" role="dialog" aria-modal="true" aria-labelledby="update-title">
    <header>
      <div>
        <span class="eyebrow">SICHERE RELEASES</span>
        <h2 id="update-title">P-Viewer aktualisieren</h2>
      </div>
      <button class="close-button" aria-label="Update-Dialog schließen" onclick={onClose} disabled={installing}>
        <X size={18} aria-hidden="true" />
      </button>
    </header>

    <div class="update-content">
      <div class="version-card">
        <span>Installierte Version</span>
        <strong>v{configuration?.currentVersion ?? "…"}</strong>
      </div>

      {#if checking}
        <div class="state-card">
          <span class="spinner"></span>
          <strong>GitHub Releases werden geprüft …</strong>
          <small>Die Prüfung wurde durch das Öffnen dieses Dialogs ausgelöst.</small>
        </div>
      {:else if errorMessage}
        <div class="state-card update-error" role="alert">
          <AlertTriangle size={32} strokeWidth={1.4} aria-hidden="true" />
          <strong>Update-Prüfung fehlgeschlagen</strong>
          <p>{errorMessage}</p>
          {#if configuration?.configured}
            <button onclick={() => void checkNow()}><RefreshCw size={14} /> Erneut prüfen</button>
          {/if}
        </div>
      {:else if !configuration?.configured}
        <div class="state-card unconfigured">
          <ShieldCheck size={34} strokeWidth={1.4} aria-hidden="true" />
          <strong>Lokaler Entwicklungsbuild</strong>
          <p>
            Dieser Build ist absichtlich noch nicht mit einem Update-Kanal verbunden.
            Beim signierten GitHub-Release werden Endpunkt und öffentlicher Schlüssel
            während des Builds eingebettet.
          </p>
          <small>Ohne vollständige Signaturkonfiguration wird kein Netzwerk-Download gestartet.</small>
        </div>
      {:else if checkResult?.available}
        <div class="state-card available">
          <Download size={34} strokeWidth={1.4} aria-hidden="true" />
          <span class="available-label">UPDATE VERFÜGBAR</span>
          <strong>Version {checkResult.version}</strong>
          {#if checkResult.body}<pre>{checkResult.body}</pre>{/if}
          {#if hasUnsavedChanges}
            <div class="unsaved-note">
              <Save size={14} aria-hidden="true" />
              <span>
                {unsavedCount === 1
                  ? "Speichere das geänderte Dokument vor dem Neustart."
                  : `Speichere alle ${unsavedCount} geänderten Dokumente vor dem Neustart.`}
              </span>
              <button onclick={() => void saveBeforeUpdate()}>
                {unsavedCount === 1 ? "Jetzt speichern" : "Alle speichern"}
              </button>
            </div>
          {/if}
          <button class="install-button" onclick={() => void installUpdate()} disabled={hasUnsavedChanges || installing}>
            {#if installing}<span class="spinner small"></span>{:else}<Download size={15} aria-hidden="true" />{/if}
            {installing ? "Update wird installiert …" : "Signiert laden und installieren"}
          </button>
        </div>
      {:else}
        <div class="state-card current">
          <CheckCircle2 size={36} strokeWidth={1.4} aria-hidden="true" />
          <strong>P-Viewer ist aktuell</strong>
          <p>Für Version {checkResult?.currentVersion ?? configuration.currentVersion} liegt kein neueres signiertes Release vor.</p>
          <button onclick={() => void checkNow()}><RefreshCw size={14} /> Erneut prüfen</button>
        </div>
      {/if}

      {#if installing && progress}
        <div class="progress-card" aria-live="polite">
          <div class="progress-copy">
            <strong>{progress.finished ? "Download geprüft" : "Update wird geladen"}</strong>
            <span>
              {formatBytes(progress.downloaded)}
              {#if progress.total} / {formatBytes(progress.total)}{/if}
            </span>
          </div>
          <div class:indeterminate={progressPercent === null} class="progress-track">
            <span style={`width: ${progressPercent ?? 35}%`}></span>
          </div>
        </div>
      {/if}

      <div class="security-note">
        <ShieldCheck size={17} aria-hidden="true" />
        <div>
          <strong>Signaturpflicht</strong>
          <span>Pakete werden vor der Installation mit dem eingebetteten öffentlichen Schlüssel verifiziert. Einstellungen liegen außerhalb des Installationsordners und bleiben erhalten.</span>
        </div>
      </div>
    </div>

    <footer>
      {#if configuration?.endpointHost}<span>Quelle: {configuration.endpointHost}</span>{:else}<span>GitHub-Release-Kanal noch nicht aktiviert</span>{/if}
      <button onclick={onClose} disabled={installing}>Schließen</button>
    </footer>
  </div>
</div>

<style>
  .update-backdrop {
    position: fixed;
    z-index: 55;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgb(4 6 10 / 58%);
    backdrop-filter: blur(3px);
  }

  .update-panel {
    display: grid;
    width: min(540px, calc(100vw - 32px));
    max-height: min(720px, calc(100vh - 32px));
    grid-template-rows: 72px minmax(0, 1fr) 52px;
    overflow: hidden;
    border: 1px solid #343945;
    border-radius: 11px;
    color: #e4e6ec;
    background: #181b21;
    box-shadow: 0 20px 70px rgb(0 0 0 / 48%);
    animation: enter 150ms ease-out;
  }

  @keyframes enter {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.985);
    }
  }

  header,
  footer {
    display: flex;
    align-items: center;
    padding: 0 18px;
    border-color: #30343e;
  }

  header {
    justify-content: space-between;
    border-bottom: 1px solid #30343e;
  }

  h2 {
    margin: 2px 0 0;
    font-size: 18px;
    letter-spacing: -0.025em;
  }

  .eyebrow,
  .available-label {
    color: #7f90e8;
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 0.14em;
  }

  button {
    border: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  button:disabled {
    cursor: default;
    opacity: 0.42;
  }

  .close-button {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border-radius: 6px;
    color: #9ba3b2;
    background: transparent;
  }

  .close-button:hover:not(:disabled) {
    color: #fff;
    background: #292e38;
  }

  .update-content {
    overflow: auto;
    padding: 16px 18px 24px;
  }

  .version-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border: 1px solid #303540;
    border-radius: 7px;
    color: #7f8796;
    background: #13161b;
    font-size: 10px;
  }

  .version-card strong {
    color: #d4d8e1;
    font-family: "Cascadia Code", Consolas, monospace;
    font-size: 11px;
  }

  .state-card {
    display: flex;
    min-height: 250px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 9px;
    padding: 28px;
    color: #798294;
    text-align: center;
  }

  .state-card > :global(svg) {
    color: #8494e8;
  }

  .state-card strong {
    color: #c8ccd5;
    font-size: 14px;
  }

  .state-card p {
    max-width: 430px;
    margin: 0;
    font-size: 10px;
    line-height: 1.65;
  }

  .state-card small {
    color: #626b7b;
    font-size: 8px;
  }

  .state-card > button,
  .unsaved-note button {
    display: inline-flex;
    height: 29px;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    padding: 0 10px;
    border-radius: 5px;
    color: #c9ced8;
    background: #292e38;
    font-size: 9px;
  }

  .state-card > button:hover:not(:disabled),
  .unsaved-note button:hover {
    color: #fff;
    background: #363c48;
  }

  .unconfigured > :global(svg) {
    color: #72bf9f;
  }

  .update-error > :global(svg) {
    color: #e08d92;
  }

  .available pre {
    width: 100%;
    max-height: 120px;
    margin: 4px 0;
    padding: 9px;
    overflow: auto;
    border: 1px solid #303540;
    border-radius: 6px;
    color: #aeb5c2;
    background: #111318;
    font-family: inherit;
    font-size: 9px;
    line-height: 1.55;
    text-align: left;
    white-space: pre-wrap;
  }

  .install-button {
    color: #fff !important;
    background: #5d70d8 !important;
  }

  .install-button:hover:not(:disabled) {
    background: #6d7fe1 !important;
  }

  .unsaved-note {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 7px;
    padding: 8px;
    border: 1px solid #62593b;
    border-radius: 6px;
    color: #d5bf7c;
    background: #282419;
    font-size: 9px;
  }

  .unsaved-note button {
    height: 24px;
    margin: 0 0 0 auto;
  }

  .progress-card {
    margin-top: 12px;
    padding: 11px;
    border: 1px solid #343a47;
    border-radius: 7px;
    background: #13161b;
  }

  .progress-copy {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    color: #8992a2;
    font-size: 9px;
  }

  .progress-copy strong {
    color: #cbd0d9;
  }

  .progress-track {
    height: 5px;
    overflow: hidden;
    border-radius: 3px;
    background: #2e333d;
  }

  .progress-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: #7183e7;
    transition: width 120ms ease;
  }

  .progress-track.indeterminate span {
    animation: progress 1.1s ease-in-out infinite alternate;
  }

  @keyframes progress {
    from { transform: translateX(-70%); }
    to { transform: translateX(220%); }
  }

  .security-note {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    margin-top: 10px;
    padding: 11px;
    border: 1px solid #2d4e44;
    border-radius: 7px;
    color: #7caa99;
    background: #15231f;
  }

  .security-note div {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .security-note strong {
    color: #9bcbb9;
    font-size: 9px;
  }

  .security-note span {
    font-size: 8px;
    line-height: 1.45;
  }

  footer {
    justify-content: space-between;
    border-top: 1px solid #30343e;
    color: #6f7888;
    font-size: 8px;
  }

  footer button {
    height: 29px;
    padding: 0 10px;
    border-radius: 5px;
    color: #c7ccd5;
    background: #292e38;
    font-size: 9px;
  }

  .spinner {
    width: 22px;
    height: 22px;
    border: 2px solid #4b5260;
    border-top-color: #8796ed;
    border-radius: 50%;
    animation: spin 700ms linear infinite;
  }

  .spinner.small {
    width: 13px;
    height: 13px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .update-panel.light {
    color: #252a34;
    border-color: #d5d8df;
    background: #fff;
  }

  .light header,
  .light footer {
    border-color: #dfe2e8;
  }

  .light h2,
  .light .state-card strong {
    color: #1d222c;
  }

  .light .version-card,
  .light .progress-card {
    border-color: #d9dce4;
    color: #656d7b;
    background: #f6f7f9;
  }

  .light .version-card strong {
    color: #303642;
  }

  .light .security-note {
    border-color: #bcdccc;
    color: #477462;
    background: #edf8f3;
  }
</style>
