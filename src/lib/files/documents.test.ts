import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { documentIsDirty } from "./tabs";

const { invokeMock, saveDialogMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  saveDialogMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(),
  open: vi.fn(),
  save: saveDialogMock,
}));

import { createUntitledDocument, saveDocument } from "./documents";

function savedDocument() {
  const document = createUntitledDocument("notes.txt");
  document.path = "C:\\Notes\\notes.txt";
  document.untitled = false;
  document.content = "Stand beim Speichern";
  document.savedContent = "Alter Stand";
  return document;
}

describe("document saving", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    invokeMock.mockReset();
    saveDialogMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps edits made while a save is in flight dirty", async () => {
    let finishWrite: ((value: { path: string; size: number }) => void) | undefined;
    invokeMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishWrite = resolve;
        }),
    );
    const document = savedDocument();

    const saving = saveDocument(document);
    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledOnce());
    document.content = "Noch während des Speicherns geändert";
    finishWrite?.({ path: document.path, size: 20 });

    const saved = await saving;
    expect(invokeMock).toHaveBeenCalledWith(
      "write_document",
      expect.objectContaining({ content: "Stand beim Speichern" }),
    );
    expect(saved?.content).toBe("Noch während des Speicherns geändert");
    expect(saved?.savedContent).toBe("Stand beim Speichern");
    expect(documentIsDirty(saved!)).toBe(true);
  });

  it("validates the target path before writing", async () => {
    const document = savedDocument();
    const validatePath = vi.fn(() => {
      throw new Error("Pfad bereits in anderem Tab geöffnet");
    });

    await expect(saveDocument(document, false, validatePath)).rejects.toThrow(
      "Pfad bereits in anderem Tab geöffnet",
    );
    expect(validatePath).toHaveBeenCalledWith(document.path);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("clears metadata changes only after a successful save", async () => {
    const document = savedDocument();
    document.metadataDirty = true;
    invokeMock.mockResolvedValue({ path: document.path, size: 20 });

    const saved = await saveDocument(document);

    expect(saved?.metadataDirty).toBe(false);
    expect(saved?.savedContent).toBe("Stand beim Speichern");
  });
});
