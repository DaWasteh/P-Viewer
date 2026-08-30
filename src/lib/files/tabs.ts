import type { OpenDocument } from "./types";

export interface DocumentTab {
  id: string;
  document: OpenDocument;
  revision: number;
}

export function documentIsDirty(document: OpenDocument): boolean {
  return document.metadataDirty || document.content !== document.savedContent;
}

export function isPristineUntitled(document: OpenDocument): boolean {
  return (
    document.untitled &&
    !document.path &&
    document.content === "" &&
    document.savedContent === "" &&
    !document.metadataDirty
  );
}

export function sameDocumentPath(left: string, right: string): boolean {
  if (!left || !right) return false;
  const windowsPath = /^[a-z]:[\\/]/i.test(left) || /^[a-z]:[\\/]/i.test(right);
  const normalize = (path: string) => path.replaceAll("\\", "/");
  return windowsPath
    ? normalize(left).toLowerCase() === normalize(right).toLowerCase()
    : normalize(left) === normalize(right);
}

export function findTabByPath(
  tabs: DocumentTab[],
  path: string,
  excludedTabId?: string,
): DocumentTab | undefined {
  return tabs.find(
    (tab) =>
      tab.id !== excludedTabId &&
      tab.document.path &&
      sameDocumentPath(tab.document.path, path),
  );
}

export function nextUntitledName(documents: OpenDocument[]): string {
  const usedNames = new Set(documents.map(({ name }) => name.toLocaleLowerCase("de")));
  let index = 1;

  while (true) {
    const name = index === 1 ? "Unbenannt.txt" : `Unbenannt ${index}.txt`;
    if (!usedNames.has(name.toLocaleLowerCase("de"))) return name;
    index += 1;
  }
}
