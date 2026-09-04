import { describe, expect, it } from "vitest";
import {
  MAX_SVG_PREVIEW_BYTES,
  SVG_PREVIEW_CSP,
  SvgPreviewTooLargeError,
  encodeBase64,
  renderSvgPreview,
  svgRootAttributes,
} from "./svg";

describe("SVG preview document", () => {
  it("embeds the source as an image data URL behind a deny-by-default CSP", () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20" viewBox="0 0 10 20"><script>alert(1)</script><rect width="10" height="20"/></svg>';
    const result = renderSvgPreview(source, { theme: "light", zoom: 2 });

    expect(result.document.indexOf(SVG_PREVIEW_CSP)).toBeGreaterThan(0);
    expect(result.document).toContain(`<img src="data:image/svg+xml;base64,${encodeBase64(source)}"`);
    expect(result.document).not.toContain("<script>");
    expect(result.document).toContain("zoom: 2;");
    expect(result).toMatchObject({ width: "10", height: "20", viewBox: "0 0 10 20" });
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
