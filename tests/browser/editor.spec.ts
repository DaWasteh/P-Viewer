import { expect, test, type Page } from "@playwright/test";

async function enterText(page: Page, content: string) {
  const editor = page.locator(".editor-pane .cm-content");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(content);
}
async function selectExtension(page: Page, extension: string) {
  const choice = await page.locator("#file-type-choice option").evaluateAll((options, ext) => {
    return (options as HTMLOptionElement[]).find((option) => option.textContent?.includes(`(.${ext})`))?.value;
  }, extension);
  expect(choice).toBeTruthy();
  await page.getByLabel("Dateityp", { exact: true }).selectOption(choice!);
}

test.beforeEach(async ({ page }) => { await page.goto("/"); await expect(page.locator(".cm-editor")).toBeVisible(); });

test("tab switch retains text, selection and undo history", async ({ page }) => {
  await enterText(page, "Alpha Beta");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ControlOrMeta+n");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await enterText(page, "Second tab");
  await page.getByRole("tab").first().click();
  await expect(page.locator(".editor-pane .cm-content")).toHaveText("Alpha Beta");
  await expect(page.locator(".statusbar")).toContainText("Ln 1, Sp 2");
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".editor-pane .cm-content")).toHaveText("");
  await page.getByRole("tab").nth(1).click();
  await expect(page.locator(".editor-pane .cm-content")).toHaveText("Second tab");
});

test("settings are keyboard-modal and restore editor focus", async ({ page }) => {
  await enterText(page, "Do not change");
  await page.keyboard.press("ControlOrMeta+,");
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
  await page.keyboard.insertText("Oops");
  await page.keyboard.press("ControlOrMeta+n");
  await expect(page.getByRole("tab")).toHaveCount(1);
  for (let i = 0; i < 45; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".cm-content")).toHaveText("Do not change");
  await expect(page.locator(".cm-content")).toBeFocused();
});

test("paste-without-formatting no longer switches to View", async ({ page }) => {
  await enterText(page, "Text");
  await page.keyboard.press("ControlOrMeta+Shift+v");
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ControlOrMeta+Shift+r");
  await expect(page.getByRole("button", { name: "View", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("Markdown split adapts to pane width and malformed fragments do not throw", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await selectExtension(page, "md");
  await enterText(page, "# Dokument\n\nEin lesbarer Absatz mit **Formatierung**.\n\n[x](#%ZZ)\n\n## Zweiter Abschnitt\n\nText.");
  await page.setViewportSize({ width: 900, height: 750 });
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.locator(".markdown-body h1")).toContainText("Dokument");
  await expect(page.getByRole("complementary", { name: "Dokumentgliederung" })).toHaveCount(0);
  expect((await page.locator(".markdown-body").boundingBox())!.width).toBeGreaterThan(350);
  await page.locator(".markdown-body").getByRole("link", { name: "x", exact: true }).click();
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/markdown-split-900.png" });
  await page.getByRole("button", { name: "View", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Dokumentgliederung" })).toBeVisible();
});

test("JSONL renders records and deeply nested JSON produces a recoverable notice", async ({ page }) => {
  await selectExtension(page, "jsonl");
  await enterText(page, '{"name":"Alpha"}\n{"name":"Beta"}');
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.getByRole("region", { name: "JSON-Struktur" })).toContainText("Alpha");
  await expect(page.getByRole("region", { name: "JSON-Struktur" })).toContainText("Beta");
  await enterText(page, "[".repeat(20_000) + "0" + "]".repeat(20_000));
  await expect(page.getByRole("alert")).toContainText("Verschachtelung");
  await enterText(page, '{"recovered":true}');
  await expect(page.getByRole("region", { name: "JSON-Struktur" })).toContainText("recovered");
});

test("safe HTML and SVG block active content and remote resources", async ({ page }) => {
  const remote: import("@playwright/test").Request[] = [];
  page.on("request", (request) => { if (request.url().includes("preview-test.invalid")) remote.push(request); });
  await selectExtension(page, "html");
  await enterText(page, '<h1>Safe document</h1><script>parent.__previewEscaped = true; fetch("https://preview-test.invalid/script")</script><img src="https://preview-test.invalid/image"><style>@import url("https://preview-test.invalid/css"); h1 { background: url("https://preview-test.invalid/background") }</style><form action="https://preview-test.invalid/post"><input autofocus></form>');
  await page.getByRole("button", { name: "Split", exact: true }).click();
  const frame = page.frameLocator('iframe[title^="Sichere HTML"]');
  await expect(frame.getByRole("heading", { name: "Safe document" })).toBeVisible();
  await expect(page.locator('iframe[title^="Sichere HTML"]')).toHaveAttribute("sandbox", "");
  await expect(frame.locator("script, form, input")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__previewEscaped)).toBeUndefined();
  await selectExtension(page, "svg");
  await enterText(page, '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" onload="parent.__previewEscaped=true"><script>fetch("https://preview-test.invalid/svg")</script><image href="https://preview-test.invalid/svg-image"/><circle cx="50" cy="50" r="40" fill="rebeccapurple"/></svg>');
  await expect(page.locator('iframe[title^="Sichere SVG"]')).toBeVisible();
  await expect(page.locator('iframe[title^="Sichere SVG"]')).toHaveAttribute("sandbox", "");
  expect(await page.evaluate(() => (window as any).__previewEscaped)).toBeUndefined();
  // Chromium reports CSS url() attempts even when CSP stops them before networking.
  // A DNS/HTTP failure is NOT accepted as evidence of containment.
  await expect.poll(() => remote.every((request) => /csp/i.test(request.failure()?.errorText ?? ""))).toBe(true);
});

test("notebook bare LaTeX and live TeX render offline, light theme persists", async ({ page }) => {
  await selectExtension(page, "ipynb");
  await enterText(page, JSON.stringify({ cells: [{ cell_type: "code", source: "x = 2", outputs: [{ output_type: "display_data", data: { "text/latex": "x^2" } }] }] }));
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.locator(".notebook-preview .katex")).toBeVisible();
  await selectExtension(page, "tex");
  await enterText(page, "\\section{Mathematik}\nEine Formel: $x^2 + y^2 = z^2$.");
  await expect(page.locator(".latex-preview .katex")).toBeVisible();
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await page.getByRole("button", { name: "Hell", exact: true }).click();
  await page.getByRole("button", { name: "Fertig", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/light/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("p-viewer.settings") ?? "{}").theme)).toBe("light");
  await page.screenshot({ path: "test-results/latex-light.png" });
});

test("CSV mounts at most the aggregate cell budget", async ({ page }) => {
  await selectExtension(page, "csv");
  await enterText(page, Array(1000).fill(Array(100).fill("x").join(",")).join("\n"));
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.locator(".csv-notice")).toContainText("200 Zeilen");
  expect(await page.locator(".csv-preview td").count()).toBeLessThanOrEqual(20_000 + 200);
  await expect(page.getByRole("button", { name: "Kopfzeile", exact: true })).toHaveAttribute("aria-pressed", "true");
});
