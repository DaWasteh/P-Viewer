import { invoke } from "@tauri-apps/api/core";

export const MAX_LOCAL_IMAGE_COUNT = 32;

export interface LocalImagePayload {
  source: string;
  dataUrl: string | null;
  path: string | null;
  error: string | null;
}

export function isRelativeImageSource(source: string): boolean {
  const value = source.trim();
  return Boolean(value) && !/^(?:[a-z][a-z\d+.-]*:|[\\/]|#)/i.test(value);
}

export async function readLocalImages(
  documentPath: string,
  sources: string[],
): Promise<LocalImagePayload[]> {
  const uniqueSources = [...new Set(sources)].filter(isRelativeImageSource);
  const selected = uniqueSources.slice(0, MAX_LOCAL_IMAGE_COUNT);
  const omitted = uniqueSources.slice(MAX_LOCAL_IMAGE_COUNT).map((source) => ({
    source,
    dataUrl: null,
    path: null,
    error: `Pro Vorschau werden höchstens ${MAX_LOCAL_IMAGE_COUNT} lokale Bilder geladen.`,
  }));

  if (!documentPath || selected.length === 0) return omitted;
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return [
      ...selected.map((source) => ({
        source,
        dataUrl: null,
        path: null,
        error: "Lokale Bilder sind nur in der P-Viewer-Desktop-App verfügbar.",
      })),
      ...omitted,
    ];
  }

  const resolved = await invoke<LocalImagePayload[]>("read_local_images", {
    documentPath,
    sources: selected,
  });
  return [...resolved, ...omitted];
}
