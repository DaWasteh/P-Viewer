# P-Viewer

P-Viewer ist ein schneller, fokussierter Desktop-Editor und Dokumentbetrachter für Windows, macOS und Linux. Das Ziel ist die Dateiformat-Kompetenz eines großen Code-Editors in einer ruhigen, übersichtlichen Oberfläche.

[![Tests](https://github.com/DaWasteh/P-Viewer/actions/workflows/tests.yml/badge.svg)](https://github.com/DaWasteh/P-Viewer/actions/workflows/tests.yml)
[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-blue.svg)](LICENSE)

> **Status:** aktueller Entwicklungsstand `v0.2.0`.

## Aktueller Funktionsumfang

- Text- und Code-Dateien encoding-sicher lesen (UTF-8, UTF-16 mit und ohne BOM, Legacy-Kodierungen), atomar speichern, erstellen und bearbeiten
- mehrere Dokumente parallel in einer kompakten Tab-Leiste öffnen und sicher schließen, mit eigener Undo-Historie, Auswahl, Faltungen, Editor- und Vorschau-Scrollposition, Ansicht und Split-Breite pro Tab
- Sitzungswiederherstellung nach einem Neustart: Tabs, Reihenfolge, angeheftete und aktiver Tab sowie ungespeicherte Änderungen kehren zurück; Dateien laden erst beim Anzeigen, extern geänderte Dateien werden nie überschrieben
- Tab-Kontextmenü mit Schließen (andere, rechts, links, alle, gespeicherte, gleiche Endung, gleicher Ordner), Anheften, Verschieben, Sortieren, Pfad kopieren, Im Explorer anzeigen, Terminal öffnen, Neu laden und „Geschlossenen Tab wieder öffnen“ (Strg/Cmd+Umschalt+T); zu viele Tabs wandern in ein durchsuchbares Overflow-Menü
- Formatierungsleiste für Markdown und HTML (Fett, Kursiv, Überschriften, Listen, Aufgaben, Zitate, Codeblöcke, Links, Bilder, Tabellen, Trennlinien, Ausrichtung, Einrücken) sowie Suchen und Ersetzen wie in VS Code (Knopf „Suchen“ in der Werkzeugleiste, Strg/Cmd+F, Strg+H) mit Trefferzähler, Groß-/Kleinschreibung, ganzem Wort und regulären Ausdrücken
- Mehrfach ersetzen mit Regellisten und Mustern sowie gespeicherte Makros (auch als abgeschottetes JavaScript) mit Verlauf, z. B. für wiederkehrende Pflege von Adblock-Listen (Strg/Cmd+Umschalt+H)
- Editor und Markdown-Vorschau scrollen in der geteilten Ansicht quellzeilengenau gemeinsam; ein Klick in die Vorschau springt zur Quellzeile
- Windows-Explorer zeigt für mit P-Viewer verknüpfte Dateien Dateityp-Symbole (wahlweise das App-Symbol)
- eine laufende Instanz für alle Dateien: extern geöffnete Dokumente landen als Tab im zuletzt benutzten Fenster; Tabs lassen sich per Maus umsortieren, zwischen P-Viewer-Fenstern verschieben oder in ein neues Fenster ziehen (Strg/Cmd+Umschalt+N öffnet ein leeres Fenster), und der letzte Tab schließt sein Fenster
- Fenster merken sich Größe, Position und Maximierung des zuletzt benutzten P-Viewer-Fensters; neue Fenster öffnen leicht versetzt daneben, und beim Start erscheint das Fenster erst mit fertig gezeichneter Oberfläche im gespeicherten Design statt als weiße Fläche
- Speicherkonflikte bei externen Änderungen erkennen; bei mehrdeutigen Dateien die Kodierung in der Statusleiste explizit neu wählen
- Dateityp direkt in der Werkzeugleiste aus allen unterstützten Formaten, speziellen Dateinamen oder über eine eigene Endung wählen
- breite Syntaxhervorhebung für 295 Text-Dateiendungen und 131 spezielle Dateinamen mit sicherem Plaintext-Fallback, inklusive gemischter Astro-, Svelte- und Vue-Syntax sowie eigener Modi für Batch, Makefile, GraphQL, Elixir, BibTeX, Ignore-Dateien, CSV, Terraform/HCL, Nix und Vim Script
- schreibgeschützte Bildansicht für PNG, JPEG, GIF, WebP, BMP, ICO und AVIF mit Zoom, Einpassen und Transparenzraster sowie eine integrierte PDF-Ansicht; beide werden per Dateisignatur geprüft, nie als Text gelesen und nie überschrieben
- Edit-, View- und Split-Ansicht mit gespeichertem Standardmodus und Ausnahmen pro Dateiendung; manuelle Moduswechsel bleiben pro Tab erhalten
- sichere statische HTML-/HTM-/XHTML-Vorschau sowie eine explizit bestätigte vollständige Vorschau mit Skripten, Stylesheets und lokalen Ressourcen
- Markdown mit GFM, Gliederung, Folding, Tabellen, Aufgabenlisten, Fußnoten, Callouts, Syntaxhervorhebung in Codeblöcken und KaTeX-Mathematik
- einklappbare JSON-Strukturansicht für JSON, JSONC, JSON5, JSON-LD, GeoJSON, Source Maps und Web-Manifeste sowie zeilenweise JSONL-/NDJSON-Datensätze; Werkzeugdateien wie `tsconfig.json`, `.babelrc` oder VS-Code-Einstellungen gelten als JSONC, Syntaxfehler werden auf Deutsch mit Zeile und Spalte gemeldet
- Jupyter-Notebook-Ansicht mit Markdown-, Code- und Ausgabezellen (Text, Raster- und SVG-Bilder, Fehler); HTML-Ausgaben werden bewusst nicht ausgeführt
- CSV-/TSV-Tabellenansicht mit automatischer Trennzeichenerkennung, Kopfzeile, Zeilennummern und Zahlenausrichtung
- sandboxed SVG-Bildvorschau mit Zoom, Transparenzraster und Quelltextumschaltung
- gebündelte, automatisch aktualisierte LaTeX-Livevorschau mit KaTeX, nummerierten Überschriften, Inhaltsverzeichnis, Fußnoten, Theorem-Umgebungen, Tabellen und Makros sowie optionaler PDF-Build über eine lokale TeX-Distribution
- Registrierung aller unterstützten Endungen für „Öffnen mit“ und auswählbare Standardprogramm-Gruppen in den Einstellungen
- Dark Mode als Standard, optionaler Light Mode
- anpassbare Schrift- und Symbolgrößen sowie gebündelte Inter-/JetBrains-Mono-Schriften für konsistente WebViews
- persistente Einstellungen einschließlich eines Diagnose-/Debug-Modus im plattformüblichen Benutzer-Konfigurationsverzeichnis
- vorbereiteter, fail-closed In-App-Updater für signierte GitHub-Releases, ohne Benutzereinstellungen zu überschreiben

## Technologie

- **Desktop:** Tauri 2 / Rust
- **UI:** Svelte 5 / TypeScript / Vite
- **Editor:** CodeMirror 6
- **Dokument-Rendering:** unified/remark/rehype, highlight.js, sandboxed HTML- und SVG-`srcdoc`, isolierter nativer HTML-WebView, KaTeX und PDF.js

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
npm run test:browser
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

## Daten- und Bildformate

- **SVG:** Die Grafik wird als Bild in einem Iframe ohne Sandbox-Rechte und mit deny-by-default-CSP dargestellt. Skripte oder externe Verweise in der SVG werden dadurch nie ausgeführt; per Umschalter steht der hervorgehobene Quelltext bereit.
- **CSV/TSV:** Trennzeichen (Komma, Semikolon, Tabulator, Pipe) werden automatisch erkannt und können überschrieben werden. Anführungszeichen, maskierte Zitate und Zeilenumbrüche in Feldern folgen RFC 4180; die Tabelle ist auf 5.000 Zeilen, 256 Spalten und insgesamt 20.000 Datenzellen begrenzt. Breite Tabellen zeigen entsprechend weniger Zeilen; der Editor zeigt weiterhin die vollständige Datei.
- **JSONL/NDJSON:** Jeder nicht leere Datensatz wird einzeln als JSON gelesen; Fehler nennen die Quellzeile. Die Datensätze erscheinen als Array in der Strukturansicht. Vorschauen sind auf 2 Millionen Zeichen, 5.000 Knoten und 64 Verschachtelungsebenen begrenzt; übergroße Dateien bleiben im Editor nutzbar.
- **Jupyter-Notebooks:** Markdown-Zellen laufen durch dieselbe sanitisierte Pipeline wie Markdown-Dateien, Code-Zellen werden nach Kernel-Sprache hervorgehoben. Ausgaben werden nur als Text, Markdown, JSON, geprüfte PNG-/JPEG-/GIF-/WebP-Bilder oder Fehlermeldungen gezeigt; `text/html`-Ausgaben bleiben deaktiviert.

## LaTeX

Die voreingestellte **Live**-Ansicht ist vollständig gebündelt, funktioniert offline und benötigt nach der Installation keine weitere Abhängigkeit. Sie rendert Dokumentstruktur mit nummerierten Überschriften, Inhaltsverzeichnis und Anhang, verbreitete Textbefehle, Akzente und Sonderzeichen, verschachtelte Listen, Fußnoten, Theorem- und Beweisumgebungen, Tabellen mit Kopfzeile und `multicolumn`, `\newcommand`-Makros mit Argumenten sowie Mathematik; nicht vollständig nachbildbare TeX-Makros werden transparent als Vereinfachungen gemeldet. Beschriftungen folgen der babel-Dokumentsprache (Deutsch oder Englisch). Quelltext wird escaped und KaTeX läuft ohne vertrauenswürdige Eingaben.

Für einen typografisch exakten **PDF**-Build kann P-Viewer zusätzlich eine lokal installierte Distribution ansteuern, bevorzugt `latexmk`; unterstützt werden außerdem Tectonic, `pdflatex`, `xelatex` und `lualatex`.

- Windows: MiKTeX oder TeX Live
- macOS: MacTeX
- Linux: TeX Live

Die externe Distribution ist optional; Shell-Escape bleibt deaktiviert.

## Standard-Anzeigemodus

Unter **Einstellungen → Anzeigemodus** lässt sich **Edit**, **View** oder **Split** als Standard für den Start sowie neue und neu geöffnete Dokumente festlegen. Unter **Erweitert** können einzelne Dateiendungen einen abweichenden Modus erhalten, z. B. `.md → Split` oder `.json → View`. Endungen sind unabhängig von Groß-/Kleinschreibung; bei zusammengesetzten Endungen hat die längste passende Regel Vorrang (`.d.ts` vor `.ts`). Ohne passende Regel gilt der Standard, auch bei Dateien ohne Endung.

Änderungen werden automatisch in den bestehenden Einstellungen gespeichert. Bereits geöffnete Tabs behalten ihre aktuelle Ansicht, auch beim Tabwechsel, Speichern oder Ändern des Dateityps. Beim Verschieben in ein anderes Fenster reist der Tab-Modus mit. Entfernen einer Regel stellt für künftiges Öffnen den Standard wieder her. Bilder und PDFs bleiben unabhängig von diesen Vorgaben schreibgeschützte Viewer. System-Dateizuordnungen werden dadurch nicht verändert.

Die Zeilennummernleiste hebt sich im dunklen Design mit einer dunkleren Fläche vom Text ab; das helle Design bleibt unverändert.

## Sitzung, Tabs und Formatierung

Unter **Einstellungen → Start** stellt P-Viewer beim nächsten Start die letzte Sitzung wieder her (Standard) oder öffnet ein leeres Fenster. Einzeln abwählbar sind Cursor und Auswahl, Scrollpositionen, Ansicht, Split-Breite, eingeklappte Abschnitte und ungespeicherte Dokumente. Sitzung und Wiederherstellungsdaten liegen ausschließlich lokal im App-Datenordner (`session/`), werden atomar geschrieben und nie hochgeladen; eine beschädigte Sitzungsdatei wird beiseitegelegt, ein beschädigter Tab übersprungen. Mehrere Fenster einer abgestürzten Sitzung kehren als eigene Fenster zurück; wer ein Fenster bewusst schließt, während andere offen bleiben, entfernt es aus der Sitzung.

**Mehrfach ersetzen** (Strg/Cmd+Umschalt+H oder „Liste …“ im Suchwidget) wendet eine Regelliste der Reihe nach als einen Undo-Schritt an. JavaScript-Makros laufen in einem eigenen Worker ohne DOM, Dateizugriff, Netzwerk oder App-Befehle und werden nach fünf Sekunden abgebrochen; die App-CSP bleibt dafür unverändert. Makros und Verlauf liegen lokal in `replace-history.json` im App-Datenordner.

Die Formatierungsleiste erzeugt ausschließlich normalen Markdown- bzw. HTML-Quelltext und lässt sich unter **Einstellungen → Editor** auf *Immer* oder *Nie* stellen. Die Scroll-Kopplung der geteilten Ansicht wird unter **Einstellungen → Vorschau-Synchronisation** und pro Tab über den Schalter „Sync“ gesteuert.

## Dateizuordnungen

Installer registrieren alle 306 unterstützten Dateiendungen als mögliche P-Viewer-Formate. Unter **Einstellungen → Standardprogramme** lassen sich 110 sinnvolle Formatgruppen auswählen; die acht Bild- und PDF-Gruppen sind dabei bewusst abgewählt, bis sie ausdrücklich angehakt werden. Windows öffnet anschließend aus Sicherheitsgründen seine geschützte Standard-Apps-Seite zur Bestätigung; Linux aktualisiert die benutzerspezifische `mimeapps.list`, macOS verwendet LaunchServices. Eine vorhandene Standard-App wird bei der Windows-Installation nicht still überschrieben.

Jede Endung besitzt unter Windows eine eigene ProgID mit eigenem Dateityp-Symbol aus `assets/file-icons` neben der EXE; unter **Einstellungen → Dateityp-Symbole** lässt sich stattdessen das App-Symbol verwenden. Neue Symbole werden als `<endung>.ico` (16, 32, 48 und 256 px) mit `npm run sync:icons -- import <ordner>` übernommen; byte-identische Dateien werden nur einmal gespeichert.

## Qualitätsprüfungen und Grenzen

`npm run test:browser` prüft den Produktionsbuild mit Playwright (Windows: vorhandenes Edge; Linux: vorher `npx playwright install --with-deps chromium`). `node scripts/smoke-local-launcher.mjs` prüft unter Windows zusätzlich die tatsächlich gebaute Root-EXE mit temporären Dokumenten und einem eigenen WebView-Profil. Dazu wird nur für diesen Testprozess ein lokaler Debug-Port aktiviert.

Vorschaugrenzen halten die App bei sehr großen/komplexen Dateien bedienbar; sie sind keine Beschränkung auf ebenso kleine Editorquellen. Markdown begrenzt Quelltext, Zeilen und Strukturmarker, Notebooks kombinieren Zell-/Text-/Ausgabelimits. Die PDF-Ansicht hält nur eine Seite mit begrenzter Bitmap-Größe vor. View ist über **Strg/Cmd+Umschalt+R** erreichbar, Split über **Strg/Cmd+Umschalt+P**, ein weiteres Fenster über **Strg/Cmd+Umschalt+N**. Tabs wandern per Drag-and-drop zwischen Fenstern; beim Verschieben bleibt die Undo-Historie im Ursprungsfenster zurück.

Testumfang, bekannte Grenzen und noch offene plattformspezifische Release-Abnahmen stehen in [`docs/QUALITY-v0.2.0.md`](docs/QUALITY-v0.2.0.md). Eine vollständige Fehlerfreiheit aller Dateiformate wird nicht behauptet.

## Versionierung

Versionen folgen semantischer Vorabversionierung und werden als `vX.Y.Z` getaggt. Der Ablauf für signierte GitHub-Releases ist in [`docs/RELEASING.md`](docs/RELEASING.md) beschrieben.

## Lizenz

P-Viewer steht unter der [MIT-Lizenz](LICENSE). Hinweise zu den gebündelten OFL-Schriften und den Dateityp-Symbolen stehen in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
