<script lang="ts">
  import { FileText, Plus, X } from "@lucide/svelte";

  interface DocumentTabItem {
    id: string;
    name: string;
    path: string;
    dirty: boolean;
  }

  interface Props {
    tabs: DocumentTabItem[];
    activeId: string;
    disabled?: boolean;
    onActivate?: (id: string) => void;
    onClose?: (id: string) => void;
    onNew?: () => void;
  }

  let {
    tabs,
    activeId,
    disabled = false,
    onActivate = () => undefined,
    onClose = () => undefined,
    onNew = () => undefined,
  }: Props = $props();

  let tabList: HTMLDivElement;

  function closeTab(event: MouseEvent, id: string): void {
    event.stopPropagation();
    onClose(id);
  }

  function handleAuxClick(event: MouseEvent, id: string): void {
    if (event.button !== 1) return;
    event.preventDefault();
    onClose(id);
  }

  function focusTab(id: string): void {
    requestAnimationFrame(() => {
      tabList.querySelector<HTMLButtonElement>(`[data-tab-id="${id}"]`)?.focus();
    });
  }

  function handleTabKeydown(event: KeyboardEvent, id: string): void {
    const currentIndex = tabs.findIndex((tab) => tab.id === id);
    if (currentIndex < 0) return;

    let nextIndex: number | null = null;
    if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextId = tabs[nextIndex].id;
    onActivate(nextId);
    focusTab(nextId);
  }
</script>

<nav class="document-tabs" aria-label="Geöffnete Dokumente">
  <div class="tab-list" role="tablist" bind:this={tabList}>
    {#each tabs as tab (tab.id)}
      <div class:active={tab.id === activeId} class="tab-shell">
        <button
          class="tab-button"
          role="tab"
          aria-selected={tab.id === activeId}
          aria-controls="document-workspace"
          tabindex={tab.id === activeId ? 0 : -1}
          data-tab-id={tab.id}
          title={tab.path || tab.name}
          onclick={() => onActivate(tab.id)}
          onauxclick={(event) => handleAuxClick(event, tab.id)}
          onkeydown={(event) => handleTabKeydown(event, tab.id)}
          {disabled}
        >
          <FileText size={13} aria-hidden="true" />
          <span>{tab.name}</span>
          {#if tab.dirty}
            <span class="dirty-indicator" title="Ungespeicherte Änderungen" aria-label="Ungespeichert">●</span>
          {/if}
        </button>
        <button
          class="close-tab"
          aria-label={`„${tab.name}“ schließen`}
          title="Schließen (Strg/Cmd+W)"
          onclick={(event) => closeTab(event, tab.id)}
          {disabled}
        >
          <X size={12} aria-hidden="true" />
        </button>
      </div>
    {/each}
  </div>
  <button
    class="new-tab"
    aria-label="Neues Dokument"
    title="Neues Dokument (Strg/Cmd+N)"
    onclick={onNew}
    {disabled}
  >
    <Plus size={14} aria-hidden="true" />
  </button>
</nav>

<style>
  .document-tabs {
    display: flex;
    min-width: 0;
    align-items: stretch;
    border-bottom: 1px solid var(--border);
    background: var(--chrome);
  }

  .tab-list {
    display: flex;
    min-width: 0;
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) transparent;
  }

  .tab-shell {
    position: relative;
    display: flex;
    min-width: 112px;
    max-width: 220px;
    flex: 0 1 170px;
    align-items: center;
    border-right: 1px solid var(--border);
    color: var(--text-muted);
    background: var(--surface);
  }

  .tab-shell::before {
    position: absolute;
    z-index: 1;
    top: 0;
    right: 0;
    left: 0;
    height: 2px;
    background: transparent;
    content: "";
  }

  .tab-shell:hover {
    color: var(--text);
    background: var(--surface-hover);
  }

  .tab-shell.active {
    color: var(--text);
    background: var(--bg);
  }

  .tab-shell.active::before {
    background: var(--accent);
  }

  .tab-button {
    display: flex;
    min-width: 0;
    height: 100%;
    flex: 1;
    align-items: center;
    gap: 6px;
    padding: 0 27px 0 10px;
    border: 0;
    color: inherit;
    background: transparent;
    cursor: pointer;
    font-size: 10px;
    text-align: left;
  }

  .tab-button > span:not(.dirty-indicator) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tab-button > :global(svg) {
    flex: 0 0 auto;
    color: var(--text-faint);
  }

  .tab-button:focus-visible,
  .close-tab:focus-visible,
  .new-tab:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .dirty-indicator {
    flex: 0 0 auto;
    color: var(--accent-strong);
    font-size: 8px;
  }

  .close-tab {
    position: absolute;
    right: 5px;
    display: grid;
    width: 20px;
    height: 20px;
    place-items: center;
    border: 0;
    border-radius: 4px;
    color: var(--text-faint);
    background: transparent;
    cursor: pointer;
    opacity: 0;
  }

  .tab-shell:hover .close-tab,
  .tab-shell.active .close-tab,
  .close-tab:focus-visible {
    opacity: 1;
  }

  .close-tab:hover:not(:disabled) {
    color: var(--text);
    background: var(--surface-raised);
  }

  .new-tab {
    display: grid;
    width: 35px;
    flex: 0 0 35px;
    place-items: center;
    border: 0;
    border-left: 1px solid var(--border);
    color: var(--text-muted);
    background: var(--surface);
    cursor: pointer;
  }

  .new-tab:hover:not(:disabled) {
    color: var(--text);
    background: var(--surface-hover);
  }

  button:disabled {
    cursor: default;
    opacity: 0.45;
  }

  @media (max-width: 560px) {
    .tab-shell {
      min-width: 92px;
      flex-basis: 135px;
    }
  }
</style>
