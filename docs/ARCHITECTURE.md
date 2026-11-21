# Architektur

**Version:** v0.2.3

## Stack

P-Viewer ist eine **Tauri-2-Desktop-App** mit **Rust-Backend** und **Svelte-5-/TypeScript-Frontend**.

| Bereich | Umsetzung |
| --- | --- |
| Desktop-Shell | Tauri 2, Single-Instance-Prozess mit beliebig vielen Dokumentfenstern |
| Native Logik | Rust (Datei-E/A, Sitzungs-/Recovery-Speicher, Dateizuordnungen, LaTeX-CLI, Loopback-Server, Updater) |
| Oberfläche | Svelte 5, TypeScript, Vite |
| Editor | CodeMirror 6 (lazy geladene Sprachpakete, eigene Stream-Modi, Zeilennummern-Auswahl mit Rand-Auto-Scroll) |
| Vorschauen | unified/remark/rehype + KaTeX + highlight.js (Markdown), sandboxed `srcdoc`-Iframes (HTML, SVG), isolierter WebView (vollständiges HTML), eigene Parser für JSON/JSONL, CSV/TSV, Jupyter-Notebooks und LaTeX-Live, PDF.js |
| Einstellungen | Tauri Store im plattformüblichen Benutzer-Konfigurationspfad |
| Updates | Signiertes Tauri-Updater-Manifest aus GitHub Releases (fail-closed) |

## Leitprinzipien

1. **Schnell & schlank:** Unbekannte Textformate nutzen Plaintext; Sprachmodi und spezialisierte Vorschauen laden erst bei Bedarf.
2. **Klare Arbeitsbereiche:** Eine Tab-Leiste pro Fenster verwaltet alle offenen Dokumente. Der **Tab-Splitscreen** zeigt bis zu vier verschiedene Dokumente gleichzeitig nebeneinander (`DocumentPane`), jeweils mit eigenem Ansichtsmodus, eigener Editor↔Vorschau-Synchronisation und manuell ziehbarer Bereichsbreite. Nicht sichtbare Tabs halten ihren CodeMirror-Zustand im Speicher, ohne versteckte Editoren zu mounten.
3. **Keine implizite Codeausführung:** Markdown-HTML wird nach GitHubs Allowlist sanitisiert, statisches HTML und SVG laufen in sandboxed Iframes mit deny-by-default-CSP, und Notebook-`text/html`-Ausgaben bleiben aus. Vollständiges HTML startet nur nach ausdrücklicher Bestätigung in einem getrennten WebView ohne App-Capabilities über einen tokenisierten Loopback-Ursprung.
4. **Sichere Dateioperationen:** Datei-I/O läuft abseits des UI-Threads über eng begrenzte Rust-Commands. Atomares Speichern nutzt eine SHA-256-Versionsprüfung gegen unbemerkte externe Überschreibungen; Binärdokumente (Bilder, PDF) werden per Signatur geprüft und bleiben schreibgeschützt.
5. **Robuste Sitzungen:** Reihenfolge, angeheftete Tabs, Splitscreen-Aufteilung, Modus und Ansichtszustand liegen atomar im App-Datenordner; ungespeicherte Texte in separaten Recovery-Dateien.
6. **Benutzerkontrolle bei Standardprogrammen:** Installer registrieren P-Viewer nur als Kandidaten und verändern keine fremden Standardzuordnungen oder `UserChoice`.

## Modulstruktur

```text
src/lib/
  debug/        WebView-/Plattformdiagnose für den Debug-Modus
  editor/       CodeMirror-Integration, Sprachen, Stream-Modi, Zeilennummern-Auswahl, Formatierung, Suchen/Ersetzen & Makros
  files/        Dateitypen, Zuordnungen, Symbole, Tab-Logik, Splitscreen-Layout, DocumentPane, Sitzung und Dialoge
  preview/      Markdown-, HTML-, SVG-, Bild-, Notebook-, JSON-, CSV-, Text-, LaTeX- und PDF-Ansichten sowie Scroll-Sync
  settings/     persistente UI-, Editor- und Zuordnungseinstellungen
  update/       In-App-Updater-Dialog
src-tauri/src/
  associations.rs  OS-konforme Standardprogramm-Auswahl
  document.rs      encoding-sichere, atomare Datei-E/A und Binär-Signaturen
  file_icons.rs    Windows-Dateityp-Symbole und ProgIDs
  html_preview.rs  isolierter Loopback-Server für vollständige HTML-Vorschauen
  latex.rs         lokale TeX-Compilersteuerung mit Timeouts (ohne shell-escape)
  session.rs       atomare Sitzungs- und Recovery-Dateien
  shell.rs         „Terminal hier öffnen“
  updater.rs       HTTPS- und Signaturprüfung für Updates
  windows.rs       Single-Instance-Weiterleitung, Fensterzustand und Tab-Transfer
```
