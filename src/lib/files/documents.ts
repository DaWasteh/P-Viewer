import { invoke } from "@tauri-apps/api/core";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { detectFileType, fileNameFromPath } from "./fileTypes";
import type {
  DocumentPayload,
  LineEnding,
  OpenDocument,
  SaveResult,
} from "./types";

const DOCUMENT_FILTERS = [
  {
    name: "Text, Code und Dokumente",
    extensions: [
      "txt",
      "text",
      "log",
      "md",
      "markdown",
      "mdown",
      "mkd",
      "mdx",
      "json",
      "jsonc",
      "json5",
      "ipynb",
      "tex",
      "latex",
      "ltx",
      "sty",
      "cls",
      "bib",
      "py",
      "pyw",
      "js",
      "mjs",
      "cjs",
      "jsx",
      "ts",
      "mts",
      "cts",
      "tsx",
      "html",
      "htm",
      "xhtml",
      "astro",
      "css",
      "scss",
      "sass",
      "less",
      "vue",
      "svelte",
      "xml",
      "svg",
      "yaml",
      "yml",
      "toml",
      "ini",
      "cfg",
      "sh",
      "bat",
      "cmd",
      "ps1",
      "rs",
      "go",
      "java",
      "c",
      "h",
      "cpp",
      "hpp",
      "cs",
      "sql",
      "csv",
      "tsv",
    ],
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

export function createUntitledDocument(): OpenDocument {
  const name = "Unbenannt.txt";
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
    fileType: detectFileType(payload.name),
  };
}

export async function saveDocument(
  document: OpenDocument,
  forceDialog = false,
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

  const result = await invoke<SaveResult>("write_document", {
    path,
    content: document.content,
    encoding: document.encoding,
    hasBom: document.hasBom,
    lineEnding: document.lineEnding,
  });
  const name = fileNameFromPath(result.path);

  return {
    ...document,
    path: result.path,
    name,
    savedContent: document.content,
    size: result.size,
    lossy: false,
    untitled: false,
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
