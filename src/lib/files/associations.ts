import associationData from "./associations.json";

export interface FileAssociationGroup {
  id: string;
  label: string;
  progId: string;
  description: string;
  extensions: readonly string[];
  mimeType: string;
  contentTypes: readonly string[];
}

export const FILE_ASSOCIATION_GROUPS: readonly FileAssociationGroup[] = Object.freeze(
  associationData.map((group) =>
    Object.freeze({
      ...group,
      extensions: Object.freeze([...group.extensions]),
      contentTypes: Object.freeze([...group.contentTypes]),
    }),
  ),
);

export const FILE_ASSOCIATION_IDS: readonly string[] = Object.freeze(
  FILE_ASSOCIATION_GROUPS.map((group) => group.id),
);

const associationIds = new Set(FILE_ASSOCIATION_IDS);

export function normalizeAssociationIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [...FILE_ASSOCIATION_IDS];

  const normalized = value.filter(
    (entry): entry is string => typeof entry === "string" && associationIds.has(entry),
  );
  return [...new Set(normalized)];
}

export function extensionsForAssociationIds(ids: readonly string[]): string[] {
  const selected = new Set(ids);
  return FILE_ASSOCIATION_GROUPS.filter((group) => selected.has(group.id)).flatMap(
    (group) => [...group.extensions],
  );
}
