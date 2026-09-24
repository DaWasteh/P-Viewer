import { indentLess, indentMore } from "@codemirror/commands";
import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type Line,
  type SelectionRange,
  type TransactionSpec,
} from "@codemirror/state";

/**
 * Formatting commands behind the editor toolbar, its keyboard shortcuts and
 * any future command palette (issue #1). Every command maps the current state
 * to one transaction: the document stays plain Markdown or HTML source, all
 * selections are handled together and one undo step reverts the command.
 */
export type FormatDialect = "markdown" | "html";
export type InlineFormat = "bold" | "italic" | "boldItalic" | "strikethrough" | "code";
export type ListKind = "bullet" | "numbered" | "task";
export type Alignment = "left" | "center" | "right";
export type FormatCommand = (state: EditorState) => TransactionSpec | null;

const USER_EVENT = "input.format";

function spec(state: EditorState, value: { changes: ChangeSpec; selection: EditorSelection }): TransactionSpec {
  return { ...value, scrollIntoView: true, userEvent: USER_EVENT };
}

// ---------------------------------------------------------------------------
// Inline formats
// ---------------------------------------------------------------------------

interface MarkdownInline {
  char: string;
  /** How many marker characters the format occupies on each side. */
  width: number;
}

const MARKDOWN_INLINE: Record<InlineFormat, MarkdownInline> = {
  bold: { char: "*", width: 2 },
  italic: { char: "*", width: 1 },
  boldItalic: { char: "*", width: 3 },
  strikethrough: { char: "~", width: 2 },
  code: { char: "`", width: 1 },
};

const HTML_INLINE: Record<InlineFormat, { open: string; close: string; alternatives: Array<[string, string]> }> = {
  bold: { open: "<strong>", close: "</strong>", alternatives: [["<b>", "</b>"]] },
  italic: { open: "<em>", close: "</em>", alternatives: [["<i>", "</i>"]] },
  boldItalic: { open: "<strong><em>", close: "</em></strong>", alternatives: [] },
  strikethrough: { open: "<s>", close: "</s>", alternatives: [["<del>", "</del>"], ["<strike>", "</strike>"]] },
  code: { open: "<code>", close: "</code>", alternatives: [] },
};

const PLACEHOLDER: Record<InlineFormat, string> = {
  bold: "fetter Text",
  italic: "kursiver Text",
  boldItalic: "Text",
  strikethrough: "durchgestrichen",
  code: "code",
};

function runLength(text: string, char: string, fromEnd: boolean): number {
  let count = 0;
  if (fromEnd) {
    for (let index = text.length - 1; index >= 0 && text[index] === char; index -= 1) count += 1;
  } else {
    for (let index = 0; index < text.length && text[index] === char; index += 1) count += 1;
  }
  return count;
}

/** Whether a marker run of `run` characters contains the format. */
function markdownActive(format: InlineFormat, run: number): boolean {
  switch (format) {
    case "italic":
      return run % 2 === 1;
    case "bold":
      return run >= 2;
    case "boldItalic":
      return run >= 3;
    case "strikethrough":
      return run >= 2;
    case "code":
      return run >= 1;
  }
}

/** Marker characters to add (positive) or remove (negative) on each side. */
function markdownDelta(format: InlineFormat, run: number): number {
  if (format === "boldItalic") return run >= 3 ? -3 : 3 - run;
  const width = MARKDOWN_INLINE[format].width;
  return markdownActive(format, run) ? -width : width;
}

/** The word around an empty cursor, so a shortcut formats the word being typed. */
function wordRange(state: EditorState, range: SelectionRange): { from: number; to: number } | null {
  const word = state.wordAt(range.head);
  return word && word.from < range.head + 1 && word.to > range.head - 1 && word.to > word.from ? word : null;
}

function toggleMarkdownInline(state: EditorState, format: InlineFormat): TransactionSpec {
  const { char } = MARKDOWN_INLINE[format];
  const underscoreAlternative = format === "bold" || format === "italic";
  return {
    ...state.changeByRange((range) => {
      let { from, to } = range;
      if (range.empty) {
        const word = wordRange(state, range);
        if (word) ({ from, to } = word);
      }
      const selected = state.sliceDoc(from, to);

      // Markers inside the selection: "**Hallo**" selected → "Hallo".
      for (const marker of underscoreAlternative ? [char, "_"] : [char]) {
        const inner = Math.min(runLength(selected, marker, false), runLength(selected, marker, true));
        if (selected.length > inner * 2 && markdownActive(format, inner)) {
          const remove = Math.min(inner, -markdownDelta(format, inner));
          if (remove > 0) {
            return {
              changes: [
                { from, to: from + remove },
                { from: to - remove, to },
              ],
              range: EditorSelection.range(from, to - remove * 2),
            };
          }
        }
      }

      // Markers around the selection: "**Hallo**" with Hallo selected.
      const before = state.sliceDoc(Math.max(0, from - 6), from);
      const after = state.sliceDoc(to, Math.min(state.doc.length, to + 6));
      for (const marker of underscoreAlternative ? [char, "_"] : [char]) {
        const run = Math.min(runLength(before, marker, true), runLength(after, marker, false));
        if (run > 0 && markdownActive(format, run) && (marker === char || format !== "boldItalic")) {
          const remove = Math.min(run, -markdownDelta(format, run));
          if (remove > 0) {
            return {
              changes: [
                { from: from - remove, to: from },
                { from: to, to: to + remove },
              ],
              range: EditorSelection.range(from - remove, to - remove),
            };
          }
        }
      }

      // Add (or complete, for bold + italic) the markers around the selection.
      const run = Math.min(runLength(before, char, true), runLength(after, char, false));
      const add = char.repeat(Math.max(1, markdownDelta(format, format === "boldItalic" ? run : 0)));
      if (from === to) {
        const placeholder = PLACEHOLDER[format];
        return {
          changes: { from, insert: `${add}${placeholder}${add}` },
          range: EditorSelection.range(from + add.length, from + add.length + placeholder.length),
        };
      }
      return {
        changes: [
          { from, insert: add },
          { from: to, insert: add },
        ],
        range: EditorSelection.range(from + add.length, to + add.length),
      };
    }),
    scrollIntoView: true,
    userEvent: USER_EVENT,
  };
}

function toggleHtmlInline(state: EditorState, format: InlineFormat): TransactionSpec {
  const tags = HTML_INLINE[format];
  const pairs: Array<[string, string]> = [[tags.open, tags.close], ...tags.alternatives];
  return {
    ...state.changeByRange((range) => {
      let { from, to } = range;
      if (range.empty) {
        const word = wordRange(state, range);
        if (word) ({ from, to } = word);
      }
      const selected = state.sliceDoc(from, to);
      for (const [open, close] of pairs) {
        if (selected.length >= open.length + close.length && selected.toLowerCase().startsWith(open) && selected.toLowerCase().endsWith(close)) {
          return {
            changes: [
              { from, to: from + open.length },
              { from: to - close.length, to },
            ],
            range: EditorSelection.range(from, to - open.length - close.length),
          };
        }
        const before = state.sliceDoc(Math.max(0, from - open.length), from).toLowerCase();
        const after = state.sliceDoc(to, Math.min(state.doc.length, to + close.length)).toLowerCase();
        if (before === open && after === close) {
          return {
            changes: [
              { from: from - open.length, to: from },
              { from: to, to: to + close.length },
            ],
            range: EditorSelection.range(from - open.length, to - open.length),
          };
        }
      }
      const body = from === to ? PLACEHOLDER[format] : "";
      return {
        changes: [
          { from, insert: `${tags.open}${body}` },
          { from: to, insert: tags.close },
        ],
        range: EditorSelection.range(from + tags.open.length, to + tags.open.length + body.length),
      };
    }),
    scrollIntoView: true,
    userEvent: USER_EVENT,
  };
}

export function toggleInline(format: InlineFormat, dialect: FormatDialect): FormatCommand {
  return (state) => (dialect === "html" ? toggleHtmlInline(state, format) : toggleMarkdownInline(state, format));
}

// ---------------------------------------------------------------------------
// Line based formats
// ---------------------------------------------------------------------------

/** Lines touched by any selection, each once, in document order. */
function selectedLines(state: EditorState): Line[] {
  const seen = new Set<number>();
  const lines: Line[] = [];
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    // A selection ending at the very start of a line does not include that line.
    let last = state.doc.lineAt(range.to).number;
    if (last > first && state.doc.line(last).from === range.to) last -= 1;
    for (let number = first; number <= last; number += 1) {
      if (seen.has(number)) continue;
      seen.add(number);
      lines.push(state.doc.line(number));
    }
  }
  return lines.sort((left, right) => left.number - right.number);
}

/** Applies per-line prefix replacements and keeps the selections mapped onto the result. */
function replaceLinePrefixes(
  state: EditorState,
  edits: Array<{ line: Line; removeLength: number; insert: string; offset?: number }>,
): TransactionSpec | null {
  const changes = edits
    .filter((edit) => edit.removeLength > 0 || edit.insert)
    .map((edit) => {
      const from = edit.line.from + (edit.offset ?? 0);
      return { from, to: from + edit.removeLength, insert: edit.insert };
    });
  if (changes.length === 0) return null;
  const changeSet = state.changes(changes);
  return {
    changes: changeSet,
    selection: state.selection.map(changeSet, 1),
    scrollIntoView: true,
    userEvent: USER_EVENT,
  };
}

const HEADING = /^( {0,3})(#{1,6})(?:[ \t]+|$)/;

export function setHeading(level: number, dialect: FormatDialect): FormatCommand {
  const target = Math.max(0, Math.min(6, Math.round(level)));
  return (state) => {
    const lines = selectedLines(state);
    if (dialect === "html") return setHtmlHeading(state, lines, target);
    const current = lines.map((line) => HEADING.exec(line.text));
    // The same level again turns the heading back into normal text.
    const removeAll = target === 0 || current.every((match) => match && match[2].length === target);
    return replaceLinePrefixes(
      state,
      lines.map((line, index) => {
        const match = current[index];
        const indent = match?.[1].length ?? 0;
        const removeLength = match ? match[0].length - indent : 0;
        const insert = removeAll || (!line.text.trim() && !match) ? "" : `${"#".repeat(target)} `;
        return { line, removeLength, insert, offset: indent };
      }),
    );
  };
}

const HTML_HEADING = /^(\s*)<h([1-6])>(.*)<\/h\2>\s*$/i;

function setHtmlHeading(state: EditorState, lines: Line[], level: number): TransactionSpec | null {
  const current = lines.map((line) => HTML_HEADING.exec(line.text));
  const removeAll = level === 0 || current.every((match) => match && Number(match[2]) === level);
  const changes: ChangeSpec[] = [];
  lines.forEach((line, index) => {
    const match = current[index];
    const indent = match?.[1] ?? /^\s*/.exec(line.text)![0];
    const inner = match ? match[3] : line.text.slice(indent.length);
    if (!match && !inner.trim()) return;
    const replacement = removeAll ? `${indent}${inner}` : `${indent}<h${level}>${inner}</h${level}>`;
    if (replacement !== line.text) changes.push({ from: line.from, to: line.to, insert: replacement });
  });
  if (changes.length === 0) return null;
  const changeSet = state.changes(changes);
  return { changes: changeSet, selection: state.selection.map(changeSet, 1), scrollIntoView: true, userEvent: USER_EVENT };
}

const LIST_MARKER = /^(\s*)(?:([-*+])[ \t]+(\[[ xX]\][ \t]+)?|(\d{1,9})[.)][ \t]+)/;

function listKindOf(text: string): ListKind | null {
  const match = LIST_MARKER.exec(text);
  if (!match) return null;
  if (match[3]) return "task";
  return match[2] ? "bullet" : "numbered";
}

export function toggleList(kind: ListKind, dialect: FormatDialect): FormatCommand {
  return (state) => {
    const lines = selectedLines(state);
    if (dialect === "html") return wrapHtmlLines(state, lines, kind === "numbered" ? "ol" : "ul", "li");
    const content = lines.filter((line) => line.text.trim());
    if (content.length === 0) {
      const line = lines[0];
      const marker = kind === "bullet" ? "- " : kind === "numbered" ? "1. " : "- [ ] ";
      return replaceLinePrefixes(state, [{ line, removeLength: 0, insert: marker }]);
    }
    const remove = content.every((line) => listKindOf(line.text) === kind);
    let number = 0;
    return replaceLinePrefixes(
      state,
      content.map((line) => {
        const match = LIST_MARKER.exec(line.text);
        const indent = /^\s*/.exec(line.text)![0].length;
        const removeLength = match ? match[0].length - indent : 0;
        number += 1;
        const insert = remove ? "" : kind === "bullet" ? "- " : kind === "numbered" ? `${number}. ` : "- [ ] ";
        return { line, removeLength, insert, offset: indent };
      }),
    );
  };
}

export function toggleBlockquote(dialect: FormatDialect): FormatCommand {
  return (state) => {
    const lines = selectedLines(state);
    if (dialect === "html") return wrapHtmlLines(state, lines, "blockquote", null);
    const remove = lines.every((line) => /^\s{0,3}>/.test(line.text) || !line.text.trim()) && lines.some((line) => /^\s{0,3}>/.test(line.text));
    return replaceLinePrefixes(
      state,
      lines.map((line) => {
        if (remove) {
          const match = /^(\s{0,3})> ?/.exec(line.text);
          return { line, removeLength: match ? match[0].length - match[1].length : 0, insert: "", offset: match?.[1].length ?? 0 };
        }
        return { line, removeLength: 0, insert: line.text.trim() ? "> " : ">" };
      }),
    );
  };
}

/** Wraps whole lines in an HTML container; selecting an existing wrapper unwraps it. */
function wrapHtmlLines(state: EditorState, lines: Line[], container: string, item: string | null): TransactionSpec | null {
  const first = lines[0];
  const last = lines[lines.length - 1];
  const text = state.sliceDoc(first.from, last.to);
  const open = new RegExp(`^\\s*<${container}(\\s[^>]*)?>\\s*\\n`, "i");
  const close = new RegExp(`\\n\\s*</${container}>\\s*$`, "i");
  let insert: string;
  if (open.test(text) && close.test(text)) {
    insert = text
      .replace(open, "")
      .replace(close, "")
      .split("\n")
      .map((line) => (item ? line.replace(new RegExp(`^\\s*<${item}>(.*)</${item}>\\s*$`, "i"), "$1") : line.replace(/^ {2}/, "")))
      .join("\n");
  } else {
    const body = text
      .split("\n")
      .filter((line) => !item || line.trim())
      .map((line) => (item ? `  <${item}>${line.trim()}</${item}>` : `  ${line}`))
      .join("\n");
    insert = `<${container}>\n${body || (item ? `  <${item}></${item}>` : "  ")}\n</${container}>`;
  }
  return spec(state, {
    changes: { from: first.from, to: last.to, insert },
    selection: EditorSelection.single(first.from, first.from + insert.length),
  });
}

// ---------------------------------------------------------------------------
// Blocks and insertions
// ---------------------------------------------------------------------------

export const CODE_LANGUAGES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "rust", label: "Rust" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "java", label: "Java" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "json", label: "JSON" },
  { id: "yaml", label: "YAML" },
  { id: "bash", label: "Bash" },
  { id: "powershell", label: "PowerShell" },
  { id: "text", label: "Nur Text" },
];

/** Block text inserted on lines of its own, with blank lines where Markdown needs them. */
function insertBlock(state: EditorState, block: string, selectFrom: number, selectTo: number, blankLines = true): TransactionSpec {
  const range = state.selection.main;
  const startLine = state.doc.lineAt(range.from);
  const endLine = state.doc.lineAt(range.to);
  const from = range.empty ? range.from : startLine.from;
  const to = range.empty ? range.to : endLine.to;
  const lineBefore = state.doc.lineAt(from);
  const lineAfter = state.doc.lineAt(to);
  const needsBreakBefore = from > lineBefore.from;
  const needsBreakAfter = to < lineAfter.to;
  // Text directly above and below the block decides whether blank lines are
  // needed (e.g. "Text" followed by "---" would become a setext heading).
  const preceding = needsBreakBefore
    ? state.sliceDoc(lineBefore.from, from)
    : lineBefore.number > 1 ? state.doc.line(lineBefore.number - 1).text : "";
  const following = needsBreakAfter
    ? state.sliceDoc(to, lineAfter.to)
    : lineAfter.number < state.doc.lines ? state.doc.line(lineAfter.number + 1).text : "";
  const prefix = (needsBreakBefore ? "\n" : "") + (blankLines && preceding.trim() ? "\n" : "");
  const suffix = (needsBreakAfter ? "\n" : "") + (blankLines && following.trim() ? "\n" : "");
  const insert = `${prefix}${block}${suffix}`;
  return spec(state, {
    changes: { from, to, insert },
    selection: EditorSelection.single(from + prefix.length + selectFrom, from + prefix.length + selectTo),
  });
}

export function toggleCodeBlock(language: string, dialect: FormatDialect): FormatCommand {
  return (state) => {
    const range = state.selection.main;
    const lines = selectedLines(state);
    const first = lines[0];
    const last = lines[lines.length - 1];
    const text = range.empty ? "" : state.sliceDoc(first.from, last.to);
    if (dialect === "markdown" && /^\s*(```|~~~)[^\n]*\n[\s\S]*\n\s*\1\s*$/.test(text)) {
      const inner = text.replace(/^\s*(```|~~~)[^\n]*\n/, "").replace(/\n\s*(```|~~~)\s*$/, "");
      return spec(state, {
        changes: { from: first.from, to: last.to, insert: inner },
        selection: EditorSelection.single(first.from, first.from + inner.length),
      });
    }
    const body = text || "";
    const language_ = language === "text" ? "" : language;
    if (dialect === "html") {
      const open = language_ ? `<pre><code class="language-${language_}">` : "<pre><code>";
      const block = `${open}${escapeHtml(body)}</code></pre>`;
      return insertBlock(state, block, open.length, open.length + escapeHtml(body).length, false);
    }
    const fence = body.includes("```") ? "~~~~" : "```";
    const open = `${fence}${language_}\n`;
    const block = `${open}${body}\n${fence}`;
    return insertBlock(state, block, open.length, open.length + body.length);
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

/** Markdown link destinations: spaces and parentheses would end the link. */
export function markdownDestination(url: string): string {
  return url.trim().replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

export function insertLink(url: string, label: string, dialect: FormatDialect): FormatCommand {
  return (state) =>
    ({
      ...state.changeByRange((range) => {
        const selected = state.sliceDoc(range.from, range.to);
        const text = (label || selected || "Link-Text").replace(/\n+/g, " ");
        const target = url.trim() || "https://";
        const open = dialect === "html" ? `<a href="${escapeAttribute(target)}">` : "[";
        const insert = dialect === "html" ? `${open}${text}</a>` : `[${text}](${markdownDestination(target)})`;
        return {
          changes: { from: range.from, to: range.to, insert },
          range: EditorSelection.range(range.from + open.length, range.from + open.length + text.length),
        };
      }),
      scrollIntoView: true,
      userEvent: USER_EVENT,
    }) satisfies TransactionSpec;
}

export function insertImage(source: string, description: string, dialect: FormatDialect): FormatCommand {
  return (state) => {
    const range = state.selection.main;
    const alt = (description || state.sliceDoc(range.from, range.to) || "Beschreibung").replace(/\n+/g, " ");
    const target = source.trim() || "bild.png";
    if (dialect === "html") {
      const insert = `<img src="${escapeAttribute(target)}" alt="${escapeAttribute(alt)}">`;
      const altFrom = insert.lastIndexOf(escapeAttribute(alt));
      return spec(state, {
        changes: { from: range.from, to: range.to, insert },
        selection: EditorSelection.single(range.from + altFrom, range.from + altFrom + escapeAttribute(alt).length),
      });
    }
    const insert = `![${alt}](${markdownDestination(target)})`;
    return spec(state, {
      changes: { from: range.from, to: range.to, insert },
      selection: EditorSelection.single(range.from + 2, range.from + 2 + alt.length),
    });
  };
}

export function insertTable(columns: number, rows: number, dialect: FormatDialect): FormatCommand {
  const columnCount = Math.max(1, Math.min(20, Math.round(columns)));
  const rowCount = Math.max(1, Math.min(100, Math.round(rows)));
  return (state) => {
    const headers = Array.from({ length: columnCount }, (_, index) => `Spalte ${index + 1}`);
    let block: string;
    if (dialect === "html") {
      const head = `    <tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>`;
      const body = Array.from({ length: rowCount }, () => `    <tr>${headers.map(() => "<td>Inhalt</td>").join("")}</tr>`).join("\n");
      block = `<table>\n  <thead>\n${head}\n  </thead>\n  <tbody>\n${body}\n  </tbody>\n</table>`;
    } else {
      const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
      block = [
        row(headers),
        row(headers.map(() => "---")),
        ...Array.from({ length: rowCount }, () => row(headers.map(() => "Inhalt"))),
      ].join("\n");
    }
    const first = dialect === "html" ? block.indexOf("Spalte 1") : 2;
    return insertBlock(state, block, first, first + "Spalte 1".length, dialect === "markdown");
  };
}

export function insertHorizontalRule(dialect: FormatDialect): FormatCommand {
  return (state) => {
    const block = dialect === "html" ? "<hr>" : "---";
    const range = state.selection.main;
    // Behind the rule, so typing continues below it.
    const next = insertBlock(state.update({ selection: EditorSelection.cursor(range.to) }).state, block, block.length, block.length);
    return next;
  };
}

const ALIGN_OPEN = /^\s*<div\s+(?:align="(left|center|right)"|style="text-align:\s*(left|center|right);?")\s*>\s*$/i;

/**
 * Markdown has no alignment; `<div align>` is what GitHub renders and what the
 * sanitized preview allows. Choosing the current alignment again unwraps it.
 */
export function setAlignment(alignment: Alignment, dialect: FormatDialect): FormatCommand {
  return (state) => {
    const lines = selectedLines(state);
    const first = lines[0];
    const last = lines[lines.length - 1];
    const open = dialect === "html" ? `<div style="text-align: ${alignment};">` : `<div align="${alignment}">`;
    const gap = dialect === "html" ? "\n" : "\n\n";

    // Selected text already sits inside an aligned div (optionally with blank lines between).
    const beforeNumber = first.number - (first.number > 2 && !state.doc.line(first.number - 1).text.trim() ? 2 : 1);
    const afterNumber = last.number + (last.number < state.doc.lines - 1 && !state.doc.line(last.number + 1).text.trim() ? 2 : 1);
    if (beforeNumber >= 1 && afterNumber <= state.doc.lines) {
      const openLine = state.doc.line(beforeNumber);
      const closeLine = state.doc.line(afterNumber);
      const match = ALIGN_OPEN.exec(openLine.text);
      if (match && /^\s*<\/div>\s*$/i.test(closeLine.text)) {
        const inner = state.sliceDoc(first.from, last.to);
        const current = (match[1] ?? match[2]).toLowerCase();
        const replacement = current === alignment ? inner : `${open}${gap}${inner}${gap}</div>`;
        const from = openLine.from;
        const innerStart = current === alignment ? 0 : open.length + gap.length;
        return spec(state, {
          changes: { from, to: closeLine.to, insert: replacement },
          selection: EditorSelection.single(from + innerStart, from + innerStart + inner.length),
        });
      }
    }

    const selectedText = state.selection.main.empty ? "Text" : state.sliceDoc(first.from, last.to);
    const block = `${open}${gap}${selectedText}${gap}</div>`;
    const range = state.selection.main;
    const replaceFrom = range.empty ? range.from : first.from;
    const replaceTo = range.empty ? range.to : last.to;
    const target = state.update({ selection: EditorSelection.range(replaceFrom, replaceTo) }).state;
    return insertBlock(target, block, open.length + gap.length, open.length + gap.length + selectedText.length);
  };
}

export function insertCallout(): FormatCommand {
  return (state) => {
    const range = state.selection.main;
    const selected = state.sliceDoc(range.from, range.to) || "Hinweis";
    const body = selected
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    const insert = `> [!NOTE]\n${body}`;
    return spec(state, {
      changes: { from: range.from, to: range.to, insert },
      selection: EditorSelection.single(range.from + insert.length),
    });
  };
}

/** Indentation reuses CodeMirror's own commands and indent unit. */
export function indentSelection(direction: "more" | "less"): FormatCommand {
  return (state) => {
    let result: TransactionSpec | null = null;
    const command = direction === "more" ? indentMore : indentLess;
    command({ state, dispatch: (transaction) => (result = { changes: transaction.changes, selection: transaction.selection, userEvent: USER_EVENT, scrollIntoView: true }) });
    return result;
  };
}
