import { expect, test } from "@playwright/test";
import { fixturePdf, mockDesktop } from "./desktop-mock";

test("delayed LaTeX build stays stale and a 1000-page PDF keeps one canvas", async ({ page }) => {
  await mockDesktop(page, "paper.tex", "Source A");
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "paper.tex", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await page.locator(".compile-button").click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__testNative.pending.compile_latex)).toBe("function");
  await page.locator(".editor-pane .cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("Source B");
  await page.evaluate((pdf) => (window as any).__testNative.pending.compile_latex({ success: true, pdfBase64: pdf, durationMs: 1, log: "", engine: "test", engineLabel: "Mock compiler" }), fixturePdf(1000));
  await expect(page.getByText("PDF ist älter als der Text")).toBeVisible();
  await expect(page.locator(".pdf-page canvas")).toHaveCount(1);
  await expect(page.locator(".pdf-state")).toHaveCount(0);
  await page.getByRole("spinbutton", { name: "PDF-Seite" }).fill("1000");
  await page.getByRole("spinbutton", { name: "PDF-Seite" }).press("Enter");
  await expect(page.locator('.pdf-page[aria-label="PDF-Seite 1000"]')).toBeVisible();
  await expect(page.locator(".pdf-page canvas")).toHaveCount(1);
  const pixels = await page.locator(".pdf-page canvas").evaluate((canvas: HTMLCanvasElement) => canvas.width * canvas.height);
  expect(pixels).toBeLessThanOrEqual(8_000_000);
  await page.keyboard.press("ControlOrMeta+n");
  await expect(page.locator(".pdf-viewer")).toHaveCount(0);
});

test("HTML preview opened after owner unmount is immediately closed", async ({ page }) => {
  await mockDesktop(page, "page.html", "<h1>Safe</h1>");
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "page.html", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await page.locator(".full-preview-button").click();
  await page.locator('dialog button[value="confirm"]').click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__testNative.pending.open_full_html_preview)).toBe("function");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.evaluate(() => (window as any).__testNative.pending.open_full_html_preview({ token: "late-session" }));
  await expect.poll(() => page.evaluate(() => (window as any).__testNative.calls.filter((call: any) => call.command === "close_full_html_preview" && call.args.token === "late-session").length)).toBe(1);
});

test("external opens queue and deduplicate during an in-flight save", async ({ page }) => {
  await mockDesktop(page, "saved.txt", "Before");
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "saved.txt", exact: true })).toBeVisible();
  await page.locator(".editor-pane .cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("After");
  await page.evaluate(() => (window as any).__testNative.deferred.push("write_document"));
  await page.keyboard.press("ControlOrMeta+s");
  await expect.poll(() => page.evaluate(() => typeof (window as any).__testNative.pending.write_document)).toBe("function");
  await page.evaluate(() => (window as any).__testNative.emit("open-documents", ["C:/fixtures/queued.txt", "C:/fixtures/queued.txt"]));
  await expect(page.getByRole("tab")).toHaveCount(1);
  await page.evaluate(() => (window as any).__testNative.pending.write_document({ path: "C:/fixtures/saved.txt", size: 5, version: "new-version" }));
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab", { name: "queued.txt", exact: true })).toHaveAttribute("aria-selected", "true");
  const version = await page.evaluate(() => (window as any).__testNative.calls.find((call: any) => call.command === "write_document").args.expectedVersion);
  expect(version).toBe("fixture-version");
});

test("update installation freezes background editing until the mocked restart", async ({ page }) => {
  await mockDesktop(page, "saved.txt", "Saved document");
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "saved.txt", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Auf Updates prüfen", exact: true }).click();
  await page.getByRole("button", { name: "Signiert laden und installieren" }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__testNative.pending.download_and_install_update)).toBe("function");
  await expect(page.locator(".editor-pane .cm-content")).toHaveAttribute("contenteditable", "false");
  await page.keyboard.press("ControlOrMeta+n");
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Update-Dialog schließen" })).toBeDisabled();
  await page.evaluate(() => (window as any).__testNative.pending.download_and_install_update(null));
  await expect.poll(() => page.evaluate(() => (window as any).__testNative.calls.some((call: any) => call.command === "plugin:process|restart"))).toBe(true);
});

test("images open as a read-only viewer without editor, save or type switch", async ({ page }) => {
  await mockDesktop(page, "photo.png", "");
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "photo.png", exact: true })).toBeVisible();
  await expect(page.locator(".editor-pane")).toHaveCount(0);
  const image = page.getByRole("img", { name: "photo.png" });
  await expect(image).toBeVisible();
  await expect(page.locator(".image-preview .dimensions")).toContainText("2 × 2 px");
  await expect(page.getByRole("button", { name: "Dokument speichern unter" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Dateityp", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Dateityp", { exact: true }).locator("option:checked")).toHaveText("PNG-Bild (.png)");
  await expect(page.locator(".statusbar")).toContainText("Schreibgeschützt");
  await page.keyboard.press("ControlOrMeta+s");
  expect(await page.evaluate(() => (window as any).__testNative.calls.some((call: any) => call.command === "write_document"))).toBe(false);
  await page.getByRole("button", { name: "Vergrößern" }).click();
  await expect(page.locator(".image-preview .zoom-value")).toHaveText("125 %");
  expect(await image.evaluate((element) => (element as HTMLImageElement).getBoundingClientRect().width)).toBeCloseTo(3, 0);
  await page.screenshot({ path: "test-results/image-viewer.png" });
  await page.keyboard.press("ControlOrMeta+n");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.locator(".editor-pane .cm-content")).toBeVisible();
  // A split mode chosen for a text tab must not halve the image viewer.
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await page.getByRole("tab", { name: "photo.png", exact: true }).click();
  await expect(page.locator(".workspace")).not.toHaveClass(/split/);
  const workspaceWidth = (await page.locator(".workspace").boundingBox())!.width;
  expect((await page.locator(".viewer-pane").boundingBox())!.width).toBeCloseTo(workspaceWidth, 0);
});
