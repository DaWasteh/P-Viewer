# Prüfbericht v0.2.2

## Lokal unter Ubuntu 26.04 / GNOME Wayland (x86_64)

- Node.js 22.23.1, Rust 1.96.1, WebKitGTK 2.52.6.
- `npm ci`, `npm audit --audit-level=low`: keine gemeldeten Sicherheitslücken nach dem gezielten Update von devalue auf 5.9.4.
- Versionsabgleich und generierte Dateizuordnungen/Symbole: erfolgreich.
- Svelte-/TypeScript-Prüfung: keine Fehler oder Warnungen.
- Vitest: **196 Tests in 26 Dateien** erfolgreich. Der ergänzte POSIX-Pfadfall schlug vor der Korrektur fehl und besteht danach.
- Playwright-Produktionsbuild: **74 Tests** erfolgreich, je 37 unter Chromium und WebKit. Abgedeckt sind u. a. Editor/Undo, Speicherkonflikte, Formatierung, Markdown/HTML-Sanitizing, JSON, CSV, SVG, Notebook, LaTeX-Livevorschau, PDF-Lifecycle, Tabs, Einstellungen, Sitzungswiederherstellung und Makros.
- Rust: **63 Tests** erfolgreich; `cargo fmt --check` und Clippy mit `-D warnings` erfolgreich.
- `npm run build:launcher`: optimierter nativer Linux-Build erfolgreich.
- `python3 scripts/smoke-linux-launcher.py`: echter Release-Build mit WebKitGTK und echten Rust-Befehlen erfolgreich. Prüft Startdateien, sichtbares Fenster, PNG, JSONL, Unicode-/CRLF-Speichern, separate POSIX-Pfade mit Groß-/Kleinschreibung und Backslash, Single-Instance-Weiterleitung/Deduplizierung während des Einstellungsdialogs, Schutz vor externen Änderungen, JavaScript-Makro und Abbruch einer Endlosschleife sowie gespeicherte Sitzungs-/Recovery-Dateien. Dokumente, Einstellungen und Cache liegen dabei ausschließlich in temporären Verzeichnissen. Screenshot: lokal `test-results/native-linux-smoke.png`.

- Lokales DEB-Paket gebaut und installiert; derselbe native Smoke mit `/usr/bin/p-viewer /usr/share/applications/P-Viewer.desktop` erfolgreich. Die Weiterleitung läuft dabei über GIO und den installierten Desktop-Eintrag, nicht über einen direkten Binäraufruf.

## Gefundene Ursachen und Korrekturen

- Tauri erzeugte `Exec=p-viewer` ohne Datei-Platzhalter; GIO meldete `supports_files=False` und `supports_uris=False`. Eine gemeinsame Linux-Vorlage mit `%F` repariert „Öffnen mit“ für DEB/RPM sowie das daraus erzeugte AppImage. Der Release-Workflow kontrolliert den gepackten DEB-Starter.
- Im über Windows gemeinsam verwendeten Projektordner waren nur Windows-native npm-Module vorhanden (`@rollup/rollup-linux-x64-gnu` fehlte). Ein getrennter Linux-Klon mit `npm ci` und den Tauri-Systempaketen behebt die lokale Build-Umgebung, ohne Windows-Abhängigkeiten zu überschreiben.
- POSIX-Dateinamen dürfen Backslashes enthalten. Der bisherige Tab-Abgleich normalisierte diese fälschlich zu `/` und konnte dadurch zwei verschiedene Dateien zu einem Tab zusammenfassen. POSIX-Pfade werden jetzt unverändert verglichen; Windows-Normalisierung bleibt erhalten.
- Der Dependency-Audit meldete Sicherheitslücken in devalue 5.9.2; das Lockfile verwendet jetzt 5.9.4.
- WebKit wird nun auch im Linux-CI geprüft, statt ausschließlich Chromium. Frontend-Builds und Browserregressionen dürfen nicht parallel dieselben Build-Verzeichnisse überschreiben.

## Grenzen

Browserregressionen verwenden gemockte Desktop-Befehle; der zusätzliche Linux-Smoke ersetzt diese für die oben genannten nativen Funktionen durch echtes Datei-I/O. Er prüft Recovery-Dateien, aber keinen vollständigen Neustart mit Wiederherstellung. Texteingabe im nativen Smoke erfolgt über die WebView-Editing-API, damit WebKitWebDrivers Wayland-Clipboard-Pfad nicht die echte Benutzerzwischenablage verwendet; Tastaturkürzel werden in den Browsertests geprüft.

Kein vollständiger Test aller 306 Dateiendungen, kein realer externer TeX-Compiler und kein signiertes In-App-Update-Installationsverfahren. Windows- und macOS-Laufzeittests sind auf diesem Ubuntu-System nicht möglich; die Release-Matrix baut die vier Zielplattformen separat. Ein erfolgreicher Build ist keine vollständige interaktive Abnahme dieser Betriebssysteme.
