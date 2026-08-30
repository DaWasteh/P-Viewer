import { invoke } from "@tauri-apps/api/core";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import {
  SUPPORTED_FILE_EXTENSIONS,
  detectFileType,
  fileNameFromPath,
} from "./fileTypes";
import type {
  DocumentPayload,
  LineEnding,
  OpenDocument,
  SaveResult,
} from "./types";

const DOCUMENT_FILTERS = [
  {
    name: "Text, Code und Dokumente",
    extensions: [...SUPPORTED_FILE_EXTENSIONS],
  },
  { name: "Alle Dateien", extensions: ["*"] },
];

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

export async function chooseAndOpenDocument(): Promise<OpenDocument | null> {
  requireDesktop();
  const selected = await open({
    multiple: false,
    directory: false,
    filters: DOCUMENT_FILTERS,
  });

  if (typeof selected !== "string") return null;
  return openDocumentPath(selected);
}

export async function openDocumentPath(path: string): Promise<OpenDocument> {
  requireDesktop();
  const payload = await invoke<DocumentPayload>("read_document", { path });
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
  let path = document.path;

  if (forceDialog || document.untitled || !path) {
    const selected = await save({
      defaultPath: document.name || "Unbenannt.txt",
      filters: DOCUMENT_FILTERS,
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
  });
  const name = fileNameFromPath(result.path);

  return {
    ...document,
    path: result.path,
    name,
    savedContent,
    size: result.size,
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
