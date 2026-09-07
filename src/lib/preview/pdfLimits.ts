export const MAX_PDF_BASE64_CHARACTERS = 140 * 1024 * 1024;
export const MAX_PDF_PAGE_PIXELS = 8_000_000;
export const MAX_PDF_DIMENSION = 8_192;

export function boundedPdfScale(width: number, height: number, desiredScale: number): number {
  if (![width, height, desiredScale].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("Ungültige PDF-Seitenabmessungen.");
  }
  return Math.min(desiredScale, MAX_PDF_DIMENSION / width, MAX_PDF_DIMENSION / height, Math.sqrt(MAX_PDF_PAGE_PIXELS / (width * height)));
}
