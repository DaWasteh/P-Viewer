export type ViewMode = "edit" | "view" | "split";
export type DocumentKind =
  | "markdown"
  | "json"
  | "notebook"
  | "latex"
  | "html"
  | "svg"
  | "csv"
  | "code"
  | "text";
export type LineEnding = "lf" | "crlf" | "cr";

export interface FileTypeInfo {
  kind: DocumentKind;
  language: string;
  label: string;
}

export interface DocumentPayload {
  path: string;
  name: string;
  content: string;
  encoding: string;
  hasBom: boolean;
  lineEnding: LineEnding;
  size: number;
  lossy: boolean;
}

export interface SaveResult {
  path: string;
  size: number;
}

export interface OpenDocument extends DocumentPayload {
  savedContent: string;
  fileType: FileTypeInfo;
  untitled: boolean;
  metadataDirty: boolean;
}
