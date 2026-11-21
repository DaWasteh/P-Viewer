# P-Viewer

P-Viewer ist ein schneller, fokussierter Desktop-Editor und Dokumentbetrachter für Windows, macOS und Linux.

[![Tests](https://github.com/DaWasteh/P-Viewer/actions/workflows/tests.yml/badge.svg)](https://github.com/DaWasteh/P-Viewer/actions/workflows/tests.yml)
[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-blue.svg)](LICENSE)

Aktuelle Version: **`v0.2.3`**

## Funktionsumfang

### Editor & Bearbeitung
- **Encoding-sichere Datei-E/A:** UTF-8, UTF-16 (mit/ohne BOM) und Legacy-Kodierungen lesen, in der Statusleiste neu wählen und atomar mit Speicherkonflikterkennung speichern.
- **Zeilenmarkierung am Rand:** Klick auf eine Zeilenzahl markiert die gesamte Zeile; Ziehen nach oben oder unten markiert mehrere Zeilen und scrollt an den Fensterrändern bei langen Dokumenten automatisch mit (desto weiter am/über dem Rand, desto schneller).
- **Syntaxhervorhebung:** 295 Text-Dateiendungen und 131 spezielle Dateinamen (u. a. Astro, Svelte, Vue, Batch, Makefile, GraphQL, Elixir, BibTeX, CSV, Terraform/HCL, Nix, Vim Script) mit Plaintext-Fallback.
- **Formatierungsleiste:** Kompakte Werkzeugleiste für Markdown und HTML (Fett, Kursiv, Überschriften, Listen, Aufgaben, Zitate, Codeblöcke, Links, Bilder, Tabellen, Ausrichtung, Hinweisboxen).
- **Suchen, Ersetzen & Makros:** Schwebendes Such-/Ersetzungs-Widget (Trefferzähler, Groß-/Kleinschreibung, ganzes Wort, RegEx) sowie Mehrfach-Ersetzen mit Regellisten, Verlauf und abgeschotteten JavaScript-Makros.

### Tabs, Splitscreen & Fenster
- **Tab-Splitscreen:** Bis zu vier verschiedene Dokumente gleichzeitig nebeneinander anzeigen und bearbeiten. Jeder Tab im Splitscreen lässt sich einzeln in den Modus **Edit**, **View** oder **Split** schalten; die Breite der Bereiche lässt sich per Teiler manuell ziehen (Doppelklick verteilt gleichmäßig).
- **Tab-Verwaltung:** Bis zu 100 Tabs pro Fenster mit eigener Undo-Historie, Auswahl, Faltung, Scrollposition und Ansichtsmodus, Anheften, Kontextmenü (u. a. selektives Schließen, Sortieren, Pfad kopieren, Explorer/Terminal öffnen), durchsuchbarem Overflow-Menü und Wiederherstellen geschlossener Tabs (`Strg/Cmd+Umschalt+T`).
- **Sitzungswiederherstellung:** Stellt beim Neustart Tabs, Reihenfolge, Splitscreen-Aufteilung, Cursor/Scrollpositionen und ungespeicherte Änderungen wieder her (unter **Einstellungen → Start** konfigurierbar). Extern geänderte Dateien werden nie still überschrieben.
- **Single-Instance & mehrere Fenster:** Extern geöffnete Dateien landen als Tab im zuletzt genutzten Fenster. Tabs lassen sich per Drag-and-drop zwischen Fenstern verschieben oder in ein neues Fenster herausziehen.

### Dokumentvorschauen
- **Markdown:** GFM, Gliederung, Folding, Tabellen, Aufgabenlisten, Fußnoten, Callouts, Code-Highlighting, KaTeX-Mathematik, sanitisiertes GitHub-HTML und quellzeilengenaue Scroll-Synchronisation in der Split-Ansicht.
- **HTML / XHTML:** Sichere, statische Iframe-Vorschau als Standard (ohne Skripte oder externe Requests); optional nach Warnung eine isolierte vollständige Vorschau im eigenen WebView.
- **Daten & Code:** Einklappbare JSON-/JSONC-/JSON5-/JSONL-Strukturansicht, CSV-/TSV-Tabelle mit automatischer Trennzeichenerkennung, Jupyter-Notebooks (Markdown, Code und sichere Ausgaben) und sandboxed SVG-Ansicht mit Zoom.
- **LaTeX:** Gebündelte, offlinefähige Live-Vorschau mit KaTeX sowie optionaler PDF-Build über eine lokale TeX-Distribution (`latexmk`, Tectonic, `pdflatex`, `xelatex`, `lualatex`).
- **Bilder & PDF:** Schreibgeschützte Ansicht für PNG, JPEG, GIF, WebP, BMP, ICO, AVIF und PDF (Signaturprüfung statt Textdecodierung).

### Integration & Anpassung
- **Standard-Anzeigemodus:** Globaler Standard (**Edit**, **View** oder **Split**) sowie Regeln pro Dateiendung unter **Einstellungen → Anzeigemodus**.
- **Design & Typografie:** Dark Mode (Standard), Light Mode oder Systemdesign; konfigurierbare Schrift- und Symbolgrößen mit gebündelten Inter- und JetBrains-Mono-Schriften.
- **Dateizuordnungen & Updates:** Registrierung für „Öffnen mit“, Windows-Explorer-Eintrag „Mit P-Viewer öffnen“ und Dateityp-Symbole; signierter In-App-Updater über GitHub Releases.

## Tastenkürzel

| Aktion | Windows / Linux | macOS |
| --- | --- | --- |
| Neues Dokument / Neues Fenster | `Strg+N` / `Strg+Umschalt+N` | `Cmd+N` / `Cmd+Umschalt+N` |
| Öffnen / Speichern / Speichern unter | `Strg+O` / `Strg+S` / `Strg+Umschalt+S` | `Cmd+O` / `Cmd+S` / `Cmd+Umschalt+S` |
| Tab schließen / Wieder öffnen | `Strg+W` / `Strg+Umschalt+T` | `Cmd+W` / `Cmd+Umschalt+T` |
| Tab wechseln / direkt wählen | `Strg+Tab` / `Alt+1…9` | `Strg+Tab` / `Cmd+1…9` |
| Edit / View / Split | `Strg+Umschalt+E` / `R` / `P` | `Cmd+Umschalt+E` / `R` / `P` |
| Tab-Splitscreen (nebeneinander) | `Strg+\` | `Cmd+\` |
| Suchen / Ersetzen / Mehrfach ersetzen | `Strg+F` / `Strg+H` / `Strg+Umschalt+H` | `Cmd+F` / `Cmd+Alt+F` / `Cmd+Umschalt+H` |
| Einstellungen / Updates | `Strg+,` / `Strg+Umschalt+U` | `Cmd+,` / `Cmd+Umschalt+U` |

## Installation & Start

Fertige Installer und signierte Pakete für Windows (`.exe`), Linux (`.deb`, `.rpm`, `.AppImage`) und macOS (`.dmg`) stehen in den [GitHub Releases](https://github.com/DaWasteh/P-Viewer/releases/latest) bereit.

### Lokale Entwicklung

Voraussetzungen: Node.js 20+, Rust Stable und die [Tauri-Systempakete](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev
```

Unter Ubuntu werden zusätzlich die WebKitGTK-Entwicklungspakete benötigt:

```bash
sudo apt install build-essential pkg-config libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

### Optimierten Einzel-Build erzeugen

```bash
npm run build:launcher
```

Erzeugt unter Windows `P-Viewer.exe` (auch per Doppelklick auf `build-exe.bat`), unter Linux `P-Viewer` im Projektstamm. Windows- und Linux-`node_modules` sind nicht untereinander austauschbar; nach einem Betriebssystemwechsel im selben Klon `npm ci` ausführen.

## Prüfungen

```bash
npm audit --audit-level=low
npm run check:version
npm run check:associations
npm run check
npm test
npm run test:browser
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Weitere Dokumentation

- [`CHANGELOG.md`](CHANGELOG.md) – Änderungen je Version
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) – Architektur und Modulgrenzen
- [`docs/RELEASING.md`](docs/RELEASING.md) – Signierte Releases und Update-Pipeline
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) – Lizenzen gebündelter Schriften und Symbole

## Lizenz

[MIT](LICENSE)
