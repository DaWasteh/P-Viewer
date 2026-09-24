import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  setSearchQuery,
} from "@codemirror/search";
import { EditorSelection, Prec, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, keymap, runScopeHandlers, type Panel, type ViewUpdate } from "@codemirror/view";

/**
 * VS Code style find and replace for the editor: a compact widget in the top
 * right corner with case, whole word and regular expression toggles, a match
 * counter, incremental search and replace / replace all. It drives
 * CodeMirror's own search state, so highlighting, F3, Strg+G and undo keep
 * working exactly as before.
 */

/** Counting stops here so huge documents stay responsive while typing. */
export const MAX_COUNTED_MATCHES = 9_999;

export interface MatchCount {
  total: number;
  /** 1-based index of the match that is currently selected, or 0. */
  current: number;
  capped: boolean;
}

export function countMatches(view: Pick<EditorView, "state">, query: SearchQuery): MatchCount {
  if (!query.valid) return { total: 0, current: 0, capped: false };
  const selection = view.state.selection.main;
  const cursor = query.getCursor(view.state);
  let total = 0;
  let current = 0;
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    total += 1;
    if (next.value.from === selection.from && next.value.to === selection.to) current = total;
    if (total >= MAX_COUNTED_MATCHES) return { total, current, capped: true };
  }
  return { total, current, capped: false };
}

export function describeMatches(count: MatchCount, query: SearchQuery): string {
  if (!query.search) return "";
  if (!query.valid) return "Ungültiger Ausdruck";
  if (count.total === 0) return "Keine Treffer";
  const total = `${count.total.toLocaleString("de-DE")}${count.capped ? "+" : ""}`;
  return count.current > 0 ? `${count.current.toLocaleString("de-DE")} von ${total}` : `${total} Treffer`;
}

const panels = new WeakMap<EditorView, FindReplacePanel>();

export interface FindReplaceOptions {
  /** Opens the list replacement / macro dialog, prefilled with the current query. */
  onBatch?: (view: EditorView, initialRules: string) => void;
  /** Called after "Alle ersetzen" so the run can join the replacement history. */
  onReplaceAll?: (query: SearchQuery) => void;
}

const ICONS = {
  chevron: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" /></svg>',
  up: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M4 7l4-4 4 4" /></svg>',
  down: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M4 9l4 4 4-4" /></svg>',
  close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>',
};

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  html = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (html) node.innerHTML = html;
  return node;
}

class FindReplacePanel implements Panel {
  readonly dom: HTMLElement;
  readonly top = true;
  private readonly searchField: HTMLInputElement;
  private readonly replaceField: HTMLInputElement;
  private readonly replaceRow: HTMLElement;
  private readonly toggleReplace: HTMLButtonElement;
  private readonly caseButton: HTMLButtonElement;
  private readonly wordButton: HTMLButtonElement;
  private readonly regexButton: HTMLButtonElement;
  private readonly count: HTMLElement;
  private readonly replaceButtons: HTMLButtonElement[];
  private query: SearchQuery;
  /** Where incremental search starts: the cursor when the panel opened. */
  private origin: number;

  constructor(
    private readonly view: EditorView,
    private readonly options: FindReplaceOptions,
  ) {
    this.query = getSearchQuery(view.state);
    this.origin = view.state.selection.main.from;

    this.dom = element("div", { class: "pv-find", role: "search", "aria-label": "Suchen und Ersetzen" });
    this.toggleReplace = element("button", { type: "button", class: "pv-find-expand", title: "Ersetzen ein-/ausblenden (Strg+H)", "aria-label": "Ersetzen ein-/ausblenden", "aria-expanded": "false" }, ICONS.chevron);

    this.searchField = element("input", { type: "text", "main-field": "true", placeholder: "Suchen", "aria-label": "Suchen", spellcheck: "false", autocomplete: "off" });
    this.caseButton = this.toggle("Aa", "Groß-/Kleinschreibung beachten (Alt+C)");
    this.wordButton = this.toggle('<span class="pv-find-word">ab</span>', "Nur ganzes Wort (Alt+W)");
    this.regexButton = this.toggle(".*", "Regulärer Ausdruck (Alt+R)");
    const searchBox = element("div", { class: "pv-find-field" });
    searchBox.append(this.searchField, this.caseButton, this.wordButton, this.regexButton);

    this.count = element("span", { class: "pv-find-count", "aria-live": "polite" });
    const previous = this.action(ICONS.up, "Vorheriger Treffer (Umschalt+Eingabe)", () => findPrevious(this.view));
    const next = this.action(ICONS.down, "Nächster Treffer (Eingabe)", () => findNext(this.view));
    const close = this.action(ICONS.close, "Schließen (Esc)", () => {
      closeSearchPanel(this.view);
      this.view.focus();
      return true;
    });
    const searchRow = element("div", { class: "pv-find-row" });
    searchRow.append(searchBox, this.count, previous, next, close);

    this.replaceField = element("input", { type: "text", placeholder: "Ersetzen", "aria-label": "Ersetzen", spellcheck: "false", autocomplete: "off" });
    const replaceBox = element("div", { class: "pv-find-field" });
    replaceBox.append(this.replaceField);
    const replaceOne = this.textAction("Ersetzen", "Ersetzen (Eingabe)", () => replaceNext(this.view));
    const replaceEvery = this.textAction("Alle", "Alle ersetzen (Strg+Alt+Eingabe)", () => this.replaceEverything());
    const list = this.textAction("Liste …", "Mehrfach ersetzen und Makros (Strg+Umschalt+H)", () => this.openBatch());
    this.replaceButtons = [replaceOne, replaceEvery, list];
    this.replaceRow = element("div", { class: "pv-find-row pv-find-replace" });
    this.replaceRow.append(replaceBox, replaceOne, replaceEvery);
    if (options.onBatch) this.replaceRow.append(list);
    this.replaceRow.hidden = true;

    const rows = element("div", { class: "pv-find-rows" });
    rows.append(searchRow, this.replaceRow);
    this.dom.append(this.toggleReplace, rows);

    this.toggleReplace.addEventListener("click", () => this.showReplace(this.replaceRow.hidden));
    this.caseButton.addEventListener("click", () => this.flip("caseSensitive"));
    this.wordButton.addEventListener("click", () => this.flip("wholeWord"));
    this.regexButton.addEventListener("click", () => this.flip("regexp"));
    this.searchField.addEventListener("input", () => this.commit(true));
    this.replaceField.addEventListener("input", () => this.commit(false));
    this.dom.addEventListener("keydown", (event) => this.keydown(event));

    this.readQuery(this.query);
    panels.set(view, this);
  }

  mount(): void {
    this.searchField.select();
    this.refreshCount();
  }

  destroy(): void {
    panels.delete(this.view);
  }

  update(update: ViewUpdate): void {
    for (const transaction of update.transactions) {
      for (const effect of transaction.effects) {
        if (effect.is(setSearchQuery) && !effect.value.eq(this.query)) this.readQuery(effect.value);
      }
    }
    if (update.docChanged || update.selectionSet || update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(setSearchQuery)))) {
      this.refreshCount();
    }
    const readOnly = update.state.readOnly;
    for (const button of this.replaceButtons) button.disabled = readOnly;
    this.replaceField.disabled = readOnly;
  }

  /** Shows the replace row; with `focus`, its field takes the keyboard. */
  showReplace(visible: boolean, focus = visible): void {
    this.replaceRow.hidden = !visible;
    this.toggleReplace.setAttribute("aria-expanded", String(visible));
    this.dom.classList.toggle("pv-find-expanded", visible);
    if (focus) {
      (this.searchField.value ? this.replaceField : this.searchField).focus();
      if (this.searchField.value) this.replaceField.select();
    }
  }

  /** Replace all as one undo step; the run is remembered for the macro dialog. */
  replaceEverything(): boolean {
    const replaced = replaceAll(this.view);
    if (replaced && this.query.valid) this.options.onReplaceAll?.(this.query);
    return replaced;
  }

  openBatch(): boolean {
    if (!this.options.onBatch) return false;
    const query = this.query;
    const initial = query.search ? `${query.search}${query.search.includes("=>") || query.replace.includes("=>") ? "\t" : " => "}${query.replace}` : "";
    this.options.onBatch(this.view, initial);
    return true;
  }

  focusSearch(): void {
    this.searchField.focus();
    this.searchField.select();
  }

  private toggle(label: string, title: string): HTMLButtonElement {
    return element("button", { type: "button", class: "pv-find-option", title, "aria-label": title, "aria-pressed": "false" }, label);
  }

  private action(icon: string, title: string, run: () => boolean): HTMLButtonElement {
    const button = element("button", { type: "button", class: "pv-find-action", title, "aria-label": title }, icon);
    button.addEventListener("click", () => run());
    return button;
  }

  private textAction(label: string, title: string, run: () => boolean): HTMLButtonElement {
    const button = element("button", { type: "button", class: "pv-find-text", title }, label);
    button.textContent = label;
    button.addEventListener("click", () => run());
    return button;
  }

  private readQuery(query: SearchQuery): void {
    this.query = query;
    if (this.searchField.value !== query.search) this.searchField.value = query.search;
    if (this.replaceField.value !== query.replace) this.replaceField.value = query.replace;
    this.caseButton.setAttribute("aria-pressed", String(query.caseSensitive));
    this.wordButton.setAttribute("aria-pressed", String(query.wholeWord));
    this.regexButton.setAttribute("aria-pressed", String(query.regexp));
    this.refreshCount();
  }

  private flip(option: "caseSensitive" | "wholeWord" | "regexp"): void {
    this.readQuery(new SearchQuery({ ...this.spec(), [option]: !this.query[option] }));
    this.view.dispatch({ effects: setSearchQuery.of(this.query) });
    this.jumpToFirst();
  }

  private spec() {
    return {
      search: this.searchField.value,
      replace: this.replaceField.value,
      caseSensitive: this.query.caseSensitive,
      wholeWord: this.query.wholeWord,
      regexp: this.query.regexp,
      literal: true,
    };
  }

  private commit(incremental: boolean): void {
    const query = new SearchQuery(this.spec());
    if (query.eq(this.query)) return;
    this.query = query;
    this.view.dispatch({ effects: setSearchQuery.of(query) });
    if (incremental) this.jumpToFirst();
  }

  /** Incremental search: select the first match from where the search began, like VS Code. */
  private jumpToFirst(): void {
    if (!this.query.valid) return;
    const state = this.view.state;
    let cursor = this.query.getCursor(state, this.origin);
    let match = cursor.next();
    if (match.done) {
      cursor = this.query.getCursor(state, 0, this.origin);
      match = cursor.next();
    }
    if (match.done) return;
    this.view.dispatch({
      selection: EditorSelection.single(match.value.from, match.value.to),
      effects: EditorView.scrollIntoView(match.value.from, { y: "center" }),
      userEvent: "select.search",
    });
  }

  private refreshCount(): void {
    const text = describeMatches(countMatches(this.view, this.query), this.query);
    this.count.textContent = text;
    this.dom.classList.toggle("pv-find-none", Boolean(this.query.search) && (text === "Keine Treffer" || text === "Ungültiger Ausdruck"));
  }

  private keydown(event: KeyboardEvent): void {
    const target = event.target;
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      const option = event.code === "KeyC" ? "caseSensitive" : event.code === "KeyW" ? "wholeWord" : event.code === "KeyR" ? "regexp" : null;
      if (option) {
        event.preventDefault();
        this.flip(option);
        return;
      }
    }
    if (event.key !== "Enter") {
      // Strg+F/H, F3, Strg+G and Esc also work while a field of the widget has the focus.
      if (runScopeHandlers(this.view, event, "search-panel")) event.preventDefault();
      return;
    }
    event.preventDefault();
    if (target === this.replaceField) {
      if ((event.ctrlKey || event.metaKey) && event.altKey) this.replaceEverything();
      else replaceNext(this.view);
    } else if (target === this.searchField) {
      if (event.shiftKey) findPrevious(this.view);
      else findNext(this.view);
      this.origin = this.view.state.selection.main.from;
    }
  }
}

/** Opens find and replace with the replace field focused (Strg+H, Cmd+Alt+F). */
export function openReplacePanel(view: EditorView): boolean {
  openSearchPanel(view);
  const panel = panels.get(view);
  if (!panel) return false;
  panel.showReplace(!view.state.readOnly);
  return true;
}

/** Options of each editor with find and replace, for commands started outside the editor. */
const registered = new WeakMap<EditorView, FindReplaceOptions>();

/** Toolbar entry points: find, replace and the list replacement / macro dialog. */
export function openFind(view: EditorView): boolean {
  return openFindPanel(view);
}

export function openBatch(view: EditorView): boolean {
  const options = registered.get(view);
  return options ? openBatchDialog(options)(view) : false;
}

function openFindPanel(view: EditorView): boolean {
  const opened = openSearchPanel(view);
  panels.get(view)?.focusSearch();
  return opened;
}

const theme = EditorView.baseTheme({
  // The widget floats over the text in the top right corner, like VS Code.
  ".cm-panels.cm-panels-top": {
    position: "absolute",
    top: "6px",
    right: "18px",
    left: "auto",
    zIndex: "5",
    border: "0 !important",
    background: "transparent",
  },
  ".pv-find": {
    display: "flex",
    gap: "3px",
    padding: "4px 5px 4px 3px",
    border: "1px solid var(--border-strong, #373c49)",
    borderRadius: "7px",
    color: "var(--text, #e7e9ef)",
    background: "var(--surface-raised, #1d2028)",
    boxShadow: "0 6px 20px rgb(0 0 0 / 32%)",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    fontSize: "11px",
  },
  ".pv-find-rows": { display: "grid", gap: "4px" },
  ".pv-find-row": { display: "flex", alignItems: "center", gap: "2px" },
  ".pv-find-field": {
    display: "flex",
    alignItems: "center",
    width: "min(250px, 40vw)",
    height: "26px",
    padding: "0 2px 0 7px",
    border: "1px solid var(--border-strong, #373c49)",
    borderRadius: "5px",
    background: "var(--inset, #12151a)",
  },
  ".pv-find-field:focus-within": { borderColor: "var(--accent, #7183e7)" },
  ".pv-find-none .pv-find-row:first-child .pv-find-field": { borderColor: "var(--danger, #ef8b91)" },
  ".pv-find-field input": {
    minWidth: "0",
    flex: "1",
    border: "0",
    outline: "none",
    color: "inherit",
    background: "transparent",
    font: "inherit",
  },
  ".pv-find button": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "0",
    borderRadius: "4px",
    color: "var(--text-muted, #9ba2b1)",
    background: "transparent",
    cursor: "pointer",
    font: "inherit",
  },
  ".pv-find button:hover:not(:disabled)": { color: "var(--text, #e7e9ef)", background: "var(--surface-hover, #242833)" },
  ".pv-find button:focus-visible": { outline: "2px solid var(--accent, #7183e7)", outlineOffset: "-2px" },
  ".pv-find button:disabled": { opacity: "0.4", cursor: "default" },
  ".pv-find svg": { width: "14px", height: "14px", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" },
  ".pv-find-expand": { width: "18px", alignSelf: "stretch" },
  ".pv-find-expand svg": { transition: "transform 120ms ease" },
  ".pv-find-expanded .pv-find-expand svg": { transform: "rotate(90deg)" },
  ".pv-find-option": { width: "22px", height: "20px", fontSize: "10px", fontWeight: "650" },
  ".pv-find-option[aria-pressed=true]": {
    color: "var(--text, #e7e9ef) !important",
    background: "color-mix(in srgb, var(--accent, #7183e7) 35%, transparent) !important",
    boxShadow: "inset 0 0 0 1px var(--accent, #7183e7)",
  },
  ".pv-find-word": { textDecoration: "underline", textUnderlineOffset: "2px" },
  ".pv-find-count": { minWidth: "76px", padding: "0 6px", color: "var(--text-muted, #9ba2b1)", whiteSpace: "nowrap" },
  ".pv-find-none .pv-find-count": { color: "var(--danger, #ef8b91)" },
  ".pv-find-action": { width: "24px", height: "24px" },
  ".pv-find-text": { height: "24px", padding: "0 8px", border: "1px solid var(--border-strong, #373c49) !important" },
});

/** Whether the key event being handled right now has Shift pressed. */
function currentEventHasShift(): boolean {
  const event = (globalThis as { event?: Event }).event;
  return event instanceof KeyboardEvent && event.shiftKey;
}

/** Opens the list replacement / macro dialog (Strg/Cmd+Umschalt+H). */
function openBatchDialog(options: FindReplaceOptions): (view: EditorView) => boolean {
  return (view) => {
    if (!options.onBatch) return false;
    const panel = panels.get(view);
    if (panel) return panel.openBatch();
    options.onBatch(view, "");
    return true;
  };
}

/** Find and replace for every editor (also the read-only code view). */
export function findReplace(options: FindReplaceOptions = {}): Extension {
  return [
    search({ top: true, literal: true, createPanel: (view) => new FindReplacePanel(view, options) }),
    ViewPlugin.define((view) => {
      registered.set(view, options);
      return { destroy: () => registered.delete(view) };
    }),
    theme,
    Prec.high(
      keymap.of([
        { key: "Mod-f", run: openFindPanel, scope: "editor search-panel" },
        // With Caps Lock (or synthetic events) Shift+H arrives as "h" and would match Mod-h.
        { key: "Mod-h", run: (view) => (currentEventHasShift() ? openBatchDialog(options)(view) : openReplacePanel(view)), scope: "editor search-panel" },
        { mac: "Mod-Alt-f", run: openReplacePanel, scope: "editor search-panel" },
        { key: "Mod-Shift-h", run: openBatchDialog(options), scope: "editor search-panel" },
      ]),
    ),
  ];
}
