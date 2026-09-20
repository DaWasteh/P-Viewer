# v0.1.5 – Qualitätsbericht und Release-Abnahme

Prüfdatum: 20. September 2026. Ziel dieser Version: Fenster merken sich Geometrie und Zustand, und der Start zeigt keinen weißen Blank-Screen mehr. Kein Anspruch auf vollständige Fehlerfreiheit; die Grenzen stehen unten.

## Durchgeführt

| Prüfung | Ergebnis |
| --- | --- |
| `npm audit --audit-level=low` | keine gemeldeten Schwachstellen |
| Versions-/Dateizuordnungssynchronisierung | v0.1.5; 306 Endungen in 110 Gruppen unverändert |
| Svelte/TypeScript | 0 Fehler, 0 Warnungen |
| Vitest | 122 Tests in 19 Dateien bestanden (unverändert) |
| Playwright / Edge, Produktionsbuild | 17 Interaktionstests bestanden (vorher 16) |
| Rust-Tests unter Windows | 43 bestanden (vorher 39) |
| Rustfmt / Clippy `-D warnings` | bestanden |
| Lokaler optimierter Tauri-Build | gebaut und nach `P-Viewer.exe` kopiert |
| Native Windows-/WebView2-Prüfung | Root-EXE v0.1.5 bestanden: alle Prüfungen aus v0.1.4 plus sichtbares Hauptfenster nach dem Sichtbarmachen durch das Frontend; anschließender Start stellt die gespeicherte Fenstergröße wieder her |

Die Browserprüfungen sind zusätzlich Teil von Branch- und Tag-CI. Der jeweilige GitHub-Run ist der Nachweis für die tatsächlich ausgeführte Linux-CI, nicht diese lokal erstellte Tabelle.

## Was geprüft wurde

### Fensterzustand und Start in Rust (`windows.rs`, `lib.rs`)

- `tauri-plugin-window-state` ist mit den Flags Größe, Position und Maximierung registriert; Sichtbarkeit bleibt bewusst ausgeschlossen, weil das Fenster von der App selbst sichtbar gemacht wird. Alle Dokumentfenster (`main`, `main-N`) teilen sich den Zustandsschlüssel `main`; Vorschaufenster werden herausgefiltert (Unit-Test).
- Starthintergrund: gespeichertes Design `dark`/`light` gewinnt, `system` oder fehlende Einstellung folgt dem Fensterthema des Betriebssystems, unbekannte Werte fallen auf Dunkel zurück (Unit-Test). Das Lesen von `preferences.theme` aus `settings.json` toleriert fehlende Schlüssel, falsche Typen und ungültiges JSON (Unit-Test).
- Kaskadierung neuer Fenster ohne Zielposition: 40 CSS-Pixel Versatz vom zuletzt benutzten Fenster, nur wenn das Fenster vollständig im Arbeitsbereich des Monitors bleibt, auch bei negativen Koordinaten eines links liegenden Zweitmonitors (Unit-Test). Maximierte oder minimierte Referenzfenster kaskadieren nicht; per Tab-Drag abgelöste Fenster werden vor dem Positionieren de-maximiert.
- Sicherheitsnetz: ein Thread zeigt jedes Dokumentfenster nach 1,5 s, falls das Frontend `reveal_window` nie aufruft; ein bereits sichtbares Fenster wird nicht erneut fokussiert.

### Frontend

- Browsertest gegen den Produktionsbuild: `reveal_window` wird genau einmal aufgerufen, erst nachdem der Einstellungsspeicher gelesen und das beim Start wartende Dokument geöffnet wurde; spätere externe Öffnungen lösen keinen zweiten Aufruf aus.
- Alle bisherigen Regressionen (Tab-Transfer, letzter Tab, Update-Sperre, Bildansicht, HTML-Vorschau, LaTeX-Staleness) laufen unverändert.

### Reale native Windows-Prüfung

`scripts/smoke-local-launcher.mjs` prüft zusätzlich zu v0.1.4, dass die Seite im WebView2 nach dem Start `visible` meldet, also das zunächst unsichtbare Fenster tatsächlich gezeigt wurde; das zweite Fenster des Smokes erschien um 40 px kaskadiert und wurde über das Schließen seines letzten Tabs per regulärer Schließanfrage beendet. Ein zweiter, einmaliger Start gegen die vom Smoke geschriebene `.window-state.json` bestätigte im laufenden Fenster die wiederhergestellte Größe (1280 × 820 physische Pixel) und die Position (Client-Ursprung exakt um Rahmen und Titelleiste neben der gespeicherten Außenposition).

- Browsertest: das Schließen des letzten Tabs ruft `plugin:window|close` auf und zerstört das Fenster erst über die delegierte Schließanfrage; der Mock spiegelt Tauris Delegation an den Fenster-Listener.

## Bekannte Grenzen

- Der Positionswechsel per Maus und die Wiederherstellung auf Mehrmonitor-Setups sind nur über die Plugin-Logik (Monitor-Schnittprüfung) und Unit-Tests abgedeckt, nicht automatisiert am nativen Fenster.
- Linux- und macOS-Verhalten des Plugins (Wayland-Positionen, macOS-Vollbild) stammen aus dem Plugin und wurden lokal nicht ausgeführt; die CI baut diese Plattformen, testet sie aber nicht nativ.
- Ein sehr großes Startdokument verzögert das Sichtbarmachen bis zum Rust-Timeout (1,5 s); in dieser Zeit ist nur die design-farbige leere Fläche sichtbar.
