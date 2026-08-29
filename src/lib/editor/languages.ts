import { LanguageDescription, type LanguageSupport } from "@codemirror/language";
import { languages } from "@codemirror/language-data";

const LANGUAGE_ALIASES: Record<string, string> = {
  Dockerfile: "Dockerfile",
  Makefile: "Makefile",
  ".env": "Properties",
};

export async function loadLanguageForFile(
  fileName: string,
): Promise<LanguageSupport | null> {
  const baseName = fileName.split(/[\\/]/).at(-1) ?? fileName;
  const alias = LANGUAGE_ALIASES[baseName];
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
