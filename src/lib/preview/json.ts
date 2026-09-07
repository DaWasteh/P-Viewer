import JSON5 from "json5";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import { extensionOf } from "$lib/files/fileTypes";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export const MAX_JSON_CHARACTERS = 2_000_000;
export const MAX_JSON_NODES = 5_000;
export const MAX_JSON_DEPTH = 64;

export interface JsonParseResult {
  value?: JsonValue;
  error?: string;
  line?: number;
  column?: number;
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
    const extension = extensionOf(fileName);
    let value: JsonValue | undefined;
    if (extension === "json5") value = JSON5.parse(content) as JsonValue;
    else if (extension === "jsonl" || extension === "ndjson") {
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
      value = parse(content, errors, { allowTrailingComma: extension === "jsonc", disallowComments: extension !== "jsonc", allowEmptyContent: false }) as JsonValue | undefined;
      if (errors.length > 0) return { error: printParseErrorCode(errors[0].error), ...offsetToPosition(content, errors[0].offset) };
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
