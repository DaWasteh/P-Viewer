export type CsvDelimiter = "," | ";" | "\t" | "|";
export type CsvDelimiterChoice = CsvDelimiter | "auto";

export const MAX_CSV_ROWS = 5_000;
export const MAX_CSV_COLUMNS = 256;

export interface CsvTable {
  delimiter: CsvDelimiter;
  rows: string[][];
  columnCount: number;
  totalRows: number;
  truncatedRows: boolean;
  truncatedColumns: boolean;
  numericColumns: boolean[];
}

const DELIMITERS: CsvDelimiter[] = [",", ";", "\t", "|"];

export function delimiterLabel(delimiter: CsvDelimiter): string {
  switch (delimiter) {
    case ",":
      return "Komma";
    case ";":
      return "Semikolon";
    case "\t":
      return "Tabulator";
    default:
      return "Pipe";
  }
}

export function detectCsvDelimiter(content: string, fileName = ""): CsvDelimiter {
  if (/\.tsv$/i.test(fileName)) return "\t";
  const sample = content.split(/\r\n|\r|\n/).filter((line) => line.trim()).slice(0, 25);
  if (sample.length === 0) return ",";

  // Candidates are ordered by how unlikely they are to appear inside free text or
  // numbers: a consistent semicolon beats a comma used as a decimal separator.
  const ranked: CsvDelimiter[] = ["\t", ";", "|", ","];
  let best: CsvDelimiter = ",";
  let bestScore = 0;
  for (const delimiter of ranked) {
    const counts = sample.map((line) => countOutsideQuotes(line, delimiter));
    const nonZero = counts.filter((count) => count > 0);
    if (nonZero.length === 0) continue;
    const consistency = nonZero.filter((count) => count === nonZero[0]).length / nonZero.length;
    const coverage = nonZero.length / sample.length;
    const score = coverage * consistency;
    if (score > bestScore + 1e-9) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      count += 1;
    }
  }
  return count;
}

export function parseCsv(
  content: string,
  delimiterChoice: CsvDelimiterChoice = "auto",
  fileName = "",
): CsvTable {
  const delimiter =
    delimiterChoice === "auto" ? detectCsvDelimiter(content, fileName) : delimiterChoice;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let totalRows = 0;
  let truncatedColumns = false;
  let truncatedRows = false;
  let columnCount = 0;

  const finishField = () => {
    if (row.length < MAX_CSV_COLUMNS) row.push(field);
    else truncatedColumns = true;
    field = "";
  };
  const finishRow = () => {
    finishField();
    const empty = row.length === 1 && row[0] === "";
    if (!empty) {
      totalRows += 1;
      if (rows.length < MAX_CSV_ROWS) {
        rows.push(row);
        columnCount = Math.max(columnCount, row.length);
      } else {
        truncatedRows = true;
      }
    }
    row = [];
  };

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field === "") {
      quoted = true;
    } else if (character === delimiter) {
      finishField();
    } else if (character === "\r") {
      if (content[index + 1] === "\n") index += 1;
      finishRow();
    } else if (character === "\n") {
      finishRow();
    } else {
      field += character;
    }
  }
  if (field !== "" || row.length > 0) finishRow();

  const numericColumns = Array.from({ length: columnCount }, (_, column) => {
    const values = rows.slice(1).map((entry) => entry[column] ?? "").filter((value) => value.trim());
    return values.length > 0 && values.every((value) => isNumericValue(value));
  });

  return {
    delimiter,
    rows,
    columnCount,
    totalRows,
    truncatedRows,
    truncatedColumns,
    numericColumns,
  };
}

export function isNumericValue(value: string): boolean {
  return /^\s*[-+]?(?:\d{1,3}(?:[.,\s]\d{3})*|\d+)(?:[.,]\d+)?(?:\s*%|(?:[eE][-+]?\d+))?\s*$/.test(value);
}
