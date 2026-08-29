import { access, chmod, copyFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const windows = process.platform === "win32";
const binaryName = windows ? "pandaviewer.exe" : "pandaviewer";
const destinationName = windows ? "PandaViewer.exe" : "PandaViewer";
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
    "Kein PandaViewer-Build gefunden. Zuerst `npm run tauri build -- --no-bundle` ausführen.",
  );
  process.exit(1);
}

const destination = resolve(destinationName);
try {
  await copyFile(source, destination);
  if (!windows) await chmod(destination, 0o755);
} catch (error) {
  console.error(
    `Launcher konnte nicht aktualisiert werden. PandaViewer gegebenenfalls schließen.\n${error}`,
  );
  process.exit(1);
}

const { size } = await stat(destination);
console.log(`Root-Launcher erstellt: ${destination} (${(size / 1024 / 1024).toFixed(1)} MiB)`);
console.log("Davon kann direkt eine Desktop-Verknüpfung erstellt werden.");
