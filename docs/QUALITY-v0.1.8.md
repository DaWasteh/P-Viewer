# v0.1.8 – Qualitätsbericht und Release-Abnahme

Prüfdatum: 21. September 2026. Ziel: gespeicherter Standard-Anzeigemodus mit Regeln pro Dateiendung sowie dunklere Zeilennummernleiste entsprechend dem Nutzer-Screenshot.

## Verhalten und Grenzen

- `defaultViewMode` und `extensionViewModes` ergänzen den vorhandenen Einstellungsbestand; fehlende/ungültige Werte fallen auf **Edit** und keine Ausnahmen zurück. Andere gültige Einstellungen bleiben erhalten.
- Regeln gelten beim Start und beim Erzeugen/Öffnen eines neuen Dokuments, nicht rückwirkend auf bereits offene Tabs. Endungen werden normalisiert, die längste passende Endung gewinnt. Endungslose Dateien verwenden den Standard. Die Einstellung ist unabhängig von System-Dateizuordnungen.
- Manuelle Modi sind tabbezogen; Tabwechsel, Speichern und Dateitypwechsel setzen sie nicht zurück. Beim Fenstertransfer zählt der übertragene Modus, nicht der Standard des Zielfensters.
- Native Startdateien und Transfers warten auf geladene Einstellungen. Auch ein verspätetes Store-Ergebnis überschreibt deshalb keinen übertragenen Tab-Modus.
- Bilder und PDF bleiben volle, schreibgeschützte Viewer, selbst bei expliziten Edit-/Split-Vorgaben.
- Ein gezieltes CodeMirror-Theme vor One Dark verdunkelt nur den Zahlenbereich (`#1e2229`, aktive Zeile `#252a33`) und verbessert den Zahlenkontrast. Syntax-/Inhaltsfarben und Light Mode bleiben erhalten. Keine CSP-Änderung.

## Lokal durchgeführt

| Prüfung | Ergebnis |
| --- | --- |
| `npm audit --audit-level=low` | keine gemeldeten Schwachstellen |
| Versions-/Dateizuordnungssynchronisierung | v0.1.8; 110 Formatgruppen synchron |
| Svelte/TypeScript | 0 Fehler, 0 Warnungen |
| Vitest | 126 Tests in 20 Dateien bestanden |
| Playwright / Edge, Produktionsbuild | 26 Tests bestanden (9 neue Fälle) |
| Rust unter Windows | 49 Tests bestanden |
| Rustfmt / Clippy `-D warnings` | bestanden |
| Optimierter Tauri-/Frontend-Build | bestanden; bekannter Vite-Hinweis zu Chunkgrößen >700 kB |
| Lokale Root-EXE | `P-Viewer.exe` als v0.1.8 neu gebaut |
| Nativer Windows-/WebView2-Smoke | bestanden: Startdateien, Bildansicht, JSONL, Unicode/CRLF-Speichern, echte CSP/Editorstyles, Single-Instance-Weiterleitung, Speicherkonflikt, Kodierungswechsel und Fenster-/Tab-Lifecycle |
| Visuelle Prüfung | dunklere Zahlenleiste und neue Einstellungen im hellen Design anhand der Browser-Screenshots geprüft |

## Neue/erweiterte Regressionen

- Alle drei Defaults beim Start und bei neuen Tabs; manuelle Änderung bleibt im ursprünglichen Tab erhalten.
- UI: ungültige Endung, normalisierte Regel, Ändern/Entfernen, Reset; tatsächliches Browser-Speichern und Wiederladen nach Reload.
- Store-Migration und isolierte Reset-Kopien; zusammengesetzte Endungen, Groß-/Kleinschreibung, Dotfiles, Pfadsegmente und nicht passende/prototypische Schlüssel.
- Verzögerter nativer Store, Startdateien, Dateiendungs-Override und Standard-Fallback; Tabwechsel bewahrt manuelle Auswahl.
- Verzögerter Store plus Starttransfer: explizites Split gewinnt gegen View-Standard/Edit-Endungsregel; native Store-Set/Save-Aufrufe sind geprüft.
- Fenstertransfer serialisiert den Modus des betreffenden Tabs.
- PNG/PDF trotz Edit-Regel ohne Editor und Speichern, ohne halbierte Ansicht.
- Tatsächliche berechnete Dark-Mode-Gutter-/Inhaltsfarben und unveränderte helle Gutter-Farbe.

## Verbleibende Abnahme

Die nativen Store-IPC-Szenarien im Browser sind gemockt; der echte WebView2-Smoke verwendet die vorhandenen Einstellungen, verändert aber keine Benutzervorgaben für einen künstlichen Neustarttest. macOS/Linux-Plattformbuilds und signierte Updater-Artefakte werden durch den Tag-Workflow geprüft. Ein lokaler Smoke ersetzt keinen Installer- oder signierten Update-Installationslauf. Die durchgeführten Tests fanden keine Regressionen; eine allgemeine Garantie für Bugfreiheit ist damit nicht verbunden.
