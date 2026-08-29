<script lang="ts">
  import { onMount } from "svelte";
  import {
    Monitor,
    Moon,
    RotateCcw,
    SpellCheck,
    Sun,
    Type,
    WrapText,
    X,
  } from "@lucide/svelte";
  import type { AppSettings, ThemePreference } from "./settings";

  interface Props {
    settings: AppSettings;
    activeTheme: "dark" | "light";
    onChange: (settings: AppSettings) => void;
    onClose: () => void;
    onReset: () => void;
  }

  let { settings, activeTheme, onChange, onClose, onReset }: Props = $props();
  let settingsPath = $state("Systemüblicher App-Datenordner");

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
    font-family: "Cascadia Code", Consolas, monospace;
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
    font-family: "Cascadia Code", Consolas, monospace;
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
  .light .storage-note strong {
    color: #434a58;
  }
</style>
