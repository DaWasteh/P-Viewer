import { describe, expect, it } from "vitest";
import componentSource from "./HtmlPreview.svelte?raw";
import tauriConfigSource from "../../../src-tauri/tauri.conf.json?raw";
import capabilitySource from "../../../src-tauri/capabilities/default.json?raw";
import backendSource from "../../../src-tauri/src/html_preview.rs?raw";

const tauriConfig = JSON.parse(tauriConfigSource) as {
  app: { security: { csp: string } };
};
const capability = JSON.parse(capabilitySource) as {
  windows: string[];
  permissions: string[];
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

  it("requires confirmation before opening active HTML in the native isolation boundary", () => {
    expect(componentSource).toContain("fullPreviewDialog.showModal()");
    expect(componentSource).toContain("Aktive HTML-Inhalte ausführen?");
    expect(componentSource).toContain('invoke<{ token: string }>("open_full_html_preview"');
    expect(componentSource).toContain('invoke<boolean>("update_full_html_preview"');
    expect(backendSource).toContain("Server::http((PREVIEW_HOST, 0))");
    expect(backendSource).toContain("pub async fn open_full_html_preview");
    expect(backendSource).toContain("WebviewUrl::External(prepared.url.clone())");
    expect(backendSource).toContain(".incognito(true)");
    expect(backendSource).toContain(".devtools(false)");
    expect(backendSource).toContain("NewWindowResponse::Deny");
    expect(backendSource).toContain("WindowEvent::CloseRequested");
    expect(backendSource).toContain("window.destroy()");
  });

  it("does not grant the isolated preview window any configured Tauri permissions", () => {
    expect(capability.windows).toEqual(["main"]);
    expect(capability.permissions.length).toBeGreaterThan(0);
    expect(backendSource).toContain('const PREVIEW_HOST: &str = "127.0.0.1"');
    expect(backendSource).toContain("url.host_str() == Some(host)");
  });
});
