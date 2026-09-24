import { access, chmod, copyFile, cp, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const windows = process.platform === "win32";
const binaryName = windows ? "p-viewer.exe" : "p-viewer";
const destinationName = windows ? "P-Viewer.exe" : "P-Viewer";
const candidates = [
  resolve("src-tauri", "target", "release", binaryName),
  resolve("src-tauri", "target", "debug", binaryName),
];

let source;
for (const candidate of candidates) {
  try {
    await access(candidate, constants.R_OK);
    source = candidate;
    break;
  } catch {
    // Try the next build profile.
  }
}

if (!source) {
  console.error(
    "Kein P-Viewer-Build gefunden. Zuerst `npm run tauri build -- --no-bundle` ausführen.",
  );
  process.exit(1);
}

const destination = resolve(destinationName);
try {
  await copyFile(source, destination);
  if (!windows) await chmod(destination, 0o755);
} catch (error) {
  console.error(
    `Launcher konnte nicht aktualisiert werden. P-Viewer gegebenenfalls schließen.\n${error}`,
  );
  process.exit(1);
}

// Windows Explorer icons for associated files live next to the EXE (issue #3).
if (windows) {
  await cp(resolve("src-tauri", "assets", "file-icons"), resolve("assets", "file-icons"), { recursive: true, force: true });
}

const { size } = await stat(destination);
console.log(`Root-Launcher erstellt: ${destination} (${(size / 1024 / 1024).toFixed(1)} MiB)`);
console.log("Davon kann direkt eine Desktop-Verknüpfung erstellt werden.");
