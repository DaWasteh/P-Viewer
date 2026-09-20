import { describe, expect, it } from "vitest";
import shell from "./app.html?raw";

// Tauri hashes inline style and script elements of the shell into the CSP.
// Once a hash source exists, browsers ignore 'unsafe-inline', and the style
// elements CodeMirror injects at runtime are blocked: the editor renders
// unstyled (v0.1.5 regression). The shell must therefore stay free of them.
describe("app shell", () => {
  const markup = shell.replace(/<!--[\s\S]*?-->/g, "");

  it("contains no inline style element", () => {
    expect(markup).not.toMatch(/<style[\s>]/i);
  });

  it("contains no inline script element", () => {
    expect(markup).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/i);
  });
});
