import type { Page } from "@playwright/test";

/** Test-only IPC boundary. Never bundled into the desktop app. */
export async function mockDesktop(page: Page, name: string, content: string) {
  await page.addInitScript(({ name, content }) => {
    const w = window as any;
    let sequence = 0;
    const callbacks = new Map<number, (event: unknown) => void>();
    const listeners = new Map<string, number[]>();
    const control = w.__testNative = { calls: [] as any[], pending: {} as Record<string, (value: unknown) => void>, deferred: ["compile_latex", "open_full_html_preview", "download_and_install_update"], emit(event: string, payload: unknown) {
      for (const id of listeners.get(event) ?? []) callbacks.get(id)?.({ event, payload, id });
    } };
    w.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main", windowLabel: "main" } },
      transformCallback(callback: (event: unknown) => void) { callbacks.set(++sequence, callback); return sequence; },
      unregisterCallback(id: number) { callbacks.delete(id); },
      async invoke(command: string, args: any = {}) {
        control.calls.push({ command, args });
        if (control.deferred.includes(command)) return new Promise((accept) => { control.pending[command] = accept; });
        if (command === "plugin:event|listen") { listeners.set(args.event, [...(listeners.get(args.event) ?? []), args.handler]); return args.handler; }
        if (command === "plugin:event|unlisten") return null;
        if (command === "take_pending_document_paths") return [`C:/fixtures/${name}`];
        if (command === "read_document") return { path: args.path, name: args.path.split("/").pop(), content, encoding: "UTF-8", hasBom: false, lineEnding: "lf", size: content.length, lossy: false, version: "fixture-version" };
        // A 2×2 PNG (red/blue checker) so the image viewer reports real dimensions.
        if (command === "read_binary_document") return { path: args.path, name: args.path.split("/").pop(), size: 87, mime: args.kind === "pdf" ? "application/pdf" : "image/png", base64: args.kind === "pdf" ? content : "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVQIW2P8z8Dwn4GBgYGJAQoAADgVAgLkOfJKAAAAAElFTkSuQmCC" };
        if (command === "write_document") return { path: args.path, size: args.content.length, version: "written-version" };
        if (command === "plugin:store|load") return 1;
        if (command === "plugin:store|get") return null;
        if (command === "plugin:path|resolve_directory") return "C:/test-profile";
        if (command === "detect_latex_engines") return [{ id: "test", label: "Mock compiler", available: true }];
        if (command === "plugin:dialog|message") return args.buttons?.OkCancelCustom?.[0] ?? "Ok";
        if (command === "updater_configuration") return { configured: true, currentVersion: "0.1.3" };
        if (command === "check_for_update") return { configured: true, currentVersion: "0.1.3", available: true, version: "0.1.4" };
        return null;
      },
    };
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  }, { name, content });
}

export function fixturePdf(pageCount: number): string {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Count ${pageCount} /Kids [${Array.from({ length: pageCount }, (_, i) => `${i + 3} 0 R`).join(" ")}] >>`];
  for (let i = 0; i < pageCount; i++) objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << >> >>");
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const start = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return btoa(pdf);
}
