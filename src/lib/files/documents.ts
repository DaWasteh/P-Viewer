import { sameDocumentPath } from "./tabs";
import { invoke } from "@tauri-apps/api/core";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import {
  SUPPORTED_BINARY_EXTENSIONS,
  SUPPORTED_FILE_EXTENSIONS,
  SUPPORTED_TEXT_EXTENSIONS,
  detectFileType,
  fileNameFromPath,
  isBinaryKind,
} from "./fileTypes";
import type {
  BinaryDocumentPayload,
  DocumentPayload,
  LineEnding,
  OpenDocument,
  SaveResult,
} from "./types";

const TEXT_FILTER = {
  name: "Text, Code und Dokumente",
  extensions: [...SUPPORTED_TEXT_EXTENSIONS],
};
const ALL_FILES_FILTER = { name: "Alle Dateien", extensions: ["*"] };

const OPEN_FILTERS = [
  { name: "Alle unterstützten Dateien", extensions: [...SUPPORTED_FILE_EXTENSIONS] },
  TEXT_FILTER,
  { name: "Bilder und PDF", extensions: [...SUPPORTED_BINARY_EXTENSIONS] },
  ALL_FILES_FILTER,
];

// Only text documents can be written; images and PDF are read-only viewers.
const SAVE_FILTERS = [TEXT_FILTER, ALL_FILES_FILTER];

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function requireDesktop(): void {
  if (!inTauri()) {
    throw new Error(
      "Native Dateidialoge sind nur in der P-Viewer-Desktop-App verfügbar.",
    );
  }
}

export function defaultLineEnding(): LineEnding {
  if (typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent)) {
    return "crlf";
  }
  return "lf";
}

export function createUntitledDocument(name = "Unbenannt.txt"): OpenDocument {
  return {
    path: "",
    name,
    content: "",
    savedContent: "",
    encoding: "UTF-8",
    hasBom: false,
    lineEnding: defaultLineEnding(),
    size: 0,
    lossy: false,
    untitled: true,
    metadataDirty: false,
    fileType: detectFileType(name),
  };
}

/** Characters held in memory for a tab: text content plus any base64 binary payload. */
export function documentWeight(document: Pick<OpenDocument, "content" | "binary">): number {
  return document.content.length + (document.binary?.base64.length ?? 0);
}

export async function chooseAndOpenDocument(): Promise<OpenDocument | null> {
  requireDesktop();
  const selected = await open({
    multiple: false,
    directory: false,
    filters: OPEN_FILTERS,
  });

  if (typeof selected !== "string") return null;
  return openDocumentPath(selected);
}

export async function openDocumentPath(path: string, encoding?: string): Promise<OpenDocument> {
  requireDesktop();
  const kind = detectFileType(fileNameFromPath(path)).kind;
  if (isBinaryKind(kind)) {
    const payload = await invoke<BinaryDocumentPayload>("read_binary_document", { path, kind });
    return {
      path: payload.path,
      name: payload.name,
      content: "",
      savedContent: "",
      encoding: "Binär",
      hasBom: false,
      lineEnding: "lf",
      size: payload.size,
      lossy: false,
      untitled: false,
      metadataDirty: false,
      fileType: detectFileType(payload.name),
      binary: { mime: payload.mime, base64: payload.base64 },
    };
  }

  const payload = await invoke<DocumentPayload>("read_document", { path, encoding: encoding ?? null });
  return {
    ...payload,
    savedContent: payload.content,
    untitled: false,
    metadataDirty: false,
    fileType: detectFileType(payload.name),
  };
}

export async function saveDocument(
  document: OpenDocument,
  forceDialog = false,
  validatePath?: (path: string) => void,
): Promise<OpenDocument | null> {
  requireDesktop();
  if (document.binary) throw new Error("Bilder und PDF-Dokumente werden nur angezeigt und können in P-Viewer nicht gespeichert werden.");
  if (document.lossy && !forceDialog) throw new Error("Diese Datei wurde mit Ersatzzeichen gelesen. Bitte die Kodierung in der Statusleiste korrigieren oder die bearbeitete Kopie mit Speichern unter sichern.");
  let path = document.path;

  if (forceDialog || document.untitled || !path) {
    const selected = await save({
      defaultPath: document.name || "Unbenannt.txt",
      filters: SAVE_FILTERS,
    });
    if (!selected) return null;
    path = selected;
  }

  validatePath?.(path);
  const savedContent = document.content;
  const result = await invoke<SaveResult>("write_document", {
    path,
    content: savedContent,
    encoding: document.encoding,
    hasBom: document.hasBom,
    lineEnding: document.lineEnding,
    expectedVersion: sameDocumentPath(path, document.path) ? document.version ?? null : null,
  });
  const name = fileNameFromPath(result.path);

  return {
    ...document,
    path: result.path,
    name,
    savedContent,
    size: result.size,
    version: result.version,
    lossy: false,
    untitled: false,
    metadataDirty: false,
    fileType: detectFileType(name),
  };
}

export async function confirmDiscardChanges(name: string): Promise<boolean> {
  if (!inTauri()) {
    return window.confirm(`Ungespeicherte Änderungen an „${name}“ verwerfen?`);
  }

  return confirm(`Ungespeicherte Änderungen an „${name}“ gehen verloren.`, {
    title: "Änderungen verwerfen?",
    kind: "warning",
    okLabel: "Verwerfen",
    cancelLabel: "Abbrechen",
  });
}

export async function confirmDiscardDocuments(names: string[]): Promise<boolean> {
  if (names.length <= 1) return confirmDiscardChanges(names[0] ?? "dem Dokument");

  const listedNames = names.slice(0, 5).map((name) => `• ${name}`).join("\n");
  const remaining = names.length > 5 ? `\n• und ${names.length - 5} weitere` : "";
  const message = `Ungespeicherte Änderungen an ${names.length} Dokumenten gehen verloren.\n\n${listedNames}${remaining}`;

  if (!inTauri()) return window.confirm(message);

  return confirm(message, {
    title: "Alle Änderungen verwerfen?",
    kind: "warning",
    okLabel: "Alle verwerfen",
    cancelLabel: "Abbrechen",
  });
}
