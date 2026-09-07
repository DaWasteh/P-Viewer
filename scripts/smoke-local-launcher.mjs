import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
import { chromium, expect } from "@playwright/test";

if (process.platform !== "win32") throw new Error("This smoke exercises the native Windows launcher/WebView2 only.");
const binary = resolve(process.argv[2] ?? "P-Viewer.exe");
const metadata = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const temporary = await mkdtemp(join(tmpdir(), "p-viewer-smoke-"));
await mkdir(resolve("test-results"), { recursive: true });
const textPath = join(temporary, "smoke.txt");
const dataPath = join(temporary, "records.jsonl");
const queuedPath = join(temporary, "queued.txt");
await writeFile(queuedPath, Buffer.from("你好", "utf16le"));
await writeFile(textPath, "Original\r\n", "utf8");
await writeFile(dataPath, '{"record":"Alpha"}\n{"record":"Beta"}', "utf8");
const server = createServer();
await new Promise((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
const port = server.address().port;
await new Promise((accept) => server.close(accept));
// Test-only CDP and a disposable WebView profile. The native app may read its
// normal preferences; this smoke does not edit settings or touch existing windows.
// No global environment or installed application is changed.
const child = spawn(binary, [textPath, dataPath], {
  cwd: temporary,
  env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: join(temporary, "webview"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (data) => { log = (log + data).slice(-8000); });
child.stderr.on("data", (data) => { log = (log + data).slice(-8000); });
let spawnError;
child.on("error", (error) => { spawnError = error; });
let browser;
let succeeded = false;
try {
  await expect.poll(async () => {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error(`Launcher exited ${child.exitCode}: ${log}`);
    try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { return false; }
  }, { timeout: 30_000 }).toBe(true);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect.poll(() => browser.contexts().flatMap((context) => context.pages()).length).toBeGreaterThan(0);
  const page = browser.contexts().flatMap((context) => context.pages())[0];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator(".version")).toHaveText(`v${metadata.version}`);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.getByRole("region", { name: "JSON-Struktur" })).toContainText("Alpha");
  await expect(page.getByRole("region", { name: "JSON-Struktur" })).toContainText("Beta");
  await page.getByRole("tab", { name: "smoke.txt", exact: true }).click();
  const editor = page.locator(".editor-pane .cm-content");
  await editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText("Saved ä 😀\nSecond line\n");
  await page.keyboard.press("Control+s");
  await expect.poll(() => readFile(textPath, "utf8")).toBe("Saved ä 😀\r\nSecond line\r\n");
  // Real native events must wait while a modal is open and deduplicate paths.
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await expect(page.getByRole("dialog", { name: "Einstellungen" })).toBeVisible();
  await page.evaluate((path) => window.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "open-documents", payload: [path, path] }), queuedPath);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.getByRole("tab", { name: "queued.txt", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("combobox", { name: "Mit Kodierung neu öffnen" }).selectOption("UTF-16LE");
  await expect(page.locator(".editor-pane .cm-content")).toHaveText("你好");
  await page.getByRole("tab", { name: "smoke.txt", exact: true }).click();
  await writeFile(textPath, "External change\r\n");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("Do not overwrite external text");
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("alert")).toContainText("außerhalb");
  expect(await readFile(textPath, "utf8")).toBe("External change\r\n");
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await expect(page.getByRole("dialog", { name: "Einstellungen" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Einstellungen" })).toHaveCount(0);
  await page.screenshot({ path: resolve("test-results/native-windows-smoke.png") });
  expect(errors).toEqual([]);
  // Discard ONLY this script's disposable edits; never address another app window.
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:window|destroy", { label: "main" })).catch((error) => {
    // Native destruction can close CDP before the IPC promise resolves.
    if (!page.isClosed()) throw error;
  });
  succeeded = true;
  console.log(`PASS native Windows v${metadata.version}: startup files, JSONL, Unicode/CRLF save, queued/deduplicated open during modal, external conflict, explicit UTF-16LE reopen, modal UI; ${binary}`);
} finally {
  await browser?.close().catch(() => undefined);
  if (child.exitCode === null) {
    await Promise.race([new Promise((accept) => child.once("exit", accept)), new Promise((accept) => { const timer = setTimeout(accept, 3000); timer.unref(); })]);
    if (child.exitCode === null) child.kill(); // exact owned child only
  }
  if (succeeded) await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  else console.error(`Smoke failed; disposable diagnostics retained at ${temporary}\n${log}`);
}
