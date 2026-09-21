import { expect, test, type Page } from "@playwright/test";
import { fixturePdf, mockDesktop } from "./desktop-mock";

const modeButton = (page: Page, mode: string) => page.getByRole("button", { name: mode, exact: true });

for (const mode of ["edit", "view", "split"]) {
  test(`saved ${mode} default applies on startup and to new tabs`, async ({ page }) => {
    await page.addInitScript((defaultViewMode) => localStorage.setItem("p-viewer.settings", JSON.stringify({ defaultViewMode })), mode);
    await page.goto("/");
    await expect(modeButton(page, mode[0].toUpperCase() + mode.slice(1))).toHaveAttribute("aria-pressed", "true");
    await modeButton(page, "Edit").click();
    await page.keyboard.press("ControlOrMeta+n");
    await expect(page.getByRole("tab")).toHaveCount(2);
    await expect(modeButton(page, mode[0].toUpperCase() + mode.slice(1))).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("tab").first().click();
    await expect(modeButton(page, "Edit")).toHaveAttribute("aria-pressed", "true");
  });
}

test("default and extension rules persist, validate, edit, remove and reset", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await page.getByLabel("Standard-Anzeigemodus", { exact: true }).selectOption("view");
  await page.getByText("Erweitert", { exact: true }).click();
  await page.getByRole("dialog", { name: "Einstellungen" }).getByLabel("Dateiendung", { exact: true }).fill("*.md");
  await page.getByRole("button", { name: "Hinzufügen / ersetzen" }).click();
  await expect(page.getByRole("alert")).toContainText("einzelne Dateiendung");
  await page.getByRole("dialog", { name: "Einstellungen" }).getByLabel("Dateiendung", { exact: true }).fill(" .TXT ");
  await page.getByLabel("Anzeigemodus für Endung", { exact: true }).selectOption("split");
  await page.getByRole("button", { name: "Hinzufügen / ersetzen" }).click();
  await expect(page.getByLabel("Anzeigemodus für .txt", { exact: true })).toHaveValue("split");
  await page.getByRole("button", { name: "Fertig", exact: true }).click();
  // Editing settings does not unexpectedly unmount an already-open editor.
  await expect(modeButton(page, "Edit")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("p-viewer.settings") ?? "{}").extensionViewModes)).toEqual({ txt: "split" });
  await page.reload();
  await expect(modeButton(page, "Split")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await expect(page.getByLabel("Standard-Anzeigemodus", { exact: true })).toHaveValue("view");
  await page.getByText("Erweitert", { exact: true }).click();
  await page.getByLabel("Anzeigemodus für .txt", { exact: true }).selectOption("edit");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("p-viewer.settings") ?? "{}").extensionViewModes)).toEqual({ txt: "edit" });
  await page.getByRole("button", { name: "Regel für .txt entfernen" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("p-viewer.settings") ?? "{}").extensionViewModes)).toEqual({});
  await page.reload();
  await expect(modeButton(page, "View")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await page.getByRole("button", { name: "Standard wiederherstellen" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("p-viewer.settings") ?? "{}").defaultViewMode)).toBe("edit");
  await page.reload();
  await expect(modeButton(page, "Edit")).toHaveAttribute("aria-pressed", "true");
});

test("delayed native settings precede queued files and manual modes survive tab switching", async ({ page }) => {
  await mockDesktop(page, "README.MD", "# Hello");
  await page.addInitScript(() => (window as any).__testNative.deferred.push("plugin:store|get"));
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => typeof (window as any).__testNative.pending["plugin:store|get"])).toBe("function");
  expect(await page.evaluate(() => (window as any).__testNative.calls.some((call: any) => ["read_document", "reveal_window"].includes(call.command)))).toBe(false);
  // Tauri Store.get returns [value, exists].
  await page.evaluate(() => (window as any).__testNative.pending["plugin:store|get"]([{ defaultViewMode: "view", extensionViewModes: { md: "split", txt: "edit" } }, true]));
  await expect(page.getByRole("tab", { name: "README.MD", exact: true })).toBeVisible();
  await expect(modeButton(page, "Split")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => (window as any).__testNative.calls.some((call: any) => call.command === "reveal_window"))).toBe(true);
  await modeButton(page, "Edit").click();
  await page.evaluate(() => (window as any).__testNative.openDocuments(["C:/fixtures/code.js"]));
  await expect(page.getByRole("tab", { name: "code.js", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(modeButton(page, "View")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "README.MD", exact: true }).click();
  await expect(modeButton(page, "Edit")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "code.js", exact: true }).click();
  await expect(modeButton(page, "View")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ControlOrMeta+n");
  await expect(modeButton(page, "Edit")).toHaveAttribute("aria-pressed", "true");
});

test("startup tab transfer keeps its explicit mode after slow settings load", async ({ page }) => {
  await mockDesktop(page, "unused.txt", "");
  await page.addInitScript(() => {
    const control = (window as any).__testNative;
    control.pendingPaths = [];
    control.deferred.push("plugin:store|get");
    control.transferredTabs.push({ dropX: null, dropY: null, tab: JSON.stringify({ version: 1, mode: "split", document: {
      path: "", name: "Moved.md", content: "# Moved", savedContent: "", encoding: "UTF-8", hasBom: false, lineEnding: "lf", size: 0, lossy: false, untitled: true, metadataDirty: false,
      fileType: { kind: "markdown", language: "markdown", label: "Markdown" },
    } }) });
  });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => typeof (window as any).__testNative.pending["plugin:store|get"])).toBe("function");
  await page.evaluate(() => (window as any).__testNative.pending["plugin:store|get"]([{ defaultViewMode: "view", extensionViewModes: { md: "edit" } }, true]));
  await expect(page.getByRole("tab", { name: "Moved.md Ungespeichert", exact: true })).toBeVisible();
  await expect(modeButton(page, "Split")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".editor-pane .cm-content")).toHaveText("# Moved");
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await page.getByLabel("Standard-Anzeigemodus", { exact: true }).selectOption("split");
  await expect.poll(() => page.evaluate(() => (window as any).__testNative.calls.filter((call: any) => call.command === "plugin:store|set").at(-1)?.args.value.defaultViewMode)).toBe("split");
  await expect.poll(() => page.evaluate(() => (window as any).__testNative.calls.some((call: any) => call.command === "plugin:store|save"))).toBe(true);
});

for (const extension of ["png", "pdf"]) {
  test(`${extension} remains a full-width read-only viewer despite an Edit override`, async ({ page }) => {
    await mockDesktop(page, `file.${extension}`, extension === "pdf" ? fixturePdf(1) : "");
    await page.addInitScript((extension) => {
      const original = (window as any).__TAURI_INTERNALS__.invoke;
      (window as any).__TAURI_INTERNALS__.invoke = (command: string, args: unknown) => command === "plugin:store|get"
        ? Promise.resolve([{ defaultViewMode: "split", extensionViewModes: { [extension]: "edit" } }, true]) : original(command, args);
    }, extension);
    await page.goto("/");
    await expect(page.getByRole("tab", { name: `file.${extension}`, exact: true })).toBeVisible();
    await expect(page.locator(".editor-pane")).toHaveCount(0);
    await expect(page.locator(".workspace")).not.toHaveClass(/split/);
    await expect(modeButton(page, "Edit")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Dokument speichern unter" })).toBeDisabled();
  });
}

test("dark gutter is darker than content and remains readable; light theme is unchanged", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cm-gutters")).toHaveCSS("background-color", "rgb(30, 34, 41)");
  await expect(page.locator(".cm-editor")).toHaveCSS("background-color", "rgb(40, 44, 52)");
  await expect(page.locator(".cm-gutters")).toHaveCSS("color", "rgb(146, 155, 171)");
  await expect(page.locator(".cm-activeLineGutter").first()).toHaveCSS("background-color", "rgb(37, 42, 51)");
  await page.screenshot({ path: "test-results/settings-dark-gutter.png" });
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await page.getByRole("button", { name: "Hell", exact: true }).click();
  await page.getByText("Erweitert", { exact: true }).click();
  await page.screenshot({ path: "test-results/settings-light-modes.png" });
  await page.getByRole("button", { name: "Fertig", exact: true }).click();
  await expect(page.locator(".cm-gutters")).toHaveCSS("background-color", "rgb(245, 246, 248)");
});
