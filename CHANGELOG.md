# Changelog

Alle Entwicklungsstufen folgen semantischer Vorabversionierung.

## 0.0.7

- finalen Produktnamen **P-Viewer** in Oberfläche, Metadaten, nativen Kennungen, Launchern und Dokumentation vereinheitlicht
- Versionsmetadaten und MIT-Lizenzhinweis für die erste öffentliche Version aktualisiert
- bekannte Low-Severity-Cookie-Sicherheitslücke in der SvelteKit-Abhängigkeitskette geschlossen
- eigenen GitHub-Testworkflow sowie vorgeschaltete Qualitätsprüfungen im signierten Release-Workflow ergänzt
- Release-Matrix für Windows, Linux sowie Intel- und Apple-Silicon-macOS aktualisiert

## 0.0.6

- restriktive WebView-CSP und enger zugeschnittene Tauri-Capabilities
- isoliertere LaTeX-Prozesse mit bereinigtem PATH, temporärem Arbeitsordner, Größenlimits und asynchronen Commands
- Dokument-Größenlimit und zusätzliche native Round-trip-Tests
- PDF.js-Laderace behoben und vollständigen TeX→PDF-UI-Fluss geprüft
- JSON-Baumdarstellung für Array-Eigenschaften und numerische Indizes korrigiert
- System-Theme gibt eine zuvor erzwungene Hell-/Dunkelwahl wieder korrekt an das Betriebssystem zurück
- optimierten `P-Viewer.exe`-Root-Launcher und Doppelklick-Fallback ergänzt
- Architektur- und Release-Dokumentation aktualisiert

## 0.0.5

- fail-closed, signaturpflichtigen Tauri-Updater vorbereitet
- Update-Dialog mit Dirty-State-Schutz und Fortschritt ergänzt
- signierten, plattformübergreifenden GitHub-Draft-Release-Workflow angelegt
- Version-Metadatenprüfung und Release-Anleitung ergänzt

## 0.0.4

- Dark-, Light- und System-Theme ergänzt
- Editor-, Vorschau- und Symbolgrößen konfigurierbar gemacht
- Einstellungen über Tauri Store im Benutzer-App-Datenordner persistiert
- Editor-Wrapping und Rechtschreibprüfung konfigurierbar gemacht

## 0.0.3

- CodeMirror 6 mit lazy geladenen Sprachmodi integriert
- sichere Markdown-/GFM-/KaTeX-Vorschau mit Gliederung, Callouts und Folding ergänzt
- einklappbaren JSON-/JSONC-/JSON5-Baum ergänzt
- isolierten LaTeX-Build und PDF.js-Vorschau ergänzt
- Tabellen-Folding unter H1/H2 korrigiert

## 0.0.2

- native Datei-Dialoge und vollständigen Dokument-Lifecycle ergänzt
- Encoding, BOM und Zeilenenden erkannt und beim Speichern erhalten
- Binärdateien abgelehnt und atomare Schreibvorgänge eingeführt
- Dirty-State-, Close-, Drag-and-drop- und Tastaturbehandlung ergänzt

## 0.0.1

- Tauri-2-/Svelte-5-/Rust-Projektbasis und P-Viewer-Oberfläche angelegt
- Architekturentscheidung, MIT-Lizenz und Grunddokumentation hinzugefügt
