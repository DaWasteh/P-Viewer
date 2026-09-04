export const MAX_SVG_PREVIEW_BYTES = 4 * 1024 * 1024;

// The SVG is embedded as an <img> data URL inside a sandboxed iframe. Browsers
// never run scripts or fetch external resources for SVG images, and the CSP
// below additionally denies every network request. The fallback document
// therefore never executes document content.
export const SVG_PREVIEW_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "img-src data:",
  "style-src 'unsafe-inline'",
].join("; ");

export interface SvgPreviewOptions {
  theme?: "dark" | "light";
  zoom?: number;
  checkerboard?: boolean;
}

export interface SvgPreviewResult {
  document: string;
  width: string | null;
  height: string | null;
  viewBox: string | null;
}

export class SvgPreviewTooLargeError extends Error {
  constructor(public readonly bytes: number) {
    super(
      `Die SVG-Datei ist mit ${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 2 })} MiB zu groß für die Bildvorschau (Limit ${MAX_SVG_PREVIEW_BYTES / 1024 / 1024} MiB).`,
    );
    this.name = "SvgPreviewTooLargeError";
  }
}

export function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function svgRootAttributes(source: string): Pick<SvgPreviewResult, "width" | "height" | "viewBox"> {
  const root = source.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const attribute = (name: string): string | null => {
    const match = root.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
    const value = match?.[2] ?? match?.[3] ?? null;
    return value && value.trim() ? value.trim() : null;
  };
  return { width: attribute("width"), height: attribute("height"), viewBox: attribute("viewBox") };
}

export function renderSvgPreview(source: string, options: SvgPreviewOptions = {}): SvgPreviewResult {
  const bytes = new TextEncoder().encode(source).byteLength;
  if (bytes > MAX_SVG_PREVIEW_BYTES) throw new SvgPreviewTooLargeError(bytes);
  if (!/<svg\b/i.test(source)) {
    throw new Error("Die Datei enthält kein <svg>-Wurzelelement.");
  }

  const theme = options.theme ?? "dark";
  const zoom = Number.isFinite(options.zoom) ? Math.min(8, Math.max(0.1, options.zoom ?? 1)) : 1;
  const checkerboard = options.checkerboard ?? true;
  const background = theme === "dark" ? "#111318" : "#ffffff";
  const checkA = theme === "dark" ? "#1c2028" : "#e6e8ee";
  const checkB = theme === "dark" ? "#242833" : "#f6f7fa";
  const dataUrl = `data:image/svg+xml;base64,${encodeBase64(source)}`;
  const css = `
:root { color-scheme: ${theme}; }
html, body { margin: 0; min-height: 100%; }
body { display: grid; place-items: center; box-sizing: border-box; min-height: 100vh; padding: 24px; background: ${background}; }
body.checkerboard { background-color: ${checkB}; background-image: linear-gradient(45deg, ${checkA} 25%, transparent 25%), linear-gradient(-45deg, ${checkA} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${checkA} 75%), linear-gradient(-45deg, transparent 75%, ${checkA} 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0; }
img { display: block; max-width: 100%; zoom: ${zoom}; }
`;

  return {
    ...svgRootAttributes(source),
    document: `<!doctype html><html lang="und"><head><meta http-equiv="Content-Security-Policy" content="${SVG_PREVIEW_CSP}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>P-Viewer SVG-Vorschau</title><style>${css}</style></head><body class="${checkerboard ? "checkerboard" : ""}"><img src="${dataUrl}" alt="SVG-Vorschau"></body></html>`,
  };
}
