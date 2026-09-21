import {
  DEFAULT_FILE_ASSOCIATION_IDS,
  normalizeAssociationIds,
} from "$lib/files/associations";

import type { ViewMode } from "$lib/files/types";

export type ThemePreference = "dark" | "light" | "system";

export interface AppSettings {
  theme: ThemePreference;
  defaultViewMode: ViewMode;
  extensionViewModes: Record<string, ViewMode>;
  editorFontSize: number;
  previewFontSize: number;
  iconSize: number;
  wordWrap: boolean;
  spellcheck: boolean;
  debugMode: boolean;
  defaultAppAssociations: string[];
}

export const DEFAULT_SETTINGS: AppSettings = Object.freeze({
  theme: "dark",
  defaultViewMode: "edit",
  extensionViewModes: {},
  editorFontSize: 14,
  previewFontSize: 16,
  iconSize: 17,
  wordWrap: true,
  spellcheck: true,
  debugMode: false,
  defaultAppAssociations: [...DEFAULT_FILE_ASSOCIATION_IDS],
});

const STORE_FILE = "settings.json";
const STORE_KEY = "preferences";
const LOCAL_STORAGE_KEY = "p-viewer.settings";

type NativeStore = Awaited<ReturnType<typeof import("@tauri-apps/plugin-store")["load"]>>;
let nativeStorePromise: Promise<NativeStore> | null = null;
let saveQueue = Promise.resolve();

export function normalizeSettings(value: unknown): AppSettings {
  const source = isRecord(value) ? value : {};
  return {
    theme: isTheme(source.theme) ? source.theme : DEFAULT_SETTINGS.theme,
    defaultViewMode: isViewMode(source.defaultViewMode) ? source.defaultViewMode : DEFAULT_SETTINGS.defaultViewMode,
    extensionViewModes: normalizeExtensionViewModes(source.extensionViewModes),
    editorFontSize: clampNumber(
      source.editorFontSize,
      10,
      28,
      DEFAULT_SETTINGS.editorFontSize,
    ),
    previewFontSize: clampNumber(
      source.previewFontSize,
      12,
      32,
      DEFAULT_SETTINGS.previewFontSize,
    ),
    iconSize: clampNumber(source.iconSize, 12, 26, DEFAULT_SETTINGS.iconSize),
    wordWrap:
      typeof source.wordWrap === "boolean"
        ? source.wordWrap
        : DEFAULT_SETTINGS.wordWrap,
    spellcheck:
      typeof source.spellcheck === "boolean"
        ? source.spellcheck
        : DEFAULT_SETTINGS.spellcheck,
    debugMode:
      typeof source.debugMode === "boolean" ? source.debugMode : DEFAULT_SETTINGS.debugMode,
    defaultAppAssociations: normalizeAssociationIds(source.defaultAppAssociations),
  };
}

export async function loadSettings(): Promise<AppSettings> {
  if (isTauri()) {
    try {
      const store = await getNativeStore();
      return normalizeSettings(await store.get<unknown>(STORE_KEY));
    } catch (error) {
      console.warn("Native Einstellungen konnten nicht geladen werden.", error);
    }
  }

  if (typeof localStorage !== "undefined") {
    try {
      const serialized = localStorage.getItem(LOCAL_STORAGE_KEY);
      return normalizeSettings(serialized ? JSON.parse(serialized) : undefined);
    } catch (error) {
      console.warn("Lokale Einstellungen konnten nicht geladen werden.", error);
    }
  }

  return resetSettings();
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const normalized = normalizeSettings(settings);

  if (isTauri()) {
    saveQueue = saveQueue.catch(() => undefined).then(async () => {
      const store = await getNativeStore();
      await store.set(STORE_KEY, normalized);
      await store.save();
    });
    return saveQueue;
  }

  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
  }
}

export function resetSettings(): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    extensionViewModes: {},
    defaultAppAssociations: [...DEFAULT_SETTINGS.defaultAppAssociations],
  };
}

export function nativeThemeFor(
  preference: ThemePreference,
): "dark" | "light" | null {
  return preference === "system" ? null : preference;
}

async function getNativeStore(): Promise<NativeStore> {
  nativeStorePromise ??= import("@tauri-apps/plugin-store").then(({ load }) =>
    load(STORE_FILE, {
      autoSave: false,
      defaults: { [STORE_KEY]: DEFAULT_SETTINGS },
    }),
  );
  return nativeStorePromise;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isViewMode(value: unknown): value is ViewMode {
  return value === "edit" || value === "view" || value === "split";
}

/** One extension, optionally dotted; compound suffixes such as d.ts are supported. */
export function normalizeExtension(value: string): string | null {
  const extension = value.trim().toLowerCase().replace(/^\./, "");
  return extension.length <= 64 && /^[a-z0-9][a-z0-9_+-]*(?:\.[a-z0-9][a-z0-9_+-]*)*$/.test(extension)
    ? extension : null;
}

function normalizeExtensionViewModes(value: unknown): Record<string, ViewMode> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, mode]) => {
    const extension = normalizeExtension(key);
    return extension && isViewMode(mode) ? [[extension, mode]] : [];
  }));
}

export function preferredViewMode(settings: AppSettings, fileName: string): ViewMode {
  const name = fileName.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  // Longest matching suffix wins; use own properties, never Object.prototype.
  for (let dot = name.indexOf("."); dot >= 0; dot = name.indexOf(".", dot + 1)) {
    const extension = name.slice(dot + 1);
    if (Object.hasOwn(settings.extensionViewModes, extension)) return settings.extensionViewModes[extension];
  }
  return settings.defaultViewMode;
}

function isTheme(value: unknown): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

function clampNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}
