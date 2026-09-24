<script lang="ts" module>
  export interface DocumentTabItem {
    id: string;
    name: string;
    path: string;
    dirty: boolean;
    pinned?: boolean;
    readOnly?: boolean;
  }

  /** Where a dragged tab was released relative to this window. */
  export interface TabDropPoint {
    clientX: number;
    clientY: number;
    /** False once the pointer left the window's viewport. */
    insideWindow: boolean;
  }

  /** Tab widths the overflow calculation works with (CSS pixels). */
  export const TAB_METRICS = { minTabWidth: 120, pinnedTabWidth: 40, overflowButtonWidth: 84 } as const;
</script>

<script lang="ts">
  import { onMount, tick } from "svelte";
  import { ChevronsRight, Lock, Pin, Plus, X } from "@lucide/svelte";
  import { fileIconUrl } from "./FileIconRegistry";
  import TabOverflowMenu from "./TabOverflowMenu.svelte";
  import { insertionIndex, logicalInsertionIndex, visibleTabIds } from "./tabs";

  interface Props {
    tabs: DocumentTabItem[];
    activeId: string;
    disabled?: boolean;
    onActivate?: (id: string) => void;
    onClose?: (id: string) => void;
    onNew?: () => void;
    /** Live reorder while dragging: `index` is the logical position among the other tabs. */
    onReorder?: (id: string, index: number) => void;
    /** The tab was dropped outside the tab strip and should move to another window. */
    onDetach?: (id: string, point: TabDropPoint) => void;
    /** Right click (or the context menu key) on a tab in the strip or in the overflow menu. */
    onContextMenu?: (id: string, x: number, y: number) => void;
  }

  let {
    tabs,
    activeId,
    disabled = false,
    onActivate = () => undefined,
    onClose = () => undefined,
    onNew = () => undefined,
    onReorder = () => undefined,
    onDetach = () => undefined,
    onContextMenu = () => undefined,
  }: Props = $props();

  /** Pointer travel before a press becomes a drag; keeps plain clicks intact. */
  const DRAG_THRESHOLD = 5;
  /** Vertical distance from the strip beyond which a drop detaches the tab. */
  const DETACH_DISTANCE = 56;

  interface DragState {
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    grabOffsetX: number;
    shell: HTMLElement;
    active: boolean;
    lastClientX: number;
  }

  let tabList: HTMLDivElement;
  let overflowButton = $state<HTMLButtonElement | null>(null);
  let drag: DragState | null = null;
  let draggingId = $state("");
  let detaching = $state(false);
  let stripWidth = $state(0);
  let overflowOpen = $state(false);
  let overflowAnchor = $state<DOMRect | null>(null);

  // Hidden tabs are purely a function of the current width: nothing about
  // them is stored, and the logical order always comes from `tabs`.
  const visibleIds = $derived(
    stripWidth > 0
      ? visibleTabIds(tabs, activeId, { available: stripWidth, ...TAB_METRICS })
      : tabs.map((tab) => tab.id),
  );
  const visibleSet = $derived(new Set(visibleIds));
  const visibleTabs = $derived(tabs.filter((tab) => visibleSet.has(tab.id)));
  const hiddenTabs = $derived(tabs.filter((tab) => !visibleSet.has(tab.id)));

  onMount(() => {
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        stripWidth = Math.floor(entry.contentRect.width);
      });
    });
    observer.observe(tabList.parentElement!);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });

  $effect(() => {
    if (hiddenTabs.length === 0 && overflowOpen) overflowOpen = false;
  });

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

  function tooltip(tab: DocumentTabItem): string {
    const states = [tab.dirty ? "Geändert" : "", tab.pinned ? "Angeheftet" : "", tab.readOnly ? "Schreibgeschützt" : ""].filter(Boolean);
    return [tab.name, tab.path, states.join(" · ")].filter(Boolean).join("\n");
  }

  function handleTabKeydown(event: KeyboardEvent, id: string): void {
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      onContextMenu(id, rect.left + 12, rect.bottom);
      return;
    }
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

  function handlePointerDown(event: PointerEvent, id: string): void {
    if (disabled || event.button !== 0 || drag) return;
    const shell = (event.currentTarget as HTMLElement).closest<HTMLElement>(".tab-shell");
    if (!shell) return;
    // Browsers activate a tab on press, not on release.
    if (id !== activeId) onActivate(id);
    drag = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      grabOffsetX: event.clientX - shell.getBoundingClientRect().left,
      shell,
      active: false,
      lastClientX: event.clientX,
    };
    // Listen on the window: the pointer may leave the strip before the drag
    // threshold is reached, and a pressed mouse keeps reporting to the page
    // even outside the window.
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
  }

  function insideViewport(event: PointerEvent): boolean {
    return (
      event.clientX >= 0 &&
      event.clientY >= 0 &&
      event.clientX <= window.innerWidth &&
      event.clientY <= window.innerHeight
    );
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      if (
        Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD &&
        Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD
      ) {
        return;
      }
      drag.active = true;
      draggingId = drag.id;
      // Capture on the strip, not the tab: reordering moves the tab's node in
      // the DOM, which would silently release a capture held by the tab itself.
      // Window listeners above still see the retargeted events.
      try {
        tabList.setPointerCapture(drag.pointerId);
      } catch {
        // Capture is best effort; window-level mouse capture still delivers events.
      }
    }
    drag.lastClientX = event.clientX;
    const strip = tabList.getBoundingClientRect();
    const awayFromStrip =
      event.clientY < strip.top - DETACH_DISTANCE || event.clientY > strip.bottom + DETACH_DISTANCE;
    detaching = !insideViewport(event) || awayFromStrip;
    if (detaching) {
      drag.shell.style.transform = "";
      return;
    }

    const shells = Array.from(tabList.querySelectorAll<HTMLElement>(".tab-shell"));
    const currentIndex = shells.indexOf(drag.shell);
    if (currentIndex < 0) return;
    const draggedRect = drag.shell.getBoundingClientRect();
    const others = shells
      .filter((_, index) => index !== currentIndex)
      .map((shell) => shell.getBoundingClientRect())
      .map((rect) => ({ left: rect.left, width: rect.width }));
    const draggedCenter = event.clientX - drag.grabOffsetX + draggedRect.width / 2;
    const target = insertionIndex(draggedCenter, others);
    if (target !== currentIndex) {
      // Tabs hidden in the overflow menu keep their logical place.
      const index = logicalInsertionIndex(tabs.map((tab) => tab.id), visibleIds, drag.id, target);
      onReorder(drag.id, index);
    }
    void tick().then(applyDragTransform);
  }

  function applyDragTransform(): void {
    if (!drag?.active || detaching) return;
    const rect = drag.shell.getBoundingClientRect();
    const offset = drag.lastClientX - drag.grabOffsetX - rect.left;
    drag.shell.style.transform = `translateX(${offset}px)`;
  }

  function finishDrag(): void {
    if (!drag) return;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerCancel);
    drag.shell.style.transform = "";
    try {
      if (tabList.hasPointerCapture(drag.pointerId)) tabList.releasePointerCapture(drag.pointerId);
    } catch {
      // Already released.
    }
    drag = null;
    draggingId = "";
    detaching = false;
  }

  function handlePointerUp(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { id, active } = drag;
    const shouldDetach = active && detaching;
    const point: TabDropPoint = {
      clientX: event.clientX,
      clientY: event.clientY,
      insideWindow: insideViewport(event),
    };
    finishDrag();
    if (shouldDetach) onDetach(id, point);
  }

  function handlePointerCancel(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    finishDrag();
  }

  function handleLostCapture(event: PointerEvent): void {
    // Fires after a normal pointerup as well; by then `drag` is already gone.
    if (drag && event.pointerId === drag.pointerId) finishDrag();
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && drag) finishDrag();
  }

  function toggleOverflow(): void {
    if (overflowOpen) {
      overflowOpen = false;
      return;
    }
    overflowAnchor = overflowButton?.getBoundingClientRect() ?? null;
    overflowOpen = Boolean(overflowAnchor);
  }

  function activateFromOverflow(id: string): void {
    overflowOpen = false;
    onActivate(id);
    // The strip now shows the tab; keyboard focus follows it.
    void tick().then(() => focusTab(id));
  }

  function dismissOverflow(restoreFocus: boolean): void {
    overflowOpen = false;
    if (restoreFocus) overflowButton?.focus();
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<nav class="document-tabs" class:dragging={Boolean(draggingId)} class:detaching aria-label="Geöffnete Dokumente">
  <div class="tab-strip">
    <div
      class="tab-list"
      role="tablist"
      tabindex="-1"
      bind:this={tabList}
      onlostpointercapture={handleLostCapture}
    >
      {#each visibleTabs as tab (tab.id)}
        <div
          class:active={tab.id === activeId}
          class:dragged={tab.id === draggingId}
          class:pinned={tab.pinned}
          class="tab-shell"
          data-shell-id={tab.id}
        >
          <button
            class="tab-button"
            role="tab"
            aria-selected={tab.id === activeId}
            aria-controls="document-workspace"
            tabindex={tab.id === activeId ? 0 : -1}
            data-tab-id={tab.id}
            title={tooltip(tab)}
            onpointerdown={(event) => handlePointerDown(event, tab.id)}
            onclick={() => onActivate(tab.id)}
            onauxclick={(event) => handleAuxClick(event, tab.id)}
            onmousedown={(event) => {
              // Keeps the middle click from starting autoscroll.
              if (event.button === 1) event.preventDefault();
            }}
            oncontextmenu={(event) => {
              event.preventDefault();
              onContextMenu(tab.id, event.clientX, event.clientY);
            }}
            onkeydown={(event) => handleTabKeydown(event, tab.id)}
            {disabled}
          >
            <img class="file-icon" src={fileIconUrl(tab.name)} alt="" width="16" height="16" draggable="false" />
            {#if tab.pinned}
              <span class="sr-only">{tab.name} Angeheftet</span>
            {:else}
              <span class="tab-name">{tab.name}</span>
            {/if}
            {#if tab.readOnly && !tab.pinned}
              <span class="state-icon" aria-label="Schreibgeschützt"><Lock size={10} aria-hidden="true" /></span>
            {/if}
            {#if tab.dirty}
              <span class="dirty-indicator" title="Ungespeicherte Änderungen" aria-label="Ungespeichert">●</span>
            {/if}
          </button>
          {#if !tab.pinned}
            <button
              class="close-tab"
              aria-label={`„${tab.name}“ schließen`}
              title="Schließen (Strg/Cmd+W)"
              onclick={(event) => closeTab(event, tab.id)}
              {disabled}
            >
              <X size={12} aria-hidden="true" />
            </button>
          {:else}
            <span class="pin-mark" aria-hidden="true"><Pin size={8} /></span>
          {/if}
        </div>
      {/each}
    </div>
    {#if hiddenTabs.length > 0}
      <button
        class="overflow-button"
        bind:this={overflowButton}
        aria-haspopup="menu"
        aria-expanded={overflowOpen}
        aria-label={`Weitere geöffnete Tabs, ${hiddenTabs.length} ausgeblendet`}
        title={hiddenTabs.length === 1 ? "1 ausgeblendeter Tab" : `${hiddenTabs.length} ausgeblendete Tabs`}
        onclick={toggleOverflow}
        {disabled}
      >
        <ChevronsRight size={13} aria-hidden="true" />
        <span>{hiddenTabs.length} mehr</span>
        {#if hiddenTabs.some((tab) => tab.dirty)}<span class="dirty-indicator" aria-hidden="true">●</span>{/if}
      </button>
    {/if}
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

{#if overflowOpen && overflowAnchor}
  <TabOverflowMenu
    tabs={hiddenTabs}
    allTabs={tabs}
    anchor={overflowAnchor}
    onActivate={activateFromOverflow}
    {onClose}
    {onContextMenu}
    onDismiss={dismissOverflow}
  />
{/if}

<style>
  .document-tabs {
    display: flex;
    min-width: 0;
    align-items: stretch;
    border-bottom: 1px solid var(--border);
    background: var(--chrome);
  }

  .tab-strip {
    display: flex;
    min-width: 0;
    flex: 1;
  }

  .tab-list {
    display: flex;
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }

  .tab-shell {
    position: relative;
    display: flex;
    min-width: 120px;
    max-width: 220px;
    flex: 0 1 170px;
    align-items: center;
    border-right: 1px solid var(--border);
    color: var(--text-muted);
    background: var(--surface);
  }

  .tab-shell.pinned {
    min-width: 40px;
    max-width: 40px;
    flex: 0 0 40px;
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

  .tab-shell.dragged {
    z-index: 2;
    box-shadow: 0 2px 10px rgb(0 0 0 / 35%);
    will-change: transform;
  }

  .dragging .tab-shell:not(.dragged) {
    transition: transform 120ms ease;
  }

  .detaching .tab-shell.dragged {
    opacity: 0.45;
    outline: 1px dashed var(--accent);
    outline-offset: -1px;
  }

  .dragging,
  .dragging .tab-button {
    cursor: grabbing;
  }

  .detaching,
  .detaching .tab-button {
    cursor: copy;
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

  .pinned .tab-button {
    justify-content: center;
    gap: 2px;
    padding: 0;
  }

  .tab-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-icon {
    flex: 0 0 16px;
    width: 16px;
    height: 16px;
    -webkit-user-drag: none;
  }

  .state-icon {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--text-faint);
  }

  .tab-button:focus-visible,
  .close-tab:focus-visible,
  .new-tab:focus-visible,
  .overflow-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .dirty-indicator {
    flex: 0 0 auto;
    color: var(--accent-strong);
    font-size: 8px;
  }

  .pin-mark {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    color: var(--text-faint);
    pointer-events: none;
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

  .overflow-button {
    display: flex;
    width: 84px;
    flex: 0 0 84px;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 0;
    border-left: 1px solid var(--border);
    color: var(--text-muted);
    background: var(--surface);
    cursor: pointer;
    font-size: 10px;
    white-space: nowrap;
  }

  .overflow-button:hover:not(:disabled),
  .overflow-button[aria-expanded="true"] {
    color: var(--text);
    background: var(--surface-hover);
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

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
</style>
