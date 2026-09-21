# v0.1.7 – Qualitätsbericht und Release-Abnahme

Prüfdatum: 21. September 2026. Ziel: Dateien von Netzlaufwerken/NAS auch dann öffnen, wenn der Netzwerkprovider die kanonische Pfadauflösung nicht unterstützt oder dabei einen Fehler meldet.

## Fehlerbild und Änderung

Fredy meldet beim Öffnen von Netzwerkdateien: „Dateipfad kann nicht aufgelöst werden: Das System kann die angegebene Datei nicht finden. (os error 2)“. Die Meldung stammt aus der bisher zwingenden `canonicalize()`-Prüfung in beiden Lese-Kommandos, noch bevor Dateiinhalte gelesen werden. Ein Fehler beim Ermitteln des endgültigen Pfads bedeutet bei Windows-Netzwerkprovidern nicht zwangsläufig, dass die Datei nicht lesbar ist. Microsoft dokumentiert entsprechende Einschränkungen für SMB und virtuelle Laufwerke bei [GetFinalPathNameByHandleW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew).

`read_document` und `read_binary_document` verwenden jetzt denselben begrenzten Leser: Der Eingabepfad wird ohne Dateisystemabfrage absolut gemacht, die Datei über diesen Pfad gelesen und erst danach optional kanonisiert. Wenn die Kanonisierung scheitert, bleibt der absolute Originalpfad erhalten. Wenn sie gelingt, bleibt die bisherige kanonische Dokumentidentität erhalten. Doppelte Metadatenprüfungen im Binärleser entfallen; dessen 32-/64-MiB-Limits werden weiterhin am geöffneten Dateihandle durchgesetzt.

Die Fehlerstelle und der Rückfall sind durch Tests belegt; der konkrete Netzwerkprovider und die Zugriffsrechte auf Fredys Freigabe sind hier nicht verfügbar. Dies ist keine behauptete End-to-End-Reproduktion auf seinem NAS.

## Lokal durchgeführt

| Prüfung | Ergebnis |
| --- | --- |
| `npm audit --audit-level=low` | keine gemeldeten Schwachstellen |
| Versions-/Dateizuordnungssynchronisierung | v0.1.7; 110 Formatgruppen synchron |
| Svelte/TypeScript | 0 Fehler, 0 Warnungen |
| Vitest | 124 Tests in 20 Dateien bestanden |
| Playwright / Edge, Produktionsbuild | 17 Tests bestanden |
| Rust unter Windows | 49 Tests bestanden (6 zusätzliche Tests) |
| Rustfmt / Clippy `-D warnings` | bestanden |
| Optimierter Tauri-/Frontend-Build | bestanden; bekannter Vite-Hinweis zu Chunkgrößen >700 kB |
| Lokale Root-EXE | `P-Viewer.exe` als v0.1.7 neu gebaut |
| Nativer Windows-/WebView2-Smoke | bestanden: Startdateien, Bildansicht, JSONL, Unicode/CRLF-Speichern, echte CSP/Editorstyles, Single-Instance-Weiterleitung, Speicherkonflikt, Kodierungswechsel und Fenster-/Tab-Lifecycle |

## Neue Regressionen

- Reale Text-/PNG-/PDF-Dateien werden trotz injizierter Kanonisierungsfehler 2, 3, 5 und 50 vollständig gelesen; nur die finale Pfadabfrage ist simuliert, nicht der Dateizugriff.
- Der absolute Rückfallpfad ist erneut lesbar; Speichern mit Versionsprüfung funktioniert und externe Änderungen werden nicht überschrieben.
- Fehlende Dateien, Ordner, leere Eingaben und Größenüberschreitungen scheitern weiterhin, bereits vor der optionalen Pfadabfrage.
- Erfolgreiche Kanonisierung bleibt erhalten; relative Eingaben erhalten einen absoluten Rückfallpfad ohne globalen Wechsel des Arbeitsverzeichnisses.
- Windows-UNC-, Extended-UNC-, Laufwerks- und Extended-Laufwerkspfade behalten ihre Wurzeln (rein lexikalischer Test ohne erfundene Freigaben anzusprechen).
- Ein zusätzlicher Unix-Test prüft kanonische Symlink-Identität und Speichern ins Ziel, ohne den Symlink zu ersetzen; dieser Test läuft in der Linux-CI, nicht lokal unter Windows.

## Sicherheitsgrenzen und verbleibende Abnahme

- Eingebettete lokale Bilder und aktive HTML-Ressourcen benötigen weiterhin kanonische Pfade für ihren Ordnergrenzen-/Symlink-Schutz. Der neue Rückfall darf dort nicht verwendet werden; auf problematischen Freigaben können diese Ressourcen daher weiterhin abgewiesen werden, während das Dokument selbst geöffnet wird.
- Nicht vorhandene, nicht verbundene oder nicht berechtigte Freigaben werden durch den Fix nicht zugänglich gemacht. Auch unterstützt nicht jeder Netzwerkprovider atomisches Ersetzen beim Speichern.
- Fredys Freigabe sollte nach dem Update nochmals über den ursprünglichen Öffnungsweg geprüft werden, ergänzend per UNC-Pfad und (falls vorhanden) Laufwerksbuchstaben. Speichertests nur mit einer entbehrlichen Kopie durchführen.
- Signierte Plattformpakete, Updater-Metadaten und Veröffentlichung werden durch den bestehenden Tag-Workflow geprüft. Ein nativer Smoke ersetzt keinen Installer-/Update-Installationslauf.
