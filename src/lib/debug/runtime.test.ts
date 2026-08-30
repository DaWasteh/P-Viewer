import { describe, expect, it } from "vitest";
import { detectRuntimeInfo } from "./runtime";

describe("runtime detection", () => {
  it.each([
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0",
      "Windows",
      "WebView2",
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1 Version/17.0 Safari/605.1",
      "Linux",
      "WebKitGTK",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1 Version/17.0 Safari/605.1",
      "macOS",
      "WebKit",
    ],
  ])("identifies %s", (userAgent, platform, engine) => {
    expect(detectRuntimeInfo(userAgent)).toMatchObject({ platform, engine });
  });

  it("falls back for an unknown browser", () => {
    expect(detectRuntimeInfo("custom-agent")).toMatchObject({
      platform: "Unbekannt",
      engine: "Browser",
    });
  });
});
