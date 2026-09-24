import { invoke } from "@tauri-apps/api/core";
import { parseTransferState, type DocumentTab, type TabViewState, type TransferState } from "./tabs";
import type { ViewMode } from "./types";

/**
 * Session restore (issue #4). The frontend decides what a window's session
 * contains; Rust (`session.rs`) only stores it atomically per window label and
 * keeps unsaved text in separate recovery files. Hidden-in-overflow state is
 * never stored: it is derived from the current window width.
 */
export const SESSION_VERSION = 1;

export interface SessionTab extends TransferState {
  path: string;
  name: string;
  untitled: boolean;
  mode: ViewMode;
}

export interface WindowSession {
  version: typeof SESSION_VERSION;
  activeRecoveryId?: string;
  tabs: SessionTab[];
}

const VIEW_MODES: readonly ViewMode[] = ["edit", "view", "split"];

/** Snapshot of one tab; `view` carries the editor/preview state captured right now. */
export function sessionTabFor(tab: DocumentTab, view: TabViewState | undefined, hasRecovery: boolean): SessionTab {
  const document = tab.document;
  const entry: SessionTab = {
    recoveryId: tab.recoveryId,
    path: document.path,
    name: document.name,
    untitled: document.untitled || !document.path,
    mode: tab.mode ?? "edit",
    pinned: Boolean(tab.pinned),
    hasRecovery,
    encoding: document.encoding,
    lineEnding: document.lineEnding,
    hasBom: document.hasBom,
  };
  // A tab that is still waiting for its first load keeps its last known version.
  const version = tab.restore ? tab.restore.version : document.version;
  if (version) entry.version = version;
  if (tab.splitRatio !== undefined) entry.splitRatio = tab.splitRatio;
  if (tab.previewSync !== undefined) entry.previewSync = tab.previewSync;
  const state = view ?? tab.view;
  if (state?.selection) entry.selection = state.selection;
  if (state?.editorScroll) entry.editorScroll = Math.round(state.editorScroll);
  if (state?.previewScroll) entry.previewScroll = Math.round(state.previewScroll);
  if (state?.folds?.length) entry.folds = state.folds;
  return entry;
}

/** Parses a stored window session; broken tabs are skipped, never the whole session. */
export function parseWindowSession(raw: string): WindowSession | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || !Array.isArray((value as { tabs?: unknown }).tabs)) return null;
  const source = value as { version?: unknown; activeRecoveryId?: unknown; tabs: unknown[] };
  if (source.version !== SESSION_VERSION) return null;
  const tabs: SessionTab[] = [];
  const seen = new Set<string>();
  for (const candidate of source.tabs) {
    const state = parseTransferState(candidate);
    if (!state || seen.has(state.recoveryId)) continue;
    const record = candidate as Record<string, unknown>;
    const mode = VIEW_MODES.includes(record.mode as ViewMode) ? (record.mode as ViewMode) : "edit";
    const untitled = state.untitled ?? !state.path;
    if (!state.name || (!untitled && !state.path)) continue;
    seen.add(state.recoveryId);
    tabs.push({ ...state, path: untitled ? "" : state.path ?? "", name: state.name, untitled, mode });
  }
  const active = typeof source.activeRecoveryId === "string" && seen.has(source.activeRecoveryId)
    ? source.activeRecoveryId
    : undefined;
  return { version: SESSION_VERSION, ...(active ? { activeRecoveryId: active } : {}), tabs };
}

function desktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Window sessions of the previous run, handed out once per process. */
export async function takeRestoredSessions(): Promise<WindowSession[]> {
  if (!desktop()) return [];
  const raw = (await invoke<string[] | null>("session_take_restore")) ?? [];
  return raw.map(parseWindowSession).filter((session): session is WindowSession => Boolean(session));
}

export async function storeWindowSession(session: WindowSession | null): Promise<void> {
  if (!desktop()) return;
  await invoke("session_store", { session: session ? JSON.stringify(session) : null });
}

export async function clearStoredSession(includeRecovery: boolean, suspend: boolean): Promise<void> {
  if (!desktop()) return;
  await invoke("session_clear", { includeRecovery, suspend });
}

export async function resumeSessionStorage(): Promise<void> {
  if (!desktop()) return;
  await invoke("session_resume");
}

export async function hasStoredRecovery(): Promise<boolean> {
  if (!desktop()) return false;
  return Boolean(await invoke<boolean>("session_has_recovery"));
}

export async function writeRecovery(id: string, content: string): Promise<void> {
  if (!desktop()) return;
  await invoke("session_write_recovery", { id, content });
}

export async function readRecovery(id: string): Promise<string | null> {
  if (!desktop()) return null;
  return (await invoke<string | null>("session_read_recovery", { id })) ?? null;
}

export async function removeRecovery(id: string): Promise<void> {
  if (!desktop()) return;
  await invoke("session_remove_recovery", { id });
}
