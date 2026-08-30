export type RuntimePlatform = "Windows" | "macOS" | "Linux" | "Unbekannt";
export type WebViewEngine = "WebView2" | "WebKitGTK" | "WebKit" | "Browser";

export interface RuntimeInfo {
  platform: RuntimePlatform;
  engine: WebViewEngine;
  userAgent: string;
}

export function detectRuntimeInfo(userAgent = ""): RuntimeInfo {
  const normalized = userAgent.toLowerCase();
  const platform: RuntimePlatform = normalized.includes("windows")
    ? "Windows"
    : normalized.includes("macintosh") || normalized.includes("mac os")
      ? "macOS"
      : normalized.includes("linux")
        ? "Linux"
        : "Unbekannt";

  let engine: WebViewEngine = "Browser";
  if (platform === "Windows" && (normalized.includes("edg/") || normalized.includes("chrome/"))) {
    engine = "WebView2";
  } else if (platform === "Linux" && normalized.includes("applewebkit")) {
    engine = "WebKitGTK";
  } else if (platform === "macOS" && normalized.includes("applewebkit")) {
    engine = "WebKit";
  }

  return { platform, engine, userAgent };
}

export function currentRuntimeInfo(): RuntimeInfo {
  return detectRuntimeInfo(typeof navigator === "undefined" ? "" : navigator.userAgent);
}
