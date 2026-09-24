<script lang="ts" module>
  export type BulkChoice = "save" | "review" | "discard" | "cancel";
  export type ReviewChoice = "save" | "discard" | "skip" | "cancel";

  export type CloseDialogRequest =
    | { kind: "bulk"; names: string[]; resolve: (choice: BulkChoice) => void }
    | { kind: "review"; name: string; position: number; total: number; resolve: (choice: ReviewChoice) => void };
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import { modal } from "$lib/modal";

  interface Props {
    request: CloseDialogRequest;
    light?: boolean;
  }

  let { request, light = false }: Props = $props();
  let primary = $state<HTMLButtonElement | null>(null);

  onMount(() => primary?.focus());

  function cancel(): void {
    if (request.kind === "bulk") request.resolve("cancel");
    else request.resolve("cancel");
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog use:modal class="close-dialog" class:light aria-labelledby="close-dialog-title" onkeydown={handleKeydown}>
  {#if request.kind === "bulk"}
    <h2 id="close-dialog-title">
      {request.names.length === 1 ? "1 Datei hat ungespeicherte Änderungen." : `${request.names.length} Dateien haben ungespeicherte Änderungen.`}
    </h2>
    <ul class="dirty-list">
      {#each request.names as name}
        <li><span class="dirty-indicator" aria-hidden="true">●</span> {name} <small>Geändert</small></li>
      {/each}
    </ul>
    <div class="actions">
      <button class="primary" bind:this={primary} onclick={() => request.kind === "bulk" && request.resolve("save")}>Alle speichern und schließen</button>
      <button onclick={() => request.kind === "bulk" && request.resolve("review")}>Einzeln prüfen</button>
      <button class="danger" onclick={() => request.kind === "bulk" && request.resolve("discard")}>Alle verwerfen</button>
      <button onclick={cancel}>Abbrechen</button>
    </div>
  {:else}
    <h2 id="close-dialog-title">„{request.name}“ hat ungespeicherte Änderungen.</h2>
    <p>Datei {request.position} von {request.total}</p>
    <div class="actions">
      <button class="primary" bind:this={primary} onclick={() => request.kind === "review" && request.resolve("save")}>Speichern</button>
      <button class="danger" onclick={() => request.kind === "review" && request.resolve("discard")}>Verwerfen</button>
      <button onclick={() => request.kind === "review" && request.resolve("skip")} title="Diese Datei bleibt geöffnet">Überspringen</button>
      <button onclick={cancel}>Vorgang abbrechen</button>
    </div>
  {/if}
</dialog>

<style>
  .close-dialog {
    width: min(460px, calc(100vw - 32px));
    padding: 20px;
    border: 1px solid var(--border-strong);
    border-radius: 9px;
    color: var(--text);
    background: var(--surface-raised);
    box-shadow: 0 16px 50px rgb(0 0 0 / 45%);
  }

  .close-dialog::backdrop {
    background: rgb(4 6 10 / 52%);
  }

  .close-dialog.light::backdrop {
    background: rgb(40 46 60 / 28%);
  }

  h2 {
    margin: 0 0 12px;
    font-size: 14px;
    letter-spacing: -0.01em;
  }

  p {
    margin: 0 0 14px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .dirty-list {
    max-height: 220px;
    margin: 0 0 16px;
    padding: 6px 0;
    overflow: auto;
    border-block: 1px solid var(--border);
    list-style: none;
    font-size: 11px;
  }

  .dirty-list li {
    display: flex;
    align-items: baseline;
    gap: 7px;
    padding: 4px 2px;
  }

  .dirty-list small {
    margin-left: auto;
    color: var(--text-faint);
    font-size: 10px;
  }

  .dirty-indicator {
    color: var(--accent-strong);
    font-size: 8px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 7px;
  }

  button {
    height: 30px;
    padding: 0 11px;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    color: var(--text);
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
  }

  button:hover {
    background: var(--surface-hover);
  }

  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  button.primary {
    border-color: transparent;
    color: #fff;
    background: #5c6fd7;
  }

  button.primary:hover {
    background: #6d7fe1;
  }

  button.danger {
    color: var(--danger);
  }
</style>
