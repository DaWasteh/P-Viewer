<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import {
    Bug,
    FileCog,
    LoaderCircle,
    Monitor,
    Moon,
    RotateCcw,
    SpellCheck,
    Sun,
    Type,
    WrapText,
    X,
  } from "@lucide/svelte";
  import {
    FILE_ASSOCIATION_GROUPS,
    FILE_ASSOCIATION_IDS,
  } from "$lib/files/associations";
  import type { AppSettings, ThemePreference } from "./settings";

  interface AssociationApplyResult {
    platform: string;
    selectedGroups: number;
    appliedTypes: number;
    requiresUserConfirmation: boolean;
    message: string;
  }

  interface Props {
    settings: AppSettings;
    activeTheme: "dark" | "light";
    onChange: (settings: AppSettings) => void;
    onClose: () => void;
    onReset: () => void;
  }

  let { settings, activeTheme, onChange, onClose, onReset }: Props = $props();
  let settingsPath = $state("Systemüblicher App-Datenordner");
  let associationSelectorOpen = $state(false);
  let applyingAssociations = $state(false);
  let associationMessage = $state("");
  let associationError = $state(false);

  const selectedAssociationCount = $derived(settings.defaultAppAssociations.length);

  onMount(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    void import("@tauri-apps/api/path")
      .then(({ appDataDir }) => appDataDir())
      .then((path) => {
        const separator = path.includes("\\") ? "\\" : "/";
        settingsPath = `${path}${path.endsWith("\\") || path.endsWith("/") ? "" : separator}settings.json`;
      })
      .catch(() => undefined);
  });

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    onChange({ ...settings, [key]: value });
  }

  function rangeValue(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value);
  }

  function updateAssociation(id: string, selected: boolean): void {
    const next = new Set(settings.defaultAppAssociations);
    if (selected) next.add(id);
    else next.delete(id);
    update(
      "defaultAppAssociations",
      FILE_ASSOCIATION_IDS.filter((associationId) => next.has(associationId)),
    );
    associationMessage = "";
  }

  function selectAllAssociations(selected: boolean): void {
    update("defaultAppAssociations", selected ? [...FILE_ASSOCIATION_IDS] : []);
    associationMessage = "";
  }

  async function applyAssociations(): Promise<void> {
    if (applyingAssociations || settings.defaultAppAssociations.length === 0) return;
    associationMessage = "";
    associationError = false;
    applyingAssociations = true;
    try {
      if (!("__TAURI_INTERNALS__" in window)) {
        throw new Error("Systemzuordnungen sind nur in der installierten Desktop-App verfügbar.");
      }
      const result = await invoke<AssociationApplyResult>(
        "apply_default_file_associations",
        { associationIds: settings.defaultAppAssociations },
      );
      associationMessage = result.message;
    } catch (error) {
      associationError = true;
      associationMessage = error instanceof Error ? error.message : String(error);
    } finally {
      applyingAssociations = false;
    }
  }

  function handleBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) onClose();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  const themes: Array<{
    id: ThemePreference;
    label: string;
    icon: typeof Moon;
  }> = [
    { id: "dark", label: "Dunkel", icon: Moon },
    { id: "light", label: "Hell", icon: Sun },
    { id: "system", label: "System", icon: Monitor },
  ];
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="settings-backdrop" role="presentation" onclick={handleBackdrop}>
  <div class:light={activeTheme === "light"} class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <header>
      <div>
        <span class="eyebrow">P-VIEWER</span>
        <h2 id="settings-title">Einstellungen</h2>
      </div>
      <button class="close-button" aria-label="Einstellungen schließen" title="Schließen (Esc)" onclick={onClose}>
        <X size={18} aria-hidden="true" />
      </button>
    </header>

    <div class="settings-scroll">
      <fieldset>
        <legend>Darstellung</legend>
        <p class="group-description">Dark Mode ist die Voreinstellung. Änderungen werden sofort angewendet.</p>
        <div class="theme-options">
          {#each themes as theme}
            <button
              class:active={settings.theme === theme.id}
              aria-pressed={settings.theme === theme.id}
              onclick={() => update("theme", theme.id)}
            >
              <theme.icon size={17} aria-hidden="true" />
              <span>{theme.label}</span>
            </button>
          {/each}
        </div>
      </fieldset>

      <fieldset>
        <legend>Größen</legend>
        <label class="range-setting">
          <span class="setting-label"><Type size={15} aria-hidden="true" /> Editor-Schrift</span>
          <input
            type="range"
            min="10"
            max="28"
            step="1"
            value={settings.editorFontSize}
            oninput={(event) => update("editorFontSize", rangeValue(event))}
          />
          <output>{settings.editorFontSize} px</output>
        </label>
        <label class="range-setting">
          <span class="setting-label"><Type size={17} aria-hidden="true" /> Vorschau-Schrift</span>
          <input
            type="range"
            min="12"
            max="32"
            step="1"
            value={settings.previewFontSize}
            oninput={(event) => update("previewFontSize", rangeValue(event))}
          />
          <output>{settings.previewFontSize} px</output>
        </label>
        <label class="range-setting">
          <span class="setting-label"><span class="icon-sample">◆</span> Symbolgröße</span>
          <input
            type="range"
            min="12"
            max="26"
            step="1"
            value={settings.iconSize}
            oninput={(event) => update("iconSize", rangeValue(event))}
          />
          <output>{settings.iconSize} px</output>
        </label>
      </fieldset>

      <fieldset>
        <legend>Editor</legend>
        <label class="toggle-setting">
          <span class="toggle-copy">
            <span class="setting-label"><WrapText size={16} aria-hidden="true" /> Zeilen umbrechen</span>
            <small>Lange Text- und Markdown-Zeilen an der Fensterbreite umbrechen.</small>
          </span>
          <input
            type="checkbox"
            checked={settings.wordWrap}
            onchange={(event) => update("wordWrap", event.currentTarget.checked)}
          />
          <span class="switch" aria-hidden="true"></span>
        </label>
        <label class="toggle-setting">
          <span class="toggle-copy">
            <span class="setting-label"><SpellCheck size={16} aria-hidden="true" /> Rechtschreibprüfung</span>
            <small>Für Text und Markdown die WebView-Rechtschreibprüfung verwenden.</small>
          </span>
          <input
            type="checkbox"
            checked={settings.spellcheck}
            onchange={(event) => update("spellcheck", event.currentTarget.checked)}
          />
          <span class="switch" aria-hidden="true"></span>
        </label>
      </fieldset>

      <fieldset>
        <legend>Diagnose</legend>
        <label class="toggle-setting">
          <span class="toggle-copy">
            <span class="setting-label"><Bug size={16} aria-hidden="true" /> Debug-Modus</span>
            <small>Persistente Laufzeitdetails einblenden und Zustandsänderungen in der WebView-Konsole protokollieren.</small>
          </span>
          <input
            type="checkbox"
            checked={settings.debugMode}
            onchange={(event) => update("debugMode", event.currentTarget.checked)}
          />
          <span class="switch" aria-hidden="true"></span>
        </label>
      </fieldset>

      <fieldset>
        <legend>Standardprogramme</legend>
        <p class="group-description">
          P-Viewer wird bei der Installation für alle unterstützten Endungen als mögliche App registriert.
          Wähle hier, welche Formatgruppen du als Systemstandard übernehmen möchtest.
        </p>
        <button
          class="association-toggle"
          aria-expanded={associationSelectorOpen}
          aria-controls="association-selector"
          onclick={() => (associationSelectorOpen = !associationSelectorOpen)}
        >
          <FileCog size={16} aria-hidden="true" />
          <span>Formate auswählen</span>
          <small>{selectedAssociationCount} von {FILE_ASSOCIATION_GROUPS.length}</small>
        </button>

        {#if associationSelectorOpen}
          <div id="association-selector" class="association-selector">
            <div class="association-actions">
              <strong>Unterstützte Formatgruppen</strong>
              <span>
                <button onclick={() => selectAllAssociations(true)}>Alle</button>
                <button onclick={() => selectAllAssociations(false)}>Keine</button>
              </span>
            </div>
            <div class="association-list" role="group" aria-label="Dateiformate für P-Viewer">
              {#each FILE_ASSOCIATION_GROUPS as association}
                <label>
                  <input
                    type="checkbox"
                    checked={settings.defaultAppAssociations.includes(association.id)}
                    onchange={(event) => updateAssociation(association.id, event.currentTarget.checked)}
                  />
                  <span>
                    <strong>{association.label}</strong>
                    <small>{association.extensions.map((extension) => `.${extension}`).join(", ")}</small>
                  </span>
                </label>
              {/each}
            </div>
            <button
              class="apply-associations"
              onclick={() => void applyAssociations()}
              disabled={applyingAssociations || selectedAssociationCount === 0}
            >
              {#if applyingAssociations}
                <LoaderCircle class="spinning" size={15} aria-hidden="true" />
              {:else}
                <FileCog size={15} aria-hidden="true" />
              {/if}
              {applyingAssociations ? "System wird geöffnet …" : "Ausgewählte als Standard festlegen"}
            </button>
            <small class="system-choice-note">
              Unter Windows öffnet P-Viewer direkt die geschützte Bestätigungsseite der App.
              Wähle dort P-Viewer bei den gewünschten Dateitypen aus; Windows erlaubt diese letzte
              Auswahl nicht in einem app-eigenen Dialog. Linux und macOS übernehmen die Gruppen direkt.
            </small>
          </div>
        {/if}

        {#if associationMessage}
          <p class:error={associationError} class="association-message" role={associationError ? "alert" : "status"}>
            {associationMessage}
          </p>
        {/if}
      </fieldset>

      <div class="storage-note">
        <strong>Automatisch gespeichert</strong>
        <span title={settingsPath}>{settingsPath}</span>
        <small>Die Datei liegt getrennt von der Installation und bleibt bei Updates erhalten.</small>
      </div>
    </div>

    <footer>
      <button class="reset-button" onclick={onReset}>
        <RotateCcw size={14} aria-hidden="true" /> Standard wiederherstellen
      </button>
      <button class="done-button" onclick={onClose}>Fertig</button>
    </footer>
  </div>
</div>

<style>
  .settings-backdrop {
    position: fixed;
    z-index: 50;
    inset: 0;
    display: flex;
    justify-content: flex-end;
    background: rgb(4 6 10 / 52%);
    -webkit-backdrop-filter: blur(2px);
    backdrop-filter: blur(2px);
  }

  .settings-panel {
    display: grid;
    width: min(440px, calc(100vw - 28px));
    height: 100%;
    grid-template-rows: 72px minmax(0, 1fr) 58px;
    color: #e4e6ec;
    background: #181b21;
    box-shadow: -12px 0 42px rgb(0 0 0 / 35%);
    animation: enter 160ms ease-out;
  }

  @keyframes enter {
    from {
      transform: translateX(24px);
      opacity: 0;
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

  .eyebrow {
    color: #7787df;
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 0.15em;
  }

  button {
    border: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
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

  .close-button:hover {
    color: #fff;
    background: #292e38;
  }

  .settings-scroll {
    overflow: auto;
    padding: 8px 18px 30px;
  }

  fieldset {
    margin: 0;
    padding: 20px 0;
    border: 0;
    border-bottom: 1px solid #2c3039;
  }

  legend {
    padding: 0;
    color: #f0f1f4;
    font-size: 12px;
    font-weight: 700;
  }

  .group-description {
    margin: 6px 0 13px;
    color: #7f8796;
    font-size: 10px;
    line-height: 1.5;
  }

  .theme-options {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 7px;
  }

  .theme-options button {
    display: flex;
    height: 58px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 5px;
    border: 1px solid #333844;
    border-radius: 7px;
    color: #949cab;
    background: #13161b;
    font-size: 10px;
  }

  .theme-options button:hover {
    border-color: #4d566d;
    color: #d9dce4;
  }

  .theme-options button.active {
    border-color: #697ce2;
    color: #f1f2f9;
    background: #222943;
    box-shadow: inset 0 0 0 1px rgb(105 124 226 / 25%);
  }

  .range-setting {
    display: grid;
    min-height: 43px;
    align-items: center;
    grid-template-columns: 130px minmax(80px, 1fr) 48px;
    gap: 9px;
  }

  .setting-label {
    display: flex;
    align-items: center;
    gap: 7px;
    color: #bdc2cc;
    font-size: 10px;
  }

  .icon-sample {
    width: 15px;
    color: #8796ed;
    text-align: center;
  }

  input[type="range"] {
    width: 100%;
    accent-color: #7183e7;
  }

  output {
    color: #818a9a;
    font-family: var(--font-mono);
    font-size: 9px;
    text-align: right;
  }

  .toggle-setting {
    position: relative;
    display: flex;
    min-height: 56px;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    cursor: pointer;
  }

  .toggle-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .toggle-copy small {
    max-width: 305px;
    color: #747d8d;
    font-size: 9px;
    line-height: 1.4;
  }

  .toggle-setting input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .switch {
    position: relative;
    flex: 0 0 34px;
    width: 34px;
    height: 19px;
    border-radius: 10px;
    background: #373c47;
    transition: background 120ms ease;
  }

  .switch::after {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: #c4c8d0;
    content: "";
    transition: transform 120ms ease;
  }

  .toggle-setting input:checked + .switch {
    background: #5f72d8;
  }

  .toggle-setting input:checked + .switch::after {
    background: #fff;
    transform: translateX(15px);
  }

  .toggle-setting input:focus-visible + .switch {
    outline: 2px solid #8796ed;
    outline-offset: 2px;
  }

  .association-toggle {
    display: grid;
    width: 100%;
    min-height: 40px;
    align-items: center;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
    padding: 0 10px;
    border: 1px solid #343a47;
    border-radius: 7px;
    color: #c8cdd7;
    background: #13161b;
    text-align: left;
  }

  .association-toggle:hover {
    border-color: #4c566d;
    background: #191d24;
  }

  .association-toggle small {
    color: #778092;
    font-size: 9px;
  }

  .association-selector {
    margin-top: 8px;
    padding: 9px;
    border: 1px solid #303641;
    border-radius: 7px;
    background: #111419;
  }

  .association-actions {
    display: flex;
    min-height: 28px;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: #aeb5c2;
    font-size: 9px;
  }

  .association-actions span {
    display: flex;
    gap: 3px;
  }

  .association-actions button {
    padding: 4px 6px;
    border-radius: 4px;
    color: #8e98aa;
    background: transparent;
    font-size: 9px;
  }

  .association-actions button:hover {
    color: #e5e8ef;
    background: #252a34;
  }

  .association-list {
    max-height: 235px;
    overflow: auto;
    border-block: 1px solid #292e38;
  }

  .association-list label {
    display: grid;
    min-height: 38px;
    align-items: center;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px;
    padding: 5px 4px;
    border-bottom: 1px solid #242932;
    cursor: pointer;
  }

  .association-list label:last-child {
    border-bottom: 0;
  }

  .association-list label:hover {
    background: #181c23;
  }

  .association-list input {
    width: 14px;
    height: 14px;
    margin: 0;
    accent-color: #7183e7;
  }

  .association-list label > span {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .association-list strong {
    color: #bdc3cf;
    font-size: 9px;
    font-weight: 650;
  }

  .association-list small {
    overflow: hidden;
    color: #6f7889;
    font-family: var(--font-mono);
    font-size: 8px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .apply-associations {
    display: flex;
    width: 100%;
    height: 32px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 9px;
    border-radius: 6px;
    color: #fff;
    background: #5c6fd7;
    font-size: 9px;
  }

  .apply-associations:hover:not(:disabled) {
    background: #6b7edf;
  }

  .apply-associations:disabled {
    cursor: default;
    opacity: 0.45;
  }

  .system-choice-note {
    display: block;
    margin-top: 7px;
    color: #697283;
    font-size: 8px;
    line-height: 1.45;
  }

  .association-message {
    margin: 8px 0 0;
    padding: 7px 8px;
    border: 1px solid #315c51;
    border-radius: 5px;
    color: #8ed1b8;
    background: #14231f;
    font-size: 9px;
    line-height: 1.45;
  }

  .association-message.error {
    border-color: #6f4047;
    color: #e6a2a8;
    background: #291a1e;
  }

  :global(.spinning) {
    animation: spin 700ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .storage-note {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 18px;
    padding: 12px;
    border: 1px solid #303641;
    border-radius: 7px;
    color: #798292;
    background: #13161b;
  }

  .storage-note strong {
    color: #aeb5c2;
    font-size: 10px;
  }

  .storage-note span {
    overflow: hidden;
    font-family: var(--font-mono);
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .storage-note small {
    font-size: 8px;
  }

  footer {
    justify-content: space-between;
    border-top: 1px solid #30343e;
  }

  footer button {
    display: inline-flex;
    height: 31px;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border-radius: 6px;
    font-size: 10px;
  }

  .reset-button {
    color: #949cab;
    background: transparent;
  }

  .reset-button:hover {
    color: #e3e5ea;
    background: #272b34;
  }

  .done-button {
    color: #fff;
    background: #5c6fd7;
  }

  .done-button:hover {
    background: #6d7fe1;
  }

  .settings-panel.light {
    color: #262b35;
    background: #fff;
  }

  .light header,
  .light footer,
  .light fieldset {
    border-color: #dfe2e8;
  }

  .light h2,
  .light legend {
    color: #171b23;
  }

  .light .theme-options button,
  .light .association-toggle,
  .light .association-selector,
  .light .storage-note {
    border-color: #d9dce4;
    color: #646c7a;
    background: #f6f7f9;
  }

  .light .theme-options button.active {
    border-color: #6478dc;
    color: #29376f;
    background: #e9edff;
  }

  .light .setting-label,
  .light .association-actions,
  .light .association-list strong,
  .light .storage-note strong {
    color: #434a58;
  }

  .light .association-list,
  .light .association-list label {
    border-color: #dfe2e8;
  }

  .light .association-list label:hover,
  .light .association-actions button:hover {
    color: #242935;
    background: #e8eaf0;
  }
</style>
