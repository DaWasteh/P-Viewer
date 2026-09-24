// Shared rules for the Windows file type icons (issue #3).
//
// Delivered ICO files are named after the extension they belong to (`md.ico`
// → `.md`). Byte-identical deliveries are stored once under a canonical name;
// `src/lib/files/file-icons.json` keeps which extension brought which icon and
// the resolved icon for every supported extension, so the frontend, the NSIS
// hooks and the Rust side never re-implement the fallback rules.
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

export const ICON_SIZES_REQUIRED = [16, 32, 48, 256];
export const PREVIEW_SIZE = 32;

/** Category fallbacks when neither the extension nor its format group has an icon. */
export const CATEGORY_ICONS = { code: "conf", text: "txt", image: "png", document: "pdf" };

/** File names that win over their extension (matched case-insensitively). */
export const FILE_NAME_ICONS = {
  dockerfile: "dockerfile",
  containerfile: "dockerfile",
  makefile: "make",
  gnumakefile: "make",
  "cmakelists.txt": "cmake",
  readme: "md",
  "readme.md": "md",
  license: "txt",
  changelog: "md",
  "changelog.md": "md",
  ".gitignore": "conf",
  ".gitattributes": "conf",
  ".editorconfig": "ini",
  ".env": "env",
  "package.json": "json",
  "package-lock.json": "json",
  "tsconfig.json": "ts",
  "cargo.toml": "rs",
  "cargo.lock": "rs",
  "requirements.txt": "py",
  "pyproject.toml": "py",
};

/**
 * Canonical names for byte-identical icons. The first listed member of a
 * duplicate set that is present wins; otherwise the alphabetically first one.
 */
const CANONICAL_PREFERENCE = [
  "html", "xml", "py", "conf", "cs", "cpp", "hpp", "sh", "ts", "js", "java", "rb",
  "scala", "php", "lua", "yaml", "less", "srt", "tsv", "psm1",
];

export function categoryForKind(kind) {
  if (kind === "markdown" || kind === "text") return "text";
  if (kind === "image") return "image";
  if (kind === "pdf") return "document";
  return "code";
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Parses an ICO container and validates every frame; throws with a readable reason. */
export function parseIco(bytes, name = "ICO") {
  if (bytes.length < 6 || bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) {
    throw new Error(`${name}: keine ICO-Datei.`);
  }
  const count = bytes.readUInt16LE(4);
  if (count === 0 || 6 + count * 16 > bytes.length) throw new Error(`${name}: ungültiges ICO-Verzeichnis.`);
  const frames = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    const width = bytes[entry] || 256;
    const height = bytes[entry + 1] || 256;
    const size = bytes.readUInt32LE(entry + 8);
    const offset = bytes.readUInt32LE(entry + 12);
    if (size === 0 || offset + size > bytes.length) throw new Error(`${name}: Bild ${width}px liegt außerhalb der Datei.`);
    const data = bytes.subarray(offset, offset + size);
    const png = data.length >= 8 && data.readUInt32BE(0) === 0x89504e47 && data.readUInt32BE(4) === 0x0d0a1a0a;
    frames.push({ width, height, data, png });
  }
  const sizes = new Set(frames.filter((frame) => frame.width === frame.height).map((frame) => frame.width));
  const missing = ICON_SIZES_REQUIRED.filter((size) => !sizes.has(size));
  if (missing.length > 0) throw new Error(`${name}: Größen ${missing.join(", ")} px fehlen.`);
  return frames;
}

/** PNG bytes of the frame used for in-app previews (32 px, rendered at 16 CSS px). */
export function previewPng(bytes, name = "ICO") {
  const frame = parseIco(bytes, name).find((candidate) => candidate.width === PREVIEW_SIZE && candidate.height === PREVIEW_SIZE);
  if (!frame) throw new Error(`${name}: kein ${PREVIEW_SIZE}px-Bild.`);
  return frame.png ? Buffer.from(frame.data) : dibToPng(frame.data, name);
}

/** Converts a 32-bit BI_RGB DIB frame (bottom-up BGRA plus AND mask) to PNG. */
function dibToPng(dib, name) {
  const headerSize = dib.readUInt32LE(0);
  const width = dib.readInt32LE(4);
  const height = dib.readInt32LE(8) / 2;
  const bitCount = dib.readUInt16LE(14);
  const compression = dib.readUInt32LE(16);
  if (bitCount !== 32 || compression !== 0) throw new Error(`${name}: nur 32-Bit-Bitmaps werden unterstützt.`);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const source = headerSize + (height - 1 - y) * width * 4;
    const target = y * (width * 4 + 1);
    raw[target] = 0;
    for (let x = 0; x < width; x += 1) {
      const from = source + x * 4;
      const to = target + 1 + x * 4;
      raw[to] = dib[from + 2];
      raw[to + 1] = dib[from + 1];
      raw[to + 2] = dib[from];
      raw[to + 3] = dib[from + 3];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Picks the stored name for a set of byte-identical icons. */
export function canonicalName(names) {
  const preferred = CANONICAL_PREFERENCE.find((name) => names.includes(name));
  return preferred ?? [...names].sort()[0];
}

/** Supported extensions and their document kind, read from `fileTypes.ts`. */
export function supportedKinds(fileTypesSource) {
  const typeBlock = fileTypesSource.match(
    /const TYPES:[\s\S]*?= \{([\s\S]*?)\n\};\n\nconst SPECIAL_NAMES/,
  )?.[1];
  if (!typeBlock) throw new Error("Unterstützte Dateiendungen konnten nicht gelesen werden.");
  return new Map(
    [...typeBlock.matchAll(/^\s{2}"?([a-z0-9][\w-]*)"?:\s*\{\s*kind:\s*"([a-z]+)"/gm)].map(
      (match) => [match[1], match[2]],
    ),
  );
}

/**
 * Icon for every supported extension: its own delivered icon, otherwise the
 * first icon of its format group, otherwise its category icon.
 */
export function resolveExtensionIcons(sources, associations, kinds, available) {
  const categories = resolveNamed(CATEGORY_ICONS, sources, available);
  const resolved = {};
  for (const group of associations) {
    const groupIcon = group.extensions.map((extension) => sources[extension]).find(Boolean);
    for (const extension of group.extensions) {
      const icon = sources[extension] ?? groupIcon ?? categories[categoryForKind(kinds.get(extension))];
      if (!available.has(icon)) throw new Error(`Für .${extension} fehlt ${icon}.ico.`);
      resolved[extension] = icon;
    }
  }
  return sortedObject(resolved);
}

/** Maps entries that name the extension whose delivered icon they use to stored icon names. */
function resolveNamed(entries, sources, available) {
  return Object.fromEntries(Object.entries(entries).map(([key, extension]) => {
    const icon = sources[extension] ?? extension;
    if (!available.has(icon)) throw new Error(`Registry verweist auf fehlendes ${extension}.ico.`);
    return [key, icon];
  }));
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

/** The complete registry written to `src/lib/files/file-icons.json`. */
export function buildRegistry(sources, associations, kinds, available) {
  return {
    version: 1,
    theme: "p-viewer-default",
    categories: resolveNamed(CATEGORY_ICONS, sources, available),
    fileNames: resolveNamed(FILE_NAME_ICONS, sources, available),
    sources: sortedObject(sources),
    extensions: resolveExtensionIcons(sources, associations, kinds, available),
  };
}
