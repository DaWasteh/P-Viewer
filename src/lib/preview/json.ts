import JSON5 from "json5";
import {
  parse,
  printParseErrorCode,
  type ParseError,
} from "jsonc-parser";
import { extensionOf } from "$lib/files/fileTypes";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface JsonParseResult {
  value?: JsonValue;
  error?: string;
  line?: number;
  column?: number;
}

export function parseJsonDocument(
  content: string,
  fileName: string,
): JsonParseResult {
  if (!content.trim()) return {};
  const extension = extensionOf(fileName);

  if (extension === "json5") {
    try {
      return { value: JSON5.parse(content) as JsonValue };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  const errors: ParseError[] = [];
  const value = parse(content, errors, {
    allowTrailingComma: extension === "jsonc",
    disallowComments: extension !== "jsonc",
    allowEmptyContent: false,
  }) as JsonValue | undefined;

  if (errors.length > 0) {
    const first = errors[0];
    const position = offsetToPosition(content, first.offset);
    return {
      error: printParseErrorCode(first.error),
      line: position.line,
      column: position.column,
    };
  }

  return { value };
}

export function countJsonNodes(value: JsonValue): number {
  if (Array.isArray(value)) {
    return 1 + value.reduce<number>((sum, item) => sum + countJsonNodes(item), 0);
  }
  if (value !== null && typeof value === "object") {
    return (
      1 +
      Object.values(value).reduce<number>(
        (sum, item) => sum + countJsonNodes(item),
        0,
      )
    );
  }
  return 1;
}

function offsetToPosition(
  content: string,
  offset: number,
): { line: number; column: number } {
  const before = content.slice(0, offset);
  const lines = before.split(/\r\n|\r|\n/);
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}
