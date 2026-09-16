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
  await page.evaluate(() => (window as any).__testNative.openDocuments(["C:/fixtures/queued.txt", "C:/fixtures/queued.txt"]));
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

test("closing the last tab closes the window instead of spawning an untitled tab", async ({ page }) => {
  await mockDesktop(page, "only.txt", "Only document");
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "only.txt", exact: true })).toBeVisible();
  await page.locator(".editor-pane .cm-content").click();
  await page.keyboard.insertText("!");
  // Unsaved changes: the declined confirmation must protect the window.
  await page.evaluate(() => { (window as any).__testNative.dialogAnswer = "Abbrechen"; });
  await page.getByRole("button", { name: "„only.txt“ schließen" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__testNative.calls.some((call: any) => call.command === "plugin:dialog|message"))).toBe(true);
  await expect(page.getByRole("tab", { name: "only.txt Ungespeichert", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__testNative.calls.some((call: any) => call.command === "plugin:window|destroy"))).toBe(false);
  // Back to the saved text: the tab is clean again and may close without a prompt.
  await page.locator(".editor-pane .cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("Only document");
  await expect(page.locator(".tab-shell.active .dirty-indicator")).toHaveCount(0);
  await page.getByRole("button", { name: "„only.txt“ schließen" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__testNative.calls.filter((call: any) => call.command === "plugin:window|destroy").length)).toBe(1);
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "Unbenannt.txt", exact: true })).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+n");
  await expect.poll(() => page.evaluate(() => (window as any).__testNative.calls.some((call: any) => call.command === "open_new_window"))).toBe(true);
});

test("tabs reorder by dragging and move between windows", async ({ page }) => {
  await mockDesktop(page, "first.md", "# First");
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "first.md", exact: true })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+n");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab").nth(1)).toHaveText(/Unbenannt\.txt/);

  // Drag the first tab past the second one: order flips, nothing detaches.
  const first = (await page.getByRole("tab", { name: "first.md", exact: true }).boundingBox())!;
  const second = (await page.getByRole("tab", { name: "Unbenannt.txt", exact: true }).boundingBox())!;
  await page.mouse.move(first.x + 20, first.y + first.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(first.x + 20 + ((second.x + second.width - first.x) * step) / 8, first.y + first.height / 2);
  }
  await page.mouse.up();
  await expect(page.getByRole("tab").nth(0)).toHaveText(/Unbenannt\.txt/);
  await expect(page.getByRole("tab").nth(1)).toHaveText(/first\.md/);
  expect(await page.evaluate(() => (window as any).__testNative.calls.some((call: any) => call.command === "move_tab_to_window"))).toBe(false);

  // Dropping far below the strip hands the tab to Rust, which decides on the target window.
  const moving = (await page.getByRole("tab", { name: "first.md", exact: true }).boundingBox())!;
  await page.mouse.move(moving.x + 20, moving.y + moving.height / 2);
  await page.mouse.down();
  await page.mouse.move(moving.x + 40, moving.y + 120);
  await page.mouse.move(moving.x + 60, moving.y + 260);
  await page.mouse.up();
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "first.md", exact: true })).toHaveCount(0);
  const move = await page.evaluate(() => (window as any).__testNative.calls.find((call: any) => call.command === "move_tab_to_window").args);
  expect(move.insideSource).toBe(true);
  expect(move.allowNewWindow).toBe(true);
  const transfer = JSON.parse(move.tab);
  expect(transfer.document.name).toBe("first.md");
  expect(transfer.document.content).toBe("# First");
  expect(transfer.document.path).toBe("C:/fixtures/first.md");

  // A tab arriving from another window shows up selected with its unsaved edits.
  await page.evaluate((tab) => (window as any).__testNative.transferTabs([{ tab, dropX: null, dropY: null }]), JSON.stringify({ ...transfer, document: { ...transfer.document, name: "moved.md", path: "C:/fixtures/moved.md", content: "# Moved (edited)" }, mode: "split" }));
  await expect(page.getByRole("tab", { name: "moved.md Ungespeichert", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".editor-pane .cm-content")).toHaveText("# Moved (edited)");
  await expect(page.locator(".tab-shell.active .dirty-indicator")).toBeVisible();
  await expect(page.getByRole("button", { name: "Split", exact: true })).toHaveAttribute("aria-pressed", "true");

  // The pristine untitled tab was replaced, so the moved document is the only tab left;
  // the last remaining tab is never moved into a new window from inside its own window.
  await expect(page.getByRole("tab")).toHaveCount(1);
  const last = (await page.getByRole("tab", { name: "moved.md Ungespeichert", exact: true }).boundingBox())!;
  await page.mouse.move(last.x + 20, last.y + last.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + 40, last.y + 260);
  await page.mouse.up();
  await expect(page.getByRole("tab")).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__testNative.calls.filter((call: any) => call.command === "move_tab_to_window").length)).toBe(1);
});
