# P-Viewer

P-Viewer ist ein schneller, fokussierter Desktop-Editor und Dokumentbetrachter für Windows, macOS und Linux. Das Ziel ist die Dateiformat-Kompetenz eines großen Code-Editors in einer ruhigen, übersichtlichen Oberfläche.

[![Tests](https://github.com/DaWasteh/P-Viewer/actions/workflows/tests.yml/badge.svg)](https://github.com/DaWasteh/P-Viewer/actions/workflows/tests.yml)
[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-blue.svg)](LICENSE)

> **Status:** aktuelle Version `v0.0.7`.

## Aktueller Funktionsumfang

- Text- und Code-Dateien encoding-sicher lesen, atomar speichern, erstellen und bearbeiten
- breite Syntaxhervorhebung mit sicherem Plaintext-Fallback
- Edit-, View- und Split-Ansicht
- Markdown mit GFM, Gliederung, Folding, Tabellen, Aufgabenlisten, Callouts und KaTeX-Mathematik
- einklappbare JSON-Strukturansicht
- LaTeX-/TeX-Editor mit PDF-Build über eine lokale TeX-Distribution
- Dark Mode als Standard, optionaler Light Mode
- anpassbare Schrift- und Symbolgrößen
- persistente Einstellungen im plattformüblichen Benutzer-Konfigurationsverzeichnis
- vorbereiteter, fail-closed In-App-Updater für signierte GitHub-Releases, ohne Benutzereinstellungen zu überschreiben

## Technologie

- **Desktop:** Tauri 2 / Rust
- **UI:** Svelte 5 / TypeScript / Vite
- **Editor:** CodeMirror 6
- **Dokument-Rendering:** unified/remark/rehype, KaTeX und PDF.js

Die Entscheidung ist in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) dokumentiert. Änderungen je Version stehen im [`CHANGELOG.md`](CHANGELOG.md).

## Lokale Entwicklung

Voraussetzungen:

- Node.js 20 oder neuer
- Rust Stable
- die [plattformabhängigen Tauri-Voraussetzungen](https://v2.tauri.app/start/prerequisites/)

```bash
npm install
npm run tauri dev
```

### Per Doppelklick starten

Ein optimierter Root-Launcher wird mit einem Befehl gebaut und nach `P-Viewer.exe` im Projektstamm kopiert:

```bash
npm run build:launcher
```

Danach lässt sich `P-Viewer.exe` direkt doppelklicken oder über **Rechtsklick → Weitere Optionen anzeigen → Verknüpfung erstellen** auf dem Desktop verknüpfen. `Start-P-Viewer.cmd` im Projektstamm dient als Fallback und findet automatisch den Root-, Release- oder Debug-Build.

Prüfungen:

```bash
npm audit --audit-level=low
npm run check:version
npm run check
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## LaTeX

Eine vollständige TeX-Distribution ist bewusst nicht Teil des schlanken App-Pakets. P-Viewer steuert sicher eine lokal installierte Distribution an, bevorzugt `latexmk`; unterstützt werden außerdem Tectonic, `pdflatex`, `xelatex` und `lualatex`.

- Windows: MiKTeX oder TeX Live
- macOS: MacTeX
- Linux: TeX Live

Shell-Escape bleibt standardmäßig deaktiviert.

## Versionierung

Versionen folgen semantischer Vorabversionierung und werden als `vX.Y.Z` getaggt. Der Ablauf für signierte GitHub-Releases ist in [`docs/RELEASING.md`](docs/RELEASING.md) beschrieben.

## Lizenz

[MIT](LICENSE)
