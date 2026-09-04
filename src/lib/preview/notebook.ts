export type NotebookCellType = "markdown" | "code" | "raw";

export type NotebookOutput =
  | { kind: "stream"; name: "stdout" | "stderr"; text: string }
  | { kind: "text"; text: string }
  | { kind: "markdown"; source: string }
  | { kind: "image"; dataUrl: string; alt: string }
  | { kind: "json"; text: string }
  | { kind: "html-only" }
  | { kind: "error"; name: string; value: string; traceback: string };

export interface NotebookCell {
  type: NotebookCellType;
  source: string;
  executionCount: number | null;
  outputs: NotebookOutput[];
  omittedOutputs: number;
}

export interface NotebookDocument {
  cells: NotebookCell[];
  language: string;
  kernel: string;
  nbformat: string;
  truncatedCells: boolean;
}

export const MAX_NOTEBOOK_CELLS = 1_000;
export const MAX_NOTEBOOK_OUTPUTS_PER_CELL = 50;
export const MAX_NOTEBOOK_OUTPUT_CHARACTERS = 200_000;
const MAX_IMAGE_BASE64_LENGTH = 8 * 1024 * 1024;

const IMAGE_TYPES: Array<[string, string]> = [
  ["image/png", "png"],
  ["image/jpeg", "jpeg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
];

const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
// ESC-based SGR/CSI sequences plus bare `[..m` remnants sometimes stored by kernels.
const ansiPattern = /\u001B\[[0-?]*[ -/]*[@-~]|\u001B[@-Z\\-_]/g;

export class NotebookParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotebookParseError";
  }
}

export function parseNotebook(content: string): NotebookDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (error) {
    throw new NotebookParseError(
      `Das Notebook ist kein gültiges JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isRecord(raw) || !Array.isArray(raw.cells)) {
    throw new NotebookParseError(
      "Das Notebook enthält keine Zellenliste im Jupyter-Format (nbformat 4).",
    );
  }

  const metadata = isRecord(raw.metadata) ? raw.metadata : {};
  const kernelspec = isRecord(metadata.kernelspec) ? metadata.kernelspec : {};
  const languageInfo = isRecord(metadata.language_info) ? metadata.language_info : {};
  const language =
    stringValue(languageInfo.name) || stringValue(kernelspec.language) || "python";
  const kernel = stringValue(kernelspec.display_name) || stringValue(kernelspec.name) || "";
  const nbformat = [raw.nbformat, raw.nbformat_minor]
    .filter((value) => typeof value === "number")
    .join(".");

  const cells = raw.cells.slice(0, MAX_NOTEBOOK_CELLS).map(parseCell);
  return {
    cells,
    language: language.toLowerCase(),
    kernel,
    nbformat,
    truncatedCells: raw.cells.length > MAX_NOTEBOOK_CELLS,
  };
}

function parseCell(value: unknown): NotebookCell {
  const cell = isRecord(value) ? value : {};
  const rawType = stringValue(cell.cell_type);
  const type: NotebookCellType =
    rawType === "markdown" || rawType === "code" || rawType === "raw" ? rawType : "raw";
  const executionCount =
    typeof cell.execution_count === "number" && Number.isFinite(cell.execution_count)
      ? cell.execution_count
      : null;
  const outputsSource = Array.isArray(cell.outputs) ? cell.outputs : [];
  const outputs =
    type === "code"
      ? outputsSource
          .slice(0, MAX_NOTEBOOK_OUTPUTS_PER_CELL)
          .map(parseOutput)
          .filter((output): output is NotebookOutput => output !== null)
      : [];

  return {
    type,
    source: multilineText(cell.source),
    executionCount,
    outputs,
    omittedOutputs: Math.max(0, outputsSource.length - MAX_NOTEBOOK_OUTPUTS_PER_CELL),
  };
}

function parseOutput(value: unknown): NotebookOutput | null {
  const output = isRecord(value) ? value : {};
  const outputType = stringValue(output.output_type);

  if (outputType === "stream") {
    const name = stringValue(output.name) === "stderr" ? "stderr" : "stdout";
    return { kind: "stream", name, text: limitText(stripAnsi(multilineText(output.text))) };
  }

  if (outputType === "error") {
    const traceback = Array.isArray(output.traceback)
      ? output.traceback.map((line) => stripAnsi(multilineText(line))).join("\n")
      : "";
    return {
      kind: "error",
      name: stringValue(output.ename),
      value: stringValue(output.evalue),
      traceback: limitText(traceback),
    };
  }

  if (outputType === "execute_result" || outputType === "display_data") {
    const data = isRecord(output.data) ? output.data : {};
    for (const [mime, extension] of IMAGE_TYPES) {
      if (!(mime in data)) continue;
      const encoded = multilineText(data[mime]).replace(/\s+/g, "");
      if (encoded.length > MAX_IMAGE_BASE64_LENGTH || !base64Pattern.test(encoded)) continue;
      return { kind: "image", dataUrl: `data:image/${extension};base64,${encoded}`, alt: `${extension}-Ausgabe` };
    }
    if ("text/markdown" in data) {
      return { kind: "markdown", source: limitText(multilineText(data["text/markdown"])) };
    }
    if ("text/latex" in data) {
      return { kind: "markdown", source: limitText(multilineText(data["text/latex"])) };
    }
    if ("application/json" in data) {
      const json = data["application/json"];
      const text =
        typeof json === "string" ? json : JSON.stringify(json, null, 2);
      return { kind: "json", text: limitText(text ?? "") };
    }
    if ("text/plain" in data) {
      return { kind: "text", text: limitText(stripAnsi(multilineText(data["text/plain"]))) };
    }
    if ("text/html" in data) {
      return { kind: "html-only" };
    }
    return null;
  }

  return null;
}

export function stripAnsi(value: string): string {
  return value.replace(ansiPattern, "");
}

function limitText(value: string): string {
  if (value.length <= MAX_NOTEBOOK_OUTPUT_CHARACTERS) return value;
  return `${value.slice(0, MAX_NOTEBOOK_OUTPUT_CHARACTERS)}\n… [Ausgabe gekürzt]`;
}

function multilineText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string").join("");
  }
  return "";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
