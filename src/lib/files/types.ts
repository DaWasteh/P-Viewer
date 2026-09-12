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
  | "text"
  | "image"
  | "pdf";
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
  version?: string;
}

/** Read-only binary content (images, PDF) delivered as a base64 payload. */
export interface BinaryDocumentPayload {
  path: string;
  name: string;
  size: number;
  mime: string;
  base64: string;
}

export interface SaveResult {
  path: string;
  size: number;
  version?: string;
}

export interface OpenDocument extends DocumentPayload {
  savedContent: string;
  fileType: FileTypeInfo;
  untitled: boolean;
  metadataDirty: boolean;
  /** Present for image and PDF documents; such documents are never editable. */
  binary?: Pick<BinaryDocumentPayload, "mime" | "base64"> | null;
}
