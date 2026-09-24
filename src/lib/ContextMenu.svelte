<script lang="ts" module>
  export interface MenuItem {
    label: string;
    shortcut?: string;
    disabled?: boolean;
    /** Tooltip, e.g. why an entry is unavailable. */
    title?: string;
    children?: MenuEntry[];
    action?: () => void;
  }
  export type MenuEntry = MenuItem | { separator: true };

  export function isSeparator(entry: MenuEntry): entry is { separator: true } {
    return "separator" in entry;
  }
</script>

<script lang="ts">
  import { onMount, tick } from "svelte";
  import { ChevronRight } from "@lucide/svelte";

  interface Props {
    items: MenuEntry[];
    x: number;
    y: number;
    label: string;
    light?: boolean;
    onClose: () => void;
  }

  let { items, x, y, label, light = false, onClose }: Props = $props();

  let root: HTMLDivElement;
  let left = $state(0);
  let top = $state(0);
  /** Index path of the open submenu (one level deep is all menus here need). */
  let openSubmenu = $state<number | null>(null);
  let submenuLeftSide = $state(false);
  let submenuShift = $state(0);

  onMount(() => {
    const rect = root.getBoundingClientRect();
    left = Math.max(4, Math.min(x, window.innerWidth - rect.width - 4));
    top = Math.max(4, Math.min(y, window.innerHeight - rect.height - 4));
    void tick().then(() => focusItem(root, 0));
    const outside = (event: PointerEvent) => {
      if (!root.contains(event.target as Node)) onClose();
    };
    const dismiss = () => onClose();
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", dismiss);
    };
  });

  function enabledItems(container: Element): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll<HTMLButtonElement>(":scope > li > button[role='menuitem']")).filter(
      (button) => button.getAttribute("aria-disabled") !== "true",
    );
  }

  function focusItem(container: Element | null, index: number): void {
    const list = container?.matches("ul") ? container : container?.querySelector("ul");
    if (!list) return;
    const buttons = enabledItems(list);
    if (buttons.length === 0) return;
    buttons[(index + buttons.length) % buttons.length].focus();
  }

  async function showSubmenu(index: number, focusFirst: boolean): Promise<void> {
    openSubmenu = index;
    await tick();
    const parent = root.querySelector<HTMLElement>(`[data-menu-index="${index}"]`);
    const submenu = root.querySelector<HTMLElement>(".submenu");
    if (parent && submenu) {
      const parentRect = parent.getBoundingClientRect();
      const width = submenu.offsetWidth;
      const height = submenu.offsetHeight;
      submenuLeftSide = parentRect.right + width > window.innerWidth - 4;
      submenuShift = Math.min(0, window.innerHeight - 4 - (parentRect.top + height));
      if (focusFirst) focusItem(submenu, 0);
    }
  }

  function activate(item: MenuItem, index: number, fromKeyboard: boolean): void {
    if (item.disabled) return;
    if (item.children) {
      void showSubmenu(index, fromKeyboard);
      return;
    }
    onClose();
    item.action?.();
  }

  function handleKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const list = target.closest("ul");
    if (!list) return;
    const buttons = enabledItems(list);
    const current = buttons.indexOf(target as HTMLButtonElement);
    const inSubmenu = list.classList.contains("submenu");
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        buttons[(current + 1) % buttons.length]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        buttons[(current - 1 + buttons.length) % buttons.length]?.focus();
        break;
      case "Home":
        event.preventDefault();
        buttons[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        buttons[buttons.length - 1]?.focus();
        break;
      case "ArrowRight": {
        const index = Number(target.dataset.menuIndex);
        if (!inSubmenu && target.getAttribute("aria-haspopup") === "menu") {
          event.preventDefault();
          void showSubmenu(index, true);
        }
        break;
      }
      case "ArrowLeft":
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        if (inSubmenu) {
          const parentIndex = openSubmenu;
          openSubmenu = null;
          root.querySelector<HTMLButtonElement>(`[data-menu-index="${parentIndex}"]`)?.focus();
        } else if (event.key === "Escape") {
          onClose();
        }
        break;
      case "Tab":
        event.preventDefault();
        onClose();
        break;
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="context-menu"
  class:light
  bind:this={root}
  style={`left: ${left}px; top: ${top}px`}
  onkeydown={handleKeydown}
  oncontextmenu={(event) => event.preventDefault()}
>
  <ul role="menu" aria-label={label}>
    {#each items as entry, index}
      {#if isSeparator(entry)}
        <li role="separator" class="separator"></li>
      {:else}
        <li class="menu-entry">
          <button
            type="button"
            role="menuitem"
            data-menu-index={index}
            aria-disabled={entry.disabled ? "true" : undefined}
            aria-haspopup={entry.children ? "menu" : undefined}
            aria-expanded={entry.children ? openSubmenu === index : undefined}
            title={entry.title}
            onclick={(event) => activate(entry, index, event.detail === 0)}
            onpointerenter={() => {
              if (entry.children && !entry.disabled) void showSubmenu(index, false);
              else if (openSubmenu !== null) openSubmenu = null;
            }}
          >
            <span class="label">{entry.label}</span>
            {#if entry.shortcut}<span class="shortcut">{entry.shortcut}</span>{/if}
            {#if entry.children}<ChevronRight size={12} aria-hidden="true" />{/if}
          </button>
          {#if entry.children && openSubmenu === index}
            <ul
              class="submenu"
              class:left-side={submenuLeftSide}
              style={`margin-top: ${submenuShift}px`}
              role="menu"
              aria-label={entry.label}
            >
              {#each entry.children as child, childIndex}
                {#if isSeparator(child)}
                  <li role="separator" class="separator"></li>
                {:else}
                  <li class="menu-entry">
                    <button
                      type="button"
                      role="menuitem"
                      data-submenu-index={childIndex}
                      aria-disabled={child.disabled ? "true" : undefined}
                      title={child.title}
                      onclick={() => activate(child, childIndex, false)}
                    >
                      <span class="label">{child.label}</span>
                      {#if child.shortcut}<span class="shortcut">{child.shortcut}</span>{/if}
                    </button>
                  </li>
                {/if}
              {/each}
            </ul>
          {/if}
        </li>
      {/if}
    {/each}
  </ul>
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: 60;
    font-size: 11px;
  }

  ul {
    min-width: 210px;
    margin: 0;
    padding: 4px;
    border: 1px solid var(--border-strong);
    border-radius: 7px;
    list-style: none;
    color: var(--text);
    background: var(--surface-raised);
    box-shadow: 0 8px 26px rgb(0 0 0 / 38%);
  }

  .menu-entry {
    position: relative;
  }

  button {
    display: flex;
    width: 100%;
    height: 27px;
    align-items: center;
    gap: 14px;
    padding: 0 9px;
    border: 0;
    border-radius: 5px;
    color: inherit;
    background: transparent;
    cursor: pointer;
    font: inherit;
    text-align: left;
    white-space: nowrap;
  }

  button:hover:not([aria-disabled="true"]),
  button:focus-visible,
  button[aria-expanded="true"] {
    outline: none;
    background: var(--surface-hover);
  }

  button[aria-disabled="true"] {
    cursor: default;
    opacity: 0.42;
  }

  .label {
    flex: 1;
  }

  .shortcut {
    color: var(--text-faint);
    font-size: 10px;
  }

  button > :global(svg) {
    margin-right: -3px;
    color: var(--text-faint);
  }

  .separator {
    height: 1px;
    margin: 4px 6px;
    background: var(--border);
  }

  .submenu {
    position: absolute;
    top: -5px;
    left: calc(100% + 2px);
  }

  .submenu.left-side {
    right: calc(100% + 2px);
    left: auto;
  }

  .light ul {
    box-shadow: 0 8px 24px rgb(30 36 52 / 16%);
  }
</style>
