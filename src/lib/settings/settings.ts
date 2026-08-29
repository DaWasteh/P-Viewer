export type ThemePreference = "dark" | "light" | "system";

export interface AppSettings {
  theme: ThemePreference;
  editorFontSize: number;
  previewFontSize: number;
  iconSize: number;
  wordWrap: boolean;
  spellcheck: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = Object.freeze({
  theme: "dark",
  editorFontSize: 14,
  previewFontSize: 16,
  iconSize: 17,
  wordWrap: true,
  spellcheck: true,
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

  return { ...DEFAULT_SETTINGS };
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
  return { ...DEFAULT_SETTINGS };
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
