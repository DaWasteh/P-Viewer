# v0.1.4 – Qualitätsbericht und Release-Abnahme

Prüfdatum: 16. September 2026. Ziel dieser Version: ein Prozess mit mehreren Dokumentfenstern, Tab-Verschiebung zwischen Fenstern und ein Fenster, das mit seinem letzten Tab schließt. Kein Anspruch auf vollständige Fehlerfreiheit; die Grenzen stehen unten.

## Durchgeführt

| Prüfung | Ergebnis |
| --- | --- |
| `npm audit --audit-level=low` | keine gemeldeten Schwachstellen |
| Versions-/Dateizuordnungssynchronisierung | v0.1.4; 306 Endungen in 110 Gruppen unverändert |
| Svelte/TypeScript | 0 Fehler, 0 Warnungen |
| Vitest | 122 Tests in 19 Dateien bestanden (vorher 119) |
| Playwright / Edge, Produktionsbuild | 16 Interaktionstests bestanden (vorher 14) |
| Rust-Tests unter Windows | 39 bestanden (vorher 30) |
| Rustfmt / Clippy `-D warnings` | bestanden |
| Lokaler optimierter Tauri-Build | gebaut und nach `P-Viewer.exe` kopiert |
| Native Windows-/WebView2-Prüfung | Root-EXE v0.1.4 bestanden: Startdateien, Zweitprozess-Weiterleitung bei offenem Modal, zweites Fenster im selben Prozess, Tab-Übergabe zwischen Fenstern, Schließen des letzten Tabs schließt nur dieses Fenster |

Die Browserprüfungen sind zusätzlich Teil von Branch- und Tag-CI. Der jeweilige GitHub-Run ist der Nachweis für die tatsächlich ausgeführte Linux-CI, nicht diese lokal erstellte Tabelle.

## Was geprüft wurde

### Fensterzuordnung in Rust (`windows.rs`)

- Labelmuster (`main`, `main-N`) erkennt nur Dokumentfenster; Vorschaufenster (`html-preview-…`) erhalten weiterhin keine Capabilities (Vitest prüft die Capability-Datei gegen ein Vorschaulabel).
- Pfad- und Tab-Warteschlangen pro Fenster: Deduplizierung, einmaliges Abholen, Obergrenzen (256 Pfade, 32 Tabs), Aufräumen beim Zerstören eines Fensters inklusive Rückgabe verwaister Tabs.
- Zielfensterwahl: zuletzt fokussiertes lebendes Fenster, deterministischer Fallback auf das niedrigste Label; Fenster unter dem Cursor bei Überlappung nach Fokusreihenfolge.
- Argumentauflösung eines Zweitprozesses relativ zu dessen Arbeitsverzeichnis; Ordner, fehlende Dateien und Leerstrings werden verworfen.

### Frontend

- Tab-Reihenfolge: Einfügeindex aus Tab-Mittelpunkten, In-place-Umsortierung mit Indexklemmung.
- Transferformat: Roundtrip inklusive ungespeicherter Änderungen und Binärnutzlast; beschädigte, falsch versionierte oder typfremde Nutzlasten werden abgelehnt, unbekannte Ansichtsmodi fallen auf „Edit“ zurück.
- Browsertests gegen den Produktionsbuild: Umsortieren per Maus ohne Fenstertransfer; Ablegen weit unterhalb der Leiste übergibt den Tab mit Inhalt, Pfad und Ansichtsmodus an Rust und entfernt ihn lokal; ein eingehender Tab erscheint ausgewählt, mit Dirty-Markierung und Ansichtsmodus; der letzte Tab wird nie aus dem eigenen Fenster heraus in ein neues Fenster verschoben; das Schließen des letzten Tabs zerstört das Fenster und erzeugt keinen leeren Tab; eine abgelehnte Bestätigung bei ungespeicherten Änderungen verhindert das Schließen; Strg/Cmd+Umschalt+N fordert ein neues Fenster an.
- Bestehende Regressionen (LaTeX-Build-Staleness, HTML-Vorschau-Lifecycle, gepufferte externe Öffnungen während eines Speichervorgangs, Update-Sperre, Bildansicht) laufen unverändert; die externe Öffnung nutzt jetzt den Pull-Pfad `take_pending_document_paths` nach einem Signal.

### Reale native Windows-Prüfung

`scripts/smoke-local-launcher.mjs` startet ausschließlich einen eigenen Prozess mit temporären Dokumenten und einem separaten WebView-Profil. Neu in dieser Version startet das Skript zusätzlich echte Zweitprozesse desselben Launchers: einmal mit einer doppelt übergebenen Datei bei geöffnetem Einstellungsdialog (der Zweitprozess muss sofort mit Code 0 enden, die Datei erscheint genau einmal nach dem Schließen des Dialogs) und einmal ohne Argumente (ein zweites Fenster `main-N` im selben Prozess). Anschließend wird ein Tab per `move_tab_to_window` an das zweite Fenster übergeben, dort geprüft und über seine Schließen-Schaltfläche geschlossen, wodurch das zweite Fenster verschwindet und das erste unverändert bleibt. Vor dem Lauf dürfen keine anderen P-Viewer-Fenster offen sein.

## Bekannte Grenzen

- Ein Tab, der über ein anderes P-Viewer-Fenster fallen gelassen wird, das das Quellfenster überdeckt, gilt als „im eigenen Fenster“ und öffnet ein neues Fenster; Tauri stellt keine Z-Reihenfolge bereit. Fenster nebeneinander legen löst das.
- Beim Verschieben bleibt die CodeMirror-Undo-Historie im Quellfenster zurück; Inhalt, gespeicherter Stand, Kodierung, Zeilenende, Version und Ansichtsmodus reisen mit.
- Cross-Prozess-Verschiebung gibt es nicht und ist nicht nötig: P-Viewer läuft immer als ein Prozess.
- Maximal 16 Dokumentfenster; pro Fenster gelten weiterhin 32 Tabs und 64 Millionen Zeichen. Ein Zielfenster, das den Tab nicht aufnehmen kann, reicht ihn in ein neues Fenster weiter, statt ihn zu verwerfen.
- Linux- und macOS-Verhalten des Single-Instance-Plugins (D-Bus beziehungsweise Socket) wurde nur kompiliert, nicht interaktiv geprüft; macOS-`Opened`-Ereignisse laufen über denselben Rust-Pfad wie Windows-Argumente.
