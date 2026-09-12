import JSON5 from "json5";
import { parse, type ParseError } from "jsonc-parser";
import { extensionOf, fileNameFromPath } from "$lib/files/fileTypes";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonDialect = "json" | "jsonc" | "json5" | "jsonl";
export const MAX_JSON_CHARACTERS = 2_000_000;
export const MAX_JSON_NODES = 5_000;
export const MAX_JSON_DEPTH = 64;

export interface JsonParseResult {
  value?: JsonValue;
  error?: string;
  line?: number;
  column?: number;
}

// Tooling configuration that is JSON with comments by convention although the
// files carry a plain `.json` extension or no extension at all (VS Code, tsc,
// Babel, ESLint, Prettier, Deno, Bun and friends).
const JSONC_FILE_NAMES = new Set([
  "settings.json",
  "launch.json",
  "tasks.json",
  "extensions.json",
  "keybindings.json",
  "devcontainer.json",
  ".devcontainer.json",
  "api-extractor.json",
  "tslint.json",
  "typedoc.json",
  "deno.json",
  "bun.lock",
  ".babelrc",
  ".eslintrc",
  ".prettierrc",
  ".swcrc",
  ".huskyrc",
  ".lintstagedrc",
  ".nycrc",
  ".stylelintrc",
  ".markdownlintrc",
  ".mocharc",
  ".jshintrc",
  ".jscsrc",
  ".hintrc",
  ".releaserc",
  ".renovaterc",
  ".bowerrc",
]);
const JSONC_FILE_PATTERNS = [
  /^tsconfig(?:\..+)?\.json$/,
  /^jsconfig(?:\..+)?\.json$/,
  /\.code-workspace$/,
  /\.code-snippets$/,
  /^\.?(?:babel|eslint|prettier|swc|stylelint|markdownlint|mocha|jshint|release|renovate|nyc)rc\.json$/,
];

export function jsonDialectFor(fileName: string): JsonDialect {
  const baseName = fileNameFromPath(fileName).toLowerCase();
  const extension = extensionOf(baseName);
  if (extension === "json5") return "json5";
  if (extension === "jsonl" || extension === "ndjson") return "jsonl";
  if (
    extension === "jsonc" ||
    JSONC_FILE_NAMES.has(baseName) ||
    JSONC_FILE_PATTERNS.some((pattern) => pattern.test(baseName))
  ) {
    return "jsonc";
  }
  return "json";
}

// jsonc-parser's `ParseErrorCode` is an ambient const enum, which
// `verbatimModuleSyntax` forbids at runtime; the numeric codes are stable.
const PROPERTY_NAME_EXPECTED = 3;
const VALUE_EXPECTED = 4;
const ERROR_MESSAGES: Record<number, string> = {
  1: "Ungültiges Symbol",
  2: "Ungültiges Zahlenformat",
  [PROPERTY_NAME_EXPECTED]: "Eigenschaftsname erwartet",
  [VALUE_EXPECTED]: "Wert erwartet",
  5: "Doppelpunkt erwartet",
  6: "Komma erwartet",
  7: "Schließende geschweifte Klammer erwartet",
  8: "Schließende eckige Klammer erwartet",
  9: "Dateiende erwartet: JSON erlaubt nur einen Wurzelwert (mehrere Datensätze gehören in .jsonl)",
  10: "Kommentare sind in JSON nicht erlaubt (nur in JSONC oder JSON5)",
  11: "Unerwartetes Kommentarende",
  12: "Zeichenkette wurde nicht geschlossen",
  13: "Unvollständige Zahl",
  14: "Ungültige Unicode-Escape-Sequenz",
  15: "Ungültiges Escape-Zeichen",
  16: "Ungültiges Zeichen",
};

export function describeJsonError(content: string, error: ParseError, dialect: JsonDialect): string {
  const trailingComma =
    (error.error === PROPERTY_NAME_EXPECTED || error.error === VALUE_EXPECTED) &&
    /,\s*$/.test(content.slice(Math.max(0, error.offset - 64), error.offset));
  if (trailingComma && dialect === "json") {
    return "Nachgestelltes Komma ist in JSON nicht erlaubt (nur in JSONC oder JSON5)";
  }
  return ERROR_MESSAGES[error.error] ?? `Syntaxfehler (${error.error})`;
}

// Guard nesting before recursive third-party parsers run. Ignore strings/comments.
function guardSource(content: string): void {
  if (content.length > MAX_JSON_CHARACTERS) throw new Error("JSON-Vorschau auf 2 Millionen Zeichen begrenzt. Der vollständige Quelltext bleibt im Editor verfügbar.");
  let depth = 0;
  let quote = "";
  let comment = "";
  for (let i = 0; i < content.length; i += 1) {
    const c = content[i], next = content[i + 1];
    if (comment === "//") { if (c === "\n" || c === "\r") comment = ""; continue; }
    if (comment === "/*") { if (c === "*" && next === "/") { comment = ""; i += 1; } continue; }
    if (quote) { if (c === "\\") i += 1; else if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === "/" && (next === "/" || next === "*")) { comment = c + next; i += 1; }
    else if (c === "[" || c === "{") { if (++depth > MAX_JSON_DEPTH) throw new Error(`JSON-Vorschau auf ${MAX_JSON_DEPTH} Verschachtelungsebenen begrenzt.`); }
    else if (c === "]" || c === "}") depth -= 1;
  }
}

export function parseJsonDocument(content: string, fileName: string): JsonParseResult {
  if (!content.trim()) return {};
  try {
    guardSource(content);
    const dialect = jsonDialectFor(fileName);
    let value: JsonValue | undefined;
    if (dialect === "json5") value = JSON5.parse(content) as JsonValue;
    else if (dialect === "jsonl") {
      const records: JsonValue[] = [];
      let line = 0;
      for (const source of content.split(/\r\n|\r|\n/)) {
        line += 1;
        if (!source.trim()) continue;
        try { records.push(JSON.parse(source) as JsonValue); }
        catch { return { error: "Ungültiger JSON-Datensatz", line, column: 1 }; }
        if (records.length > MAX_JSON_NODES) throw new Error("Zu viele JSON-Datensätze für die Vorschau.");
      }
      value = records;
    } else {
      const errors: ParseError[] = [];
      const lenient = dialect === "jsonc";
      value = parse(content, errors, { allowTrailingComma: lenient, disallowComments: !lenient, allowEmptyContent: false }) as JsonValue | undefined;
      if (errors.length > 0) return { error: describeJsonError(content, errors[0], dialect), ...offsetToPosition(content, errors[0].offset) };
    }
    if (value !== undefined && countJsonNodes(value) > MAX_JSON_NODES) throw new Error(`JSON-Vorschau auf ${MAX_JSON_NODES.toLocaleString("de-DE")} Knoten begrenzt. Der vollständige Quelltext bleibt im Editor verfügbar.`);
    return { value };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function countJsonNodes(value: JsonValue): number {
  const pending: JsonValue[] = [value];
  let count = 0;
  while (pending.length) {
    const item = pending.pop();
    if (++count > MAX_JSON_NODES) return count;
    if (item !== null && typeof item === "object") {
      const children = Object.values(item);
      if (count + pending.length + children.length > MAX_JSON_NODES) return MAX_JSON_NODES + 1;
      pending.push(...children);
    }
  }
  return count;
}

function offsetToPosition(content: string, offset: number): { line: number; column: number } {
  const lines = content.slice(0, offset).split(/\r\n|\r|\n/);
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
}
