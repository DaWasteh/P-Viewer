import { expect, test, type Page } from "@playwright/test";
import { mockDesktop } from "./desktop-mock";

const native = (page: Page) => page.evaluate(() => (window as any).__testNative.calls as Array<{ command: string; args: any }>);
const openDocuments = (page: Page, paths: string[]) => page.evaluate((list) => (window as any).__testNative.openDocuments(list), paths);
const editor = (page: Page) => page.locator(".editor-pane .cm-content");

test("formatting toolbar writes undoable Markdown and only appears for Markdown and HTML", async ({ page }) => {
  await mockDesktop(page, "notes.md", "Hallo Welt");
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "notes.md", exact: true })).toBeVisible();
  const toolbar = page.getByRole("toolbar", { name: "Markdown-Formatierung" });
  await expect(toolbar).toBeVisible();

  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Home");
  for (let step = 0; step < 5; step++) await page.keyboard.press("Shift+ArrowRight");
  await toolbar.getByRole("button", { name: "Fett", exact: true }).click();
  await expect(editor(page)).toHaveText("**Hallo** Welt");
  await page.keyboard.press("ControlOrMeta+i");
  await expect(editor(page)).toHaveText("***Hallo*** Welt");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor(page)).toHaveText("**Hallo** Welt");

  await toolbar.getByRole("button", { name: "Überschrift", exact: true }).click();
  await page.getByRole("menuitem", { name: "Überschrift 2" }).click();
  await expect(editor(page)).toHaveText("## **Hallo** Welt");

  await page.keyboard.press("ControlOrMeta+k");
  const link = page.getByRole("dialog", { name: "Link einfügen" });
  await expect(link.getByLabel("Adresse (URL)")).toBeFocused();
  await link.getByLabel("Adresse (URL)").fill("https://example.com");
  await link.getByLabel("Adresse (URL)").press("Enter");
  await expect(editor(page)).toHaveText("## **[Hallo](https://example.com)** Welt");

  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.locator(".markdown-body h2 strong a")).toHaveText("Hallo");

  // Source code files keep the plain editor in the automatic mode.
  await openDocuments(page, ["C:/fixtures/main.py"]);
  await expect(page.getByRole("tab", { name: "main.py", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("toolbar", { name: /Formatierung/ })).toHaveCount(0);
});

test("find and replace works like VS Code with counter, replace all and undo", async ({ page }) => {
  await mockDesktop(page, "text.txt", "eins zwei eins drei eins");
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "text.txt", exact: true })).toBeVisible();
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+f");
  const find = page.getByLabel("Suchen", { exact: true });
  await expect(find).toBeFocused();
  await find.fill("eins");
  await expect(page.locator(".pv-find-count")).toHaveText("1 von 3");
  await find.press("Enter");
  await expect(page.locator(".pv-find-count")).toHaveText("2 von 3");
  await find.press("Shift+Enter");
  await expect(page.locator(".pv-find-count")).toHaveText("1 von 3");

  await page.keyboard.press("ControlOrMeta+h");
  const replace = page.getByLabel("Ersetzen", { exact: true });
  await expect(replace).toBeFocused();
  await replace.fill("EINS");
  await page.getByRole("button", { name: "Alle", exact: true }).click();
  await expect(editor(page)).toHaveText("EINS zwei EINS drei EINS");

  await page.getByRole("button", { name: "Groß-/Kleinschreibung beachten (Alt+C)" }).click();
  await expect(page.locator(".pv-find-count")).toHaveText("Keine Treffer");
  await find.press("Escape");
  await expect(page.locator(".pv-find")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor(page)).toHaveText("eins zwei eins drei eins");
});

test("tab context menu acts on the right-clicked tab, protects pinned tabs and can be undone", async ({ page }) => {
  await mockDesktop(page, "a.md", "A");
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "a.md", exact: true })).toBeVisible();
  await openDocuments(page, ["C:/fixtures/b.md", "C:/fixtures/c.md", "C:/fixtures/d.md"]);
  await expect(page.getByRole("tab")).toHaveCount(4);

  await page.getByRole("tab", { name: "c.md", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Anheften" }).click();
  await expect(page.getByRole("tab").first()).toHaveAccessibleName("c.md Angeheftet");

  await page.getByRole("tab", { name: "b.md", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Andere schließen" }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab", { name: "b.md", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "c.md Angeheftet" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "2 Tabs geschlossen" })).toBeVisible();
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByRole("tab")).toHaveCount(4);

  await page.keyboard.press("ControlOrMeta+w");
  await expect(page.getByRole("tab")).toHaveCount(3);
  await page.keyboard.press("ControlOrMeta+Shift+t");
  await expect(page.getByRole("tab")).toHaveCount(4);

  await page.getByRole("tab", { name: "a.md", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Kopieren" }).hover();
  await expect(page.getByRole("menuitem", { name: "Relativer Pfad" })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
});

test("bulk close asks once for all unsaved tabs and never drops them silently", async ({ page }) => {
  await mockDesktop(page, "a.md", "A");
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "a.md", exact: true })).toBeVisible();
  await openDocuments(page, ["C:/fixtures/b.md"]);
  await expect(page.getByRole("tab", { name: "b.md", exact: true })).toHaveAttribute("aria-selected", "true");
  await editor(page).click();
  await page.keyboard.insertText("!");

  await page.getByRole("tab", { name: "a.md", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Alle schließen" }).click();
  const dialog = page.locator("dialog.close-dialog");
  await expect(dialog).toContainText("1 Datei hat ungespeicherte Änderungen.");
  await dialog.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);

  await page.getByRole("tab", { name: "a.md", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Gespeicherte schließen" }).click();
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "b.md Ungespeichert" })).toBeVisible();

  await page.getByRole("tab", { name: "b.md Ungespeichert" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Alle schließen" }).click();
  await dialog.getByRole("button", { name: "Alle speichern und schließen" }).click();
  await expect(page.getByRole("tab", { name: "Unbenannt.txt", exact: true })).toBeVisible();
  const saved = (await native(page)).filter((call) => call.command === "write_document");
  expect(saved.map((call) => call.args.path)).toEqual(["C:/fixtures/b.md"]);
});

test("tabs that do not fit move into a searchable overflow menu without changing their order", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await mockDesktop(page, "t01.md", "x");
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "t01.md", exact: true })).toBeVisible();
  const names = Array.from({ length: 15 }, (_, index) => `t${String(index + 1).padStart(2, "0")}.md`);
  await openDocuments(page, names.slice(1).map((name) => `C:/fixtures/${name}`));
  await expect(page.getByRole("tab", { name: "t15.md", exact: true })).toHaveAttribute("aria-selected", "true");

  const overflow = page.getByRole("button", { name: /^Weitere geöffnete Tabs, \d+ ausgeblendet$/ });
  await expect(overflow).toBeVisible();
  const visible = await page.getByRole("tab").count();
  expect(visible).toBeLessThan(15);
  await expect(overflow).toHaveAccessibleName(`Weitere geöffnete Tabs, ${15 - visible} ausgeblendet`);
  // Tabs keep a readable width.
  const widths = await page.locator(".tab-shell:not(.pinned)").evaluateAll((shells) => shells.map((shell) => shell.getBoundingClientRect().width));
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(119);

  await overflow.click();
  const search = page.getByPlaceholder("Geöffnete Tabs durchsuchen …");
  await expect(search).toBeFocused();
  await search.fill("t08");
  await expect(page.getByRole("menuitem")).toHaveCount(1);
  await search.press("Enter");
  await expect(page.getByRole("tab", { name: "t08.md", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "t08.md", exact: true })).toBeVisible();
  // The logical order is untouched: the first tab is still t01.
  await expect(page.getByRole("tab").first()).toHaveAccessibleName("t01.md");

  await page.setViewportSize({ width: 2600, height: 700 });
  await expect(page.getByRole("tab")).toHaveCount(15);
  await expect(overflow).toHaveCount(0);
});

test("session restore brings back tabs lazily, unsaved text and view state", async ({ page }) => {
  await mockDesktop(page, "unused.md", "Disk text");
  await page.addInitScript(() => {
    const native = (window as any).__testNative;
    native.pendingPaths = [];
    native.recovery = { "r-b": "B unsaved", "r-c": "Untitled recovered" };
    native.sessionRestore = [JSON.stringify({
      version: 1,
      activeRecoveryId: "r-b",
      tabs: [
        { recoveryId: "r-a", path: "C:/fixtures/a.md", name: "a.md", untitled: false, mode: "split", pinned: true },
        { recoveryId: "r-b", path: "C:/fixtures/b.md", name: "b.md", untitled: false, mode: "edit", hasRecovery: true, version: "fixture-version", selection: { anchor: 2, head: 2 } },
        { recoveryId: "r-c", path: "", name: "Notiz.txt", untitled: true, mode: "edit", hasRecovery: true },
        { recoveryId: "../broken", path: "C:/x.md", name: "x.md", mode: "edit" },
      ],
    })];
  });
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "b.md Ungespeichert" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.getByRole("tab").first()).toHaveAccessibleName("a.md Angeheftet");
  await expect(page.getByRole("tab", { name: "Notiz.txt Ungespeichert" })).toBeVisible();
  await expect(editor(page)).toHaveText("B unsaved");
  await expect(page.locator(".statusbar")).toContainText("Ln 1, Sp 3");
  // The pinned tab has not been read yet: it loads when it is shown.
  expect((await native(page)).filter((call) => call.command === "read_document").map((call) => call.args.path)).toEqual(["C:/fixtures/b.md"]);
  await page.getByRole("tab", { name: "a.md Angeheftet" }).click();
  await expect(page.getByRole("button", { name: "Split", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect((await native(page)).filter((call) => call.command === "read_document").map((call) => call.args.path)).toContain("C:/fixtures/a.md");

  await expect.poll(async () => {
    const stores = (await native(page)).filter((call) => call.command === "session_store" && call.args.session);
    return stores.length ? JSON.parse(stores[stores.length - 1].args.session).tabs.map((tab: any) => tab.name) : [];
  }).toEqual(["a.md", "b.md", "Notiz.txt"]);
});

test("a file changed on disk since the last session is never overwritten silently", async ({ page }) => {
  await mockDesktop(page, "unused.md", "Disk text");
  await page.addInitScript(() => {
    const native = (window as any).__testNative;
    native.pendingPaths = [];
    native.recovery = { "r-b": "Recovered text" };
    native.sessionRestore = [JSON.stringify({
      version: 1,
      tabs: [{ recoveryId: "r-b", path: "C:/fixtures/b.md", name: "b.md", untitled: false, mode: "edit", hasRecovery: true, version: "older-version" }],
    })];
  });
  await page.goto("/");
  await expect(editor(page)).toHaveText("Recovered text");
  await expect(page.getByRole("status").filter({ hasText: "außerhalb von P-Viewer geändert" })).toBeVisible();
  await page.evaluate(() => { (window as any).__testNative.writeError = "Die Datei wurde außerhalb von P-Viewer geändert."; });
  await page.keyboard.press("ControlOrMeta+s");
  // The stale version is sent along, so the native side reports the conflict.
  await expect.poll(async () => (await native(page)).find((call) => call.command === "write_document")?.args.expectedVersion).toBe("older-version");
  await expect(page.getByRole("alert")).toContainText("außerhalb von P-Viewer geändert");
  await page.getByRole("button", { name: "Datenträgerversion verwenden" }).click();
  await expect(editor(page)).toHaveText("Disk text");
  await expect(page.getByRole("tab", { name: "b.md", exact: true })).toBeVisible();
});

test("split view keeps its width per tab, syncs scrolling and navigates from the preview", async ({ page }) => {
  const paragraphs = Array.from({ length: 60 }, (_, index) => `Absatz ${index + 1} mit etwas Text.`).join("\n\n");
  const markdown = `# Anfang\n\n<div align="center">\n\nMitte\n\n</div>\n\n${paragraphs}\n\n## Ziel\n\nEnde`;
  await mockDesktop(page, "long.md", markdown);
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "long.md", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.locator('.markdown-body div[align="center"]')).toHaveText("Mitte");

  const divider = page.getByRole("slider", { name: "Breite von Editor und Vorschau" });
  await divider.focus();
  for (let step = 0; step < 5; step++) await page.keyboard.press("ArrowRight");
  await expect(divider).toHaveAttribute("aria-valuenow", "60");
  const editorWidth = (await page.locator(".editor-pane").boundingBox())!.width;
  const previewWidth = (await page.locator(".viewer-pane").boundingBox())!.width;
  expect(editorWidth / (editorWidth + previewWidth)).toBeCloseTo(0.6, 1);

  // Scrolling the editor moves the preview along.
  const scroller = page.locator(".markdown-preview .article-scroll");
  const editorBox = (await page.locator(".editor-pane .cm-scroller").boundingBox())!;
  await page.mouse.move(editorBox.x + editorBox.width / 2, editorBox.y + editorBox.height / 2);
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(200);

  // A click in the preview puts the editor cursor on the source line.
  await page.getByText("Ende", { exact: true }).click();
  const line = markdown.split("\n").indexOf("Ende") + 1;
  await expect(page.locator(".statusbar")).toContainText(`Ln ${line}, Sp 1`);

  // The toolbar toggle turns synchronisation off for this tab only.
  await page.getByRole("button", { name: /^Sync an/ }).click();
  await expect(page.getByRole("button", { name: /^Sync aus/ })).toHaveAttribute("aria-pressed", "false");
});

test("list replacements and JavaScript macros run as one undo step and stay available", async ({ page }) => {
  await mockDesktop(page, "blocklist.txt", "! Kommentar\n||ads.example.com^\nFrüh Früh\n||ads.example.com^");
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "blocklist.txt", exact: true })).toBeVisible();
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Shift+h");
  const dialog = page.getByRole("dialog", { name: "Mehrfach ersetzen und Makros" });
  await dialog.locator("#batch-rules").fill("Früh => Frühschicht\n||ads.example.com^ => ||ads.example.org^");
  await expect(dialog.getByRole("status")).toHaveText("2 Regeln · 4 Treffer");
  await dialog.getByLabel("Als Makro speichern unter").fill("Adblock-Pflege");
  await dialog.getByRole("button", { name: "Anwenden", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(editor(page)).toHaveText("! Kommentar||ads.example.org^Frühschicht Frühschicht||ads.example.org^");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor(page)).toHaveText("! Kommentar||ads.example.com^Früh Früh||ads.example.com^");

  // The saved macro runs again with one click.
  await page.keyboard.press("ControlOrMeta+Shift+h");
  await dialog.getByRole("button", { name: "„Adblock-Pflege“ direkt ausführen" }).click();
  await expect(editor(page)).toHaveText("! Kommentar||ads.example.org^Frühschicht Frühschicht||ads.example.org^");

  // JavaScript macro in the sandboxed worker: the template strips comments and duplicates.
  await page.keyboard.press("ControlOrMeta+Shift+h");
  await dialog.getByRole("tab", { name: "JavaScript" }).click();
  await dialog.getByRole("button", { name: "Anwenden", exact: true }).click();
  await expect(editor(page)).toHaveText("||ads.example.org^Frühschicht Frühschicht");

  // Script errors are reported and leave the document untouched.
  await page.keyboard.press("ControlOrMeta+Shift+h");
  await dialog.getByRole("tab", { name: "JavaScript" }).click();
  await dialog.locator("#batch-script").fill("return 42;");
  await dialog.getByRole("button", { name: "Anwenden", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("muss mit return einen Text");
  await dialog.locator("#batch-script").fill("while (true) {}");
  await dialog.getByRole("button", { name: "Anwenden", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("abgebrochen", { timeout: 10_000 });
  await dialog.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(editor(page)).toHaveText("||ads.example.org^Frühschicht Frühschicht");
});

test("the toolbar offers find, replace and the macro dialog, also from the View mode", async ({ page }) => {
  await mockDesktop(page, "notes.txt", "alpha beta alpha");
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "notes.txt", exact: true })).toBeVisible();
  const search = page.getByRole("button", { name: "Suchen", exact: true });
  await search.click();
  await page.getByRole("menuitem", { name: /^Ersetzen/ }).click();
  await expect(page.getByLabel("Ersetzen", { exact: true })).toBeVisible();
  await page.getByLabel("Suchen", { exact: true }).fill("alpha");
  await expect(page.locator(".pv-find-count")).toHaveText("1 von 2");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "View", exact: true }).click();
  await search.click();
  await page.getByRole("menuitem", { name: /^Mehrfach ersetzen/ }).click();
  await expect(page.getByRole("dialog", { name: "Mehrfach ersetzen und Makros" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Split", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("clicking and dragging line numbers selects whole lines and auto-scrolls near edges", async ({ page }) => {
  const lines = Array.from({ length: 160 }, (_, index) => `Zeile ${index + 1} Inhalt`);
  await mockDesktop(page, "long.txt", lines.join("\n"));
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "long.txt", exact: true })).toBeVisible();

  const lineGutter = (num: number) =>
    page.locator(".editor-pane .cm-lineNumbers .cm-gutterElement").filter({ hasText: new RegExp(`^${num}$`) });

  // Single click on line 2 selects the entire line including its newline.
  await lineGutter(2).click();
  const expectedLine2Length = `${lines[1]}\n`.length;
  await expect(page.locator(".statusbar")).toContainText(`${expectedLine2Length} ausgewählt`);

  // Drag downward from line 2 to line 4 selects lines 2, 3 and 4.
  const box2 = (await lineGutter(2).boundingBox())!;
  const box4 = (await lineGutter(4).boundingBox())!;
  await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
  await page.mouse.down();
  await page.mouse.move(box4.x + box4.width / 2, box4.y + box4.height / 2, { steps: 6 });
  await page.mouse.up();
  const expectedDownLength = `${lines[1]}\n${lines[2]}\n${lines[3]}\n`.length;
  await expect(page.locator(".statusbar")).toContainText(`${expectedDownLength} ausgewählt`);

  // Drag upward from line 5 to line 3 selects lines 3, 4 and 5.
  const box5 = (await lineGutter(5).boundingBox())!;
  const box3 = (await lineGutter(3).boundingBox())!;
  await page.mouse.move(box5.x + box5.width / 2, box5.y + box5.height / 2);
  await page.mouse.down();
  await page.mouse.move(box3.x + box3.width / 2, box3.y + box3.height / 2, { steps: 6 });
  await page.mouse.up();
  const expectedUpLength = `${lines[2]}\n${lines[3]}\n${lines[4]}\n`.length;
  await expect(page.locator(".statusbar")).toContainText(`${expectedUpLength} ausgewählt`);

  // Dragging to the bottom edge auto-scrolls down and expands selection;
  // dragging further below scrolls faster.
  const scroller = page.locator(".editor-pane .cm-scroller");
  const scrollerBox = (await scroller.boundingBox())!;
  const box1 = (await lineGutter(1).boundingBox())!;
  await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
  await page.mouse.down();
  await page.mouse.move(box1.x + box1.width / 2, scrollerBox.y + scrollerBox.height - 6);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop), { timeout: 5_000 }).toBeGreaterThan(40);
  const scrollAfterNearEdge = await scroller.evaluate((el) => el.scrollTop);
  await page.mouse.move(box1.x + box1.width / 2, scrollerBox.y + scrollerBox.height + 80);
  await expect
    .poll(async () => (await scroller.evaluate((el) => el.scrollTop)) - scrollAfterNearEdge, { timeout: 5_000 })
    .toBeGreaterThan(200);
  await page.mouse.up();
  const selectedText = await page.locator(".statusbar").textContent();
  const match = selectedText?.match(/(\d+)\s+ausgewählt/);
  expect(Number(match?.[1] ?? 0)).toBeGreaterThan(expectedDownLength * 3);
});

test("multi-tab splitscreen displays and edits documents side-by-side with per-tab modes and resizable widths", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockDesktop(page, "left.md", "# Links\n\nAbsatz links");
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "left.md", exact: true })).toBeVisible();
  await openDocuments(page, ["C:/fixtures/right.json", "C:/fixtures/third.txt"]);
  await expect(page.getByRole("tab")).toHaveCount(3);

  // Focus left.md, then open right.json side-by-side via tab context menu.
  await page.getByRole("tab", { name: "left.md", exact: true }).click();
  await page.getByRole("tab", { name: "right.json", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Nebeneinander öffnen" }).click();

  const panes = page.locator(".document-pane");
  await expect(panes).toHaveCount(2);
  const leftPane = panes.nth(0);
  const rightPane = panes.nth(1);
  await expect(leftPane.locator(".pane-name")).toHaveText("left.md");
  await expect(rightPane.locator(".pane-name")).toHaveText("right.json");

  // Edit both documents independently side-by-side without cross-contamination.
  await rightPane.locator(".editor-pane .cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText('{"side":"rechts"}');
  await leftPane.locator(".editor-pane .cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText(" bearbeitet");

  await expect(leftPane.locator(".editor-pane .cm-content")).toContainText("Absatz links bearbeitet");
  await expect(rightPane.locator(".editor-pane .cm-content")).toContainText('"side":"rechts"');

  // Choose view modes independently per tab right in the pane headers.
  await leftPane.getByRole("button", { name: "Split (left.md)" }).click();
  await expect(leftPane.locator(".markdown-body h1")).toContainText("Links");
  await rightPane.getByRole("button", { name: "View (right.json)" }).click();
  await expect(rightPane.getByRole("region", { name: "JSON-Struktur" })).toContainText("rechts");
  await expect(leftPane.locator(".editor-pane")).toBeVisible();
  await expect(rightPane.locator(".editor-pane")).toBeHidden();

  // Manually resize pane widths with mouse drag on the divider.
  const divider = page.locator(".pane-divider").first();
  const dividerBox = (await divider.boundingBox())!;
  const beforeLeft = (await leftPane.boundingBox())!.width;
  await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dividerBox.x + 180, dividerBox.y + dividerBox.height / 2, { steps: 6 });
  await page.mouse.up();
  const afterLeft = (await leftPane.boundingBox())!.width;
  expect(afterLeft).toBeGreaterThan(beforeLeft + 120);

  // Double-click equalizes the pair again.
  const movedDividerBox = (await divider.boundingBox())!;
  await page.mouse.dblclick(movedDividerBox.x + movedDividerBox.width / 2, movedDividerBox.y + movedDividerBox.height / 2);
  const equalLeft = (await leftPane.boundingBox())!.width;
  const equalRight = (await rightPane.boundingBox())!.width;
  expect(Math.abs(equalLeft - equalRight)).toBeLessThan(12);

  // Add a 3rd pane via the toolbar Splitscreen menu.
  await page.getByRole("button", { name: /^Splitscreen \(2\)/ }).click();
  await page.getByRole("menuitem", { name: "Weiteren Bereich öffnen" }).click();
  await expect(panes).toHaveCount(3);
  await expect(panes.nth(2).locator(".pane-name")).toHaveText("third.txt");

  // Removing a pane leaves its tab open in the tab strip.
  await panes.nth(2).getByRole("button", { name: "„third.txt“ aus Splitscreen entfernen" }).click();
  await expect(panes).toHaveCount(2);
  await expect(page.getByRole("tab", { name: "third.txt", exact: true })).toBeVisible();

  // Exit splitscreen cleanly returns to single-pane mode.
  await page.getByRole("button", { name: /^Splitscreen \(2\)/ }).click();
  await page.getByRole("menuitem", { name: "Splitscreen beenden" }).click();
  await expect(panes).toHaveCount(1);
});

test("session restore brings back multi-tab splitscreen panes and widths", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 750 });
  await mockDesktop(page, "unused.md", "Disk content");
  await page.addInitScript(() => {
    const native = (window as any).__testNative;
    native.pendingPaths = [];
    native.sessionRestore = [JSON.stringify({
      version: 1,
      activeRecoveryId: "r-b",
      tabs: [
        { recoveryId: "r-a", path: "C:/fixtures/a.md", name: "a.md", untitled: false, mode: "edit" },
        { recoveryId: "r-b", path: "C:/fixtures/b.md", name: "b.md", untitled: false, mode: "view" },
      ],
      panes: [
        { recoveryId: "r-a", weight: 0.3 },
        { recoveryId: "r-b", weight: 0.7 },
      ],
    })];
  });
  await page.goto("/");
  const panes = page.locator(".document-pane");
  await expect(panes).toHaveCount(2);
  await expect(panes.nth(0).locator(".pane-name")).toHaveText("a.md");
  await expect(panes.nth(1).locator(".pane-name")).toHaveText("b.md");
  await expect(panes.nth(1)).toHaveClass(/focused/);
  const leftW = (await panes.nth(0).boundingBox())!.width;
  const rightW = (await panes.nth(1).boundingBox())!.width;
  expect(leftW / (leftW + rightW)).toBeCloseTo(0.3, 1);
});
