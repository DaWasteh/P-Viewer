# Changelog

Alle Entwicklungsstufen folgen semantischer Vorabversionierung.

## 0.1.0

- alle 81 unterstützten Dateiendungen in 49 synchronisierten Formatgruppen für Windows, Linux und macOS registriert
- Windows-NSIS-Registrierung für „Öffnen mit“ und „Standard-Apps“ ergänzt, ohne bestehende Standardprogramme bei der Installation still zu überschreiben
- benutzerausgelöste Formatwahl in den Einstellungen ergänzt; Windows bestätigt geschützt im Systemdialog, Linux über `mimeapps.list` und macOS über LaunchServices
- mehrere Startargumente, Drag-and-drop-Dateien und macOS-Open-Events in einem gemeinsamen Dokumentfluss verarbeitet
- vollständig gebündelte, sichere LaTeX-Livevorschau mit Dokumentstruktur, verbreiteten Textbefehlen, Listen, Tabellen und KaTeX-Mathematik ergänzt
- exakten PDF-Build als weiterhin optionalen Modus mit lokaler TeX-Distribution beibehalten
- persistenten Debug-Modus mit Plattform-/WebView-/Dokumentdiagnose und Konsolenprotokollierung ergänzt
- Inter und JetBrains Mono lokal gebündelt, Safari-13-Buildziel, WebKit-Fallbacks sowie CSS-Präfixe für konsistentere WebViews ergänzt
- `build-exe.bat` für einen geprüften optimierten Windows-Root-Build ergänzt
- CI-Prüfung gegen Drift zwischen unterstützten Endungen, Tauri-Konfiguration und NSIS-Hooks ergänzt

## 0.0.9

- VS-Code-ähnliche Dokument-Tabs zum parallelen Öffnen, Wechseln und Schließen mehrerer Dateien ergänzt
- Tab-Wechsel über Strg/Cmd+Tab, Schließen über Strg/Cmd+W sowie vollständige Tastaturbedienung der Tab-Leiste ergänzt
- sichtbare Dateityp-Anzeige als natives Dropdown mit allen unterstützten Endungen und speziellen Dateinamen umgesetzt
- validierte eigene Dateiendungen mit sicherem Plaintext-Fallback und sofortiger Anpassung von Syntaxmodus und Vorschau ergänzt
- ungespeicherte Inhalte und Dateitypänderungen tabübergreifend vor Schließen und Updates geschützt
- doppelte Tabs für denselben Speicherpfad sowie konkurrierende Save-As-Ziele abgefangen
- Speichervorgänge gegen parallele Editoränderungen abgesichert, damit spätere Eingaben als ungespeichert erhalten bleiben

## 0.0.8

- HTML-, HTM- und XHTML-Dateien in einer sanitisierten, vollständig sandboxed `srcdoc`-Vorschau gerendert
- Skripte, Event-Handler, Formulare, Navigation, eingebettete Inhalte und Netzwerkzugriffe in HTML-Vorschauen fail-closed blockiert
- lokale Rasterbilder auf relative Pfade innerhalb des Dokumentordners, geprüfte Dateisignaturen sowie Anzahl- und Gesamtgrößenlimits begrenzt
- dediziertes, lazy geladenes Astro-Highlighting für Frontmatter, Ausdrücke, Skripte und Styles mit HTML-Fallback ergänzt
- Svelte-Mischsyntax sowie Highlighting-Fallbacks für JSONC/JSON5, MDX und verwandte Formate korrigiert
- Dateidialog um Astro, Svelte, Vue, XHTML, HTM und weitere bereits unterstützte Webformate erweitert
- verlorenes `data-callout`-Attribut in der Markdown-Sanitizer-Pipeline korrigiert
- HTML-Vorschau auf 1 MiB Quelltext begrenzt und asynchrone Render-Races abgefangen

## 0.0.7

- finalen Produktnamen **P-Viewer** in Oberfläche, Metadaten, nativen Kennungen, Launchern und Dokumentation vereinheitlicht
- Versionsmetadaten und MIT-Lizenzhinweis für die erste öffentliche Version aktualisiert
- bekannte Low-Severity-Cookie-Sicherheitslücke in der SvelteKit-Abhängigkeitskette geschlossen
- eigenen GitHub-Testworkflow sowie vorgeschaltete Qualitäts- und Signaturschlüsselprüfungen im signierten Release-Workflow ergänzt
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
