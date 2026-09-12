import { LanguageDescription, LanguageSupport } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { specialFileType } from "$lib/files/fileTypes";
import { customLanguage, type CustomLanguageId } from "./modes";

// Special file names resolve through their file type's language id (see
// `SPECIAL_FILES` in fileTypes.ts) so both tables cannot drift apart. An empty
// string keeps a format deliberately plain.
const LANGUAGE_ID_LOADERS: Record<string, string> = {
  dockerfile: "Dockerfile",
  makefile: "custom:makefile",
  cmake: "CMake",
  groovy: "Groovy",
  ruby: "Ruby",
  properties: "Properties files",
  ini: "Properties files",
  toml: "TOML",
  json: "JSON",
  yaml: "YAML",
  shell: "Shell",
  ignore: "custom:ignore",
  starlark: "Python",
  nginx: "Nginx",
  vim: "custom:vim",
  gomod: "",
  plaintext: "",
};

// Extensions whose language-data match is missing or wrong for this app.
const EXTENSION_ALIASES: Record<string, string> = {
  jsonc: "JSON",
  json5: "JSON",
  jsonl: "JSON",
  ndjson: "JSON",
  ipynb: "JSON",
  jsonld: "JSON-LD",
  geojson: "JSON",
  topojson: "JSON",
  webmanifest: "JSON",
  har: "JSON",
  avsc: "JSON",
  arb: "JSON",
  sarif: "JSON",
  "code-workspace": "JSON",
  "code-snippets": "JSON",
  mdown: "Markdown",
  mkdn: "Markdown",
  mdwn: "Markdown",
  mkd: "Markdown",
  mdx: "Markdown",
  rmd: "Markdown",
  qmd: "Markdown",
  xhtml: "HTML",
  latex: "LaTeX",
  rnw: "LaTeX",
  sty: "LaTeX",
  cls: "LaTeX",
  dtx: "LaTeX",
  ins: "LaTeX",
  bib: "custom:bibtex",
  bat: "custom:batch",
  cmd: "custom:batch",
  mk: "custom:makefile",
  make: "custom:makefile",
  mak: "custom:makefile",
  graphql: "custom:graphql",
  gql: "custom:graphql",
  ex: "custom:elixir",
  exs: "custom:elixir",
  eex: "HTML",
  heex: "HTML",
  leex: "HTML",
  erb: "HTML",
  csv: "custom:csv",
  tsv: "custom:csv",
  tab: "custom:csv",
  tf: "custom:hcl",
  tfvars: "custom:hcl",
  hcl: "custom:hcl",
  nix: "custom:nix",
  vim: "custom:vim",
  zsh: "Shell",
  fish: "Shell",
  ksh: "Shell",
  csh: "Shell",
  tcsh: "Shell",
  conf: "Properties files",
  cnf: "Properties files",
  cfg: "Properties files",
  inf: "Properties files",
  env: "Properties files",
  xcconfig: "Properties files",
  cabal: "Properties files",
  service: "Properties files",
  timer: "Properties files",
  socket: "Properties files",
  dockerfile: "Dockerfile",
  fsx: "F#",
  fsi: "F#",
  csx: "C#",
  sc: "Scala",
  sbt: "Scala",
  hrl: "Erlang",
  pyi: "Python",
  pyx: "Cython",
  pxd: "Cython",
  pxi: "Cython",
  bzl: "Python",
  bazel: "Python",
  cbl: "Cobol",
  f03: "Fortran",
  f08: "Fortran",
  ftn: "Fortran",
  lsp: "Common Lisp",
  rkt: "Scheme",
  cu: "C++",
  cuh: "C++",
  ipp: "C++",
  tpp: "C++",
  inl: "C++",
  glsl: "C++",
  vert: "C++",
  frag: "C++",
  hlsl: "C++",
  rake: "Ruby",
  gemspec: "Ruby",
  ru: "Ruby",
  podspec: "Ruby",
  dpr: "Pascal",
  lpr: "Pascal",
  tk: "Tcl",
  plist: "XML",
  xaml: "XML",
  axaml: "XML",
  fxml: "XML",
  wxml: "XML",
  xslt: "XML",
  wsdl: "XML",
  rdf: "XML",
  csproj: "XML",
  vbproj: "XML",
  fsproj: "XML",
  props: "XML",
  targets: "XML",
  nuspec: "XML",
  resx: "XML",
  ui: "XML",
  qrc: "XML",
  opml: "XML",
  gpx: "XML",
  kml: "XML",
  xlf: "XML",
  xliff: "XML",
  mobileconfig: "XML",
  entitlements: "XML",
  xcscheme: "XML",
  rss: "XML",
  atom: "XML",
  cff: "YAML",
  desktop: "Properties files",
  reg: "Properties files",
  asm: "Gas",
  s: "Gas",
  hbs: "HTML",
  handlebars: "HTML",
  http: "HTTP",
  rest: "HTTP",
  psm1: "PowerShell",
  psd1: "PowerShell",
  pgsql: "PostgreSQL",
  mysql: "MySQL",
  plsql: "PLSQL",
  hql: "SQL",
  // `.text` and `.r` files are plain text and R, never LaTeX/Rebol.
  text: "",
  txt: "",
  log: "",
  rst: "",
  adoc: "",
  asciidoc: "",
  org: "",
  pod: "",
  wiki: "",
  srt: "",
  vtt: "",
  ass: "",
  ssa: "",
  sln: "",
  pem: "",
  crt: "",
  csr: "",
  pub: "",
  asc: "",
  sha256: "",
  md5: "",
};

async function loadHtmlFallback(baseName: string): Promise<LanguageSupport | null> {
  try {
    const { html } = await import("@codemirror/lang-html");
    return html({ selfClosingTags: true });
  } catch (error) {
    console.warn(`HTML-Fallback für ${baseName} konnte nicht geladen werden.`, error);
    return null;
  }
}

async function loadWebComponentLanguage(baseName: string): Promise<LanguageSupport | null> {
  const nameParts = baseName.split(".");
  const extension = nameParts[nameParts.length - 1]?.toLowerCase();

  try {
    if (extension === "astro") {
      const { astro } = await import("@fazelstudio/codemirror-lang-astro");
      return astro();
    }
    if (extension === "svelte") {
      const { svelte } = await import("@replit/codemirror-lang-svelte");
      return svelte();
    }
  } catch (error) {
    console.warn(`Syntaxsprache für ${baseName} konnte nicht geladen werden.`, error);
    return loadHtmlFallback(baseName);
  }

  return null;
}

function resolveAlias(lowerName: string, extension: string): string | undefined {
  const special = specialFileType(lowerName);
  if (special) return LANGUAGE_ID_LOADERS[special.language] ?? "";
  return EXTENSION_ALIASES[extension];
}

export async function loadLanguageForFile(
  fileName: string,
): Promise<LanguageSupport | null> {
  const pathParts = fileName.split(/[\\/]/);
  const baseName = pathParts[pathParts.length - 1] ?? fileName;
  const lowerName = baseName.toLowerCase();
  const webComponentLanguage = await loadWebComponentLanguage(baseName);
  if (webComponentLanguage) return webComponentLanguage;

  const extensionParts = lowerName.split(".");
  const extension = extensionParts.length > 1 ? extensionParts[extensionParts.length - 1] : "";
  const alias = resolveAlias(lowerName, extension);
  if (alias === "") return null;
  if (alias?.startsWith("custom:")) {
    return new LanguageSupport(customLanguage(alias.slice("custom:".length) as CustomLanguageId));
  }

  const description = alias
    ? languages.find((language) => language.name === alias) ?? null
    : LanguageDescription.matchFilename(languages, baseName);

  if (!description) return null;

  try {
    return await description.load();
  } catch (error) {
    console.warn(`Syntaxsprache für ${baseName} konnte nicht geladen werden.`, error);
    return null;
  }
}
