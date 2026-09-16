<script lang="ts">
  import { tick } from "svelte";
  import { FileText, Plus, X } from "@lucide/svelte";
  import { insertionIndex } from "./tabs";

  interface DocumentTabItem {
    id: string;
    name: string;
    path: string;
    dirty: boolean;
  }

  /** Where a dragged tab was released relative to this window. */
  export interface TabDropPoint {
    clientX: number;
    clientY: number;
    /** False once the pointer left the window's viewport. */
    insideWindow: boolean;
  }

  interface Props {
    tabs: DocumentTabItem[];
    activeId: string;
    disabled?: boolean;
    onActivate?: (id: string) => void;
    onClose?: (id: string) => void;
    onNew?: () => void;
    /** Live reorder while dragging: `index` is the position among the other tabs. */
    onReorder?: (id: string, index: number) => void;
    /** The tab was dropped outside the tab strip and should move to another window. */
    onDetach?: (id: string, point: TabDropPoint) => void;
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
  let drag: DragState | null = null;
  let draggingId = $state("");
  let detaching = $state(false);

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
    if (target !== currentIndex) onReorder(drag.id, target);
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
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<nav class="document-tabs" class:dragging={Boolean(draggingId)} class:detaching aria-label="Geöffnete Dokumente">
  <div
    class="tab-list"
    role="tablist"
    tabindex="-1"
    bind:this={tabList}
    onlostpointercapture={handleLostCapture}
  >
    {#each tabs as tab (tab.id)}
      <div class:active={tab.id === activeId} class:dragged={tab.id === draggingId} class="tab-shell">
        <button
          class="tab-button"
          role="tab"
          aria-selected={tab.id === activeId}
          aria-controls="document-workspace"
          tabindex={tab.id === activeId ? 0 : -1}
          data-tab-id={tab.id}
          title={tab.path || tab.name}
          onpointerdown={(event) => handlePointerDown(event, tab.id)}
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
