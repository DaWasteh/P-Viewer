import { LanguageDescription, LanguageSupport } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { customLanguage, type CustomLanguageId } from "./modes";

// Special file names (lower-cased) that map to a language-data name or a bundled mode.
const NAME_ALIASES: Record<string, string> = {
  dockerfile: "Dockerfile",
  containerfile: "Dockerfile",
  makefile: "custom:makefile",
  gnumakefile: "custom:makefile",
  rakefile: "Ruby",
  gemfile: "Ruby",
  vagrantfile: "Ruby",
  brewfile: "Ruby",
  guardfile: "Ruby",
  podfile: "Ruby",
  jenkinsfile: "Groovy",
  "cmakelists.txt": "CMake",
  pkgbuild: "Shell",
  procfile: "Properties files",
  pipfile: "TOML",
  "cargo.lock": "TOML",
  ".env": "Properties files",
  ".editorconfig": "Properties files",
  ".gitconfig": "Properties files",
  ".gitmodules": "Properties files",
  ".npmrc": "Properties files",
  ".yarnrc": "Properties files",
  ".htaccess": "Properties files",
  ".gitignore": "custom:ignore",
  ".gitattributes": "custom:ignore",
  ".dockerignore": "custom:ignore",
  ".npmignore": "custom:ignore",
  ".prettierignore": "custom:ignore",
  ".eslintignore": "custom:ignore",
  ".babelrc": "JSON",
  ".prettierrc": "JSON",
  ".eslintrc": "JSON",
  ".bashrc": "Shell",
  ".zshrc": "Shell",
  ".profile": "Shell",
  ".bash_profile": "Shell",
  ".bash_aliases": "Shell",
  ".zprofile": "Shell",
};

// Extensions whose language-data match is missing or wrong for this app.
const EXTENSION_ALIASES: Record<string, string> = {
  jsonc: "JSON",
  json5: "JSON",
  ipynb: "JSON",
  jsonld: "JSON-LD",
  geojson: "JSON",
  webmanifest: "JSON",
  mdown: "Markdown",
  mkdn: "Markdown",
  mdwn: "Markdown",
  mkd: "Markdown",
  mdx: "Markdown",
  rmd: "Markdown",
  qmd: "Markdown",
  xhtml: "HTML",
  latex: "LaTeX",
  sty: "LaTeX",
  cls: "LaTeX",
  bib: "custom:bibtex",
  bat: "custom:batch",
  cmd: "custom:batch",
  mk: "custom:makefile",
  make: "custom:makefile",
  graphql: "custom:graphql",
  gql: "custom:graphql",
  ex: "custom:elixir",
  exs: "custom:elixir",
  csv: "custom:csv",
  tsv: "custom:csv",
  zsh: "Shell",
  fish: "Shell",
  ksh: "Shell",
  conf: "Properties files",
  cfg: "Properties files",
  env: "Properties files",
  dockerfile: "Dockerfile",
  fsx: "F#",
  fsi: "F#",
  hrl: "Erlang",
  pyi: "Python",
  plist: "XML",
  xaml: "XML",
  rss: "XML",
  atom: "XML",
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
  // `.text` and `.r` files are plain text and R, never LaTeX/Rebol.
  text: "",
  txt: "",
  log: "",
  rst: "",
  adoc: "",
  asciidoc: "",
  org: "",
  srt: "",
  vtt: "",
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
  if (lowerName in NAME_ALIASES) return NAME_ALIASES[lowerName];
  // `.env.local`, `.env.production` and similar variants behave like `.env`.
  if (lowerName.startsWith(".env.")) return NAME_ALIASES[".env"];
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
