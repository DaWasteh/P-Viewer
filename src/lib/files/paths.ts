const externalScheme = /^[a-z][a-z\d+.-]*:/i;

export function resolveDocumentReference(
  documentPath: string,
  reference: string,
): string | null {
  const trimmed = reference.trim();
  if (!documentPath || !trimmed || trimmed.startsWith("#")) return null;
  if (externalScheme.test(trimmed) && !/^[a-z]:[\\/]/i.test(trimmed)) return null;

  const withoutSuffix = trimmed.split(/[?#]/, 1)[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutSuffix);
  } catch {
    decoded = withoutSuffix;
  }

  if (/^[a-z]:[\\/]/i.test(decoded) || decoded.startsWith("/")) {
    return normalizePath(decoded, decoded.includes("\\") ? "\\" : "/");
  }

  const separator = documentPath.includes("\\") ? "\\" : "/";
  const parent = documentPath.replace(/[\\/][^\\/]*$/, "");
  return normalizePath(`${parent}${separator}${decoded}`, separator);
}

function normalizePath(value: string, separator: "\\" | "/"): string {
  const unified = value.replace(/\\/g, "/");
  const drive = unified.match(/^[a-z]:/i)?.[0] ?? "";
  const absolute = unified.startsWith("/") || Boolean(drive);
  const body = drive ? unified.slice(drive.length) : unified;
  const parts: string[] = [];

  for (const part of body.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length > 0) parts.pop();
      continue;
    }
    parts.push(part);
  }

  const prefix = drive ? `${drive}/` : absolute ? "/" : "";
  return `${prefix}${parts.join("/")}`.split("/").join(separator);
}
