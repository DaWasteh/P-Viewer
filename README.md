# P-Viewer

P-Viewer ist ein schneller, fokussierter Desktop-Editor und Dokumentbetrachter für Windows, macOS und Linux. Das Ziel ist die Dateiformat-Kompetenz eines großen Code-Editors in einer ruhigen, übersichtlichen Oberfläche.

[![Tests](https://github.com/DaWasteh/P-Viewer/actions/workflows/tests.yml/badge.svg)](https://github.com/DaWasteh/P-Viewer/actions/workflows/tests.yml)
[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-blue.svg)](LICENSE)

> **Status:** aktuelle Version `v0.1.1`.

## Aktueller Funktionsumfang

- Text- und Code-Dateien encoding-sicher lesen, atomar speichern, erstellen und bearbeiten
- mehrere Dokumente parallel in einer VS-Code-ähnlichen Tab-Leiste öffnen und sicher schließen
- Dateityp direkt in der Werkzeugleiste aus allen unterstützten Formaten oder über eine eigene Endung wählen
- breite Syntaxhervorhebung mit sicherem Plaintext-Fallback, inklusive gemischter Astro-, Svelte- und Vue-Syntax
- Edit-, View- und Split-Ansicht
- sichere statische HTML-/HTM-/XHTML-Vorschau sowie eine explizit bestätigte vollständige Vorschau mit Skripten, Stylesheets und lokalen Ressourcen
- Markdown mit GFM, Gliederung, Folding, Tabellen, Aufgabenlisten, Callouts und KaTeX-Mathematik
- einklappbare JSON-Strukturansicht
- gebündelte, automatisch aktualisierte LaTeX-Livevorschau mit KaTeX sowie optionaler PDF-Build über eine lokale TeX-Distribution
- Registrierung aller unterstützten Endungen für „Öffnen mit“ und auswählbare Standardprogramm-Gruppen in den Einstellungen
- Dark Mode als Standard, optionaler Light Mode
- anpassbare Schrift- und Symbolgrößen sowie gebündelte Inter-/JetBrains-Mono-Schriften für konsistente WebViews
- persistente Einstellungen einschließlich eines Diagnose-/Debug-Modus im plattformüblichen Benutzer-Konfigurationsverzeichnis
- vorbereiteter, fail-closed In-App-Updater für signierte GitHub-Releases, ohne Benutzereinstellungen zu überschreiben

## Technologie

- **Desktop:** Tauri 2 / Rust
- **UI:** Svelte 5 / TypeScript / Vite
- **Editor:** CodeMirror 6
- **Dokument-Rendering:** unified/remark/rehype, sandboxed HTML `srcdoc`, isolierter nativer HTML-WebView, KaTeX und PDF.js

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

Ein optimierter Root-Launcher wird mit einem Befehl gebaut und nach `P-Viewer.exe` im Projektstamm kopiert. Unter Windows kann dafür `build-exe.bat` doppelt angeklickt werden; im Terminal gilt plattformübergreifend:

```bash
npm run build:launcher
```

Danach lässt sich `P-Viewer.exe` direkt doppelklicken oder über **Rechtsklick → Weitere Optionen anzeigen → Verknüpfung erstellen** auf dem Desktop verknüpfen. `Start-P-Viewer.cmd` im Projektstamm dient als Fallback und findet automatisch den Root-, Release- oder Debug-Build.

Prüfungen:

```bash
npm audit --audit-level=low
npm run check:version
npm run check:associations
npm run check
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## HTML und Webkomponenten

HTML, HTM und XHTML besitzen zwei klar getrennte Vorschauarten:

- **Sicher (Standard):** Das Dokument wird ohne Browser-Ressourcenabruf geparst, sanitisiert und in einem Iframe mit undurchsichtiger Herkunft, leerem Sandbox-Rechtesatz und eigener deny-by-default-CSP angezeigt. Skripte, Event-Handler, Navigation, Formulare, Frames und externe Netzwerkressourcen werden entfernt oder blockiert. Inline-CSS sowie geprüfte relative Rasterbilder innerhalb des Dokumentordners bleiben erhalten. Diese Vorschau ist auf 1 MiB Quelltext begrenzt; größere Dateien bleiben vollständig im Editor nutzbar.
- **Vollständig (nach Warnung):** Nach expliziter Bestätigung öffnet P-Viewer ein separates Inkognito-WebView-Fenster. Dort funktionieren Skripte, Stylesheets, Medien und weitere relative lokale Ressourcen. Jede Vorschau verwendet einen eigenen tokenisierten Loopback-Ursprung und besitzt keine P-Viewer-/Tauri-Capabilities. Lokale Dateien bleiben auf den kanonischen Dokumentordner begrenzt; Traversals, Symlink-Ausbrüche, Popups, Downloads und Navigation zu anderen Ursprüngen werden blockiert. Quelltext und einzelne Ressourcen sind jeweils auf 64 MiB begrenzt. Dokumentcode kann in diesem Modus wie in einem Browser auf das Netzwerk zugreifen und sollte deshalb nur bei vertrauenswürdigen Dateien aktiviert werden.

Astro, Svelte und Vue werden als hervorgehobener Quelltext angezeigt. Projektkomponenten werden nicht ohne ihren Build-Prozess ausgeführt oder unzuverlässig nachgebildet.

## LaTeX

Die voreingestellte **Live**-Ansicht ist vollständig gebündelt, funktioniert offline und benötigt nach der Installation keine weitere Abhängigkeit. Sie rendert Dokumentstruktur, verbreitete Textbefehle, Listen, Tabellen und Mathematik; nicht vollständig nachbildbare TeX-Makros werden transparent als Vereinfachungen gemeldet. Quelltext wird escaped und KaTeX läuft ohne vertrauenswürdige Eingaben.

Für einen typografisch exakten **PDF**-Build kann P-Viewer zusätzlich eine lokal installierte Distribution ansteuern, bevorzugt `latexmk`; unterstützt werden außerdem Tectonic, `pdflatex`, `xelatex` und `lualatex`.

- Windows: MiKTeX oder TeX Live
- macOS: MacTeX
- Linux: TeX Live

Die externe Distribution ist optional; Shell-Escape bleibt deaktiviert.

## Dateizuordnungen

Installer registrieren alle 81 unterstützten Dateiendungen als mögliche P-Viewer-Formate. Unter **Einstellungen → Standardprogramme** lassen sich 49 sinnvolle Formatgruppen auswählen. Windows öffnet anschließend aus Sicherheitsgründen seine geschützte Standard-Apps-Seite zur Bestätigung; Linux aktualisiert die benutzerspezifische `mimeapps.list`, macOS verwendet LaunchServices. Eine vorhandene Standard-App wird bei der Windows-Installation nicht still überschrieben.

## Versionierung

Versionen folgen semantischer Vorabversionierung und werden als `vX.Y.Z` getaggt. Der Ablauf für signierte GitHub-Releases ist in [`docs/RELEASING.md`](docs/RELEASING.md) beschrieben.

## Lizenz

P-Viewer steht unter der [MIT-Lizenz](LICENSE). Hinweise zu den gebündelten OFL-Schriften stehen in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
