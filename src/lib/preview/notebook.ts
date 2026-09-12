import { svgDataUrl } from "./svg";

export type NotebookCellType = "markdown" | "code" | "raw";

export type NotebookOutput =
  | { kind: "stream"; name: "stdout" | "stderr"; text: string }
  | { kind: "text"; text: string }
  | { kind: "markdown"; source: string }
  | { kind: "latex"; source: string }
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

export const MAX_NOTEBOOK_CELLS = 200;
export const MAX_NOTEBOOK_SOURCE_CHARACTERS = 8_000_000;
export const MAX_NOTEBOOK_RENDER_CHARACTERS = 500_000;
export const MAX_NOTEBOOK_OUTPUTS_PER_CELL = 50;
export const MAX_NOTEBOOK_OUTPUT_CHARACTERS = 200_000;
const MAX_IMAGE_BASE64_LENGTH = 8 * 1024 * 1024;
const MAX_SVG_OUTPUT_LENGTH = 2 * 1024 * 1024;

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
  if (content.length > MAX_NOTEBOOK_SOURCE_CHARACTERS) throw new NotebookParseError("Notebook-Vorschau auf 8 Millionen Zeichen begrenzt. Der Quelltext bleibt vollständig im Editor verfügbar.");
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

  const cells: NotebookCell[] = [];
  let renderedCharacters = 0;
  let renderedOutputs = 0;
  let imageCharacters = 0;
  let imageCount = 0;
  for (const rawCell of raw.cells.slice(0, MAX_NOTEBOOK_CELLS)) {
    const cell = parseCell(rawCell);
    if (renderedCharacters + cell.source.length > MAX_NOTEBOOK_RENDER_CHARACTERS) break;
    renderedCharacters += cell.source.length;
    cell.outputs = cell.outputs.filter((output) => {
      const image = output.kind === "image";
      const cost = image ? output.dataUrl.length : JSON.stringify(output).length;
      const fits = renderedOutputs < 500 && (image
        ? imageCount < 32 && imageCharacters + cost <= MAX_IMAGE_BASE64_LENGTH
        : renderedCharacters + cost <= MAX_NOTEBOOK_RENDER_CHARACTERS);
      if (!fits) { cell.omittedOutputs += 1; return false; }
      renderedOutputs += 1;
      if (image) { imageCharacters += cost; imageCount += 1; }
      else renderedCharacters += cost;
      return true;
    });
    cells.push(cell);
  }
  return {
    cells,
    language: language.toLowerCase(),
    kernel,
    nbformat,
    truncatedCells: raw.cells.length > cells.length,
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
    source: limitText(multilineText(cell.source)),
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
      name: limitText(stringValue(output.ename)),
      value: limitText(stringValue(output.evalue)),
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
    if ("image/svg+xml" in data) {
      // Matplotlib and Plotly export vector output. As an <img> data URL the SVG
      // cannot run scripts or load external resources, like the SVG preview.
      const svg = multilineText(data["image/svg+xml"]);
      if (svg.length <= MAX_SVG_OUTPUT_LENGTH && /<svg\b/i.test(svg)) {
        return { kind: "image", dataUrl: svgDataUrl(svg), alt: "svg-Ausgabe" };
      }
    }
    if ("text/markdown" in data) {
      return { kind: "markdown", source: limitText(multilineText(data["text/markdown"])) };
    }
    if ("text/latex" in data) {
      return { kind: "latex", source: limitText(multilineText(data["text/latex"])) };
    }
    if ("application/json" in data) {
      const json = data["application/json"];
      let text: string | undefined;
      try { text = typeof json === "string" ? json : JSON.stringify(json, null, 2); }
      catch { text = "JSON-Ausgabe ist zu tief verschachtelt."; }
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
