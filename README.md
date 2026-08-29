# PandaViewer

PandaViewer ist ein schneller, fokussierter Desktop-Editor und Dokumentbetrachter für Windows, macOS und Linux. Das Ziel ist die Dateiformat-Kompetenz eines großen Code-Editors in einer ruhigen, übersichtlichen Oberfläche.

> **Status:** lokale Version `v0.0.6`. Das Projekt ist funktionsfähig, aber noch nicht veröffentlicht.

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

Ein optimierter Root-Launcher wird mit einem Befehl gebaut und nach `PandaViewer.exe` im Projektstamm kopiert:

```bash
npm run build:launcher
```

Danach lässt sich `PandaViewer.exe` direkt doppelklicken oder über **Rechtsklick → Weitere Optionen anzeigen → Verknüpfung erstellen** auf dem Desktop verknüpfen. `Start-PandaViewer.cmd` im Projektstamm dient als Fallback und findet automatisch den Root-, Release- oder Debug-Build.

Prüfungen:

```bash
npm run check:version
npm run check
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## LaTeX

Eine vollständige TeX-Distribution ist bewusst nicht Teil des schlanken App-Pakets. PandaViewer steuert sicher eine lokal installierte Distribution an, bevorzugt `latexmk`; unterstützt werden außerdem Tectonic, `pdflatex`, `xelatex` und `lualatex`.

- Windows: MiKTeX oder TeX Live
- macOS: MacTeX
- Linux: TeX Live

Shell-Escape bleibt standardmäßig deaktiviert.

## Versionierung

Lokale Entwicklungsstufen werden fortlaufend als `v0.0.1`, `v0.0.2`, … committed und getaggt. Der Ablauf für signierte Draft-Releases ist in [`docs/RELEASING.md`](docs/RELEASING.md) beschrieben.

## Lizenz

[MIT](LICENSE)
