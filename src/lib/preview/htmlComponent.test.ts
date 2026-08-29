import { describe, expect, it } from "vitest";
import componentSource from "./HtmlPreview.svelte?raw";
import tauriConfigSource from "../../../src-tauri/tauri.conf.json?raw";

const tauriConfig = JSON.parse(tauriConfigSource) as {
  app: { security: { csp: string } };
};

describe("HTML preview containment wiring", () => {
  it("keeps the iframe sandbox empty and omits parent-context HTML injection", () => {
    const iframeTag = componentSource.match(/<iframe[\s\S]*?>/)?.[0] ?? "";
    expect(iframeTag).toContain('sandbox=""');
    expect(iframeTag).toContain('referrerpolicy="no-referrer"');
    expect(iframeTag).not.toMatch(/allow-(?:scripts|same-origin|forms|popups|top-navigation|downloads|modals)/);
    expect(componentSource).not.toContain("{@html");
  });

  it("allows only same-origin frames at the outer Tauri CSP boundary", () => {
    const csp = tauriConfig.app.security.csp;
    expect(csp).toContain("frame-src 'self'");
    expect(csp).not.toMatch(/frame-src[^;]*(?:data:|blob:|https?:)/);
  });
});
