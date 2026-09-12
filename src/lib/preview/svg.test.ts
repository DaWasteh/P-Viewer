import { describe, expect, it } from "vitest";
import {
  MAX_SVG_PREVIEW_BYTES,
  SVG_PREVIEW_CSP,
  SvgPreviewTooLargeError,
  encodeBase64,
  normalizeSvgSource,
  renderSvgPreview,
  svgDataUrl,
  svgRootAttributes,
} from "./svg";

describe("SVG preview document", () => {
  it("embeds the source as an image data URL behind a deny-by-default CSP", () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20" viewBox="0 0 10 20"><script>alert(1)</script><rect width="10" height="20"/></svg>';
    const result = renderSvgPreview(source, { theme: "light", zoom: 2 });

    expect(result.document.indexOf(SVG_PREVIEW_CSP)).toBeGreaterThan(0);
    expect(result.document).toContain(`<img src="data:image/svg+xml;charset=utf-8;base64,${encodeBase64(source)}"`);
    expect(result.document).not.toContain("<script>");
    expect(result.document).toContain("zoom: 2;");
    expect(result).toMatchObject({ width: "10", height: "20", viewBox: "0 0 10 20" });
  });

  it("lets zoom exceed the pane width and keeps the overflow reachable", () => {
    expect(renderSvgPreview("<svg/>", { zoom: 2 }).document).toContain("max-width: calc(100% * 2);");
    expect(renderSvgPreview("<svg/>", { zoom: 0.5 }).document).toContain("max-width: calc(100% * 0.5);");
    expect(renderSvgPreview("<svg/>").document).toContain("place-items: safe center;");
  });

  it("rewrites legacy XML encoding declarations for the decoded source", () => {
    const legacy = '<?xml version="1.0" encoding="ISO-8859-1" standalone="no"?>\n<svg xmlns="http://www.w3.org/2000/svg"><text>Grüße</text></svg>';
    expect(normalizeSvgSource(legacy)).toContain('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
    expect(normalizeSvgSource("<svg/>")).toBe("<svg/>");
    expect(normalizeSvgSource("<?xml version='1.0'?><svg/>")).toBe("<?xml version='1.0'?><svg/>");
    expect(svgDataUrl(legacy)).toBe(`data:image/svg+xml;charset=utf-8;base64,${encodeBase64(normalizeSvgSource(legacy))}`);
    expect(renderSvgPreview(legacy).document).not.toContain(encodeBase64(legacy));
  });

  it("encodes Unicode content and reads root attributes with either quote style", () => {
    expect(encodeBase64("Ünïcödé")).toBe(btoa(String.fromCharCode(...new TextEncoder().encode("Ünïcödé"))));
    expect(svgRootAttributes("<svg viewBox='0 0 1 1'>")).toEqual({ width: null, height: null, viewBox: "0 0 1 1" });
  });

  it("rejects oversized and non-SVG input", () => {
    expect(() => renderSvgPreview(`<svg>${"x".repeat(MAX_SVG_PREVIEW_BYTES)}</svg>`)).toThrow(
      SvgPreviewTooLargeError,
    );
    expect(() => renderSvgPreview("<div>nope</div>")).toThrow(/<svg>/);
  });
});
