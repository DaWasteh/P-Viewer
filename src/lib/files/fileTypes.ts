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

  html: { kind: "code", language: "html", label: "HTML" },
  htm: { kind: "code", language: "html", label: "HTML" },
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

const FALLBACK: FileTypeInfo = {
  kind: "text",
  language: "plaintext",
  label: "Text",
};

export function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export function extensionOf(fileName: string): string {
  const baseName = fileNameFromPath(fileName);
  const dot = baseName.lastIndexOf(".");
  return dot > 0 ? baseName.slice(dot + 1).toLowerCase() : "";
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
