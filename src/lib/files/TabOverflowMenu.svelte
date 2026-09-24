<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Lock, Pin, Search } from "@lucide/svelte";
  import { fileIconUrl } from "./FileIconRegistry";
  import { disambiguationHints, searchTabs } from "./tabs";
  import type { DocumentTabItem } from "./DocumentTabs.svelte";

  interface Props {
    /** Hidden tabs in logical tab order; the menu never keeps its own list. */
    tabs: DocumentTabItem[];
    /** All open tabs, to tell equally named files apart. */
    allTabs: DocumentTabItem[];
    anchor: DOMRect;
    onActivate: (id: string) => void;
    onClose: (id: string) => void;
    onContextMenu: (id: string, x: number, y: number) => void;
    onDismiss: (restoreFocus: boolean) => void;
  }

  let { tabs, allTabs, anchor, onActivate, onClose, onContextMenu, onDismiss }: Props = $props();

  /** From this many hidden tabs on, the menu opens with the search field focused. */
  const SEARCH_THRESHOLD = 8;

  let root: HTMLDivElement;
  let list = $state<HTMLUListElement | null>(null);
  let searchInput = $state<HTMLInputElement | null>(null);
  let query = $state("");
  const showSearch = $derived(tabs.length >= SEARCH_THRESHOLD);
  const hints = $derived(disambiguationHints(allTabs));
  const results = $derived(searchTabs(tabs, query));
  let maxHeight = $state(400);

  onMount(() => {
    maxHeight = Math.max(160, window.innerHeight - anchor.bottom - 16);
    void tick().then(() => {
      if (showSearch) searchInput?.focus();
      else focusEntry(0);
    });
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!root.contains(target) && !target.closest?.(".context-menu") && !target.closest?.(".overflow-button")) onDismiss(false);
    };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  });

  function entries(): HTMLButtonElement[] {
    return Array.from(list?.querySelectorAll<HTMLButtonElement>("button.overflow-entry") ?? []);
  }

  function focusEntry(index: number): void {
    const buttons = entries();
    if (buttons.length === 0) return;
    buttons[Math.max(0, Math.min(index, buttons.length - 1))].focus();
  }

  function handleKeydown(event: KeyboardEvent): void {
    const buttons = entries();
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const page = Math.max(1, Math.floor((list?.clientHeight ?? 300) / 34));
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onDismiss(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusEntry(current < 0 ? 0 : current + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (current <= 0 && showSearch) searchInput?.focus();
      else focusEntry(current - 1);
    } else if (event.key === "PageDown") {
      event.preventDefault();
      focusEntry(current < 0 ? page : current + page);
    } else if (event.key === "PageUp") {
      event.preventDefault();
      focusEntry(current - page);
    } else if ((event.key === "Home" || event.key === "End") && current >= 0) {
      event.preventDefault();
      focusEntry(event.key === "Home" ? 0 : buttons.length - 1);
    } else if (event.key === "Enter" && document.activeElement === searchInput && results.length > 0) {
      event.preventDefault();
      onActivate(results[0].id);
    } else if (event.key === "Tab") {
      event.preventDefault();
      onDismiss(true);
    }
  }

  function describe(tab: DocumentTabItem): string {
    const states = [tab.dirty ? "geändert" : "", tab.pinned ? "angeheftet" : "", tab.readOnly ? "schreibgeschützt" : ""].filter(Boolean);
    return states.length > 0 ? `${tab.name}, ${states.join(", ")}` : tab.name;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="overflow-menu"
  bind:this={root}
  style={`top: ${anchor.bottom + 2}px; right: ${Math.max(4, window.innerWidth - anchor.right)}px; max-height: ${maxHeight}px`}
  onkeydown={handleKeydown}
>
  <div class="overflow-header">
    <strong>Weitere geöffnete Tabs</strong>
  </div>
  {#if showSearch}
    <label class="overflow-search">
      <Search size={13} aria-hidden="true" />
      <span class="sr-only">Geöffnete Tabs durchsuchen</span>
      <input bind:this={searchInput} bind:value={query} placeholder="Geöffnete Tabs durchsuchen …" spellcheck="false" />
    </label>
  {/if}
  <ul bind:this={list} role="menu" aria-label={`Weitere geöffnete Tabs, ${tabs.length} ausgeblendet`}>
    {#each results as tab (tab.id)}
      <li>
        <button
          class="overflow-entry"
          role="menuitem"
          aria-label={describe(tab)}
          title={tab.path ? `${tab.name}\n${tab.path}` : tab.name}
          onclick={() => onActivate(tab.id)}
          onauxclick={(event) => {
            if (event.button !== 1) return;
            event.preventDefault();
            onClose(tab.id);
          }}
          onmousedown={(event) => {
            // Keeps the middle click from starting autoscroll.
            if (event.button === 1) event.preventDefault();
          }}
          oncontextmenu={(event) => {
            event.preventDefault();
            onContextMenu(tab.id, event.clientX, event.clientY);
          }}
        >
          <img class="file-icon" src={fileIconUrl(tab.name)} alt="" width="16" height="16" draggable="false" />
          <span class="entry-text">
            <span class="entry-name">{tab.name}</span>
            {#if hints.get(tab.id)}<span class="entry-hint">{hints.get(tab.id)}</span>{/if}
          </span>
          {#if tab.pinned}<Pin size={11} aria-hidden="true" />{/if}
          {#if tab.readOnly}<Lock size={11} aria-hidden="true" />{/if}
          {#if tab.dirty}<span class="dirty-indicator" aria-hidden="true">●</span>{/if}
        </button>
      </li>
    {:else}
      <li class="no-results">Kein Tab gefunden</li>
    {/each}
  </ul>
  <div class="overflow-footer">{tabs.length === 1 ? "1 ausgeblendeter Tab" : `${tabs.length} ausgeblendete Tabs`}</div>
</div>

<style>
  .overflow-menu {
    position: fixed;
    z-index: 55;
    display: flex;
    width: min(360px, calc(100vw - 16px));
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border-strong);
    border-radius: 7px;
    color: var(--text);
    background: var(--surface-raised);
    box-shadow: 0 8px 26px rgb(0 0 0 / 38%);
    font-size: 11px;
  }

  .overflow-header,
  .overflow-footer {
    display: flex;
    min-height: 30px;
    align-items: center;
    justify-content: space-between;
    padding: 0 11px;
    color: var(--text-muted);
  }

  .overflow-header {
    border-bottom: 1px solid var(--border);
    font-size: 10px;
  }

  .overflow-footer {
    border-top: 1px solid var(--border);
    color: var(--text-faint);
    font-size: 10px;
  }

  .overflow-search {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 6px 6px 2px;
    padding: 0 8px;
    border: 1px solid var(--border-strong);
    border-radius: 5px;
    color: var(--text-faint);
    background: var(--inset);
  }

  .overflow-search input {
    min-width: 0;
    height: 27px;
    flex: 1;
    border: 0;
    outline: none;
    color: var(--text);
    background: transparent;
    font: inherit;
  }

  .overflow-search:focus-within {
    border-color: var(--accent);
  }

  ul {
    min-height: 0;
    flex: 1;
    margin: 0;
    padding: 4px;
    overflow-y: auto;
    list-style: none;
  }

  .overflow-entry {
    display: flex;
    width: 100%;
    height: 30px;
    align-items: center;
    gap: 7px;
    padding: 0 8px;
    border: 0;
    border-radius: 5px;
    color: inherit;
    background: transparent;
    cursor: pointer;
    font: inherit;
    text-align: left;
  }

  .overflow-entry:hover,
  .overflow-entry:focus-visible {
    outline: none;
    background: var(--surface-hover);
  }

  .overflow-entry > :global(svg) {
    flex: 0 0 auto;
    color: var(--text-faint);
  }

  .file-icon {
    flex: 0 0 16px;
  }

  .entry-text {
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: baseline;
    gap: 6px;
  }

  .entry-name {
    min-width: 0;
    flex: 0 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .entry-hint {
    min-width: 0;
    flex: 0 1 auto;
    overflow: hidden;
    color: var(--text-faint);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .entry-hint::before {
    content: "— ";
  }

  .dirty-indicator {
    color: var(--accent-strong);
    font-size: 8px;
  }

  .no-results {
    padding: 10px;
    color: var(--text-faint);
    text-align: center;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
</style>
