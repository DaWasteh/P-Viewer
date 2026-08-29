import { LanguageDescription, type LanguageSupport } from "@codemirror/language";
import { languages } from "@codemirror/language-data";

const NAME_ALIASES: Record<string, string> = {
  dockerfile: "Dockerfile",
  makefile: "Makefile",
  ".env": "Properties files",
};

const EXTENSION_ALIASES: Record<string, string> = {
  jsonc: "JSON",
  json5: "JSON",
  ipynb: "JSON",
  mdown: "Markdown",
  mkd: "Markdown",
  mdx: "Markdown",
  xhtml: "HTML",
  latex: "LaTeX",
  sty: "LaTeX",
  cls: "LaTeX",
  bib: "LaTeX",
  zsh: "Shell",
  fish: "Shell",
  conf: "Properties files",
  env: "Properties files",
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
  const extension = baseName.split(".").at(-1)?.toLowerCase();

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

export async function loadLanguageForFile(
  fileName: string,
): Promise<LanguageSupport | null> {
  const baseName = fileName.split(/[\\/]/).at(-1) ?? fileName;
  const lowerName = baseName.toLowerCase();
  const webComponentLanguage = await loadWebComponentLanguage(baseName);
  if (webComponentLanguage) return webComponentLanguage;

  const extension = lowerName.split(".").at(-1) ?? "";
  const alias = NAME_ALIASES[lowerName] ?? EXTENSION_ALIASES[extension];
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
