import type { FileTypeInfo } from "./types";

const TYPES: Record<string, FileTypeInfo> = {
  md: { kind: "markdown", language: "markdown", label: "Markdown" },
  markdown: { kind: "markdown", language: "markdown", label: "Markdown" },
  mdown: { kind: "markdown", language: "markdown", label: "Markdown" },
  mkd: { kind: "markdown", language: "markdown", label: "Markdown" },
  mdx: { kind: "markdown", language: "mdx", label: "MDX" },

  json: { kind: "json", language: "json", label: "JSON" },
  jsonc: { kind: "json", language: "json", label: "JSON mit Kommentaren" },
  json5: { kind: "json", language: "json5", label: "JSON5" },
  ipynb: { kind: "json", language: "json", label: "Jupyter Notebook" },

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
  py: { kind: "code", language: "python", label: "Python" },
  pyw: { kind: "code", language: "python", label: "Python" },
  rs: { kind: "code", language: "rust", label: "Rust" },
  go: { kind: "code", language: "go", label: "Go" },
  java: { kind: "code", language: "java", label: "Java" },
  kt: { kind: "code", language: "kotlin", label: "Kotlin" },
  kts: { kind: "code", language: "kotlin", label: "Kotlin Script" },
  cs: { kind: "code", language: "csharp", label: "C#" },
  c: { kind: "code", language: "c", label: "C" },
  h: { kind: "code", language: "c", label: "C Header" },
  cc: { kind: "code", language: "cpp", label: "C++" },
  cpp: { kind: "code", language: "cpp", label: "C++" },
  cxx: { kind: "code", language: "cpp", label: "C++" },
  hpp: { kind: "code", language: "cpp", label: "C++ Header" },
  swift: { kind: "code", language: "swift", label: "Swift" },
  rb: { kind: "code", language: "ruby", label: "Ruby" },
  php: { kind: "code", language: "php", label: "PHP" },
  lua: { kind: "code", language: "lua", label: "Lua" },
  r: { kind: "code", language: "r", label: "R" },
  scala: { kind: "code", language: "scala", label: "Scala" },
  dart: { kind: "code", language: "dart", label: "Dart" },
  ex: { kind: "code", language: "elixir", label: "Elixir" },
  exs: { kind: "code", language: "elixir", label: "Elixir Script" },

  sh: { kind: "code", language: "shell", label: "Shell" },
  bash: { kind: "code", language: "shell", label: "Bash" },
  zsh: { kind: "code", language: "shell", label: "Zsh" },
  fish: { kind: "code", language: "shell", label: "Fish" },
  bat: { kind: "code", language: "batch", label: "Windows Batch" },
  cmd: { kind: "code", language: "batch", label: "Windows Command" },
  ps1: { kind: "code", language: "powershell", label: "PowerShell" },

  html: { kind: "html", language: "html", label: "HTML" },
  htm: { kind: "html", language: "html", label: "HTML" },
  xhtml: { kind: "html", language: "html", label: "XHTML" },
  astro: { kind: "code", language: "astro", label: "Astro" },
  css: { kind: "code", language: "css", label: "CSS" },
  scss: { kind: "code", language: "sass", label: "SCSS" },
  sass: { kind: "code", language: "sass", label: "Sass" },
  less: { kind: "code", language: "less", label: "Less" },
  vue: { kind: "code", language: "vue", label: "Vue" },
  svelte: { kind: "code", language: "svelte", label: "Svelte" },
  xml: { kind: "code", language: "xml", label: "XML" },
  svg: { kind: "code", language: "xml", label: "SVG" },

  yaml: { kind: "code", language: "yaml", label: "YAML" },
  yml: { kind: "code", language: "yaml", label: "YAML" },
  toml: { kind: "code", language: "toml", label: "TOML" },
  ini: { kind: "code", language: "ini", label: "INI" },
  cfg: { kind: "code", language: "ini", label: "Konfiguration" },
  conf: { kind: "code", language: "ini", label: "Konfiguration" },
  env: { kind: "code", language: "properties", label: "Environment" },
  properties: { kind: "code", language: "properties", label: "Properties" },
  sql: { kind: "code", language: "sql", label: "SQL" },
  graphql: { kind: "code", language: "graphql", label: "GraphQL" },
  gql: { kind: "code", language: "graphql", label: "GraphQL" },

  txt: { kind: "text", language: "plaintext", label: "Text" },
  text: { kind: "text", language: "plaintext", label: "Text" },
  log: { kind: "text", language: "plaintext", label: "Log" },
  csv: { kind: "text", language: "plaintext", label: "CSV" },
  tsv: { kind: "text", language: "plaintext", label: "TSV" },
};

const SPECIAL_NAMES: Record<string, FileTypeInfo> = {
  dockerfile: { kind: "code", language: "dockerfile", label: "Dockerfile" },
  makefile: { kind: "code", language: "makefile", label: "Makefile" },
  rakefile: { kind: "code", language: "ruby", label: "Rakefile" },
  gemfile: { kind: "code", language: "ruby", label: "Gemfile" },
  ".gitignore": { kind: "code", language: "plaintext", label: "Git Ignore" },
  ".gitattributes": { kind: "code", language: "plaintext", label: "Git Attributes" },
  ".editorconfig": { kind: "code", language: "ini", label: "EditorConfig" },
};

const SPECIAL_NAME_CASE: Record<string, string> = {
  dockerfile: "Dockerfile",
  makefile: "Makefile",
  rakefile: "Rakefile",
  gemfile: "Gemfile",
  ".gitignore": ".gitignore",
  ".gitattributes": ".gitattributes",
  ".editorconfig": ".editorconfig",
};

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

export function fileTypeChoiceIdFor(fileName: string): string {
  const baseName = fileNameFromPath(fileName).toLowerCase();
  if (SPECIAL_NAMES[baseName]) return `name:${baseName}`;

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
  return SPECIAL_NAMES[baseName] ?? TYPES[extensionOf(baseName)] ?? FALLBACK;
}

export function countLines(content: string): number {
  return content.length === 0 ? 1 : content.split(/\r\n|\r|\n/).length;
}

export function countWords(content: string): number {
  const matches = content.trim().match(/[\p{L}\p{N}_'-]+/gu);
  return matches?.length ?? 0;
}
