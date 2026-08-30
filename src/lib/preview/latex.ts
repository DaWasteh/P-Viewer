import katex, { type KatexOptions } from "katex";

const MAX_LIVE_SOURCE_LENGTH = 1_000_000;
const MAX_MATH_SOURCE_LENGTH = 50_000;
const TOKEN_START = "\uE000";
const TOKEN_END = "\uE001";

interface ProtectedToken {
  html: string;
  block: boolean;
}

interface CommandArgument {
  value: string;
  end: number;
}

export interface LatexLiveRenderResult {
  html: string;
  warnings: string[];
  truncated: boolean;
}

export function renderLatexLive(source: string): LatexLiveRenderResult {
  const truncated = source.length > MAX_LIVE_SOURCE_LENGTH;
  const input = normalizeSource(source.slice(0, MAX_LIVE_SOURCE_LENGTH));
  const warnings = new Set<string>();
  const tokens: ProtectedToken[] = [];
  const macros = extractKatexMacros(input);
  const metadata = {
    title: commandValue(input, "title"),
    author: commandValue(input, "author"),
    date: commandValue(input, "date"),
  };

  let body = documentBody(input);
  body = protectVerbatim(body, tokens);
  body = stripComments(body);
  body = protectMathEnvironments(body, tokens, macros, warnings);
  body = protectDelimitedMath(body, tokens, macros, warnings);
  body = protectTabular(body, tokens, warnings);

  const html = renderLines(body, tokens, metadata, warnings);
  if (truncated) {
    warnings.add("Die Live-Vorschau ist auf 1.000.000 Zeichen begrenzt.");
  }

  return {
    html,
    warnings: [...warnings],
    truncated,
  };
}

function normalizeSource(source: string): string {
  return source.replace(/\r\n?/g, "\n");
}

function stripComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      for (let index = 0; index < line.length; index += 1) {
        if (line[index] !== "%") continue;
        let slashes = 0;
        for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) {
          slashes += 1;
        }
        if (slashes % 2 === 0) return line.slice(0, index);
      }
      return line;
    })
    .join("\n");
}

function documentBody(source: string): string {
  const begin = source.search(/\\begin\s*\{document\}/);
  if (begin < 0) return source;
  const beginMatch = source.slice(begin).match(/^\\begin\s*\{document\}/);
  const start = begin + (beginMatch?.[0].length ?? 0);
  const end = source.search(/\\end\s*\{document\}/);
  return source.slice(start, end >= start ? end : undefined);
}

function commandValue(source: string, command: string): string {
  const marker = `\\${command}`;
  let cursor = source.indexOf(marker);
  while (cursor >= 0) {
    const after = cursor + marker.length;
    if (!/[A-Za-z@]/.test(source[after] ?? "")) {
      const argument = readNextBracedArgument(source, after);
      if (argument) return argument.value;
    }
    cursor = source.indexOf(marker, after);
  }
  return "";
}

function extractKatexMacros(source: string): Record<string, string> {
  const macros: Record<string, string> = {};
  const pattern = /\\(?:newcommand|renewcommand)\s*\{?\\([A-Za-z@]+)\}?\s*(?:\[0\])?\s*\{([^{}]*)\}/g;
  for (const match of source.matchAll(pattern)) {
    macros[`\\${match[1]}`] = match[2];
  }
  return macros;
}

function addToken(tokens: ProtectedToken[], html: string, block: boolean): string {
  const index = tokens.push({ html, block }) - 1;
  return `${TOKEN_START}${index}${TOKEN_END}`;
}

function tokenAt(value: string, index: number, tokens: ProtectedToken[]) {
  if (value[index] !== TOKEN_START) return null;
  const end = value.indexOf(TOKEN_END, index + TOKEN_START.length);
  if (end < 0) return null;
  const tokenIndex = Number(value.slice(index + TOKEN_START.length, end));
  const token = tokens[tokenIndex];
  if (!token) return null;
  return { token, end: end + TOKEN_END.length };
}

function exactToken(value: string, tokens: ProtectedToken[]): ProtectedToken | null {
  const parsed = tokenAt(value, 0, tokens);
  return parsed && parsed.end === value.length ? parsed.token : null;
}

function protectVerbatim(source: string, tokens: ProtectedToken[]): string {
  return source.replace(
    /\\begin\s*\{(verbatim\*?|lstlisting|minted)\}(?:\[[^\]]*\])?(?:\{[^}]*\})?([\s\S]*?)\\end\s*\{\1\}/g,
    (_match, environment: string, content: string) =>
      addToken(
        tokens,
        `<pre class="latex-code"><code data-environment="${escapeHtml(environment)}">${escapeHtml(content.replace(/^\n|\n$/g, ""))}</code></pre>`,
        true,
      ),
  );
}

function protectMathEnvironments(
  source: string,
  tokens: ProtectedToken[],
  macros: Record<string, string>,
  warnings: Set<string>,
): string {
  const displayEnvironments =
    "equation\\*?|align\\*?|alignat\\*?|gather\\*?|multline\\*?|displaymath|eqnarray\\*?";
  const pattern = new RegExp(
    `\\\\begin\\s*\\{(${displayEnvironments})\\}([\\s\\S]*?)\\\\end\\s*\\{\\1\\}`,
    "g",
  );
  return source.replace(pattern, (_match, environment: string, content: string) => {
    const expression = /^(?:align|alignat|gather|multline|eqnarray)/.test(environment)
      ? `\\begin{aligned}${content}\\end{aligned}`
      : content;
    return addToken(tokens, renderMath(expression, true, macros, warnings), true);
  });
}

function protectDelimitedMath(
  source: string,
  tokens: ProtectedToken[],
  macros: Record<string, string>,
  warnings: Set<string>,
): string {
  let protectedSource = protectPairedDelimiter(
    source,
    "\\[",
    "\\]",
    true,
    tokens,
    macros,
    warnings,
  );
  protectedSource = protectPairedDelimiter(
    protectedSource,
    "\\(",
    "\\)",
    false,
    tokens,
    macros,
    warnings,
  );
  return protectDollarMath(protectedSource, tokens, macros, warnings);
}

function protectPairedDelimiter(
  source: string,
  opening: string,
  closing: string,
  displayMode: boolean,
  tokens: ProtectedToken[],
  macros: Record<string, string>,
  warnings: Set<string>,
): string {
  let output = "";
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(opening, cursor);
    if (start < 0) return output + source.slice(cursor);
    const end = source.indexOf(closing, start + opening.length);
    if (end < 0) return output + source.slice(cursor);
    output += source.slice(cursor, start);
    output += addToken(
      tokens,
      renderMath(
        source.slice(start + opening.length, end),
        displayMode,
        macros,
        warnings,
      ),
      displayMode,
    );
    cursor = end + closing.length;
  }
  return output;
}

function protectDollarMath(
  source: string,
  tokens: ProtectedToken[],
  macros: Record<string, string>,
  warnings: Set<string>,
): string {
  let output = "";
  let cursor = 0;

  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      output += source.slice(cursor, cursor + 2);
      cursor += Math.min(2, source.length - cursor);
      continue;
    }
    if (source[cursor] !== "$") {
      output += source[cursor];
      cursor += 1;
      continue;
    }

    const displayMode = source[cursor + 1] === "$";
    const delimiter = displayMode ? "$$" : "$";
    const contentStart = cursor + delimiter.length;
    const end = findUnescapedDelimiter(source, delimiter, contentStart, !displayMode);
    if (end < 0) {
      output += delimiter;
      cursor = contentStart;
      continue;
    }

    const expression = source.slice(contentStart, end);
    output += addToken(
      tokens,
      renderMath(expression, displayMode, macros, warnings),
      displayMode,
    );
    cursor = end + delimiter.length;
  }
  return output;
}

function findUnescapedDelimiter(
  source: string,
  delimiter: string,
  start: number,
  stopAtNewline: boolean,
): number {
  for (let index = start; index <= source.length - delimiter.length; index += 1) {
    if (stopAtNewline && source[index] === "\n") return -1;
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source.startsWith(delimiter, index)) return index;
  }
  return -1;
}

function renderMath(
  expression: string,
  displayMode: boolean,
  macros: Record<string, string>,
  warnings: Set<string>,
): string {
  if (expression.length > MAX_MATH_SOURCE_LENGTH) {
    warnings.add("Eine Formel überschreitet das Live-Limit von 50.000 Zeichen.");
    return `<code class="latex-math-error">${escapeHtml(expression.slice(0, 500))} …</code>`;
  }

  const options: KatexOptions = {
    displayMode,
    throwOnError: false,
    strict: "ignore",
    trust: false,
    output: "htmlAndMathml",
    macros,
  };
  try {
    return katex.renderToString(expression.trim(), options);
  } catch (error) {
    warnings.add(`Eine Formel konnte nicht vollständig gerendert werden: ${messageFrom(error)}`);
    return `<code class="latex-math-error">${escapeHtml(expression)}</code>`;
  }
}

function protectTabular(
  source: string,
  tokens: ProtectedToken[],
  warnings: Set<string>,
): string {
  return source.replace(
    /\\begin\s*\{tabular\}\s*\{[^}]*\}([\s\S]*?)\\end\s*\{tabular\}/g,
    (_match, content: string) => {
      const rows = splitUnescaped(content.replace(/\\hline/g, ""), "\\\\")
        .map((row) => row.trim())
        .filter(Boolean);
      if (rows.length === 0) return "";
      const html = rows
        .map((row) => {
          const cells = splitUnescaped(row, "&")
            .map((cell) => `<td>${renderInline(cell.trim(), tokens, warnings)}</td>`)
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return addToken(tokens, `<div class="latex-table-wrap"><table>${html}</table></div>`, true);
    },
  );
}

function splitUnescaped(value: string, delimiter: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let index = 0; index <= value.length - delimiter.length; index += 1) {
    if (!value.startsWith(delimiter, index)) continue;
    let slashes = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
      slashes += 1;
    }
    if (slashes % 2 !== 0) continue;
    parts.push(value.slice(start, index));
    start = index + delimiter.length;
    index = start - 1;
  }
  parts.push(value.slice(start));
  return parts;
}

function renderLines(
  source: string,
  tokens: ProtectedToken[],
  metadata: { title: string; author: string; date: string },
  warnings: Set<string>,
): string {
  const output: string[] = [];
  let paragraph: string[] = [];
  let listTag: "ul" | "ol" | null = null;
  let listItem: string[] = [];
  const wrappers: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    output.push(`<p>${renderInline(paragraph.join(" "), tokens, warnings)}</p>`);
    paragraph = [];
  };
  const flushListItem = () => {
    if (!listTag || listItem.length === 0) return;
    output.push(`<li>${renderInline(listItem.join(" "), tokens, warnings)}</li>`);
    listItem = [];
  };
  const closeList = () => {
    if (!listTag) return;
    flushListItem();
    output.push(`</${listTag}>`);
    listTag = null;
  };

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    const blockToken = exactToken(line, tokens);
    if (blockToken?.block) {
      if (listTag) {
        listItem.push(line);
      } else {
        flushParagraph();
        output.push(blockToken.html);
      }
      continue;
    }

    if (!line) {
      if (listTag) listItem.push("\\newline");
      else flushParagraph();
      continue;
    }

    if (/^\\maketitle\b/.test(line)) {
      flushParagraph();
      closeList();
      const title = metadata.title
        ? `<h1>${renderInline(metadata.title, tokens, warnings)}</h1>`
        : "";
      const author = metadata.author
        ? `<p class="latex-author">${renderInline(metadata.author, tokens, warnings)}</p>`
        : "";
      const date = metadata.date
        ? `<p class="latex-date">${renderInline(metadata.date, tokens, warnings)}</p>`
        : "";
      output.push(`<header class="latex-title">${title}${author}${date}</header>`);
      continue;
    }

    const heading = parseHeading(line);
    if (heading) {
      flushParagraph();
      closeList();
      output.push(
        `<h${heading.level}>${renderInline(heading.value, tokens, warnings)}</h${heading.level}>`,
      );
      continue;
    }

    const environment = line.match(/^\\(begin|end)\s*\{([^}]+)\}/);
    if (environment) {
      const opening = environment[1] === "begin";
      const name = environment[2].replace(/\*$/, "");
      if (name === "itemize" || name === "enumerate") {
        flushParagraph();
        if (opening) {
          closeList();
          listTag = name === "itemize" ? "ul" : "ol";
          output.push(`<${listTag}>`);
        } else {
          closeList();
        }
      } else if (["quote", "quotation", "abstract", "center"].includes(name)) {
        flushParagraph();
        closeList();
        if (opening) {
          const tag = name === "center" ? "div" : name === "abstract" ? "section" : "blockquote";
          const className = `latex-${name}`;
          output.push(
            `<${tag} class="${className}">${name === "abstract" ? "<h2>Zusammenfassung</h2>" : ""}`,
          );
          wrappers.push(tag);
        } else {
          const tag = wrappers.pop();
          if (tag) output.push(`</${tag}>`);
        }
      } else if (!["document", "figure", "table", "minipage"].includes(name)) {
        warnings.add(`Umgebung „${name}“ wird in der Live-Vorschau vereinfacht.`);
      }
      continue;
    }

    if (listTag && /^\\item\b/.test(line)) {
      flushListItem();
      listItem.push(line.replace(/^\\item(?:\s*\[[^\]]*\])?\s*/, ""));
      continue;
    }

    const caption = parseSingleArgumentCommand(line, "caption");
    if (caption) {
      flushParagraph();
      output.push(`<p class="latex-caption">${renderInline(caption.value, tokens, warnings)}</p>`);
      continue;
    }

    if (listTag) listItem.push(line);
    else paragraph.push(line);
  }

  flushParagraph();
  closeList();
  while (wrappers.length > 0) output.push(`</${wrappers.pop()}>`);

  if (output.length === 0) {
    return '<div class="latex-empty">Leeres LaTeX-Dokument</div>';
  }
  return output.join("\n");
}

function parseHeading(line: string): { level: number; value: string } | null {
  const levels: Record<string, number> = {
    part: 1,
    chapter: 1,
    section: 2,
    subsection: 3,
    subsubsection: 4,
    paragraph: 5,
    subparagraph: 6,
  };
  const match = line.match(/^\\([A-Za-z]+)\*?/);
  if (!match || !(match[1] in levels)) return null;
  const argument = readNextBracedArgument(line, match[0].length);
  return argument ? { level: levels[match[1]], value: argument.value } : null;
}

function parseSingleArgumentCommand(line: string, command: string): CommandArgument | null {
  const marker = `\\${command}`;
  if (!line.startsWith(marker) || /[A-Za-z@]/.test(line[marker.length] ?? "")) return null;
  return readNextBracedArgument(line, marker.length);
}

function renderInline(
  source: string,
  tokens: ProtectedToken[],
  warnings: Set<string>,
): string {
  let output = "";
  let index = 0;

  while (index < source.length) {
    const protectedToken = tokenAt(source, index, tokens);
    if (protectedToken) {
      output += protectedToken.token.html;
      index = protectedToken.end;
      continue;
    }

    const char = source[index];
    if (char === "\\") {
      const next = source[index + 1] ?? "";
      if (next === "\\") {
        output += "<br>";
        index += 2;
        continue;
      }
      if ("%$&#_{}".includes(next)) {
        output += escapeHtml(next);
        index += 2;
        continue;
      }

      const commandMatch = source.slice(index + 1).match(/^([A-Za-z@]+|[^A-Za-z\s])/);
      if (!commandMatch) {
        output += "\\";
        index += 1;
        continue;
      }
      const command = commandMatch[1];
      let cursor = index + 1 + command.length;

      if (command === "verb") {
        if (source[cursor] === "*") cursor += 1;
        const delimiter = source[cursor];
        const end = delimiter ? source.indexOf(delimiter, cursor + 1) : -1;
        if (end > cursor) {
          output += `<code>${escapeHtml(source.slice(cursor + 1, end))}</code>`;
          index = end + 1;
          continue;
        }
      }

      if (["LaTeX", "TeX"].includes(command)) {
        const emptyGroup = readNextBracedArgument(source, cursor);
        output += command;
        index = emptyGroup?.value === "" ? emptyGroup.end : cursor;
        continue;
      }

      if (["href", "hyperref"].includes(command)) {
        const destination = readNextBracedArgument(source, cursor);
        const label = destination
          ? readNextBracedArgument(source, destination.end)
          : null;
        if (destination && label) {
          output += `<span class="latex-link" title="${escapeAttribute(destination.value)}">${renderInline(label.value, tokens, warnings)}</span>`;
          index = label.end;
          continue;
        }
      }

      const argument = readNextBracedArgument(source, cursor);
      if (argument) {
        const content = renderInline(argument.value, tokens, warnings);
        const wrappers: Record<string, [string, string]> = {
          textbf: ["<strong>", "</strong>"],
          bfseries: ["<strong>", "</strong>"],
          textit: ["<em>", "</em>"],
          emph: ["<em>", "</em>"],
          textsl: ["<em>", "</em>"],
          texttt: ["<code>", "</code>"],
          underline: ["<u>", "</u>"],
          textsc: ["<span class=\"latex-smallcaps\">", "</span>"],
          textsuperscript: ["<sup>", "</sup>"],
          textsubscript: ["<sub>", "</sub>"],
          footnote: ["<sup class=\"latex-footnote\" title=\"Fußnote\">", "</sup>"],
          caption: ["<strong>", "</strong>"],
        };
        if (wrappers[command]) {
          output += `${wrappers[command][0]}${content}${wrappers[command][1]}`;
        } else if (["label", "index", "hypertarget"].includes(command)) {
          // Metadata-only commands are intentionally hidden.
        } else if (["ref", "pageref", "eqref", "cite", "citep", "citet"].includes(command)) {
          output += `<span class="latex-reference">[${content}]</span>`;
        } else if (command === "url") {
          output += `<span class="latex-link">${content}</span>`;
        } else if (command === "includegraphics") {
          output += `<span class="latex-image-placeholder">Bild: ${content}</span>`;
        } else if (["\"", "'", "`", "^", "~", "c", "v", "H"].includes(command)) {
          output += applyAccent(command, argument.value);
        } else {
          output += content;
          if (!["mbox", "textrm", "textsf", "mathrm", "operatorname"].includes(command)) {
            warnings.add(`Befehl „\\${command}“ wird in der Live-Vorschau vereinfacht.`);
          }
        }
        index = argument.end;
        continue;
      }

      const replacements: Record<string, string> = {
        LaTeX: "LaTeX",
        TeX: "TeX",
        today: new Intl.DateTimeFormat("de-DE").format(new Date()),
        ldots: "…",
        dots: "…",
        textbackslash: "\\",
        textasciitilde: "~",
        textasciicircum: "^",
        and: " · ",
        quad: " ",
        qquad: "  ",
        newline: "<br>",
        linebreak: "<br>",
      };
      if (command in replacements) {
        output += replacements[command];
      } else if (!["noindent", "indent", "centering", "small", "large", "Large", "clearpage", "newpage"].includes(command)) {
        warnings.add(`Befehl „\\${command}“ wird in der Live-Vorschau nicht dargestellt.`);
      }
      index = cursor;
      continue;
    }

    if (char === "{" || char === "}") {
      index += 1;
      continue;
    }
    if (char === "~") {
      output += "&nbsp;";
      index += 1;
      continue;
    }
    if (source.startsWith("---", index)) {
      output += "—";
      index += 3;
      continue;
    }
    if (source.startsWith("--", index)) {
      output += "–";
      index += 2;
      continue;
    }
    if (source.startsWith("``", index)) {
      output += "„";
      index += 2;
      continue;
    }
    if (source.startsWith("''", index)) {
      output += "“";
      index += 2;
      continue;
    }

    output += escapeHtml(char);
    index += 1;
  }

  return output;
}

function readNextBracedArgument(source: string, start: number): CommandArgument | null {
  let cursor = start;
  while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  if (source[cursor] === "*") {
    cursor += 1;
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  }
  if (source[cursor] === "[") {
    const optionEnd = findClosing(source, cursor, "[", "]");
    if (optionEnd < 0) return null;
    cursor = optionEnd + 1;
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  }
  if (source[cursor] !== "{") return null;
  const end = findClosing(source, cursor, "{", "}");
  if (end < 0) return null;
  return { value: source.slice(cursor + 1, end), end: end + 1 };
}

function findClosing(
  source: string,
  start: number,
  opening: string,
  closing: string,
): number {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] === opening) depth += 1;
    else if (source[index] === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function applyAccent(command: string, value: string): string {
  const combining: Record<string, string> = {
    "\"": "\u0308",
    "'": "\u0301",
    "`": "\u0300",
    "^": "\u0302",
    "~": "\u0303",
    c: "\u0327",
    v: "\u030C",
    H: "\u030B",
  };
  return escapeHtml(`${value}${combining[command] ?? ""}`.normalize("NFC"));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function escapeAttribute(value: string): string {
  return escapeHtml(value.replace(/[\u0000-\u001F\u007F]/g, ""));
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
