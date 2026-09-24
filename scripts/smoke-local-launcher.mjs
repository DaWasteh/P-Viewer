import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
import { chromium, expect } from "@playwright/test";

if (process.platform !== "win32") throw new Error("This smoke exercises the native Windows launcher/WebView2 only.");
// P-Viewer is single-instance: with another P-Viewer running, the spawned
// launcher would forward its documents to that instance and exit immediately.
const binary = resolve(process.argv[2] ?? "P-Viewer.exe");
const metadata = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const temporary = await mkdtemp(join(tmpdir(), "p-viewer-smoke-"));
await mkdir(resolve("test-results"), { recursive: true });
const textPath = join(temporary, "smoke.txt");
const dataPath = join(temporary, "records.jsonl");
const queuedPath = join(temporary, "queued.txt");
const imagePath = join(temporary, "pixel.png");
await writeFile(queuedPath, Buffer.from("你好", "utf16le"));
// 2×2 PNG: the binary document path must go through the real Rust signature check.
await writeFile(imagePath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVQIW2P8z8Dwn4GBgYGJAQoAADgVAgLkOfJKAAAAAElFTkSuQmCC", "base64"));
await writeFile(textPath, "Original\r\n", "utf8");
await writeFile(dataPath, '{"record":"Alpha"}\n{"record":"Beta"}', "utf8");
// Session and recovery files go to a disposable folder, never the user's real session.
const sessionPath = join(temporary, "session");
async function freePort() {
  const server = createServer();
  await new Promise((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
  const port = server.address().port;
  await new Promise((accept) => server.close(accept));
  return port;
}
const port = await freePort();
// Test-only CDP and a disposable WebView profile. The native app may read its
// normal preferences; this smoke does not edit settings or touch existing windows.
// Like any regular run it may update the remembered window geometry
// (.window-state.json) with where its own window ended up.
// No global environment or installed application is changed.
const child = spawn(binary, [textPath, dataPath, imagePath], {
  cwd: temporary,
  env: { ...process.env, P_VIEWER_SESSION_DIR: sessionPath, WEBVIEW2_USER_DATA_FOLDER: join(temporary, "webview"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
/** Starts another launcher process; the running instance must take over its arguments so it exits at once. */
async function runSecondInstance(args) {
  const second = spawn(binary, args, { cwd: temporary, env: { ...process.env, P_VIEWER_SESSION_DIR: sessionPath, WEBVIEW2_USER_DATA_FOLDER: join(temporary, "webview-second") }, stdio: ["ignore", "pipe", "pipe"] });
  second.stdout.on("data", (data) => { log = (log + data).slice(-8000); });
  second.stderr.on("data", (data) => { log = (log + data).slice(-8000); });
  const exited = await Promise.race([
    new Promise((accept) => second.once("exit", () => accept(true))),
    new Promise((accept) => { const timer = setTimeout(() => accept(false), 15_000); timer.unref(); }),
  ]);
  if (!exited) { second.kill(); throw new Error("Second P-Viewer instance kept running instead of forwarding to the first one."); }
  return second;
}
child.stdout.on("data", (data) => { log = (log + data).slice(-8000); });
child.stderr.on("data", (data) => { log = (log + data).slice(-8000); });
let spawnError;
child.on("error", (error) => { spawnError = error; });
let browser;
let relaunched;
let relaunchedBrowser;
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
  await expect(page.getByRole("tab")).toHaveCount(3);
  // The window starts hidden and is shown by the frontend once it has painted.
  // WebView2 reports the page hidden while its window is hidden.
  await expect.poll(() => page.evaluate(() => document.visibilityState), { timeout: 10_000 }).toBe("visible");
  await page.getByRole("tab", { name: "pixel.png", exact: true }).click();
  await expect(page.getByRole("img", { name: "pixel.png" })).toBeVisible();
  await expect(page.locator(".image-preview .dimensions")).toContainText("2 × 2 px");
  await expect(page.getByRole("button", { name: "Dokument speichern unter" })).toBeDisabled();
  await expect(page.locator(".editor-pane")).toHaveCount(0);
  await page.getByRole("tab", { name: "records.jsonl", exact: true }).click();
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.getByRole("region", { name: "JSON-Struktur" })).toContainText("Alpha");
  await expect(page.getByRole("region", { name: "JSON-Struktur" })).toContainText("Beta");
  await page.getByRole("tab", { name: "smoke.txt", exact: true }).click();
  const editor = page.locator(".editor-pane .cm-content");
  // CodeMirror injects its styles at runtime; under the real Tauri CSP they must
  // still apply (v0.1.5 lost them to CSP hashes for an inline <style> in app.html).
  expect(await page.locator(".editor-pane .cm-editor").evaluate((element) => getComputedStyle(element).display)).toBe("flex");
  expect(await editor.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("JetBrains Mono");
  await editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText("Saved ä 😀\nSecond line\n");
  await page.keyboard.press("Control+s");
  await expect.poll(() => readFile(textPath, "utf8")).toBe("Saved ä 😀\r\nSecond line\r\n");
  // Real single-instance forwarding: a second process hands its files to this
  // window and exits. The window must wait while a modal is open and deduplicate paths.
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await expect(page.getByRole("dialog", { name: "Einstellungen" })).toBeVisible();
  const forwarder = await runSecondInstance([queuedPath, queuedPath]);
  expect(forwarder.exitCode).toBe(0);
  await expect(page.getByRole("tab")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab")).toHaveCount(4);
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
  // Find and replace widget: its styles are injected at runtime like CodeMirror's own.
  await editor.click();
  await page.keyboard.press("Control+f");
  await expect(page.locator(".pv-find")).toBeVisible();
  expect(await page.locator(".pv-find").evaluate((element) => getComputedStyle(element).display)).toBe("flex");
  await page.keyboard.press("Escape");
  await expect(page.locator(".pv-find")).toHaveCount(0);
  // JavaScript macros run in a blob worker, which the real CSP must allow while
  // keeping eval out of the app; the run is one undoable change.
  await page.keyboard.press("Control+Shift+H");
  const batch = page.getByRole("dialog", { name: "Mehrfach ersetzen und Makros" });
  await batch.getByRole("tab", { name: "JavaScript" }).click();
  await batch.locator("#batch-script").fill("return text.toUpperCase();");
  await batch.getByRole("button", { name: "Anwenden", exact: true }).click();
  await expect(batch).toHaveCount(0);
  await expect(editor).toContainText("DO NOT OVERWRITE EXTERNAL TEXT");
  await page.keyboard.press("Control+z");
  await expect(editor).toContainText("Do not overwrite external text");
  await page.screenshot({ path: resolve("test-results/native-windows-smoke.png") });

  // A launch without files opens a second window inside the running process.
  const opener = await runSecondInstance([]);
  expect(opener.exitCode).toBe(0);
  const pages = () => browser.contexts().flatMap((context) => context.pages());
  await expect.poll(() => pages().length, { timeout: 20_000 }).toBe(2);
  const second = pages().find((candidate) => candidate !== page);
  const secondLabel = await second.evaluate(() => window.__TAURI_INTERNALS__.metadata.currentWindow.label);
  expect(secondLabel).toMatch(/^main-[0-9]+$/);
  await expect(second.getByRole("tab", { name: "Unbenannt.txt", exact: true })).toBeVisible();
  // An explicit hand-over goes through the Rust queue, the signal and the pull of the target window.
  const handover = { version: 1, mode: "edit", document: { path: "", name: "Handover.txt", content: "Moved between windows", savedContent: "Moved between windows", encoding: "UTF-8", hasBom: false, lineEnding: "lf", size: 0, lossy: false, untitled: true, metadataDirty: false, fileType: { kind: "text", language: "plaintext", label: "Text" } } };
  await page.evaluate(([tab, target]) => window.__TAURI_INTERNALS__.invoke("move_tab_to_window", { tab, target, insideSource: false, allowNewWindow: false }), [JSON.stringify(handover), secondLabel]);
  await expect(second.getByRole("tab", { name: "Handover.txt", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(second.locator(".editor-pane .cm-content")).toHaveText("Moved between windows");
  await expect(second.getByRole("tab")).toHaveCount(1);
  // Closing the last (clean) tab closes that window; the first window stays.
  await second.getByRole("button", { name: "„Handover.txt“ schließen" }).click();
  await expect.poll(() => pages().filter((candidate) => !candidate.isClosed()).length, { timeout: 20_000 }).toBe(1);
  await expect(page.getByRole("tab")).toHaveCount(4);
  expect(errors).toEqual([]);
  // The session and the unsaved text of smoke.txt reached the disposable session folder.
  await expect.poll(async () => {
    try {
      const stored = JSON.parse(await readFile(join(sessionPath, "session.json"), "utf8"));
      return stored.windows.map((window) => window.session.tabs.length);
    } catch { return []; }
  }, { timeout: 10_000 }).toEqual([4]);
  await expect.poll(async () => (await readdir(join(sessionPath, "recovery")).catch(() => [])).length, { timeout: 10_000 }).toBe(1);
  // Discard ONLY this script's disposable edits; never address another app window.
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:window|destroy", { label: "main" })).catch((error) => {
    // Native destruction can close CDP before the IPC promise resolves.
    if (!page.isClosed()) throw error;
  });
  await Promise.race([new Promise((accept) => child.once("exit", accept)), new Promise((accept) => { const timer = setTimeout(accept, 10_000); timer.unref(); })]);
  if (child.exitCode === null) throw new Error("The first P-Viewer process did not exit after its window was destroyed.");

  // Restart without files: the previous session comes back, unsaved text included,
  // and the external change to smoke.txt is reported instead of being overwritten.
  const relaunchPort = await freePort();
  relaunched = spawn(binary, [], {
    cwd: temporary,
    env: { ...process.env, P_VIEWER_SESSION_DIR: sessionPath, WEBVIEW2_USER_DATA_FOLDER: join(temporary, "webview"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${relaunchPort} --remote-debugging-address=127.0.0.1` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  relaunched.stdout.on("data", (data) => { log = (log + data).slice(-8000); });
  relaunched.stderr.on("data", (data) => { log = (log + data).slice(-8000); });
  await expect.poll(async () => {
    try { return (await fetch(`http://127.0.0.1:${relaunchPort}/json/version`)).ok; } catch { return false; }
  }, { timeout: 30_000 }).toBe(true);
  relaunchedBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${relaunchPort}`);
  await expect.poll(() => relaunchedBrowser.contexts().flatMap((context) => context.pages()).length).toBeGreaterThan(0);
  const restored = relaunchedBrowser.contexts().flatMap((context) => context.pages())[0];
  await expect(restored.getByRole("tab")).toHaveCount(4);
  await expect(restored.getByRole("tab", { name: "smoke.txt Ungespeichert" })).toBeVisible();
  await restored.getByRole("tab", { name: "smoke.txt Ungespeichert" }).click();
  await expect(restored.locator(".editor-pane .cm-content")).toContainText("Do not overwrite external text");
  await expect(restored.getByRole("status").filter({ hasText: "außerhalb von P-Viewer geändert" })).toBeVisible();
  expect(await readFile(textPath, "utf8")).toBe("External change\r\n");
  await restored.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:window|destroy", { label: "main" })).catch((error) => {
    if (!restored.isClosed()) throw error;
  });
  succeeded = true;
  console.log(`PASS native Windows v${metadata.version}: startup files, PNG viewer, JSONL, Unicode/CRLF save, single-instance forwarding during modal, external conflict, explicit UTF-16LE reopen, modal UI, find widget, second window with tab hand-over and last-tab close, session restore with recovered text after restart; ${binary}`);
} finally {
  await browser?.close().catch(() => undefined);
  await relaunchedBrowser?.close().catch(() => undefined);
  if (relaunched && relaunched.exitCode === null) {
    await Promise.race([new Promise((accept) => relaunched.once("exit", accept)), new Promise((accept) => { const timer = setTimeout(accept, 3000); timer.unref(); })]);
    if (relaunched.exitCode === null) relaunched.kill();
  }
  if (child.exitCode === null) {
    await Promise.race([new Promise((accept) => child.once("exit", accept)), new Promise((accept) => { const timer = setTimeout(accept, 3000); timer.unref(); })]);
    if (child.exitCode === null) child.kill(); // exact owned child only
  }
  if (succeeded) await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  else console.error(`Smoke failed; disposable diagnostics retained at ${temporary}\n${log}`);
}
