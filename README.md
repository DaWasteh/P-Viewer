# PandaViewer

PandaViewer ist ein schneller, fokussierter Desktop-Editor und Dokumentbetrachter für Windows, macOS und Linux. Das Ziel ist die Dateiformat-Kompetenz eines großen Code-Editors in einer ruhigen, übersichtlichen Oberfläche.

> **Status:** frühe lokale Entwicklung. Das Projekt wird noch nicht veröffentlicht.

## Geplanter Funktionsumfang

- Text- und Code-Dateien lesen, erstellen und bearbeiten
- breite Syntaxhervorhebung mit sicherem Plaintext-Fallback
- Edit-, View- und Split-Ansicht
- Markdown mit GFM, Gliederung, Folding, Tabellen, Aufgabenlisten, Callouts und KaTeX-Mathematik
- einklappbare JSON-Strukturansicht
- LaTeX-/TeX-Editor mit PDF-Build über eine lokale TeX-Distribution
- Dark Mode als Standard, optionaler Light Mode
- anpassbare Schrift- und Symbolgrößen
- persistente Einstellungen im plattformüblichen Benutzer-Konfigurationsverzeichnis
- signierte In-App-Updates aus einem späteren GitHub-Release-Kanal, ohne Benutzereinstellungen zu überschreiben

## Technologie

- **Desktop:** Tauri 2 / Rust
- **UI:** Svelte 5 / TypeScript / Vite
- **Editor:** CodeMirror 6
- **Dokument-Rendering:** unified/remark/rehype, KaTeX und PDF.js

Die Entscheidung ist in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) dokumentiert.

## Lokale Entwicklung

Voraussetzungen:

- Node.js 20 oder neuer
- Rust Stable
- die [plattformabhängigen Tauri-Voraussetzungen](https://v2.tauri.app/start/prerequisites/)

```bash
npm install
npm run tauri dev
```

Frontend-Prüfung:

```bash
npm run check
npm run build
```

## LaTeX

Eine vollständige TeX-Distribution ist bewusst nicht Teil des schlanken App-Pakets. PandaViewer steuert sicher eine lokal installierte Distribution an, bevorzugt `latexmk`; unterstützt werden außerdem `pdflatex`, `xelatex`, `lualatex` und später optional Tectonic.

- Windows: MiKTeX oder TeX Live
- macOS: MacTeX
- Linux: TeX Live

Shell-Escape bleibt standardmäßig deaktiviert.

## Versionierung

Lokale Entwicklungsstufen werden fortlaufend als `v0.0.1`, `v0.0.2`, … committed und getaggt.

## Lizenz

[MIT](LICENSE)
