const externalScheme = /^[a-z][a-z\d+.-]*:/i;
const windowsDriveAbsolute = /^[a-z]:[\\/]/i;
const unsafePathCharacter = /[\u0000-\u001f\u007f]/;

export function resolveDocumentReference(
  documentPath: string,
  reference: string,
): string | null {
  const trimmed = reference.trim();
  if (!documentPath || !trimmed || trimmed.startsWith("#")) return null;

  const withoutSuffix = trimmed.split(/[?#]/, 1)[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutSuffix).trim();
  } catch {
    decoded = withoutSuffix.trim();
  }
  if (!decoded || unsafePathCharacter.test(decoded)) return null;

  // Check after decoding as well: `https%3A%2F%2F…` must never be interpreted
  // as a local path. Scheme-relative links are external/ambiguous, not UNC.
  if (externalScheme.test(decoded) && !windowsDriveAbsolute.test(decoded)) return null;
  if (decoded.startsWith("//")) return null;

  const windowsDocument = isWindowsDocumentPath(documentPath);
  if (windowsDriveAbsolute.test(decoded) || decoded.startsWith("\\\\")) {
    return normalizeWindowsPath(decoded);
  }

  if (decoded.startsWith("/") || (windowsDocument && decoded.startsWith("\\"))) {
    if (!windowsDocument) return normalizePosixPath(decoded);
    const root = windowsRoot(documentPath);
    if (!root) return null;
    return normalizeWindowsPath(`${root}\\${decoded.replace(/^[\\/]+/, "")}`);
  }

  if (windowsDocument) {
    const parent = windowsParent(documentPath);
    return normalizeWindowsPath(parent ? `${parent}\\${decoded}` : decoded);
  }

  const parent = posixParent(documentPath);
  return normalizePosixPath(parent ? `${parent}/${decoded}` : decoded);
}

function isWindowsDocumentPath(value: string): boolean {
  return windowsDriveAbsolute.test(value) || value.startsWith("\\\\") || value.includes("\\");
}

function windowsParent(value: string): string {
  const normalized = value.replace(/\//g, "\\");
  const separator = normalized.lastIndexOf("\\");
  return separator < 0 ? "" : normalized.slice(0, separator);
}

function posixParent(value: string): string {
  const separator = value.lastIndexOf("/");
  if (separator < 0) return "";
  return separator === 0 ? "/" : value.slice(0, separator);
}

function windowsRoot(value: string): string | null {
  const normalized = value.replace(/\//g, "\\");
  const extendedUnc = normalized.match(/^\\\\\?\\UNC\\([^\\]+)\\([^\\]+)/i);
  if (extendedUnc) return `\\\\?\\UNC\\${extendedUnc[1]}\\${extendedUnc[2]}`;

  const extendedDrive = normalized.match(/^\\\\\?\\([a-z]:)\\/i);
  if (extendedDrive) return `\\\\?\\${extendedDrive[1]}`;

  const unc = normalized.match(/^\\\\([^\\]+)\\([^\\]+)/);
  if (unc) return `\\\\${unc[1]}\\${unc[2]}`;

  const drive = normalized.match(/^([a-z]:)\\/i);
  return drive?.[1] ?? null;
}

function normalizeWindowsPath(value: string): string | null {
  const normalized = value.replace(/\//g, "\\");
  let root = "";
  let tail = normalized;
  let driveRoot = false;

  const extendedUnc = normalized.match(/^\\\\\?\\UNC\\([^\\]+)\\([^\\]+)(?:\\|$)/i);
  if (extendedUnc) {
    if ([extendedUnc[1], extendedUnc[2]].some((part) => part === "." || part === "..")) {
      return null;
    }
    root = `\\\\?\\UNC\\${extendedUnc[1]}\\${extendedUnc[2]}`;
    tail = normalized.slice(extendedUnc[0].length);
  } else {
    const extendedDrive = normalized.match(/^\\\\\?\\([a-z]:)\\/i);
    if (extendedDrive) {
      root = `\\\\?\\${extendedDrive[1]}`;
      tail = normalized.slice(extendedDrive[0].length);
      driveRoot = true;
    } else if (normalized.startsWith("\\\\?\\") || normalized.startsWith("\\\\.\\")) {
      // Do not pass device namespaces or malformed extended paths to native I/O.
      return null;
    } else {
      const unc = normalized.match(/^\\\\([^\\]+)\\([^\\]+)(?:\\|$)/);
      if (unc) {
        if ([unc[1], unc[2]].some((part) => part === "." || part === "..")) return null;
        root = `\\\\${unc[1]}\\${unc[2]}`;
        tail = normalized.slice(unc[0].length);
      } else if (normalized.startsWith("\\\\")) {
        return null;
      } else {
        const drive = normalized.match(/^([a-z]:)\\/i);
        if (drive) {
          root = drive[1];
          tail = normalized.slice(drive[0].length);
          driveRoot = true;
        }
      }
    }
  }

  const parts = normalizeSegments(tail.split("\\"), Boolean(root));
  if (!root) return parts.join("\\");
  if (parts.length === 0) return driveRoot ? `${root}\\` : root;
  return `${root}\\${parts.join("\\")}`;
}

function normalizePosixPath(value: string): string {
  const rooted = value.startsWith("/");
  const parts = normalizeSegments(value.split("/"), rooted);
  if (!rooted) return parts.join("/");
  return parts.length > 0 ? `/${parts.join("/")}` : "/";
}

function normalizeSegments(segments: string[], rooted: boolean): string[] {
  const parts: string[] = [];
  for (const part of segments) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length > 0 && parts.at(-1) !== "..") parts.pop();
      else if (!rooted) parts.push(part);
      continue;
    }
    parts.push(part);
  }
  return parts;
}
