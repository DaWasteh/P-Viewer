<script lang="ts">
  import { ChevronDown } from "@lucide/svelte";
  import {
    SUPPORTED_FILE_TYPE_CHOICES,
    extensionOf,
    fileNameForFileTypeChoice,
    fileNameWithExtension,
    fileTypeChoiceIdFor,
    normalizeCustomExtension,
    type FileTypeChoiceGroup,
  } from "./fileTypes";

  interface Props {
    fileName: string;
    disabled?: boolean;
    onChange?: (fileName: string) => void;
  }

  let { fileName, disabled = false, onChange = () => undefined }: Props = $props();

  const groups: FileTypeChoiceGroup[] = [
    "Text",
    "Dokumente",
    "Code und Konfiguration",
    "Spezielle Dateinamen",
  ];
  const customChoiceId = "action:custom";

  let customDialog: HTMLDialogElement;
  let customInput: HTMLInputElement;
  let customExtension = $state("");
  let customError = $state("");

  const currentChoiceId = $derived(fileTypeChoiceIdFor(fileName));
  const currentCustomExtension = $derived(
    currentChoiceId.startsWith("custom:") ? extensionOf(fileName) : "",
  );

  function openCustomDialog(): void {
    customExtension = currentCustomExtension;
    customError = "";
    if (!customDialog.open) customDialog.showModal();
    requestAnimationFrame(() => {
      customInput.focus();
      customInput.select();
    });
  }

  function handleSelection(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement;
    const choiceId = select.value;

    if (choiceId === customChoiceId) {
      select.value = currentChoiceId;
      openCustomDialog();
      return;
    }

    const choice = SUPPORTED_FILE_TYPE_CHOICES.find(({ id }) => id === choiceId);
    if (choice) onChange(fileNameForFileTypeChoice(fileName, choice));
  }

  function applyCustomExtension(event: SubmitEvent): void {
    event.preventDefault();
    const normalized = normalizeCustomExtension(customExtension);
    if (!normalized) {
      customError = "Bitte 1–32 Buchstaben, Ziffern, _ oder - eingeben.";
      return;
    }

    onChange(fileNameWithExtension(fileName, normalized));
    customDialog.close();
  }

  function closeCustomDialog(): void {
    customDialog.close();
  }

  function handleDialogClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) closeCustomDialog();
  }
</script>

<div class="file-type-selector">
  <label class="sr-only" for="file-type-choice">Dateityp</label>
  <div class="select-shell">
    <select
      id="file-type-choice"
      value={currentChoiceId}
      onchange={handleSelection}
      title="Dateityp oder Dateiendung ändern"
      aria-haspopup="dialog"
      {disabled}
    >
      {#if currentChoiceId.startsWith("custom:")}
        <option value={currentChoiceId}>
          {currentCustomExtension
            ? `Eigene Endung (.${currentCustomExtension})`
            : "Text (ohne Endung)"}
        </option>
      {/if}
      {#each groups as group}
        <optgroup label={group}>
          {#each SUPPORTED_FILE_TYPE_CHOICES.filter((choice) => choice.group === group) as choice}
            <option value={choice.id}>{choice.label}</option>
          {/each}
        </optgroup>
      {/each}
      <option value={customChoiceId}>Eigene Endung …</option>
    </select>
    <ChevronDown size={13} aria-hidden="true" />
  </div>

  <dialog
    bind:this={customDialog}
    aria-labelledby="custom-extension-title"
    onclick={handleDialogClick}
    onclose={() => (customError = "")}
  >
    <form method="dialog" onsubmit={applyCustomExtension}>
      <div>
        <span class="eyebrow">DATEITYP</span>
        <h2 id="custom-extension-title">Eigene Dateiendung</h2>
        <p id="custom-extension-help">
          Die Endung legt den vorgeschlagenen Dateinamen fest. Unbekannte Formate werden
          sicher als Text behandelt.
        </p>
      </div>

      <label for="custom-extension">Dateiendung</label>
      <div class="extension-input">
        <span aria-hidden="true">.</span>
        <input
          bind:this={customInput}
          id="custom-extension"
          bind:value={customExtension}
          maxlength="33"
          placeholder="z. B. notes"
          aria-describedby="custom-extension-help custom-extension-error"
          aria-invalid={Boolean(customError)}
          oninput={() => (customError = "")}
        />
      </div>
      <small id="custom-extension-error" class:error={Boolean(customError)} aria-live="polite">
        {customError || "Ein führender Punkt ist optional."}
      </small>

      <div class="dialog-actions">
        <button type="button" onclick={closeCustomDialog}>Abbrechen</button>
        <button class="primary" type="submit">Übernehmen</button>
      </div>
    </form>
  </dialog>
</div>

<style>
  .file-type-selector {
    position: relative;
    margin-left: auto;
  }

  .select-shell {
    position: relative;
    display: flex;
    align-items: center;
  }

  select {
    width: min(190px, 24vw);
    height: 27px;
    -webkit-appearance: none;
    appearance: none;
    padding: 0 27px 0 9px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--text-muted);
    background: var(--surface);
    cursor: pointer;
    font-family: var(--mono);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  select:hover:not(:disabled) {
    border-color: var(--border-strong);
    color: var(--text);
    background: var(--surface-hover);
  }

  select:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  select:disabled {
    cursor: default;
    opacity: 0.45;
  }

  .select-shell > :global(svg) {
    position: absolute;
    right: 8px;
    color: var(--text-faint);
    pointer-events: none;
  }

  dialog {
    width: min(420px, calc(100vw - 32px));
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: 10px;
    color: var(--text);
    background: var(--surface-raised);
    box-shadow: 0 22px 70px rgb(0 0 0 / 50%);
  }

  dialog::backdrop {
    background: rgb(4 6 10 / 58%);
    -webkit-backdrop-filter: blur(2px);
    backdrop-filter: blur(2px);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 13px;
    padding: 20px;
  }

  .eyebrow {
    color: var(--accent-strong);
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 0.14em;
  }

  h2 {
    margin: 3px 0 6px;
    font-size: 18px;
  }

  p {
    margin: 0;
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1.55;
  }

  form > label {
    margin-bottom: -7px;
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 700;
  }

  .extension-input {
    display: grid;
    height: 36px;
    align-items: center;
    grid-template-columns: 25px minmax(0, 1fr);
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--inset);
  }

  .extension-input:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .extension-input span {
    color: var(--text-faint);
    font-family: var(--mono);
    text-align: right;
  }

  input {
    min-width: 0;
    height: 100%;
    padding: 0 9px 0 2px;
    border: 0;
    outline: 0;
    color: var(--text);
    background: transparent;
    font-family: var(--mono);
    font-size: 12px;
  }

  small {
    min-height: 13px;
    margin-top: -8px;
    color: var(--text-faint);
    font-size: 9px;
  }

  small.error {
    color: var(--danger);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 7px;
    margin-top: 3px;
  }

  button {
    height: 31px;
    padding: 0 11px;
    border: 0;
    border-radius: 6px;
    color: var(--text-muted);
    background: var(--surface-hover);
    cursor: pointer;
    font-size: 10px;
  }

  button:hover {
    color: var(--text);
  }

  button.primary {
    color: #fff;
    background: var(--accent);
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
    .file-type-selector {
      display: none;
    }
  }
</style>
