import katex, { type KatexOptions } from "katex";

const MAX_LIVE_SOURCE_LENGTH = 1_000_000;
const MAX_MATH_SOURCE_LENGTH = 50_000;
const MAX_MACROS = 200;
const MAX_MACRO_BODY_LENGTH = 2_000;
const MAX_TABLE_COLUMNS = 64;
const TOKEN_START = "\uE000";
const TOKEN_END = "\uE001";
const TOC_PLACEHOLDER = "\uE002";

export type LatexLiveLanguage = "de" | "en";

interface ProtectedToken {
  html: string;
  block: boolean;
}

interface CommandArgument {
  value: string;
  end: number;
}

interface HeadingEntry {
  level: number;
  number: string;
  html: string;
}

interface RenderContext {
  tokens: ProtectedToken[];
  warnings: Set<string>;
  macros: Record<string, string>;
  footnotes: string[];
  headings: HeadingEntry[];
  language: LatexLiveLanguage;
  hasChapters: boolean;
  counters: { part: number; chapter: number; section: number; subsection: number; subsubsection: number };
  appendix: boolean;
}

interface DocumentMetadata {
  title: string | null;
  author: string | null;
  date: string | null;
}

export interface LatexLiveRenderResult {
  html: string;
  warnings: string[];
  truncated: boolean;
}

const LABELS: Record<LatexLiveLanguage, Record<string, string>> = {
  de: {
    abstract: "Zusammenfassung",
    contents: "Inhaltsverzeichnis",
    references: "Literatur",
    footnotes: "Fußnoten",
    part: "Teil",
    theorem: "Satz",
    lemma: "Lemma",
    corollary: "Korollar",
    proposition: "Proposition",
    definition: "Definition",
    example: "Beispiel",
    remark: "Bemerkung",
    note: "Notiz",
    claim: "Behauptung",
    conjecture: "Vermutung",
    exercise: "Aufgabe",
    solution: "Lösung",
    proof: "Beweis",
    included: "Eingebundene Datei",
    image: "Bild",
    pdfOnly: "wird nur im PDF-Build erzeugt",
    bibliography: "Literaturverzeichnis",
    listOfFigures: "Abbildungsverzeichnis",
    listOfTables: "Tabellenverzeichnis",
    index: "Stichwortverzeichnis",
    footnoteTitle: "Fußnote",
    quoteOpen: "„",
    quoteClose: "“",
    singleQuoteOpen: "‚",
    singleQuoteClose: "‘",
  },
  en: {
    abstract: "Abstract",
    contents: "Contents",
    references: "References",
    footnotes: "Footnotes",
    part: "Part",
    theorem: "Theorem",
    lemma: "Lemma",
    corollary: "Corollary",
    proposition: "Proposition",
    definition: "Definition",
    example: "Example",
    remark: "Remark",
    note: "Note",
    claim: "Claim",
    conjecture: "Conjecture",
    exercise: "Exercise",
    solution: "Solution",
    proof: "Proof",
    included: "Included file",
    image: "Image",
    pdfOnly: "is only produced by the PDF build",
    bibliography: "Bibliography",
    listOfFigures: "List of Figures",
    listOfTables: "List of Tables",
    index: "Index",
    footnoteTitle: "Footnote",
    quoteOpen: "“",
    quoteClose: "”",
    singleQuoteOpen: "‘",
    singleQuoteClose: "’",
  },
};

const THEOREM_ENVIRONMENTS = new Set([
  "theorem",
  "lemma",
  "corollary",
  "proposition",
  "definition",
  "example",
  "remark",
  "note",
  "claim",
  "conjecture",
  "exercise",
  "solution",
]);

const IGNORED_ENVIRONMENTS = new Set([
  "document",
  "figure",
  "table",
  "minipage",
  "titlepage",
  "subequations",
  "columns",
  "column",
  "wrapfigure",
  "wraptable",
  "landscape",
  "sidewaysfigure",
  "sidewaystable",
  "samepage",
  "sloppypar",
  "small",
  "footnotesize",
  "scriptsize",
  "tiny",
  "large",
  "Large",
  "LARGE",
  "huge",
  "Huge",
  "normalsize",
  "singlespace",
  "onehalfspace",
  "doublespace",
  "spacing",
  "adjustbox",
  "threeparttable",
  "tablenotes",
  "subfigure",
  "subtable",
  "multicols",
  "group",
  "otherlanguage",
]);

const SILENT_ARGUMENT_COMMANDS = new Set([
  "vspace",
  "hspace",
  "vskip",
  "hskip",
  "setlength",
  "addtolength",
  "setcounter",
  "addtocounter",
  "stepcounter",
  "refstepcounter",
  "pagestyle",
  "thispagestyle",
  "pagenumbering",
  "usepackage",
  "RequirePackage",
  "documentclass",
  "newcommand",
  "renewcommand",
  "providecommand",
  "newenvironment",
  "renewenvironment",
  "newtheorem",
  "theoremstyle",
  "numberwithin",
  "DeclareMathOperator",
  "includeonly",
  "graphicspath",
  "hypersetup",
  "geometry",
  "bibliographystyle",
  "label",
  "index",
  "hypertarget",
  "addcontentsline",
  "rule",
  "title",
  "author",
  "date",
  "institute",
  "titlegraphic",
  "logo",
  "usetheme",
  "usecolortheme",
  "usefonttheme",
  "setbeamertemplate",
  "setbeamercolor",
  "setbeamerfont",
  "nocite",
  "selectlanguage",
  "lstset",
  "definecolor",
  "pagecolor",
  "color",
  "fontsize",
  "linespread",
  "setstretch",
  "setmainfont",
  "setsansfont",
  "setmonofont",
  "newfontfamily",
  "captionsetup",
  "floatname",
  "renewcaption",
  "phantom",
  "hphantom",
  "vphantom",
  "footnotemark",
  "footnotetext",
  "settowidth",
  "newlength",
  "newcounter",
  "newsavebox",
  "savebox",
  "sbox",
  "usebox",
  "typeout",
  "message",
  "AtBeginDocument",
  "AtEndDocument",
  "makeatletter",
  "makeatother",
  "let",
  "def",
  "counterwithin",
  "counterwithout",
  "DeclareCaptionFormat",
  "DeclareSIUnit",
  "sisetup",
  "setmainlanguage",
  "setotherlanguage",
  "setotherlanguages",
  "babelprovide",
  "hyphenation",
  "onecolumn",
  "twocolumn",
  "mathversion",
  "columnbreak",
  "pause",
]);

const SILENT_COMMANDS = new Set([
  "noindent",
  "indent",
  "centering",
  "raggedright",
  "raggedleft",
  "small",
  "footnotesize",
  "scriptsize",
  "tiny",
  "normalsize",
  "large",
  "Large",
  "LARGE",
  "huge",
  "Huge",
  "clearpage",
  "cleardoublepage",
  "newpage",
  "pagebreak",
  "nopagebreak",
  "bigskip",
  "medskip",
  "smallskip",
  "hfill",
  "vfill",
  "hfil",
  "vfil",
  "hss",
  "relax",
  "protect",
  "ignorespaces",
  "frenchspacing",
  "nonfrenchspacing",
  "sloppy",
  "fussy",
  "appendix",
  "frontmatter",
  "mainmatter",
  "backmatter",
  "bfseries",
  "itshape",
  "ttfamily",
  "rmfamily",
  "sffamily",
  "mdseries",
  "upshape",
  "scshape",
  "slshape",
  "em",
  "bf",
  "it",
  "tt",
  "rm",
  "sf",
  "sc",
  "sl",
  "normalfont",
  "selectfont",
  "boldmath",
  "unboldmath",
  "nolinebreak",
  "hline",
  "toprule",
  "midrule",
  "bottomrule",
  "qed",
  "qedhere",
  "pause",
  "makeatletter",
  "makeatother",
  "onecolumn",
  "twocolumn",
  "columnbreak",
  "linenumbers",
  "nolinenumbers",
  "flushbottom",
  "raggedbottom",
  "nobreak",
  "allowbreak",
  "strut",
  "null",
  "leavevmode",
  "unskip",
  "nointerlineskip",
  "displaystyle",
  "textstyle",
  "hrulefill",
  "dotfill",
  "endinput",
  "listoffigures",
  "listoftables",
  "printindex",
  "maketitle",
  "tableofcontents",
  "printbibliography",
]);

const DECLARATION_WRAPPERS: Record<string, [string, string]> = {
  bfseries: ["<strong>", "</strong>"],
  bf: ["<strong>", "</strong>"],
  itshape: ["<em>", "</em>"],
  it: ["<em>", "</em>"],
  em: ["<em>", "</em>"],
  slshape: ["<em>", "</em>"],
  sl: ["<em>", "</em>"],
  ttfamily: ["<code>", "</code>"],
  tt: ["<code>", "</code>"],
  scshape: ['<span class="latex-smallcaps">', "</span>"],
  sc: ['<span class="latex-smallcaps">', "</span>"],
  sffamily: ['<span class="latex-sans">', "</span>"],
  sf: ['<span class="latex-sans">', "</span>"],
  small: ['<span class="latex-size-small">', "</span>"],
  footnotesize: ['<span class="latex-size-footnote">', "</span>"],
  scriptsize: ['<span class="latex-size-script">', "</span>"],
  tiny: ['<span class="latex-size-tiny">', "</span>"],
  large: ['<span class="latex-size-large">', "</span>"],
  Large: ['<span class="latex-size-Large">', "</span>"],
  LARGE: ['<span class="latex-size-LARGE">', "</span>"],
  huge: ['<span class="latex-size-huge">', "</span>"],
  Huge: ['<span class="latex-size-Huge">', "</span>"],
};

const TEXT_WRAPPERS: Record<string, [string, string]> = {
  textbf: ["<strong>", "</strong>"],
  textit: ["<em>", "</em>"],
  emph: ["<em>", "</em>"],
  textsl: ["<em>", "</em>"],
  texttt: ["<code>", "</code>"],
  underline: ["<u>", "</u>"],
  uline: ["<u>", "</u>"],
  ul: ["<u>", "</u>"],
  sout: ["<s>", "</s>"],
  st: ["<s>", "</s>"],
  hl: ["<mark>", "</mark>"],
  textsc: ['<span class="latex-smallcaps">', "</span>"],
  textsf: ['<span class="latex-sans">', "</span>"],
  textsuperscript: ["<sup>", "</sup>"],
  textsubscript: ["<sub>", "</sub>"],
  caption: ["<strong>", "</strong>"],
  alert: ['<span class="latex-alert">', "</span>"],
  structure: ['<span class="latex-structure">', "</span>"],
  marginpar: ['<span class="latex-marginpar">', "</span>"],
};

const TRANSPARENT_COMMANDS = new Set([
  "mbox",
  "textrm",
  "textnormal",
  "textmd",
  "textup",
  "text",
  "mathrm",
  "operatorname",
  "MakeUppercase",
  "MakeLowercase",
  "textcolor",
  "colorbox",
  "fcolorbox",
  "parbox",
  "makebox",
  "framebox",
  "fbox",
  "raisebox",
  "resizebox",
  "scalebox",
  "rotatebox",
  "texorpdfstring",
  "translate",
  "protect",
  "hbox",
  "vbox",
  "centerline",
  "shortstack",
  "uppercase",
  "lowercase",
  "nolinkurl",
  "path",
  "textrm",
  "boxed",
  "subcaption",
  "subfloat",
  "adjustbox",
  "only",
  "uncover",
  "visible",
  "invisible",
  "onslide",
  "textsl",
]);

const SI_UNITS: Record<string, string> = {
  meter: "m",
  metre: "m",
  gram: "g",
  kilogram: "kg",
  second: "s",
  ampere: "A",
  kelvin: "K",
  mole: "mol",
  candela: "cd",
  hertz: "Hz",
  newton: "N",
  pascal: "Pa",
  joule: "J",
  watt: "W",
  coulomb: "C",
  volt: "V",
  farad: "F",
  ohm: "Ω",
  siemens: "S",
  weber: "Wb",
  tesla: "T",
  henry: "H",
  celsius: "°C",
  degreeCelsius: "°C",
  lumen: "lm",
  lux: "lx",
  becquerel: "Bq",
  gray: "Gy",
  sievert: "Sv",
  katal: "kat",
  radian: "rad",
  steradian: "sr",
  liter: "L",
  litre: "L",
  minute: "min",
  hour: "h",
  day: "d",
  year: "a",
  tonne: "t",
  bar: "bar",
  degree: "°",
  percent: "%",
  byte: "B",
  bit: "bit",
  electronvolt: "eV",
  dalton: "Da",
  decibel: "dB",
  neper: "Np",
  angstrom: "Å",
  astronomicalunit: "au",
  atomicmassunit: "u",
  arcminute: "′",
  arcsecond: "″",
  per: "/",
  squared: "²",
  cubed: "³",
  square: "²",
  cubic: "³",
  yocto: "y",
  zepto: "z",
  atto: "a",
  femto: "f",
  pico: "p",
  nano: "n",
  micro: "µ",
  milli: "m",
  centi: "c",
  deci: "d",
  deca: "da",
  hecto: "h",
  kilo: "k",
  mega: "M",
  giga: "G",
  tera: "T",
  peta: "P",
  exa: "E",
  zetta: "Z",
  yotta: "Y",
};

const ACCENT_MARKS: Record<string, string> = {
  '"': "\u0308",
  "'": "\u0301",
  "`": "\u0300",
  "^": "\u0302",
  "~": "\u0303",
  "=": "\u0304",
  ".": "\u0307",
  c: "\u0327",
  v: "\u030C",
  H: "\u030B",
  u: "\u0306",
  r: "\u030A",
  k: "\u0328",
  d: "\u0323",
  b: "\u0331",
  t: "\u0361",
};

const SPECIAL_CHARACTERS: Record<string, string> = {
  ss: "ß",
  SS: "SS",
  ae: "æ",
  AE: "Æ",
  oe: "œ",
  OE: "Œ",
  o: "ø",
  O: "Ø",
  aa: "å",
  AA: "Å",
  l: "ł",
  L: "Ł",
  i: "ı",
  j: "ȷ",
  S: "§",
  P: "¶",
  dag: "†",
  ddag: "‡",
  copyright: "©",
  textcopyright: "©",
  textregistered: "®",
  texttrademark: "™",
  pounds: "£",
  textsterling: "£",
  euro: "€",
  texteuro: "€",
  textbar: "|",
  textless: "<",
  textgreater: ">",
  textquotedblleft: "“",
  textquotedblright: "”",
  textquoteleft: "‘",
  textquoteright: "’",
  quotedblbase: "„",
  quotesinglbase: "‚",
  glqq: "„",
  grqq: "“",
  glq: "‚",
  grq: "‘",
  flqq: "«",
  frqq: "»",
  flq: "‹",
  frq: "›",
  guillemotleft: "«",
  guillemotright: "»",
  dq: '"',
  textendash: "–",
  textemdash: "—",
  textellipsis: "…",
  ldots: "…",
  dots: "…",
  slash: "/",
  textbullet: "•",
  textdegree: "°",
  degree: "°",
  textasteriskcentered: "∗",
  textperiodcentered: "·",
  textbackslash: "\\",
  textasciitilde: "~",
  textasciicircum: "^",
  textunderscore: "_",
  textbraceleft: "{",
  textbraceright: "}",
  textdollar: "$",
  textsection: "§",
  textparagraph: "¶",
  textexclamdown: "¡",
  textquestiondown: "¿",
  textmu: "µ",
  textohm: "Ω",
  textcelsius: "℃",
  textperthousand: "‰",
  textpertenthousand: "‱",
  textonehalf: "½",
  textonequarter: "¼",
  textthreequarters: "¾",
  textminus: "−",
  textpm: "±",
  texttimes: "×",
  textdiv: "÷",
  textrightarrow: "→",
  textleftarrow: "←",
  textuparrow: "↑",
  textdownarrow: "↓",
  checkmark: "✓",
  cdot: "·",
  LaTeX: "LaTeX",
  LaTeXe: "LaTeX2ε",
  TeX: "TeX",
  BibTeX: "BibTeX",
  XeLaTeX: "XeLaTeX",
  LuaLaTeX: "LuaLaTeX",
  quad: "\u2003",
  qquad: "\u2003\u2003",
  enspace: "\u2002",
  enskip: "\u2002",
  thinspace: "\u2009",
  negthinspace: "",
  nobreakspace: "\u00A0",
  and: " · ",
  newline: "<br>",
  linebreak: "<br>",
  par: "<br>",
  ",": "\u2009",
  ";": "\u2005",
  ":": "\u2004",
  "!": "",
  "/": "",
  "-": "",
  "@": "",
  "&": "&amp;",
  "%": "%",
  $: "$",
  "#": "#",
  _: "_",
  "{": "{",
  "}": "}",
};

export function renderLatexLive(source: string): LatexLiveRenderResult {
  const truncated = source.length > MAX_LIVE_SOURCE_LENGTH;
  const input = normalizeSource(source.slice(0, MAX_LIVE_SOURCE_LENGTH));
  const context: RenderContext = {
    tokens: [],
    warnings: new Set<string>(),
    macros: extractKatexMacros(input),
    footnotes: [],
    headings: [],
    language: detectLanguage(input),
    hasChapters: false,
    counters: { part: 0, chapter: 0, section: 0, subsection: 0, subsubsection: 0 },
    appendix: false,
  };
  const metadata: DocumentMetadata = {
    title: commandValue(input, "title"),
    author: commandValue(input, "author"),
    date: commandValue(input, "date"),
  };

  let body = documentBody(input);
  body = protectVerbatim(body, context);
  body = removeHiddenBlocks(body);
  body = stripComments(body);
  context.hasChapters = /\\chapter\b/.test(body);
  body = protectMathEnvironments(body, context);
  body = protectDelimitedMath(body, context);
  body = protectTabular(body, context);

  let html = renderLines(body, context, metadata);
  if (context.footnotes.length > 0) html += renderFootnotes(context);
  html = html.split(TOC_PLACEHOLDER).join(renderTableOfContents(context));
  if (truncated) {
    context.warnings.add("Die Live-Vorschau ist auf 1.000.000 Zeichen begrenzt.");
  }

  return {
    html: `<div class="latex-body"${context.hasChapters ? ' data-chapters="true"' : ""}>${html}</div>`,
    warnings: [...context.warnings],
    truncated,
  };
}

function label(context: RenderContext, key: string): string {
  return LABELS[context.language][key] ?? LABELS.de[key] ?? key;
}

function normalizeSource(source: string): string {
  return source.replace(/\r\n?/g, "\n");
}

export function detectLanguage(source: string): LatexLiveLanguage {
  const english = /^(?:english|american|british|usenglish|ukenglish|canadian|australian|newzealand|USenglish|UKenglish)$/i;
  const german = /^(?:german|ngerman|austrian|naustrian|swissgerman|nswissgerman)$/i;
  const candidates: string[] = [];

  for (const match of source.matchAll(/\\usepackage\s*\[([^\]]*)\]\s*\{(?:babel|polyglossia)\}/g)) {
    let main: string | null = null;
    for (const option of match[1].split(",")) {
      const trimmed = option.trim();
      const assigned = trimmed.match(/^main\s*=\s*(.+)$/);
      if (assigned) main = assigned[1].trim();
      else if (trimmed) candidates.push(trimmed);
    }
    if (main) candidates.push(main);
  }
  for (const match of source.matchAll(/\\(?:setmainlanguage|setdefaultlanguage|selectlanguage)(?:\s*\[[^\]]*\])?\s*\{([^}]*)\}/g)) {
    candidates.push(match[1].trim());
  }

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    if (english.test(candidates[index])) return "en";
    if (german.test(candidates[index])) return "de";
  }
  return "de";
}

function stripComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      for (let index = 0; index < line.length; index += 1) {
        if (line[index] !== "%") continue;
        if (backslashesBefore(line, index) % 2 === 0) return line.slice(0, index);
      }
      return line;
    })
    .join("\n");
}

function backslashesBefore(value: string, index: number): number {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    count += 1;
  }
  return count;
}

function removeHiddenBlocks(source: string): string {
  return source
    .replace(/\\begin\s*\{comment\}[\s\S]*?\\end\s*\{comment\}/g, "")
    .replace(/\\iffalse\b[\s\S]*?\\fi\b/g, "");
}

function documentBody(source: string): string {
  const begin = source.search(/\\begin\s*\{document\}/);
  if (begin < 0) return source;
  const beginMatch = source.slice(begin).match(/^\\begin\s*\{document\}/);
  const start = begin + (beginMatch?.[0].length ?? 0);
  const end = source.search(/\\end\s*\{document\}/);
  return source.slice(start, end >= start ? end : undefined);
}

function commandValue(source: string, command: string): string | null {
  const marker = `\\${command}`;
  let cursor = source.indexOf(marker);
  while (cursor >= 0) {
    const after = cursor + marker.length;
    if (!/[A-Za-z@]/.test(source[after] ?? "") && backslashesBefore(source, cursor) % 2 === 0) {
      const argument = readNextBracedArgument(source, after);
      if (argument) return argument.value;
    }
    cursor = source.indexOf(marker, after);
  }
  return null;
}

export function extractKatexMacros(source: string): Record<string, string> {
  const macros: Record<string, string> = {};
  const pattern =
    /\\(newcommand|renewcommand|providecommand|DeclareMathOperator|def)(\*?)/g;
  let count = 0;

  for (const match of source.matchAll(pattern)) {
    if (count >= MAX_MACROS) break;
    const command = match[1];
    const starred = match[2] === "*";
    let cursor = match.index + match[0].length;
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;

    let name: string | null = null;
    if (source[cursor] === "{") {
      const braced = readNextBracedArgument(source, cursor);
      if (!braced) continue;
      const inner = braced.value.trim();
      if (!/^\\[A-Za-z@]+$/.test(inner)) continue;
      name = inner;
      cursor = braced.end;
    } else if (source[cursor] === "\\") {
      const nameMatch = source.slice(cursor).match(/^\\([A-Za-z@]+)/);
      if (!nameMatch) continue;
      name = `\\${nameMatch[1]}`;
      cursor = cursor + nameMatch[0].length;
    } else {
      continue;
    }

    if (command === "def") {
      // Parameter patterns such as \def\foo#1{...} are not representable.
      if (/^\s*#/.test(source.slice(cursor))) continue;
    } else {
      let argumentCount = source.slice(cursor).match(/^\s*\[(\d)\]/);
      if (argumentCount) {
        cursor += argumentCount[0].length;
        argumentCount = null;
      }
      if (/^\s*\[/.test(source.slice(cursor))) {
        // Optional default arguments cannot be expressed as KaTeX macros.
        continue;
      }
    }

    const body = readNextBracedArgument(source, cursor);
    if (!body || body.value.length > MAX_MACRO_BODY_LENGTH) continue;
    const value = body.value.trim();
    if (command === "DeclareMathOperator") {
      macros[name] = `\\operatorname${starred ? "*" : ""}{${value}}`;
    } else {
      macros[name] = value;
    }
    count += 1;
  }

  return macros;
}

function addToken(context: RenderContext, html: string, block: boolean): string {
  const index = context.tokens.push({ html, block }) - 1;
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

function protectVerbatim(source: string, context: RenderContext): string {
  let output = source.replace(
    /\\begin\s*\{(verbatim\*?|lstlisting|minted|Verbatim|BVerbatim|LVerbatim)\}(?:\[[^\]]*\])?(?:\{[^}]*\})?([\s\S]*?)\\end\s*\{\1\}/g,
    (_match, environment: string, content: string) =>
      addToken(
        context,
        `<pre class="latex-code"><code data-environment="${escapeHtml(environment)}">${escapeHtml(content.replace(/^\n|\n$/g, ""))}</code></pre>`,
        true,
      ),
  );
  output = output.replace(
    /\\(?:verb\*?|lstinline(?:\[[^\]]*\])?|mintinline\{[^}]*\})([^A-Za-z\s{])(.*?)\1/g,
    (_match, _delimiter: string, content: string) =>
      addToken(context, `<code>${escapeHtml(content)}</code>`, false),
  );
  return output;
}

function protectMathEnvironments(source: string, context: RenderContext): string {
  const displayEnvironments =
    "equation\\*?|align\\*?|alignat\\*?|flalign\\*?|gather\\*?|multline\\*?|displaymath|eqnarray\\*?";
  const pattern = new RegExp(
    `\\\\begin\\s*\\{(${displayEnvironments})\\}([\\s\\S]*?)\\\\end\\s*\\{\\1\\}`,
    "g",
  );
  let output = source.replace(pattern, (_match, environment: string, content: string) => {
    const cleaned = stripMathLabels(content);
    const expression = /^(?:align|alignat|flalign|gather|multline|eqnarray)/.test(environment)
      ? `\\begin{aligned}${cleaned}\\end{aligned}`
      : cleaned;
    return addToken(context, renderMath(expression, true, context), true);
  });
  output = output.replace(
    /\\begin\s*\{math\}([\s\S]*?)\\end\s*\{math\}/g,
    (_match, content: string) => addToken(context, renderMath(content, false, context), false),
  );
  return output;
}

function stripMathLabels(content: string): string {
  return content.replace(/\\label\s*\{[^}]*\}/g, "");
}

function protectDelimitedMath(source: string, context: RenderContext): string {
  let protectedSource = protectPairedDelimiter(source, "\\[", "\\]", true, context);
  protectedSource = protectPairedDelimiter(protectedSource, "\\(", "\\)", false, context);
  protectedSource = protectEnsureMath(protectedSource, context);
  return protectDollarMath(protectedSource, context);
}

function protectEnsureMath(source: string, context: RenderContext): string {
  let output = "";
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf("\\ensuremath", cursor);
    if (start < 0) return output + source.slice(cursor);
    const argument = readNextBracedArgument(source, start + "\\ensuremath".length);
    if (!argument || backslashesBefore(source, start) % 2 !== 0) {
      output += source.slice(cursor, start + 1);
      cursor = start + 1;
      continue;
    }
    output += source.slice(cursor, start);
    output += addToken(context, renderMath(argument.value, false, context), false);
    cursor = argument.end;
  }
  return output;
}

function protectPairedDelimiter(
  source: string,
  opening: string,
  closing: string,
  displayMode: boolean,
  context: RenderContext,
): string {
  let output = "";
  let cursor = 0;
  while (cursor < source.length) {
    const start = findCommandDelimiter(source, opening, cursor);
    if (start < 0) return output + source.slice(cursor);
    const end = findCommandDelimiter(source, closing, start + opening.length);
    if (end < 0) return output + source.slice(cursor);
    output += source.slice(cursor, start);
    output += addToken(
      context,
      renderMath(stripMathLabels(source.slice(start + opening.length, end)), displayMode, context),
      displayMode,
    );
    cursor = end + closing.length;
  }
  return output;
}

function findCommandDelimiter(source: string, delimiter: string, from: number): number {
  let cursor = source.indexOf(delimiter, from);
  while (cursor >= 0) {
    // `\\[2mm]` is a line break with spacing, not the start of display math.
    if (backslashesBefore(source, cursor) % 2 === 0) return cursor;
    cursor = source.indexOf(delimiter, cursor + 1);
  }
  return -1;
}

function protectDollarMath(source: string, context: RenderContext): string {
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
    output += addToken(context, renderMath(expression, displayMode, context), displayMode);
    cursor = end + delimiter.length;
  }
  return output;
}

function findUnescapedDelimiter(
  source: string,
  delimiter: string,
  start: number,
  stopAtBlankLine: boolean,
): number {
  for (let index = start; index <= source.length - delimiter.length; index += 1) {
    if (stopAtBlankLine && source[index] === "\n" && source[index + 1] === "\n") return -1;
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source.startsWith(delimiter, index)) return index;
  }
  return -1;
}

function renderMath(expression: string, displayMode: boolean, context: RenderContext): string {
  if (expression.length > MAX_MATH_SOURCE_LENGTH) {
    context.warnings.add("Eine Formel überschreitet das Live-Limit von 50.000 Zeichen.");
    return `<code class="latex-math-error">${escapeHtml(expression.slice(0, 500))} …</code>`;
  }

  const options: KatexOptions = {
    displayMode,
    throwOnError: false,
    strict: "ignore",
    trust: false,
    output: "htmlAndMathml",
    macros: context.macros,
  };
  try {
    return katex.renderToString(expression.trim(), options);
  } catch (error) {
    context.warnings.add(
      `Eine Formel konnte nicht vollständig gerendert werden: ${messageFrom(error)}`,
    );
    return `<code class="latex-math-error">${escapeHtml(expression)}</code>`;
  }
}

const TABLE_ENVIRONMENTS = ["tabular*", "tabularx", "tabulary", "tabular", "longtable"];

function protectTabular(source: string, context: RenderContext): string {
  let output = "";
  let cursor = 0;

  while (cursor < source.length) {
    const beginMatch = source.slice(cursor).match(/\\begin\s*\{(tabular\*?|tabularx|tabulary|longtable)\}/);
    if (!beginMatch || beginMatch.index === undefined) return output + source.slice(cursor);
    const start = cursor + beginMatch.index;
    const environment = beginMatch[1];
    let argumentCursor = start + beginMatch[0].length;

    if (environment !== "tabular" && environment !== "longtable") {
      const width = readNextBracedArgument(source, argumentCursor);
      if (width) argumentCursor = width.end;
    }
    const spec = readNextBracedArgument(source, argumentCursor);
    const endPattern = new RegExp(`\\\\end\\s*\\{${escapeRegExp(environment)}\\}`);
    const endMatch = source.slice(spec ? spec.end : argumentCursor).match(endPattern);
    if (!spec || !endMatch || endMatch.index === undefined) {
      output += source.slice(cursor, start + beginMatch[0].length);
      cursor = start + beginMatch[0].length;
      continue;
    }

    const contentStart = spec.end;
    const contentEnd = contentStart + endMatch.index;
    output += source.slice(cursor, start);
    output += addToken(
      context,
      renderTable(spec.value, source.slice(contentStart, contentEnd), context),
      true,
    );
    cursor = contentEnd + endMatch[0].length;
  }
  return output;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseColumnAlignments(spec: string): string[] {
  const alignments: string[] = [];
  let index = 0;
  while (index < spec.length && alignments.length < MAX_TABLE_COLUMNS) {
    const character = spec[index];
    if (character === "*") {
      const count = readNextBracedArgument(spec, index + 1);
      const inner = count ? readNextBracedArgument(spec, count.end) : null;
      if (!count || !inner) {
        index += 1;
        continue;
      }
      const repeat = Math.min(MAX_TABLE_COLUMNS, Number.parseInt(count.value, 10) || 0);
      const expanded = parseColumnAlignments(inner.value);
      for (let repetition = 0; repetition < repeat; repetition += 1) alignments.push(...expanded);
      index = inner.end;
      continue;
    }
    if ("@!><".includes(character)) {
      const argument = readNextBracedArgument(spec, index + 1);
      index = argument ? argument.end : index + 1;
      continue;
    }
    if ("pmbPMB".includes(character)) {
      const argument = readNextBracedArgument(spec, index + 1);
      alignments.push("left");
      index = argument ? argument.end : index + 1;
      continue;
    }
    if (character === "l" || character === "L" || character === "X" || character === "J") {
      alignments.push("left");
    } else if (character === "c" || character === "C") {
      alignments.push("center");
    } else if (character === "r" || character === "R" || character === "S" || character === "N") {
      alignments.push("right");
    }
    index += 1;
  }
  return alignments.slice(0, MAX_TABLE_COLUMNS);
}

interface TableRow {
  cells: string;
  leadingRule: boolean;
}

function renderTable(spec: string, content: string, context: RenderContext): string {
  const alignments = parseColumnAlignments(spec);
  const rulePattern =
    /\\(?:hline|toprule|midrule|bottomrule|cline\s*\{[^}]*\}|cmidrule(?:\([^)]*\))?(?:\[[^\]]*\])?\s*\{[^}]*\}|addlinespace(?:\[[^\]]*\])?|specialrule\s*\{[^}]*\}\s*\{[^}]*\}\s*\{[^}]*\}|morecmidrules|endhead|endfirsthead|endfoot|endlastfoot|noalign\s*\{[^}]*\})/g;
  const rows: TableRow[] = splitUnescaped(content, "\\\\")
    .map((segment) => segment.replace(/^\s*\[[^\]]*\]/, ""))
    .map((segment) => {
      const leadingRule = /^\s*\\(?:hline|toprule|midrule|bottomrule|cline|cmidrule)/.test(segment);
      return { cells: segment.replace(rulePattern, "").trim(), leadingRule };
    })
    .filter((row) => row.cells.length > 0);
  if (rows.length === 0) return "";

  const hasHeader = rows.length > 1 && rows[1].leadingRule;
  const renderRow = (row: TableRow, header: boolean): string => {
    let column = 0;
    const cells = splitUnescaped(row.cells, "&").map((rawCell) => {
      const cell = rawCell.trim();
      let span = 1;
      let alignment = alignments[column] ?? null;
      let body = cell;

      const multicolumn = cell.match(/^\\multicolumn\s*/);
      if (multicolumn) {
        const count = readNextBracedArgument(cell, multicolumn[0].length);
        const columnSpec = count ? readNextBracedArgument(cell, count.end) : null;
        const inner = columnSpec ? readNextBracedArgument(cell, columnSpec.end) : null;
        if (count && columnSpec && inner) {
          span = Math.max(1, Math.min(MAX_TABLE_COLUMNS, Number.parseInt(count.value, 10) || 1));
          alignment = parseColumnAlignments(columnSpec.value)[0] ?? alignment;
          body = inner.value;
        }
      }
      const multirow = body.match(/^\\multirow\s*/);
      if (multirow) {
        const count = readNextBracedArgument(body, multirow[0].length);
        const width = count ? readNextBracedArgument(body, count.end) : null;
        const inner = width ? readNextBracedArgument(body, width.end) : null;
        if (inner) body = inner.value;
      }

      const tag = header ? "th" : "td";
      const attributes = [
        span > 1 ? ` colspan="${span}"` : "",
        alignment ? ` style="text-align: ${alignment}"` : "",
      ].join("");
      column += span;
      return `<${tag}${attributes}>${renderInline(body, context)}</${tag}>`;
    });
    return `<tr>${cells.join("")}</tr>`;
  };

  const head = hasHeader ? `<thead>${renderRow(rows[0], true)}</thead>` : "";
  const bodyRows = (hasHeader ? rows.slice(1) : rows).map((row) => renderRow(row, false)).join("");
  return `<div class="latex-table-wrap"><table class="latex-table">${head}<tbody>${bodyRows}</tbody></table></div>`;
}

function splitUnescaped(value: string, delimiter: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index <= value.length - delimiter.length; index += 1) {
    if (value[index] === "\\" && value[index + 1] !== undefined && !value.startsWith(delimiter, index)) {
      index += 1;
      continue;
    }
    if (value[index] === "{") depth += 1;
    else if (value[index] === "}") depth = Math.max(0, depth - 1);
    if (depth > 0 || !value.startsWith(delimiter, index)) continue;
    if (backslashesBefore(value, index) % 2 !== 0) continue;
    parts.push(value.slice(start, index));
    start = index + delimiter.length;
    index = start - 1;
  }
  parts.push(value.slice(start));
  return parts;
}

interface ListFrame {
  tag: "ul" | "ol" | "dl";
  itemOpen: boolean;
  itemTag: "li" | "dd";
  buffer: string[];
  openIndex: number;
}

function renderLines(source: string, context: RenderContext, metadata: DocumentMetadata): string {
  const output: string[] = [];
  const lists: ListFrame[] = [];
  const wrappers: string[] = [];
  let paragraph: string[] = [];

  const currentList = () => lists[lists.length - 1] ?? null;
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const html = renderInline(paragraph.join(" "), context);
    paragraph = [];
    if (html.trim()) output.push(`<p>${html}</p>`);
  };
  const appendToItem = (list: ListFrame, html: string) => {
    // Keep simple items on one line: <li>Text</li>. Nested blocks start new lines.
    if (list.itemOpen && output.length - 1 === list.openIndex) {
      output[list.openIndex] += html;
    } else {
      output.push(html);
    }
  };
  const flushItemText = () => {
    const list = currentList();
    if (!list || list.buffer.length === 0) return;
    const html = renderInline(list.buffer.join(" "), context);
    list.buffer = [];
    if (html.trim()) appendToItem(list, html);
  };
  const closeItem = () => {
    const list = currentList();
    if (!list) return;
    flushItemText();
    if (list.itemOpen) {
      appendToItem(list, `</${list.itemTag}>`);
      list.itemOpen = false;
    }
  };
  const openItem = (list: ListFrame, html: string) => {
    output.push(html);
    list.itemOpen = true;
    list.openIndex = output.length - 1;
  };
  const openList = (tag: ListFrame["tag"], className?: string) => {
    flushParagraph();
    flushItemText();
    lists.push({
      tag,
      itemOpen: false,
      itemTag: tag === "dl" ? "dd" : "li",
      buffer: [],
      openIndex: -1,
    });
    output.push(className ? `<${tag} class="${className}">` : `<${tag}>`);
  };
  const closeList = () => {
    const list = currentList();
    if (!list) return;
    closeItem();
    output.push(`</${list.tag}>`);
    lists.pop();
  };
  const closeAllLists = () => {
    while (lists.length > 0) closeList();
  };
  const pushText = (text: string) => {
    const list = currentList();
    if (list) {
      if (!list.itemOpen) {
        // Text before the first \item is rendered as a lead-in.
        openItem(list, `<${list.itemTag} class="latex-list-lead">`);
      }
      list.buffer.push(text);
    } else {
      paragraph.push(text);
    }
  };
  const pushBlock = (html: string) => {
    if (currentList()) {
      pushText("");
      flushItemText();
      output.push(html);
    } else {
      flushParagraph();
      output.push(html);
    }
  };

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    const blockToken = exactToken(line, context.tokens);
    if (blockToken?.block) {
      pushBlock(blockToken.html);
      continue;
    }

    if (!line) {
      if (currentList()) {
        const list = currentList()!;
        if (list.buffer.length > 0) list.buffer.push("\\newline");
      } else {
        flushParagraph();
      }
      continue;
    }

    if (/^\\par\b/.test(line)) {
      flushParagraph();
      continue;
    }

    if (/^\\maketitle\b/.test(line)) {
      flushParagraph();
      closeAllLists();
      output.push(renderTitle(metadata, context));
      continue;
    }

    if (/^\\tableofcontents\b/.test(line)) {
      flushParagraph();
      closeAllLists();
      output.push(TOC_PLACEHOLDER);
      continue;
    }

    if (/^\\appendix\b/.test(line)) {
      flushParagraph();
      closeAllLists();
      context.appendix = true;
      context.counters.chapter = 0;
      context.counters.section = 0;
      context.counters.subsection = 0;
      context.counters.subsubsection = 0;
      continue;
    }

    if (/^\\(?:newpage|clearpage|cleardoublepage)\b/.test(line)) {
      flushParagraph();
      closeAllLists();
      output.push('<hr class="latex-pagebreak">');
      continue;
    }

    const bibliography = line.match(/^\\(bibliography|printbibliography|listoffigures|listoftables|printindex)\b/);
    if (bibliography) {
      flushParagraph();
      closeAllLists();
      const kind = bibliography[1];
      const title =
        kind === "listoffigures"
          ? label(context, "listOfFigures")
          : kind === "listoftables"
            ? label(context, "listOfTables")
            : kind === "printindex"
              ? label(context, "index")
              : label(context, "bibliography");
      output.push(
        `<p class="latex-note"><strong>${title}</strong> ${label(context, "pdfOnly")}.</p>`,
      );
      continue;
    }

    const included = parseSingleArgumentCommand(line, "input") ?? parseSingleArgumentCommand(line, "include");
    if (included) {
      flushParagraph();
      closeAllLists();
      output.push(
        `<p class="latex-note"><strong>${label(context, "included")}:</strong> <code>${escapeHtml(included.value)}</code></p>`,
      );
      continue;
    }

    const heading = parseHeading(line);
    if (heading) {
      flushParagraph();
      closeAllLists();
      output.push(renderHeading(heading, context));
      if (heading.rest.trim()) pushText(heading.rest.trim());
      continue;
    }

    const frameTitle = parseSingleArgumentCommand(line, "frametitle");
    if (frameTitle) {
      flushParagraph();
      closeAllLists();
      output.push(`<h3 class="latex-frametitle">${renderInline(frameTitle.value, context)}</h3>`);
      continue;
    }

    const environment = line.match(/^\\(begin|end)\s*\{([^}]+)\}/);
    if (environment) {
      const opening = environment[1] === "begin";
      const name = environment[2].replace(/\*$/, "");
      const rest = line.slice(environment[0].length);

      if (name === "itemize" || name === "enumerate" || name === "description") {
        if (opening) {
          openList(name === "itemize" ? "ul" : name === "enumerate" ? "ol" : "dl");
        } else {
          closeList();
        }
        continue;
      }
      if (name === "thebibliography") {
        flushParagraph();
        closeAllLists();
        if (opening) {
          output.push(`<h2 class="latex-bibliography-title">${label(context, "references")}</h2>`);
          openList("ol", "latex-bibliography");
        } else {
          closeList();
        }
        continue;
      }
      if (opening && (name === "frame" || name === "block" || name === "alertblock" || name === "exampleblock")) {
        flushParagraph();
        closeAllLists();
        const titleArgument = readNextBracedArgument(rest, 0);
        const title = titleArgument ? renderInline(titleArgument.value, context) : "";
        if (name === "frame") {
          output.push(
            `<section class="latex-frame">${title ? `<h3 class="latex-frametitle">${title}</h3>` : ""}`,
          );
          wrappers.push("</section>");
        } else {
          output.push(
            `<div class="latex-block latex-${name}">${title ? `<strong class="latex-block-title">${title}</strong>` : ""}`,
          );
          wrappers.push("</div>");
        }
        continue;
      }
      if (!opening && (name === "frame" || name === "block" || name === "alertblock" || name === "exampleblock")) {
        flushParagraph();
        closeAllLists();
        const closing = wrappers.pop();
        if (closing) output.push(closing);
        continue;
      }
      if (THEOREM_ENVIRONMENTS.has(name) || name === "proof") {
        flushParagraph();
        closeAllLists();
        if (opening) {
          const optional = rest.match(/^\s*\[/) ? readOptionalArgument(rest, rest.indexOf("[")) : null;
          const title = optional ? ` (${renderInline(optional.value, context)})` : "";
          if (name === "proof") {
            output.push(
              `<div class="latex-proof"><em class="latex-theorem-title">${optional ? renderInline(optional.value, context) : label(context, "proof")}.</em> `,
            );
            wrappers.push('<span class="latex-qed">∎</span></div>');
          } else {
            output.push(
              `<div class="latex-theorem latex-theorem-${name}"><strong class="latex-theorem-title">${label(context, name)}${title}.</strong> `,
            );
            wrappers.push("</div>");
          }
          if (optional && optional.end < rest.length && rest.slice(optional.end).trim()) {
            pushText(rest.slice(optional.end).trim());
          } else if (!optional && rest.trim()) {
            pushText(rest.trim());
          }
        } else {
          const closing = wrappers.pop();
          if (closing) output.push(closing);
        }
        continue;
      }
      if (["quote", "quotation", "abstract", "center", "flushleft", "flushright", "verse"].includes(name)) {
        flushParagraph();
        closeAllLists();
        if (opening) {
          const tag = name === "abstract" ? "section" : name === "quote" || name === "quotation" || name === "verse" ? "blockquote" : "div";
          output.push(
            `<${tag} class="latex-${name}">${name === "abstract" ? `<h2 class="latex-abstract-title">${label(context, "abstract")}</h2>` : ""}`,
          );
          wrappers.push(`</${tag}>`);
        } else {
          const closing = wrappers.pop();
          if (closing) output.push(closing);
        }
        continue;
      }
      if (!IGNORED_ENVIRONMENTS.has(name)) {
        context.warnings.add(`Umgebung „${name}“ wird in der Live-Vorschau vereinfacht.`);
      }
      if (rest.trim() && !/^\s*[[{]/.test(rest)) pushText(rest.trim());
      continue;
    }

    const item = line.match(/^\\(item|bibitem)\b/);
    if (item && currentList()) {
      const list = currentList()!;
      closeItem();
      let remainder = line.slice(item[0].length);
      let labelText: string | null = null;
      const optional = remainder.match(/^\s*\[/) ? readOptionalArgument(remainder, remainder.indexOf("[")) : null;
      if (optional) {
        labelText = optional.value;
        remainder = remainder.slice(optional.end);
      }
      if (item[1] === "bibitem") {
        const key = readNextBracedArgument(remainder, 0);
        if (key) remainder = remainder.slice(key.end);
        openItem(
          list,
          labelText
            ? `<li class="latex-labeled"><span class="latex-item-label">[${renderInline(labelText, context)}]</span> `
            : "<li>",
        );
      } else if (list.tag === "dl") {
        openItem(list, `<dt>${labelText ? renderInline(labelText, context) : ""}</dt><dd>`);
      } else if (labelText) {
        openItem(
          list,
          `<li class="latex-labeled"><span class="latex-item-label">${renderInline(labelText, context)}</span> `,
        );
      } else {
        openItem(list, "<li>");
      }
      list.buffer = remainder.trim() ? [remainder.trim()] : [];
      continue;
    }

    const caption = parseSingleArgumentCommand(line, "caption");
    if (caption) {
      flushParagraph();
      output.push(`<p class="latex-caption">${renderInline(caption.value, context)}</p>`);
      continue;
    }

    pushText(line);
  }

  flushParagraph();
  closeAllLists();
  while (wrappers.length > 0) output.push(wrappers.pop()!);

  if (output.length === 0) {
    return '<div class="latex-empty">Leeres LaTeX-Dokument</div>';
  }
  return output.join("\n");
}

function renderTitle(metadata: DocumentMetadata, context: RenderContext): string {
  const title = metadata.title
    ? `<h1 class="latex-doctitle">${renderInline(metadata.title, context)}</h1>`
    : "";
  const author = metadata.author
    ? `<p class="latex-author">${renderInline(metadata.author, context)}</p>`
    : "";
  const dateSource = metadata.date === null ? "\\today" : metadata.date;
  const date = dateSource ? `<p class="latex-date">${renderInline(dateSource, context)}</p>` : "";
  return `<header class="latex-title">${title}${author}${date}</header>`;
}

interface ParsedHeading {
  level: number;
  command: string;
  numbered: boolean;
  value: string;
  rest: string;
}

function parseHeading(line: string): ParsedHeading | null {
  const levels: Record<string, number> = {
    part: 1,
    chapter: 1,
    section: 2,
    subsection: 3,
    subsubsection: 4,
    paragraph: 5,
    subparagraph: 6,
  };
  const match = line.match(/^\\([A-Za-z]+)(\*?)/);
  if (!match || !(match[1] in levels)) return null;
  const argument = readNextBracedArgument(line, match[0].length);
  if (!argument) return null;
  return {
    level: levels[match[1]],
    command: match[1],
    numbered: match[2] !== "*",
    value: argument.value,
    rest: line.slice(argument.end),
  };
}

function renderHeading(heading: ParsedHeading, context: RenderContext): string {
  const counters = context.counters;
  let number = "";
  if (heading.numbered) {
    if (heading.command === "part") {
      counters.part += 1;
      number = toRoman(counters.part);
    } else if (heading.command === "chapter") {
      counters.chapter += 1;
      counters.section = 0;
      counters.subsection = 0;
      counters.subsubsection = 0;
      number = formatCounter(counters.chapter, context.appendix);
    } else if (heading.command === "section") {
      counters.section += 1;
      counters.subsection = 0;
      counters.subsubsection = 0;
      number = context.hasChapters
        ? `${formatCounter(counters.chapter, context.appendix)}.${counters.section}`
        : formatCounter(counters.section, context.appendix);
    } else if (heading.command === "subsection") {
      counters.subsection += 1;
      counters.subsubsection = 0;
      number = context.hasChapters
        ? `${formatCounter(counters.chapter, context.appendix)}.${counters.section}.${counters.subsection}`
        : `${formatCounter(counters.section, context.appendix)}.${counters.subsection}`;
    } else if (heading.command === "subsubsection") {
      counters.subsubsection += 1;
      number = context.hasChapters
        ? `${formatCounter(counters.chapter, context.appendix)}.${counters.section}.${counters.subsection}.${counters.subsubsection}`
        : `${formatCounter(counters.section, context.appendix)}.${counters.subsection}.${counters.subsubsection}`;
    }
  }

  const html = renderInline(heading.value, context);
  const tag = `h${heading.level}`;
  const classes = ["latex-heading", `latex-${heading.command}`];
  if (heading.numbered) classes.push("latex-numbered");
  const prefix =
    heading.command === "part" && number
      ? `<span class="latex-number">${label(context, "part")} ${number}</span> `
      : number
        ? `<span class="latex-number">${number}</span> `
        : "";
  if (heading.level <= 4 && (heading.numbered || heading.command === "part")) {
    context.headings.push({ level: heading.level, number, html });
  }
  return `<${tag} class="${classes.join(" ")}">${prefix}${html}</${tag}>`;
}

function formatCounter(value: number, appendix: boolean): string {
  if (!appendix) return String(value);
  return value >= 1 && value <= 26 ? String.fromCharCode(64 + value) : String(value);
}

function toRoman(value: number): string {
  const numerals: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remaining = Math.max(0, Math.min(3999, value));
  let output = "";
  for (const [amount, numeral] of numerals) {
    while (remaining >= amount) {
      output += numeral;
      remaining -= amount;
    }
  }
  return output || String(value);
}

function renderTableOfContents(context: RenderContext): string {
  if (context.headings.length === 0) {
    return `<nav class="latex-toc"><h2 class="latex-toc-title">${label(context, "contents")}</h2></nav>`;
  }
  const entries = context.headings
    .map(
      (entry) =>
        `<li class="latex-toc-level-${entry.level}">${entry.number ? `<span class="latex-number">${entry.number}</span> ` : ""}${entry.html}</li>`,
    )
    .join("");
  return `<nav class="latex-toc"><h2 class="latex-toc-title">${label(context, "contents")}</h2><ul>${entries}</ul></nav>`;
}

function renderFootnotes(context: RenderContext): string {
  const items = context.footnotes
    .map((html, index) => `<li id="latex-footnote-${index + 1}">${html}</li>`)
    .join("");
  return `\n<section class="latex-footnotes" aria-label="${label(context, "footnotes")}"><ol>${items}</ol></section>`;
}

function parseSingleArgumentCommand(line: string, command: string): CommandArgument | null {
  const marker = `\\${command}`;
  if (!line.startsWith(marker) || /[A-Za-z@]/.test(line[marker.length] ?? "")) return null;
  return readNextBracedArgument(line, marker.length);
}

function renderInline(source: string, context: RenderContext): string {
  let output = "";
  let index = 0;

  while (index < source.length) {
    const protectedToken = tokenAt(source, index, context.tokens);
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
        if (source[index] === "*") index += 1;
        const spacing = source[index] === "[" ? readOptionalArgument(source, index) : null;
        if (spacing) index = spacing.end;
        continue;
      }
      if (next === "" || /\s/.test(next)) {
        output += " ";
        index += 2;
        continue;
      }

      const commandMatch = source.slice(index + 1).match(/^([A-Za-z@]+\*?|[^A-Za-z\s])/);
      if (!commandMatch) {
        output += "\\";
        index += 1;
        continue;
      }
      const command = commandMatch[1].replace(/\*$/, "");
      let cursor = index + 1 + commandMatch[1].length;

      if (command === "verb") {
        const delimiter = source[cursor];
        const end = delimiter ? source.indexOf(delimiter, cursor + 1) : -1;
        if (end > cursor) {
          output += `<code>${escapeHtml(source.slice(cursor + 1, end))}</code>`;
          index = end + 1;
          continue;
        }
      }

      if (command in ACCENT_MARKS) {
        const braced = readNextBracedArgument(source, cursor);
        if (braced) {
          output += applyAccent(command, braced.value);
          index = braced.end;
          continue;
        }
        const target = source.slice(cursor).match(/^\s*(\\[ij]\b|[A-Za-z])/);
        if (target) {
          const base = target[1] === "\\i" ? "ı" : target[1] === "\\j" ? "ȷ" : target[1];
          output += applyAccent(command, base);
          index = cursor + target[0].length;
          continue;
        }
      }

      if (["LaTeX", "TeX", "LaTeXe", "BibTeX", "XeLaTeX", "LuaLaTeX"].includes(command)) {
        const emptyGroup = readNextBracedArgument(source, cursor);
        output += SPECIAL_CHARACTERS[command];
        index = emptyGroup?.value === "" ? emptyGroup.end : cursor;
        continue;
      }

      if (command === "href" || command === "hyperref") {
        const destination = readNextBracedArgument(source, cursor);
        const labelArgument = destination ? readNextBracedArgument(source, destination.end) : null;
        if (destination && labelArgument) {
          output += `<span class="latex-link" title="${escapeAttribute(destination.value)}">${renderInline(labelArgument.value, context)}</span>`;
          index = labelArgument.end;
          continue;
        }
      }

      if (command === "footnote") {
        const note = readNextBracedArgument(source, cursor);
        if (note) {
          const number = context.footnotes.push(renderInline(note.value, context));
          output += `<sup class="latex-footnote" title="${label(context, "footnoteTitle")} ${number}">${number}</sup>`;
          index = note.end;
          continue;
        }
      }

      if (command === "enquote") {
        const quoted = readNextBracedArgument(source, cursor);
        if (quoted) {
          const single = commandMatch[1].endsWith("*");
          output += `${label(context, single ? "singleQuoteOpen" : "quoteOpen")}${renderInline(quoted.value, context)}${label(context, single ? "singleQuoteClose" : "quoteClose")}`;
          index = quoted.end;
          continue;
        }
      }

      if (["SI", "qty", "si", "unit", "num", "ang"].includes(command)) {
        const first = readNextBracedArgument(source, cursor);
        if (first) {
          if (command === "num") {
            output += escapeHtml(first.value.replace(/\s+/g, ""));
            index = first.end;
            continue;
          }
          if (command === "ang") {
            output += `${escapeHtml(first.value)}°`;
            index = first.end;
            continue;
          }
          if (command === "si" || command === "unit") {
            output += renderUnit(first.value);
            index = first.end;
            continue;
          }
          const unit = readNextBracedArgument(source, first.end);
          if (unit) {
            output += `${escapeHtml(first.value.replace(/\s+/g, ""))}\u2009${renderUnit(unit.value)}`;
            index = unit.end;
            continue;
          }
        }
      }

      if (command === "textcolor" || command === "colorbox" || command === "fcolorbox") {
        let colorArgument = readNextBracedArgument(source, cursor);
        if (command === "fcolorbox" && colorArgument) {
          colorArgument = readNextBracedArgument(source, colorArgument.end);
        }
        const content = colorArgument ? readNextBracedArgument(source, colorArgument.end) : null;
        if (colorArgument && content) {
          const color = safeColor(colorArgument.value);
          const rendered = renderInline(content.value, context);
          output += color
            ? `<span class="latex-${command}" style="${command === "textcolor" ? "color" : "background-color"}: ${color}">${rendered}</span>`
            : rendered;
          index = content.end;
          continue;
        }
      }

      if (["parbox", "makebox", "framebox", "raisebox", "scalebox", "rotatebox", "resizebox", "texorpdfstring", "adjustbox", "only", "uncover", "visible", "onslide", "translate"].includes(command)) {
        const argumentCount = command === "resizebox" ? 3 : command === "texorpdfstring" ? 2 : 2;
        let last: CommandArgument | null = null;
        let position = cursor;
        let collected = 0;
        while (collected < argumentCount) {
          const argument = readNextBracedArgument(source, position);
          if (!argument) break;
          last = argument;
          position = argument.end;
          collected += 1;
        }
        if (last) {
          const keep = command === "texorpdfstring" && collected === 2 ? readNextBracedArgument(source, cursor) : last;
          output += renderInline((keep ?? last).value, context);
          index = position;
          continue;
        }
      }

      // Argument-free commands are often terminated by an empty group: \ss{} or \dots{}.
      const emptyGroup = source.slice(cursor).match(/^\s*\{\s*\}/);
      const argument = emptyGroup && (command in SPECIAL_CHARACTERS || SILENT_COMMANDS.has(command))
        ? null
        : readNextBracedArgument(source, cursor);
      if (emptyGroup && !argument) cursor += emptyGroup[0].length;
      if (argument) {
        if (SILENT_ARGUMENT_COMMANDS.has(command)) {
          index = argument.end;
          if (command === "setlength" || command === "addtolength" || command === "settowidth" || command === "definecolor" || command === "let" || command === "renewcommand" || command === "newcommand" || command === "providecommand" || command === "DeclareMathOperator" || command === "newtheorem" || command === "sbox" || command === "savebox") {
            let extra = readNextBracedArgument(source, index);
            while (extra) {
              index = extra.end;
              extra = readNextBracedArgument(source, index);
            }
          }
          continue;
        }
        const content = renderInline(argument.value, context);
        if (TEXT_WRAPPERS[command]) {
          output += `${TEXT_WRAPPERS[command][0]}${content}${TEXT_WRAPPERS[command][1]}`;
        } else if (DECLARATION_WRAPPERS[command]) {
          output += `${DECLARATION_WRAPPERS[command][0]}${content}${DECLARATION_WRAPPERS[command][1]}`;
        } else if (["ref", "pageref", "eqref", "autoref", "cref", "Cref", "nameref", "vref"].includes(command)) {
          output += `<span class="latex-reference">[${content}]</span>`;
        } else if (/^[Cc]ite/.test(command) || ["parencite", "textcite", "footcite", "autocite", "citep", "citet", "citeauthor", "citeyear", "citealp", "citealt"].includes(command)) {
          output += `<span class="latex-reference">[${content}]</span>`;
        } else if (command === "url") {
          output += `<span class="latex-link">${content}</span>`;
        } else if (command === "includegraphics") {
          output += `<span class="latex-image-placeholder">${label(context, "image")}: ${content}</span>`;
        } else if (command === "MakeUppercase" || command === "uppercase") {
          output += `<span class="latex-uppercase">${content}</span>`;
        } else if (command === "gls" || command === "Gls" || command === "glspl" || command === "acrshort" || command === "acrlong" || command === "acrfull" || command === "ac") {
          output += `<span class="latex-reference">${content}</span>`;
        } else if (command === "todo") {
          output += `<mark class="latex-todo">${content}</mark>`;
        } else {
          output += content;
          if (!TRANSPARENT_COMMANDS.has(command)) {
            context.warnings.add(`Befehl „\\${command}“ wird in der Live-Vorschau vereinfacht.`);
          }
        }
        index = argument.end;
        continue;
      }

      if (command === "today") {
        output += new Intl.DateTimeFormat(context.language === "en" ? "en-US" : "de-DE", {
          dateStyle: "long",
        }).format(new Date());
      } else if (command in SPECIAL_CHARACTERS) {
        output += SPECIAL_CHARACTERS[command];
      } else if (!SILENT_COMMANDS.has(command) && !SILENT_ARGUMENT_COMMANDS.has(command) && !DECLARATION_WRAPPERS[command]) {
        context.warnings.add(`Befehl „\\${command}“ wird in der Live-Vorschau nicht dargestellt.`);
      }
      index = cursor;
      continue;
    }

    if (char === "{") {
      const end = findClosing(source, index, "{", "}");
      if (end < 0) {
        index += 1;
        continue;
      }
      output += renderGroup(source.slice(index + 1, end), context);
      index = end + 1;
      continue;
    }
    if (char === "}") {
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
      output += "“";
      index += 2;
      continue;
    }
    if (source.startsWith("''", index)) {
      output += "”";
      index += 2;
      continue;
    }
    if (char === "`") {
      output += "‘";
      index += 1;
      continue;
    }
    if (char === "'") {
      output += "’";
      index += 1;
      continue;
    }
    if (source.startsWith("!`", index)) {
      output += "¡";
      index += 2;
      continue;
    }
    if (source.startsWith("?`", index)) {
      output += "¿";
      index += 2;
      continue;
    }

    output += escapeHtml(char);
    index += 1;
  }

  return output;
}

function renderGroup(inner: string, context: RenderContext): string {
  const declaration = inner.match(
    /^\s*\\(bfseries|bf|itshape|it|em|slshape|sl|ttfamily|tt|scshape|sc|sffamily|sf|small|footnotesize|scriptsize|tiny|large|Large|LARGE|huge|Huge|normalsize|rmfamily|rm|mdseries|upshape|normalfont|color|underline)\b/,
  );
  if (!declaration) return renderInline(inner, context);

  let rest = inner.slice(declaration[0].length);
  const name = declaration[1];
  if (name === "color") {
    const colorArgument = readNextBracedArgument(rest, 0);
    const color = colorArgument ? safeColor(colorArgument.value) : null;
    const content = renderInline(colorArgument ? rest.slice(colorArgument.end) : rest, context);
    return color ? `<span style="color: ${color}">${content}</span>` : content;
  }
  if (name === "underline") return renderInline(inner, context);
  const wrapper = DECLARATION_WRAPPERS[name];
  rest = rest.replace(/^\s+/, "");
  const content = renderInline(rest, context);
  return wrapper ? `${wrapper[0]}${content}${wrapper[1]}` : content;
}

function renderUnit(value: string): string {
  const parts: string[] = [];
  let index = 0;
  let perPending = false;
  while (index < value.length) {
    const char = value[index];
    if (char === "\\") {
      const match = value.slice(index + 1).match(/^[A-Za-z]+/);
      if (!match) {
        index += 1;
        continue;
      }
      const name = match[0];
      index += 1 + name.length;
      if (name === "per") {
        perPending = true;
        continue;
      }
      const unit = SI_UNITS[name] ?? name;
      if (perPending) {
        parts.push(`/${unit}`);
        perPending = false;
      } else if (unit === "²" || unit === "³") {
        parts[parts.length - 1] = `${parts[parts.length - 1] ?? ""}${unit}`;
      } else {
        parts.push(unit);
      }
      continue;
    }
    if (char === "^") {
      const braced = readNextBracedArgument(value, index + 1);
      const exponent = braced ? braced.value : value[index + 1] ?? "";
      parts[parts.length - 1] = `${parts[parts.length - 1] ?? ""}${toSuperscript(exponent)}`;
      index = braced ? braced.end : index + 2;
      continue;
    }
    if (char === "." || char === "~") {
      index += 1;
      continue;
    }
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    parts.push(escapeHtml(char));
    index += 1;
  }
  return parts.join("");
}

function toSuperscript(value: string): string {
  const digits: Record<string, string> = {
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
    "-": "⁻",
    "+": "⁺",
  };
  return [...value].map((character) => digits[character] ?? escapeHtml(character)).join("");
}

function safeColor(value: string): string | null {
  const trimmed = value.trim();
  if (/^[A-Za-z]{2,32}$/.test(trimmed)) return trimmed.toLowerCase();
  const hex = trimmed.match(/^\[HTML\]\s*\{?\s*([0-9A-Fa-f]{6})\s*\}?$/);
  if (hex) return `#${hex[1]}`;
  const bang = trimmed.match(/^([A-Za-z]{2,32})!(\d{1,3})(?:!([A-Za-z]{2,32}))?/);
  if (bang) return bang[1].toLowerCase();
  return null;
}

function readOptionalArgument(source: string, start: number): CommandArgument | null {
  if (source[start] !== "[") return null;
  const end = findClosing(source, start, "[", "]");
  if (end < 0) return null;
  return { value: source.slice(start + 1, end), end: end + 1 };
}

function readNextBracedArgument(source: string, start: number): CommandArgument | null {
  let cursor = start;
  while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  if (source[cursor] === "*") {
    cursor += 1;
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  }
  while (source[cursor] === "[") {
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
  const base = value.replace(/^\\i\b/, "ı").replace(/^\\j\b/, "ȷ");
  return escapeHtml(`${base}${ACCENT_MARKS[command] ?? ""}`.normalize("NFC"));
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
