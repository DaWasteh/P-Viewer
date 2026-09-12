# v0.1.3 – Qualitätsbericht und Release-Abnahme

Prüfdatum: 12. September 2026 (zweiter Durchgang; erster Durchgang 7. September 2026). Ziel: schlanker Editor/Viewer, sichere Datei-E/A, robuste Vorschauen und nachvollziehbare Testgrenzen. Kein Anspruch auf vollständige Fehlerfreiheit oder vollständige Unterstützung jeder Ausprägung aller Formate.

## Durchgeführt

| Prüfung | Ergebnis |
| --- | --- |
| `npm audit --audit-level=low` | keine gemeldeten Schwachstellen |
| Versions-/Dateizuordnungssynchronisierung | v0.1.3; 306 Endungen in 110 Gruppen, davon 8 Bild-/PDF-Gruppen ohne Vorauswahl |
| Svelte/TypeScript | 0 Fehler, 0 Warnungen |
| Vitest | 119 Tests in 19 Dateien bestanden (vorher 110) |
| Playwright / Edge, Produktionsbuild | 14 Interaktionstests bestanden (vorher 12) |
| Rust-Tests unter Windows | 30 bestanden (vorher 29) |
| Rustfmt / Clippy `-D warnings` | bestanden |
| Lokaler optimierter Tauri-Build | gebaut und nach `P-Viewer.exe` kopiert |
| Native Windows-/WebView2-Prüfung | Root-EXE v0.1.3 gestartet und geprüft, nicht nur ein Browser-Mock |

Die Browserprüfungen sind zusätzlich Teil von Branch- und Tag-CI. Der jeweilige GitHub-Run ist der Nachweis für die tatsächlich ausgeführte Linux-CI, nicht diese lokal erstellte Tabelle.

## Zweiter Durchgang: Fehlersuche in den Darstellungen

Gefunden und behoben, jeweils mit Regressionstest:

- **LaTeX:** `\begin{center}…\end{center}`, `\begin{abstract}…\end{abstract}` und ähnliche Umgebungen auf einer Zeile verloren ihren Text; `\item A \item B` auf einer Zeile ergab einen einzigen Listenpunkt; die Breitenargumente von `minipage`, `frame` und weiteren Umgebungen erschienen als Fließtext. Ein Vorlauf isoliert Block-Befehle auf eigene Zeilen, ohne wohlgeformte Quellen zu verändern (Absatz- und Listenabstände bleiben identisch).
- **SVG:** `max-width: 100%` deckelte das gezoomte Bild auf die Pane-Breite, sodass „Vergrößern“ bei breiten Grafiken wirkungslos war; beim Überlauf war der linke Rand durch `place-items: center` unerreichbar. Eine XML-Deklaration mit Legacy-Kodierung (`encoding="ISO-8859-1"`) hätte die bereits als UTF-8 decodierte Quelle im Browser falsch decodiert; sie wird umgeschrieben und die Data-URL trägt `charset=utf-8`.
- **JSON:** `tsconfig.json`, `.babelrc`, `.eslintrc`, VS-Code-`settings.json`/`launch.json`, `*.code-workspace` und weitere Werkzeugdateien wurden mit „InvalidCommentToken“ abgelehnt; sie gelten jetzt als JSONC. Fehlermeldungen sind auf Deutsch; nachgestellte Kommas und mehrere Wurzelwerte erhalten einen gezielten Hinweis. Strikte `.json`-Dateien bleiben strikt.
- **Notebook:** `image/svg+xml`-Ausgaben (Matplotlib/Plotly) fehlten und fielen auf `<Figure …>` zurück; sie werden als opake `<img>`-Data-URL dargestellt, sodass kein SVG-Markup und kein Skript den DOM erreicht.
- **Sprachauflösung:** Sondernamen wie `Guardfile`, `Podfile`, `.eslintrc`, `.zprofile` waren nur in der Hervorhebungstabelle, nicht in der Dateityptabelle eingetragen; beide Tabellen sind jetzt über die Sprach-ID der Sondernamen verbunden und werden gemeinsam getestet.

Geprüft und ohne Befund: CSV-Parser (zitierte Leerrecords, CRLF, Trennzeichenerkennung), JSON-Knoten-/Tiefengrenzen, Markdown-Sanitizer-Reihenfolge (KaTeX und Hervorhebung laufen nach dem Sanitizer, `trust: false`), HTML-Vorschau-Allowlist, Pfadauflösung, Rust-Kodierungserkennung und Konfliktprüfung, Editor-Sitzungszustand pro Tab.

### Formaterweiterung

- Bild- und PDF-Ansicht: Rust liefert eine signaturgeprüfte Base64-Payload (PNG, JPEG, GIF, WebP, BMP, ICO, AVIF, `%PDF-`), nie eine Textdecodierung; falsch benannte Dateien werden mit ihrem echten Typ gezeigt oder abgelehnt. Bilder bis 32 MiB, PDF bis 64 MiB. Editor, Speichern, Speichern unter, Typwechsel und Kodierungswahl sind für diese Dokumente gesperrt; Strg/Cmd+S löst keinen Schreibvorgang aus (Browsertest). Bild- und PDF-Gruppen sind in der Standardprogramm-Auswahl bewusst abgewählt.
- 137 neue Endungen, 95 neue Sondernamen und drei neue Stream-Modi (HCL/Terraform, Nix, Vim Script); jede Endung mit Hervorhebung wird per Test geladen, jeder Sondername ebenfalls. Ohne Hervorhebung bleiben absichtlich `go.mod`/`go.sum`/`go.work` und die Plaintext-Formate.

### Reale native Windows-Prüfung

`scripts/smoke-local-launcher.mjs` startet ausschließlich einen eigenen Prozess mit temporären Dokumenten und einem separaten WebView-Profil. CDP ist nur für diesen Testprozess über einen lokalen Port aktiviert. Keine persönlichen Dokumente, Standardprogramme oder bestehenden App-Fenster werden verändert; normale native Einstellungen können gelesen werden, werden im Test aber nicht umgestellt.

Nachweise:

- mehrere Startargumente öffnen die vorgesehenen Tabs;
- JSONL-Datensätze werden sichtbar gerendert;
- ein PNG-Startargument öffnet den schreibgeschützten Bildbetrachter über den echten Rust-Binärpfad mit Pixelmaßen;
- echte Rust-E/A bewahrt Unicode inklusive Emoji und CRLF beim Speichern;
- nach externer Änderung verweigert Speichern den Konflikt und erhält die externen Bytes;
- echtes Tauri-Open-Event während eines Modals wird gepuffert und doppelte Pfade werden nur einmal geöffnet;
- explizites Neuöffnen mit UTF-16LE liest mehrdeutiges BOM-loses `你好` korrekt;
- Einstellungen öffnen und schließen als echtes Modal;
- keine erfassten JavaScript-Seitenfehler während dieser Interaktionen.

### Browser- und Extremfälle

- Tabwechsel bewahren Text, Cursor und Undo; Einstellungen halten den Tastaturfokus und blockieren Hintergrundkürzel.
- Strg/Cmd+Umschalt+V schaltet nicht mehr unerwartet den Editor aus.
- Markdown-Split bei 900 px lässt genügend Textbreite; ungültige Fragment-Escapes verursachen keine Exception; Dark-/Light-Darstellung visuell anhand Screenshots geprüft.
- SVG-Zoom überschreitet nachweislich die Pane-Breite, der Body wird scrollbar und der linke Bildrand bleibt bei 0; Bildbetrachter meldet echte Pixelmaße und skaliert auf 125 % auf 3 px.
- 20.000-fach verschachteltes JSON wird vor rekursiven Parsern begrenzt; 100.000 Einträge überschreiten kontrolliert das Knotenbudget. Vorschau erholt sich nach einer Korrektur.
- CSV-Extremfälle prüfen 5.000 × 256 Felder sowie erst spät breiter werdende Zeilen; gemountete Tabellen bleiben im aggregierten Budget. Zitierte Leerrecords und unvollständige Quotes sind abgedeckt.
- 50.000 Markdown-Überschriften, Notebook-Gesamtlast, überlange Fehlerfelder, 5.000 verschachtelte LaTeX-Gruppen und extreme PDF-Seitenverhältnisse werden deterministisch begrenzt.
- HTML-/SVG-Skripte und externe Ressourcen bleiben in sicheren Vorschauen blockiert. Chromium meldet für manche CSS-`url()` einen Request-Versuch; der Test verlangt ausdrücklich `csp` als Abbruchgrund und akzeptiert keinen DNS-/HTTP-Fehler als Sicherheitsnachweis.
- Notebook-`text/latex` ohne Markdown-Begrenzer erzeugt KaTeX, ohne vertrauenswürdige Befehle zu aktivieren.
- Native Dateitests prüfen SHA-256-Konflikte, gleich lange externe Änderungen, gelöschte Quellen, Folgespeicherungen, Lesegrenzen, NUL-Bytes außerhalb des früheren 8-KiB-Samples sowie Signaturprüfung, Größenlimit und Typmismatch für Binärdokumente.
- Loopback-Tests prüfen zwei gleichzeitig gültige Vorschau-Cookies. HEAD ohne Body war bereits durch `tiny_http` implementiert; der anfängliche Auditverdacht wurde anhand der Abhängigkeit widerlegt und nun durch einen Regressionstest abgesichert.

**Explizit gemockt:** Die Browser-Lifecycle-Tests verzögern IPC kontrolliert, um verspätete HTML-Fenster, veraltete LaTeX-Ergebnisse, Open-Events während Save und den Update-Neustart zu prüfen. Der PDF-Test rendert ein synthetisches 1.000-Seiten-Dokument mit echtem PDF.js und hält genau eine Canvas vor. Er verwendet keinen externen TeX-Compiler. Der Update-Test installiert keine echte Software. Der Browser-Bildtest liefert ein 2×2-PNG über den gemockten IPC; der echte Rust-Pfad ist durch den nativen Smoke und die Rust-Tests abgedeckt.

## Bekannte Grenzen / bewusster Folgebedarf

- Vorschaugrenzen sind konservative Ressourcenbudgets, keine allgemeine Laufzeitgarantie für alle möglichen Parser-/Font-/Bilddaten. Vollständige Quelle bleibt editierbar; die Rich-Vorschau kann bewusst eingeschränkt sein.
- Speicherkonflikte sind optimistisch: SHA-256 wird direkt vor Commit geprüft, aber es gibt keinen atomaren systemweiten Compare-and-Swap zwischen unabhängig schreibenden Prozessen. Save-As in ein anderes Ziel folgt weiterhin dem Dateidialog-Overwrite-Verhalten.
- Pfade werden kanonisiert und Windows-UNC/Extended-Pfade verglichen. Eine plattformübergreifende stabile Hardlink-Dateiidentität sowie beliebige nicht-UTF-8-Unix-Dateinamen sind nicht implementiert.
- Atomare Ersetzung garantiert keinen vollständigen Erhalt aller plattformspezifischen ACLs, xattrs, Alternate Data Streams oder sonstiger Zusatzmetadaten. Dateien mit solchen Anforderungen vorerst nicht in-place bearbeiten; separate Kopien verwenden. Hier fehlt noch eine plattformweise definierte und getestete Metadatenstrategie.
- Gemischte Zeilenenden werden beim Bearbeiten/Speichern weiterhin auf den erkannten Dokumentstil vereinheitlicht. BOM-loses Unicode ist nicht eindeutig automatisch erkennbar; dafür existiert jetzt die explizite Kodierungswahl.
- Bild- und PDF-Ansicht sind reine Betrachter: kein Bearbeiten, kein Konvertieren, kein Textlayer/Suche im PDF. Die decodierbaren Bildformate hängen von der WebView ab (AVIF unter WebKit erst ab macOS 13). Sehr große Bilder werden vollständig als Base64 über IPC übertragen; oberhalb von 32 MiB (Bild) beziehungsweise 64 MiB (PDF) wird bewusst abgelehnt.
- PDF ist weiterhin die Vorschau des optionalen LaTeX-Builds und jetzt zusätzlich ein eigenständiger Betrachter, kein Editor. Textlayer/Screenreader-Lesereihenfolge und komplexe CJK-/JPX-/Spezialfont-PDFs benötigen weitere Abnahme.
- Aktive HTML-Vorschau ist ein ausdrücklich bestätigter Browsermodus mit Netzwerkzugriff, kein netzwerkfreier Sandbox-Ersatz. Quelltext-/Ressourcenlimits ersetzen kein CPU-/Bilddecoder-Sandboxing.
- GLSL/HLSL, CUDA und Cython nutzen die nächstliegenden vorhandenen Grammatiken (C++ beziehungsweise Cython); `.cl` wird als Common Lisp gelesen, OpenCL-Kernel mit dieser Endung erhalten daher eine unpassende Hervorhebung.
- Kein LSP, Terminal, Notebook-Codeausführen, Office-/EPUB-Konverter oder zusätzliches Cloud-System wurde eingeführt.

## Vor öffentlicher Veröffentlichung noch erforderlich

Gemäß `docs/RELEASING.md` bleibt der signierte GitHub-Release zunächst ein **Entwurf**:

- Windows-NSIS-Installation/Deinstallation und Candidate-only-Registrierung einschließlich unverändertem `UserChoice` in einer sauberen Testumgebung;
- echte macOS- und Linux-Installer-Smokes, einschließlich Öffnen, Speichern, Schrift-/WebView-Darstellung sowie Bild-/PDF-Öffnen über die neuen Zuordnungen;
- vollständiger signierter Update-Installations-/Neustarttest;
- Kontrolle aller signierten Release-Artefakte und `latest.json` nach erfolgreichem Tag-Workflow.

Diese Punkte werden nicht aus grünen Unit-Tests oder einem erfolgreichen Cross-Platform-Build abgeleitet. Die lokal verwendete Root-EXE ist unabhängig davon neu gebaut und geprüft.
