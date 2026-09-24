# v0.1.9 – Qualitätsbericht und Release-Abnahme

Prüfdatum: 24. September 2026. Ziel: Umsetzung der Verbesserungsvorschläge aus den Issues #1 (Formatierungsleiste), #2 (Editor ↔ Vorschau-Synchronisation), #3 (Windows-Dateityp-Symbole), #4 (Tab-Zustand, Sitzung, Tab-Kontextmenü) und #5 (Tab-Overflow-Menü) sowie Suchen und Ersetzen, Mehrfach-Ersetzen und Makros.

## Verhalten und Grenzen

- **Formatierung:** Alle Befehle sind reine Funktionen `EditorState → Transaktion` (`editor/formatting.ts`); Toolbar und Tastenkürzel nutzen dieselben Befehle. Jede Aktion ist ein Undo-Schritt, betrifft alle Auswahlen und bleibt reiner Quelltext. Ausrichtung verwendet `<div align>`; die Markdown-Pipeline wandelt nur diese exakten Wrapper (`div`/`p`, Werte left/center/right) in Container um, jedes andere Roh-HTML bleibt verworfen. Ein Editor-Kontextmenü mit Formatbefehlen wurde bewusst nicht eingebaut: es würde das native Menü mit Ausschneiden/Einfügen und Rechtschreibvorschlägen ersetzen.
- **Suchen/Ersetzen/Makros:** eigenes CodeMirror-Suchpanel auf Basis des CodeMirror-Suchzustands. Regellisten laufen der Reihe nach, literal oder als regulärer Ausdruck, als eine Änderung. JavaScript-Makros laufen als Blob-Worker (von `worker-src blob:` bereits erlaubt), erhalten nur Text, haben keine DOM-/IPC-Funktionen, Netzwerk-APIs werden im Worker entfernt und `connect-src` blockiert ohnehin; Abbruch nach 5 s. Die App-CSP ist unverändert, es gibt kein `eval` im Hauptfenster.
- **Synchronisation:** `data-source-start/-end` auf Blockelementen (Sanitizer erlaubt nur Ziffern), gecachte Ankerliste, binäre Suche und Interpolation; Neuvermessung nur bei Rendern, ResizeObserver, Bildladen und Falten. Die zuletzt bediente Seite führt, Scroll-Echos der anderen Seite werden ignoriert. Nur in Split-Ansicht von Markdown aktiv.
- **Sitzung:** `session.rs` speichert pro Fensterlabel atomar unter `session/session.json`, ungespeicherte Texte unter `session/recovery/<id>.txt` (IDs nur `[A-Za-z0-9-]`). Beschädigte Dateien werden beiseitegelegt, einzelne defekte Tabs übersprungen. Nicht referenzierte Recovery-Dateien werden erst nach 7 Tagen gelöscht. Wiederhergestellte Dateien laden beim ersten Anzeigen; unerreichbare Pfade melden sich nach 15 s ohne den Start zu blockieren. Bei geändertem Datenträgerstand bleibt die alte Version gesetzt, ein normales Speichern meldet also den Konflikt statt zu überschreiben. Datei-Befehle laufen jetzt auf dem Blocking-Pool statt dem UI-Thread. „Duplizieren“ bleibt deaktiviert (kein gemeinsames Dokumentmodell), „Relativer Pfad“ ebenso (kein Projektordner).
- **Overflow:** reine Breitenberechnung (`visibleTabIds`), Mindestbreite 120 px, Overflow-Button-Breite vorab reserviert; nichts davon wird gespeichert.
- **Dateityp-Symbole:** 259 gelieferte ICOs → 136 unterschiedliche Dateien (`src-tauri/assets/file-icons`, nur im Windows-Bundle, Installer +~10 MB), 32-px-PNG-Vorschauen im Frontend. Eine ProgID pro Endung (erste Endung einer Gruppe behält die alte ProgID) mit statischem `DefaultIcon`; kein Shell-Icon-Handler-DLL (Explorer-Stabilität, gesperrte DLL bei Updates). `*_auto_file`-Klassen werden nur beim App-Start geprüft, nicht per Registry-Überwachung. Einige gelieferte Symbole sind Familien-Symbole (z. B. `dart`, `r`, `jl` mit Python-Logo, `svg` mit XML-Symbol, `html` mit Browser-Logo) und wurden unverändert übernommen; `ppk.ico` (nur 256 px, Aufschrift „.pkk“, keine unterstützte Endung) wurde übersprungen. Die Badge-Option aus der Spezifikation entfällt, da das Abzeichen Teil der Grafiken ist.

## Lokal durchgeführt

| Prüfung | Ergebnis |
| --- | --- |
| `npm audit --audit-level=low` | keine gemeldeten Schwachstellen |
| Versions-/Zuordnungs-/Symbolsynchronisierung | v0.1.9; 110 Formatgruppen, 136 Symbole für 306 Endungen synchron |
| Svelte/TypeScript | 0 Fehler, 0 Warnungen |
| Vitest | 179 Tests in 25 Dateien bestanden |
| Playwright / Edge, Produktionsbuild | 35 Tests bestanden (9 neue Fälle) |
| Rust unter Windows | 63 Tests bestanden |
| Rustfmt / Clippy `-D warnings` | bestanden |
| Vollständiger Tauri-Build mit NSIS-Installer | bestanden; generierte Hooks (306 ProgIDs, `*_auto_file`-Aufräumschleife) kompilieren, Symbole liegen unter `$INSTDIR\assets\file-icons` |
| Lokale Root-EXE | `P-Viewer.exe` als v0.1.9 neu gebaut, Symbole daneben unter `assets/file-icons` |
| Nativer Windows-/WebView2-Smoke | bestanden, zusätzlich: Suchwidget-Styles unter echter CSP, JavaScript-Makro im Worker unter echter CSP mit Undo, Sitzung und Recovery in isoliertem Ordner, Neustart mit wiederhergestellten Tabs, ungespeichertem Text und Konflikthinweis |
| Visuelle Prüfung | Toolbar, Tabs mit Symbolen, Kontextmenü, Overflow-Menü, Suchwidget, Makro-Dialog und Einstellungen in Dark/Light per Screenshot; native EXE per Smoke-Screenshot |

## Neue Regressionen

- Formatierung: Umschalten fett/kursiv/kombiniert, Marker innerhalb/außerhalb der Auswahl, Wort am Cursor, Mehrfachauswahl mit einem Undo, Überschriftenebenen, Listen/Aufgaben/Zitate mehrzeilig, Codeblöcke, Links mit Sonderzeichen, Bilder, Tabellen, Trennlinie ohne Setext-Effekt, Ausrichtung umschalten, Einrücken, HTML-Dialekt.
- Suche: Zähler, Optionen, Ersetzen-alle mit Undo; Mehrfach-Ersetzen: Parser, Reihenfolge, Muster mit Gruppen, ganze Wörter, leere Treffer, Minimaländerung, Verlauf/Makros mit Limit; Browser: Makro per Klick, JS-Makro, Skriptfehler, Endlosschleifen-Abbruch.
- Tabs: Pinned-Gruppen, Verschieben, Sortieren, Bulk-Ziele in logischer Reihenfolge, Drag-Index mit Overflow, Ordnerhinweise, Fuzzy-Suche, Overflow-Auswahl ohne Oszillation, Transfer-/Session-Validierung; Browser: Kontextmenü, Rückgängig, Sammeldialog, Overflow mit Suche und Resize, Sitzungswiederherstellung, Konfliktschutz.
- Sync: Interpolation innerhalb und zwischen Ankern, Rundlauf, Normalisierung; Browser: Split-Breite, Editor-Scroll bewegt Vorschau, Klicknavigation, Sync-Schalter.
- Rust: Session-Speicher, Label-Reihenfolge, einmalige Übergabe, beschädigte Dateien, Pruning, Unterbrechung nach Löschen, späte Schreibzugriffe geschlossener Fenster, Recovery-ID-Validierung; Terminal-Ordner; Symbolzuordnung, ProgIDs, Symbolmodus, Befehlsvergleich.

## Verbleibende Abnahme

Die Windows-Registry-Änderungen (ProgID pro Endung, Symbolmodus, `*_auto_file`-Reparatur) sind strukturell und per Installer-Build geprüft, aber nicht durch eine Installation auf diesem Rechner, um die vorhandene Installation nicht zu verändern. Nach dem Update sollte im Explorer geprüft werden, dass verknüpfte Dateien ihre Dateityp-Symbole zeigen (Explorer kann alte Symbole kurz zwischenspeichern). macOS/Linux-Plattformbuilds und signierte Updater-Artefakte prüft der Tag-Workflow. Herkunft und Nutzungsrechte der gelieferten Symbolgrafiken sind mit dem Beitragenden zu bestätigen. Die durchgeführten Tests fanden keine Regressionen; eine allgemeine Garantie für Bugfreiheit ist damit nicht verbunden.
