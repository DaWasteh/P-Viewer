import type { FileTypeInfo } from "./types";

// Special file names without a meaningful extension. The display casing is
// preserved for the file type selector; matching is case-insensitive.
const SPECIAL_FILES: Array<[string, FileTypeInfo]> = [
  ["Dockerfile", { kind: "code", language: "dockerfile", label: "Dockerfile" }],
  ["Containerfile", { kind: "code", language: "dockerfile", label: "Containerfile" }],
  ["Makefile", { kind: "code", language: "makefile", label: "Makefile" }],
  ["GNUmakefile", { kind: "code", language: "makefile", label: "GNU Makefile" }],
  ["CMakeLists.txt", { kind: "code", language: "cmake", label: "CMake" }],
  ["Jenkinsfile", { kind: "code", language: "groovy", label: "Jenkinsfile" }],
  ["Rakefile", { kind: "code", language: "ruby", label: "Rakefile" }],
  ["Gemfile", { kind: "code", language: "ruby", label: "Gemfile" }],
  ["Vagrantfile", { kind: "code", language: "ruby", label: "Vagrantfile" }],
  ["Brewfile", { kind: "code", language: "ruby", label: "Brewfile" }],
  ["Procfile", { kind: "code", language: "properties", label: "Procfile" }],
  ["Pipfile", { kind: "code", language: "toml", label: "Pipfile" }],
  ["Cargo.lock", { kind: "code", language: "toml", label: "Cargo Lock" }],
  ["PKGBUILD", { kind: "code", language: "shell", label: "PKGBUILD" }],
  ["LICENSE", { kind: "text", language: "plaintext", label: "Lizenz" }],
  ["README", { kind: "text", language: "plaintext", label: "README" }],
  ["CHANGELOG", { kind: "text", language: "plaintext", label: "Changelog" }],
  [".env", { kind: "code", language: "properties", label: "Environment" }],
  [".gitignore", { kind: "code", language: "ignore", label: "Git Ignore" }],
  [".gitattributes", { kind: "code", language: "ignore", label: "Git Attributes" }],
  [".gitmodules", { kind: "code", language: "ini", label: "Git Modules" }],
  [".gitconfig", { kind: "code", language: "ini", label: "Git Config" }],
  [".editorconfig", { kind: "code", language: "ini", label: "EditorConfig" }],
  [".npmrc", { kind: "code", language: "ini", label: "npm Config" }],
  [".yarnrc", { kind: "code", language: "ini", label: "Yarn Config" }],
  [".htaccess", { kind: "code", language: "ini", label: "Apache htaccess" }],
  [".dockerignore", { kind: "code", language: "ignore", label: "Docker Ignore" }],
  [".npmignore", { kind: "code", language: "ignore", label: "npm Ignore" }],
  [".prettierignore", { kind: "code", language: "ignore", label: "Prettier Ignore" }],
  [".eslintignore", { kind: "code", language: "ignore", label: "ESLint Ignore" }],
  [".prettierrc", { kind: "json", language: "json", label: "Prettier Config" }],
  [".babelrc", { kind: "json", language: "json", label: "Babel Config" }],
  [".bashrc", { kind: "code", language: "shell", label: "Bash RC" }],
  [".bash_profile", { kind: "code", language: "shell", label: "Bash Profile" }],
  [".zshrc", { kind: "code", language: "shell", label: "Zsh RC" }],
  [".profile", { kind: "code", language: "shell", label: "Shell Profile" }],
];

const TYPES: Record<string, FileTypeInfo> = {
  md: { kind: "markdown", language: "markdown", label: "Markdown" },
  markdown: { kind: "markdown", language: "markdown", label: "Markdown" },
  mdown: { kind: "markdown", language: "markdown", label: "Markdown" },
  mkd: { kind: "markdown", language: "markdown", label: "Markdown" },
  mkdn: { kind: "markdown", language: "markdown", label: "Markdown" },
  mdwn: { kind: "markdown", language: "markdown", label: "Markdown" },
  mdx: { kind: "markdown", language: "mdx", label: "MDX" },
  rmd: { kind: "markdown", language: "markdown", label: "R Markdown" },
  qmd: { kind: "markdown", language: "markdown", label: "Quarto" },

  json: { kind: "json", language: "json", label: "JSON" },
  jsonc: { kind: "json", language: "json", label: "JSON mit Kommentaren" },
  json5: { kind: "json", language: "json5", label: "JSON5" },
  jsonld: { kind: "json", language: "json", label: "JSON-LD" },
  geojson: { kind: "json", language: "json", label: "GeoJSON" },
  webmanifest: { kind: "json", language: "json", label: "Web App Manifest" },
  ipynb: { kind: "notebook", language: "json", label: "Jupyter Notebook" },

  tex: { kind: "latex", language: "stex", label: "LaTeX" },
  latex: { kind: "latex", language: "stex", label: "LaTeX" },
  ltx: { kind: "latex", language: "stex", label: "LaTeX" },
  sty: { kind: "code", language: "stex", label: "LaTeX Style" },
  cls: { kind: "code", language: "stex", label: "LaTeX Class" },
  bib: { kind: "code", language: "bibtex", label: "BibTeX" },

  js: { kind: "code", language: "javascript", label: "JavaScript" },
  mjs: { kind: "code", language: "javascript", label: "JavaScript" },
  cjs: { kind: "code", language: "javascript", label: "JavaScript" },
  jsx: { kind: "code", language: "jsx", label: "JavaScript JSX" },
  ts: { kind: "code", language: "typescript", label: "TypeScript" },
  mts: { kind: "code", language: "typescript", label: "TypeScript" },
  cts: { kind: "code", language: "typescript", label: "TypeScript" },
  tsx: { kind: "code", language: "tsx", label: "TypeScript TSX" },
  coffee: { kind: "code", language: "coffeescript", label: "CoffeeScript" },
  py: { kind: "code", language: "python", label: "Python" },
  pyw: { kind: "code", language: "python", label: "Python" },
  pyi: { kind: "code", language: "python", label: "Python Stub" },
  rs: { kind: "code", language: "rust", label: "Rust" },
  go: { kind: "code", language: "go", label: "Go" },
  java: { kind: "code", language: "java", label: "Java" },
  kt: { kind: "code", language: "kotlin", label: "Kotlin" },
  kts: { kind: "code", language: "kotlin", label: "Kotlin Script" },
  groovy: { kind: "code", language: "groovy", label: "Groovy" },
  gradle: { kind: "code", language: "groovy", label: "Gradle" },
  scala: { kind: "code", language: "scala", label: "Scala" },
  cs: { kind: "code", language: "csharp", label: "C#" },
  fs: { kind: "code", language: "fsharp", label: "F#" },
  fsx: { kind: "code", language: "fsharp", label: "F# Script" },
  vb: { kind: "code", language: "vbnet", label: "VB.NET" },
  vbs: { kind: "code", language: "vbscript", label: "VBScript" },
  c: { kind: "code", language: "c", label: "C" },
  h: { kind: "code", language: "c", label: "C Header" },
  cc: { kind: "code", language: "cpp", label: "C++" },
  cpp: { kind: "code", language: "cpp", label: "C++" },
  cxx: { kind: "code", language: "cpp", label: "C++" },
  hpp: { kind: "code", language: "cpp", label: "C++ Header" },
  hh: { kind: "code", language: "cpp", label: "C++ Header" },
  hxx: { kind: "code", language: "cpp", label: "C++ Header" },
  ino: { kind: "code", language: "cpp", label: "Arduino" },
  mm: { kind: "code", language: "objectivecpp", label: "Objective-C++" },
  swift: { kind: "code", language: "swift", label: "Swift" },
  rb: { kind: "code", language: "ruby", label: "Ruby" },
  php: { kind: "code", language: "php", label: "PHP" },
  pl: { kind: "code", language: "perl", label: "Perl" },
  pm: { kind: "code", language: "perl", label: "Perl Module" },
  lua: { kind: "code", language: "lua", label: "Lua" },
  r: { kind: "code", language: "r", label: "R" },
  jl: { kind: "code", language: "julia", label: "Julia" },
  dart: { kind: "code", language: "dart", label: "Dart" },
  ex: { kind: "code", language: "elixir", label: "Elixir" },
  exs: { kind: "code", language: "elixir", label: "Elixir Script" },
  erl: { kind: "code", language: "erlang", label: "Erlang" },
  hrl: { kind: "code", language: "erlang", label: "Erlang Header" },
  hs: { kind: "code", language: "haskell", label: "Haskell" },
  elm: { kind: "code", language: "elm", label: "Elm" },
  ml: { kind: "code", language: "ocaml", label: "OCaml" },
  mli: { kind: "code", language: "ocaml", label: "OCaml Interface" },
  clj: { kind: "code", language: "clojure", label: "Clojure" },
  cljs: { kind: "code", language: "clojure", label: "ClojureScript" },
  cljc: { kind: "code", language: "clojure", label: "Clojure Common" },
  edn: { kind: "code", language: "clojure", label: "EDN" },
  lisp: { kind: "code", language: "lisp", label: "Lisp" },
  el: { kind: "code", language: "lisp", label: "Emacs Lisp" },
  scm: { kind: "code", language: "scheme", label: "Scheme" },
  cr: { kind: "code", language: "crystal", label: "Crystal" },
  d: { kind: "code", language: "d", label: "D" },
  pas: { kind: "code", language: "pascal", label: "Pascal" },
  f90: { kind: "code", language: "fortran", label: "Fortran" },
  f95: { kind: "code", language: "fortran", label: "Fortran" },
  f: { kind: "code", language: "fortran", label: "Fortran" },
  tcl: { kind: "code", language: "tcl", label: "Tcl" },
  asm: { kind: "code", language: "assembler", label: "Assembler" },
  s: { kind: "code", language: "assembler", label: "Assembler" },
  vhd: { kind: "code", language: "vhdl", label: "VHDL" },
  vhdl: { kind: "code", language: "vhdl", label: "VHDL" },
  wat: { kind: "code", language: "wasm", label: "WebAssembly Text" },
  wast: { kind: "code", language: "wasm", label: "WebAssembly Text" },
  proto: { kind: "code", language: "protobuf", label: "Protocol Buffers" },
  feature: { kind: "code", language: "gherkin", label: "Gherkin" },

  sh: { kind: "code", language: "shell", label: "Shell" },
  bash: { kind: "code", language: "shell", label: "Bash" },
  zsh: { kind: "code", language: "shell", label: "Zsh" },
  fish: { kind: "code", language: "shell", label: "Fish" },
  ksh: { kind: "code", language: "shell", label: "Korn Shell" },
  bat: { kind: "code", language: "batch", label: "Windows Batch" },
  cmd: { kind: "code", language: "batch", label: "Windows Command" },
  ps1: { kind: "code", language: "powershell", label: "PowerShell" },
  psm1: { kind: "code", language: "powershell", label: "PowerShell Module" },
  psd1: { kind: "code", language: "powershell", label: "PowerShell Data" },
  dockerfile: { kind: "code", language: "dockerfile", label: "Dockerfile" },
  mk: { kind: "code", language: "makefile", label: "Makefile" },
  cmake: { kind: "code", language: "cmake", label: "CMake" },
  nsi: { kind: "code", language: "nsis", label: "NSIS" },
  nsh: { kind: "code", language: "nsis", label: "NSIS Header" },
  diff: { kind: "code", language: "diff", label: "Diff" },
  patch: { kind: "code", language: "diff", label: "Patch" },
  http: { kind: "code", language: "http", label: "HTTP-Anfrage" },
  rest: { kind: "code", language: "http", label: "REST-Anfrage" },

  html: { kind: "html", language: "html", label: "HTML" },
  htm: { kind: "html", language: "html", label: "HTML" },
  xhtml: { kind: "html", language: "html", label: "XHTML" },
  astro: { kind: "code", language: "astro", label: "Astro" },
  vue: { kind: "code", language: "vue", label: "Vue" },
  svelte: { kind: "code", language: "svelte", label: "Svelte" },
  hbs: { kind: "code", language: "handlebars", label: "Handlebars" },
  handlebars: { kind: "code", language: "handlebars", label: "Handlebars" },
  pug: { kind: "code", language: "pug", label: "Pug" },
  j2: { kind: "code", language: "jinja", label: "Jinja" },
  jinja: { kind: "code", language: "jinja", label: "Jinja" },
  jinja2: { kind: "code", language: "jinja", label: "Jinja" },
  liquid: { kind: "code", language: "liquid", label: "Liquid" },
  css: { kind: "code", language: "css", label: "CSS" },
  scss: { kind: "code", language: "sass", label: "SCSS" },
  sass: { kind: "code", language: "sass", label: "Sass" },
  less: { kind: "code", language: "less", label: "Less" },
  styl: { kind: "code", language: "stylus", label: "Stylus" },
  xml: { kind: "code", language: "xml", label: "XML" },
  xsl: { kind: "code", language: "xml", label: "XSLT" },
  xsd: { kind: "code", language: "xml", label: "XML Schema" },
  dtd: { kind: "code", language: "dtd", label: "DTD" },
  plist: { kind: "code", language: "xml", label: "Property List" },
  xaml: { kind: "code", language: "xml", label: "XAML" },
  rss: { kind: "code", language: "xml", label: "RSS-Feed" },
  atom: { kind: "code", language: "xml", label: "Atom-Feed" },
  svg: { kind: "svg", language: "xml", label: "SVG" },

  yaml: { kind: "code", language: "yaml", label: "YAML" },
  yml: { kind: "code", language: "yaml", label: "YAML" },
  toml: { kind: "code", language: "toml", label: "TOML" },
  ini: { kind: "code", language: "ini", label: "INI" },
  cfg: { kind: "code", language: "ini", label: "Konfiguration" },
  conf: { kind: "code", language: "ini", label: "Konfiguration" },
  desktop: { kind: "code", language: "ini", label: "Desktop-Eintrag" },
  reg: { kind: "code", language: "ini", label: "Windows-Registrierung" },
  env: { kind: "code", language: "properties", label: "Environment" },
  properties: { kind: "code", language: "properties", label: "Properties" },
  sql: { kind: "code", language: "sql", label: "SQL" },
  graphql: { kind: "code", language: "graphql", label: "GraphQL" },
  gql: { kind: "code", language: "graphql", label: "GraphQL" },

  txt: { kind: "text", language: "plaintext", label: "Text" },
  text: { kind: "text", language: "plaintext", label: "Text" },
  log: { kind: "text", language: "plaintext", label: "Log" },
  rst: { kind: "text", language: "plaintext", label: "reStructuredText" },
  adoc: { kind: "text", language: "plaintext", label: "AsciiDoc" },
  asciidoc: { kind: "text", language: "plaintext", label: "AsciiDoc" },
  org: { kind: "text", language: "plaintext", label: "Org" },
  textile: { kind: "code", language: "textile", label: "Textile" },
  srt: { kind: "text", language: "plaintext", label: "SubRip-Untertitel" },
  vtt: { kind: "text", language: "plaintext", label: "WebVTT-Untertitel" },
  csv: { kind: "csv", language: "csv", label: "CSV" },
  tsv: { kind: "csv", language: "csv", label: "TSV" },
};

const SPECIAL_NAMES: Record<string, FileTypeInfo> = Object.fromEntries(
  SPECIAL_FILES.map(([name, fileType]) => [name.toLowerCase(), fileType]),
);

const SPECIAL_NAME_CASE: Record<string, string> = Object.fromEntries(
  SPECIAL_FILES.map(([name]) => [name.toLowerCase(), name]),
);

export type FileTypeChoiceGroup =
  | "Text"
  | "Dokumente"
  | "Code und Konfiguration"
  | "Spezielle Dateinamen";

export interface FileTypeChoice {
  id: string;
  group: FileTypeChoiceGroup;
  label: string;
  fileType: FileTypeInfo;
  extension?: string;
  fileName?: string;
}

function groupFor(fileType: FileTypeInfo): FileTypeChoiceGroup {
  if (fileType.kind === "text") return "Text";
  if (fileType.kind === "code") return "Code und Konfiguration";
  return "Dokumente";
}

export const SUPPORTED_FILE_EXTENSIONS = Object.freeze(Object.keys(TYPES));

export const SUPPORTED_FILE_TYPE_CHOICES: readonly FileTypeChoice[] = Object.freeze(
  [
    ...Object.entries(TYPES).map(([extension, fileType]) => ({
      id: `extension:${extension}`,
      group: groupFor(fileType),
      label: `${fileType.label} (.${extension})`,
      fileType,
      extension,
    })),
    ...Object.entries(SPECIAL_NAMES).map(([name, fileType]) => ({
      id: `name:${name}`,
      group: "Spezielle Dateinamen" as const,
      label: `${fileType.label} (${SPECIAL_NAME_CASE[name]})`,
      fileType,
      fileName: SPECIAL_NAME_CASE[name],
    })),
  ].sort((left, right) =>
    left.label.localeCompare(right.label, "de", { sensitivity: "base" }),
  ),
);

const FALLBACK: FileTypeInfo = {
  kind: "text",
  language: "plaintext",
  label: "Text",
};

export function fileNameFromPath(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

export function extensionOf(fileName: string): string {
  const baseName = fileNameFromPath(fileName);
  const dot = baseName.lastIndexOf(".");
  return dot > 0 ? baseName.slice(dot + 1).toLowerCase() : "";
}

export function normalizeCustomExtension(value: string): string | null {
  const normalized = value.trim().replace(/^\.+/, "").toLowerCase();
  return /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,31}$/u.test(normalized)
    ? normalized
    : null;
}

export function fileNameWithExtension(fileName: string, extension: string): string {
  const normalized = normalizeCustomExtension(extension);
  if (!normalized) throw new Error("Ungültige Dateiendung.");

  const baseName = fileNameFromPath(fileName);
  const dot = baseName.lastIndexOf(".");
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
  return `${stem || "Unbenannt"}.${normalized}`;
}

function specialNameKey(baseName: string): string | null {
  if (SPECIAL_NAMES[baseName]) return baseName;
  // `.env.local`, `.env.production` and similar variants behave like `.env`.
  if (baseName.startsWith(".env.")) return ".env";
  return null;
}

export function fileTypeChoiceIdFor(fileName: string): string {
  const baseName = fileNameFromPath(fileName).toLowerCase();
  const special = specialNameKey(baseName);
  if (special) return `name:${special}`;

  const extension = extensionOf(baseName);
  return TYPES[extension] ? `extension:${extension}` : `custom:${extension}`;
}

export function fileNameForFileTypeChoice(
  fileName: string,
  choice: FileTypeChoice,
): string {
  return choice.fileName ?? fileNameWithExtension(fileName, choice.extension ?? "");
}

export function detectFileType(fileName: string): FileTypeInfo {
  const baseName = fileNameFromPath(fileName).toLowerCase();
  const special = specialNameKey(baseName);
  if (special) return SPECIAL_NAMES[special];
  return TYPES[extensionOf(baseName)] ?? FALLBACK;
}

export function countLines(content: string): number {
  return content.length === 0 ? 1 : content.split(/\r\n|\r|\n/).length;
}

export function countWords(content: string): number {
  const matches = content.trim().match(/[\p{L}\p{N}_'-]+/gu);
  return matches?.length ?? 0;
}
