/**
 * "Mehrfach ersetzen": a list of search → replacement rules applied in order,
 * e.g. to maintain ad block lists. One rule per line, separated by a tab or
 * by `=>`; an empty replacement deletes the matches. The whole run becomes a
 * single editor transaction, so one undo reverts it.
 */
export interface ReplaceRule {
  search: string;
  replace: string;
  /** 1-based line in the rule text, for error messages. */
  line: number;
}

export interface ReplaceOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
}

export const DEFAULT_REPLACE_OPTIONS: ReplaceOptions = { caseSensitive: true, wholeWord: false, regexp: false };

export interface ParsedRules {
  rules: ReplaceRule[];
  errors: string[];
}

/** Separator: the first tab, otherwise the first `=>` (spaces around it are trimmed). */
export function parseRules(text: string): ParsedRules {
  const rules: ReplaceRule[] = [];
  const errors: string[] = [];
  text.split(/\r\n|\r|\n/).forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) return;
    let search: string;
    let replace: string;
    const tab = raw.indexOf("\t");
    if (tab >= 0) {
      search = raw.slice(0, tab);
      replace = raw.slice(tab + 1);
    } else {
      const arrow = raw.indexOf("=>");
      if (arrow < 0) {
        errors.push(`Zeile ${line}: Trennzeichen fehlt (Tab oder „=>“).`);
        return;
      }
      search = raw.slice(0, arrow).replace(/ +$/, "");
      replace = raw.slice(arrow + 2).replace(/^ +/, "");
    }
    if (!search) {
      errors.push(`Zeile ${line}: Suchtext fehlt.`);
      return;
    }
    rules.push({ search, replace, line });
  });
  return { rules, errors };
}

export function formatRules(rules: ReadonlyArray<Pick<ReplaceRule, "search" | "replace">>): string {
  return rules.map((rule) => (rule.search.includes("=>") || rule.replace.includes("=>") ? `${rule.search}\t${rule.replace}` : `${rule.search} => ${rule.replace}`)).join("\n");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The regular expression of a rule; throws with a readable message for invalid patterns. */
export function ruleExpression(rule: Pick<ReplaceRule, "search" | "line">, options: ReplaceOptions): RegExp {
  let source = options.regexp ? rule.search : escapeRegExp(rule.search);
  if (options.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  try {
    return new RegExp(source, `g${options.caseSensitive ? "" : "i"}u`);
  } catch {
    throw new Error(`Zeile ${rule.line}: ungültiger regulärer Ausdruck.`);
  }
}

export interface ReplaceResult {
  text: string;
  /** Matches replaced per rule, in rule order. */
  counts: number[];
  total: number;
}

/** Applies the rules one after another; later rules see the result of earlier ones. */
export function applyRules(text: string, rules: readonly ReplaceRule[], options: ReplaceOptions): ReplaceResult {
  const counts: number[] = [];
  let result = text;
  for (const rule of rules) {
    const expression = ruleExpression(rule, options);
    let count = 0;
    result = result.replace(expression, (...match) => {
      // Empty matches of a regular expression would otherwise loop over every position.
      if (match[0] === "") return match[0];
      count += 1;
      if (!options.regexp) return rule.replace;
      const groups = match.slice(1, -2);
      return rule.replace.replace(/\$(\$|&|\d{1,2})/g, (token, reference: string) => {
        if (reference === "$") return "$";
        if (reference === "&") return match[0];
        return groups[Number(reference) - 1] ?? token;
      });
    });
    counts.push(count);
  }
  return { text: result, counts, total: counts.reduce((sum, count) => sum + count, 0) };
}

/** The smallest change turning `before` into `after`, so cursor and folds elsewhere survive. */
export function minimalChange(before: string, after: string): { from: number; to: number; insert: string } | null {
  if (before === after) return null;
  let start = 0;
  const limit = Math.min(before.length, after.length);
  while (start < limit && before.charCodeAt(start) === after.charCodeAt(start)) start += 1;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)) {
    endBefore -= 1;
    endAfter -= 1;
  }
  return { from: start, to: endBefore, insert: after.slice(start, endAfter) };
}

// ---------------------------------------------------------------------------
// History of replacement runs, kept locally across restarts
// ---------------------------------------------------------------------------

/** A rule list with patterns, or a JavaScript transformation of the whole text. */
export type MacroKind = "rules" | "script";

export interface ReplaceHistoryEntry {
  id: string;
  /** Named entries are macros: kept permanently and listed first. */
  name: string;
  kind: MacroKind;
  /** Rule text or script source. */
  rules: string;
  options: ReplaceOptions;
  usedAt: number;
  uses: number;
}

export const MAX_REPLACE_HISTORY = 40;
const STORE_FILE = "replace-history.json";
const STORE_KEY = "entries";
const LOCAL_STORAGE_KEY = "p-viewer.replace-history";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeHistory(value: unknown): ReplaceHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((entry) => typeof entry.id === "string" && typeof entry.rules === "string" && entry.rules.length <= 1_000_000)
    .map((entry) => ({
      id: entry.id as string,
      name: typeof entry.name === "string" ? entry.name.slice(0, 120) : "",
      kind: (entry.kind === "script" ? "script" : "rules") as MacroKind,
      rules: entry.rules as string,
      options: {
        caseSensitive: isRecord(entry.options) && typeof entry.options.caseSensitive === "boolean" ? entry.options.caseSensitive : DEFAULT_REPLACE_OPTIONS.caseSensitive,
        wholeWord: isRecord(entry.options) && typeof entry.options.wholeWord === "boolean" ? entry.options.wholeWord : false,
        regexp: isRecord(entry.options) && typeof entry.options.regexp === "boolean" ? entry.options.regexp : false,
      },
      usedAt: typeof entry.usedAt === "number" ? entry.usedAt : 0,
      uses: typeof entry.uses === "number" ? entry.uses : 1,
    }))
    .sort((left, right) => right.usedAt - left.usedAt)
    .filter(keepWithinLimit());
}

/** Macros (named entries) are never dropped; unnamed runs keep the newest ones. */
function keepWithinLimit(): (entry: ReplaceHistoryEntry) => boolean {
  let unnamed = 0;
  return (entry) => Boolean(entry.name) || ++unnamed <= MAX_REPLACE_HISTORY;
}

/**
 * Records a run: an identical rule set (same rules and options) moves to the
 * top instead of appearing twice; a given name is kept or updated.
 */
export function rememberRun(
  history: readonly ReplaceHistoryEntry[],
  run: { name: string; kind?: MacroKind; rules: string; options: ReplaceOptions },
  now = Date.now(),
): ReplaceHistoryEntry[] {
  const kind = run.kind ?? "rules";
  const same = (entry: ReplaceHistoryEntry) =>
    entry.kind === kind &&
    entry.rules === run.rules &&
    entry.options.caseSensitive === run.options.caseSensitive &&
    entry.options.wholeWord === run.options.wholeWord &&
    entry.options.regexp === run.options.regexp;
  const existing = history.find(same);
  const entry: ReplaceHistoryEntry = existing
    ? { ...existing, name: run.name.trim() || existing.name, usedAt: now, uses: existing.uses + 1 }
    : {
        id: globalThis.crypto?.randomUUID?.() ?? `h-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: run.name.trim(),
        kind,
        rules: run.rules,
        options: { ...run.options },
        usedAt: now,
        uses: 1,
      };
  return [entry, ...history.filter((candidate) => candidate !== existing)].filter(keepWithinLimit());
}

export function renameEntry(history: readonly ReplaceHistoryEntry[], id: string, name: string): ReplaceHistoryEntry[] {
  return history.map((entry) => (entry.id === id ? { ...entry, name: name.trim().slice(0, 120) } : entry));
}

export function removeEntry(history: readonly ReplaceHistoryEntry[], id: string): ReplaceHistoryEntry[] {
  return history.filter((entry) => entry.id !== id);
}

/** Short label for history lists: the name, or the first rule. */
export function historyLabel(entry: Pick<ReplaceHistoryEntry, "name" | "rules">): string {
  if (entry.name) return entry.name;
  const first = entry.rules.split(/\r\n|\r|\n/).find((line) => line.trim() && !line.trim().startsWith("//")) ?? "";
  return first.length > 60 ? `${first.slice(0, 59)}…` : first;
}

type NativeStore = Awaited<ReturnType<typeof import("@tauri-apps/plugin-store")["load"]>>;
let storePromise: Promise<NativeStore> | null = null;

function desktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function store(): Promise<NativeStore> {
  storePromise ??= import("@tauri-apps/plugin-store").then(({ load }) => load(STORE_FILE, { autoSave: false, defaults: {} }));
  return storePromise;
}

export async function loadReplaceHistory(): Promise<ReplaceHistoryEntry[]> {
  try {
    if (desktop()) return normalizeHistory(await (await store()).get<unknown>(STORE_KEY));
    return normalizeHistory(JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export async function saveReplaceHistory(history: readonly ReplaceHistoryEntry[]): Promise<void> {
  if (desktop()) {
    const native = await store();
    await native.set(STORE_KEY, history);
    await native.save();
    return;
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(history));
}

// ---------------------------------------------------------------------------
// JavaScript macros
// ---------------------------------------------------------------------------

export const SCRIPT_TEMPLATE = `// Erhält den Dokumenttext (bzw. die Auswahl) als „text“ und gibt den neuen Text zurück.
// Beispiel für Adblock-Listen: Kommentare entfernen, Zeilen trimmen, Duplikate streichen.
const seen = new Set();
return text
  .split("\\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("!") && !seen.has(line) && seen.add(line))
  .join("\\n");`;

export const SCRIPT_TIMEOUT = 5_000;
const MAX_SCRIPT_RESULT = 64 * 1024 * 1024;

/**
 * Runs a user macro in a dedicated worker. The worker only receives the text
 * and returns text: it has no DOM, no P-Viewer IPC access and no network or
 * file functions, and it is terminated after a timeout. The script is loaded
 * as a worker source (not evaluated), so the app keeps its strict CSP.
 */
export function runScript(text: string, code: string, timeout = SCRIPT_TIMEOUT): Promise<string> {
  const source = `"use strict";
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches", "Worker", "SharedWorker", "BroadcastChannel"]) {
  try { Object.defineProperty(self, name, { value: undefined, configurable: false, writable: false }); } catch {}
}
const __run = async (text) => {
${code}
};
self.onmessage = async (event) => {
  try {
    const result = await __run(event.data);
    if (typeof result !== "string") throw new TypeError("Das Skript muss mit return einen Text zurückgeben.");
    self.postMessage({ ok: true, text: result });
  } catch (error) {
    self.postMessage({ ok: false, error: error && error.message ? error.message : String(error) });
  }
};
`;
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  return new Promise<string>((resolve, reject) => {
    const worker = new Worker(url);
    const finish = (callback: () => void) => {
      window.clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      callback();
    };
    const timer = window.setTimeout(
      () => finish(() => reject(new Error(`Das Skript wurde nach ${timeout / 1000} Sekunden abgebrochen.`))),
      timeout,
    );
    worker.onmessage = (event: MessageEvent<{ ok: boolean; text?: string; error?: string }>) => {
      const data = event.data;
      finish(() => {
        if (!data.ok) reject(new Error(`Skriptfehler: ${data.error}`));
        else if ((data.text ?? "").length > MAX_SCRIPT_RESULT) reject(new Error("Das Ergebnis des Skripts ist zu groß."));
        else resolve(data.text ?? "");
      });
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish(() => reject(new Error(`Skriptfehler: ${event.message || "Syntaxfehler"}`)));
    };
    worker.postMessage(text);
  });
}
