# Changelog

Alle Entwicklungsstufen folgen semantischer Vorabversionierung.

## 0.2.0

Erste Version der 0.2-Reihe: bündelt die Funktionen aus v0.1.9 (Formatierungsleiste, Suchen und Ersetzen, Mehrfach-Ersetzen und Makros, Editor ↔ Vorschau-Synchronisation, Sitzungswiederherstellung, Tab-Verwaltung, Overflow-Menü und Windows-Dateityp-Symbole) und macht sie leichter auffindbar.

- Neuer Knopf **Suchen** in der Werkzeugleiste neben Edit/View/Split mit „Suchen“ (Strg/Cmd+F), „Ersetzen“ (Strg+H, macOS Cmd+Alt+F) und „Mehrfach ersetzen und Makros …“ (Strg/Cmd+Umschalt+H); aus der reinen Leseansicht wechselt er in die geteilte Ansicht, damit die Treffer sichtbar sind
- Hinweisbox-Knopf der Formatierungsleiste: fügt die GitHub-Hinweisbox jetzt als eigenen Block unter dem aktuellen Absatz ein, statt sie mitten in die Zeile zu setzen; mehrfaches Klicken erzeugt dadurch keine verschachtelten Zeilen wie `> Hinweis> [!NOTE]` mehr, und eine Auswahl wird vollständig zum Hinweistext
- Regressionstests für beide Fälle ergänzt

## 0.1.9

Umsetzung der Verbesserungsvorschläge aus den Issues #1–#5 sowie Suchen und Ersetzen.

- **Formatierungsleiste (#1):** kompakte Leiste über dem Editor für Fett, Kursiv, Durchgestrichen, Inline-Code, Überschriften H1–H6, Aufzählung, nummerierte Liste, Aufgabenliste, Zitat, Codeblock mit Sprachauswahl, Link, Bild (mit Dateiauswahl und relativem Pfad), Tabelle (Spalten/Zeilen), Trennlinie, Links/Zentriert/Rechts, Ein-/Ausrücken und GitHub-Hinweisbox; echte Umschalter (erneutes Anwenden entfernt die Formatierung, bestehende Überschriftenebenen werden ersetzt), alle Auswahlen einer Mehrfachauswahl, ein Undo-Schritt pro Aktion, Auswahl bleibt erhalten; HTML-Dateien erhalten HTML-Tags; Tastenkürzel Strg/Cmd+B, +I, +Umschalt+X, +E und +K (das bisher von CodeMirror verdeckte Strg+I funktioniert jetzt); zu schmale Fenster verschieben seltenere Befehle in ein „…“-Menü; Einstellung **Formatierungsleiste: Automatisch/Immer/Nie** (Automatisch nur für Markdown und HTML)
- Markdown-Vorschau rendert `<div align="left|center|right">` bzw. `<p align=…>` als ausgerichteten Block mit Markdown-Inhalt; sonstiges Roh-HTML bleibt wie bisher entfernt, der Sanitizer lässt nur diese drei Werte zu
- **Suchen und Ersetzen wie in VS Code:** schwebendes Widget oben rechts im Editor (Strg/Cmd+F, Ersetzen mit Strg+H bzw. Cmd+Alt+F), inkrementelle Suche, Trefferzähler „2 von 12“, Groß-/Kleinschreibung, ganzes Wort und reguläre Ausdrücke (Alt+C/W/R), vorheriger/nächster Treffer, Ersetzen und Alle ersetzen als ein Undo-Schritt; auch in der schreibgeschützten Codeansicht (dort ohne Ersetzen)
- **Mehrfach ersetzen und Makros:** Strg/Cmd+Umschalt+H oder „Liste …“ im Suchwidget öffnet eine Ersetzungsliste (eine Regel pro Zeile, `suchen => ersetzen` oder Tab-getrennt, leerer Ersatz löscht), die der Reihe nach als ein Undo-Schritt angewendet wird – im ganzen Dokument oder nur in der Auswahl, wahlweise mit Groß-/Kleinschreibung, ganzen Wörtern und Mustern (reguläre Ausdrücke mit `$1`) und mit Live-Trefferzählung; alternativ transformiert ein JavaScript-Makro den Text (`text` rein, neuer Text per `return` raus) in einem abgeschotteten Worker ohne Datei-, Netzwerk- oder App-Zugriff mit 5-Sekunden-Abbruch; benannte Läufe werden als **Makros** dauerhaft gespeichert und mit einem Klick erneut ausgeführt, alle weiteren Läufe (auch „Alle ersetzen“ im Suchwidget) landen im **Verlauf** zum Laden, Bearbeiten oder direkten Ausführen – etwa für wiederkehrende Adblock-Listen-Pflege
- **Editor ↔ Vorschau-Synchronisation (#2):** gerenderte Markdown-Blöcke tragen ihre Quellzeilen; Scrollen koppelt beide Seiten anhand dieser Anker mit Interpolation innerhalb und zwischen Blöcken statt prozentual, ohne Scroll-Schleifen (die zuletzt benutzte Seite führt) und gebündelt per `requestAnimationFrame`; Ankerpositionen werden nur nach Rendern, Größenänderung, Bildladen oder Falten neu gemessen; Klick in die Vorschau setzt den Editor-Cursor auf die Quellzeile (Links, Schaltflächen, Checkboxen und Textauswahl bleiben unberührt; Strg/Cmd+Klick springt immer), Klick in den Editor hebt den passenden Vorschaublock kurz hervor; Einstellungen **Scrollen koppeln** (beide Richtungen, Editor → Vorschau, Vorschau → Editor, aus) und **Klick in der Vorschau springt zum Quelltext** sowie ein „Sync“-Schalter pro Tab in der Werkzeugleiste; nur in der geteilten Ansicht aktiv
- **Dateityp-Symbole unter Windows (#3):** 136 unterschiedliche Symbole für alle 306 Endungen (259 gelieferte ICO-Dateien, byte-identische nur einmal gespeichert; 47 Endungen ohne eigenes Symbol nutzen Gruppen- bzw. Kategorie-Fallback); jede Endung erhält eine eigene ProgID mit `DefaultIcon`, die erste Endung einer Gruppe behält die bisherige ProgID; Windows-generierte `<endung>_auto_file`-Klassen ohne Symbol, die exakt diese P-Viewer-EXE öffnen, erhalten das passende Symbol (protokolliert und bei der Deinstallation nur unverändert entfernt); Einstellung **Dateityp-Symbole / P-Viewer-App-Symbol** mit Vorschau; dieselben Symbole in Tabs, Overflow-Menü und Einstellungen; `npm run sync:icons` importiert neue `<endung>.ico`-Dateien
- **Tab-Zustand, Sitzung und Tab-Verwaltung (#4):** jeder Tab behält Cursor, Auswahl, Faltungen, Editor- und Vorschau-Scrollposition, Modus, eigene Split-Breite (ziehbarer Teiler, 20–80 %) und Sync-Schalter; beim Neustart kehren Tabs, Reihenfolge, angeheftete Tabs, aktiver Tab und ungespeicherte Änderungen zurück (Einstellungen → Start, einzeln abwählbar, „Gespeicherte Sitzung löschen“); Dateien werden erst beim Anzeigen geladen, fehlende oder nicht erreichbare Netzwerkdateien blockieren den Start nicht und bieten Erneut versuchen/Datei suchen/Schließen; ungespeicherter Text wird ~1 s nach der letzten Änderung atomar gesichert und nach einem Absturz wiederhergestellt; eine seit der letzten Sitzung extern geänderte Datei wird nie überschrieben (Hinweis mit „Wiederhergestellte Version behalten“/„Datenträgerversion verwenden“)
- Tab-Kontextmenü: Schließen, Andere/Rechts/Links/Alle/Gespeicherte schließen, alle Tabs derselben Endung bzw. desselben Ordners schließen, Anheften/Loslösen, In neues Fenster verschieben (mit Cursor, Scroll, Modus und ungespeicherten Änderungen), Geschlossenen Tab wieder öffnen (Strg/Cmd+Umschalt+T, 20 Einträge), Verschieben, Sortieren nach Name/Typ/Ordner, Dateiname/Pfad kopieren, Im Explorer anzeigen, Terminal hier öffnen (Windows Terminal, PowerShell oder cmd), Neu laden; Sammeldialog für ungespeicherte Tabs (Alle speichern/Einzeln prüfen/Alle verwerfen/Abbrechen); Hinweis „Tab geschlossen – Rückgängig“; kompakte angeheftete Tabs, Schreibschutz-Symbol, Tooltips mit Pfad und Status, Alt+1…9 (macOS Cmd+1…9) zur Tab-Wahl; bis zu 100 Tabs pro Fenster
- **Tab-Overflow-Menü (#5):** Tabs schrumpfen nicht mehr unter 120 px; was nicht passt, erscheint unter „» N mehr“ mit Dateityp-Symbolen, Ungespeichert-/Angeheftet-/Schreibschutz-Markierung, Ordnerhinweisen bei gleichen Namen, unscharfer Suche ab acht Tabs, Tastatursteuerung, Mittelklick zum Schließen und demselben Kontextmenü; angeheftete Tabs und der aktive Tab bleiben sichtbar, die logische Reihenfolge ändert sich nie
- Datei-Lese- und Schreibbefehle laufen nicht mehr auf dem UI-Thread, sodass ein langsames Netzlaufwerk das Fenster nicht einfriert
- Regressionstests für Formatierungsbefehle, Suche, Tab-Logik, Overflow-Berechnung, Anker-Interpolation, Ausrichtung/Sanitizing, Session- und Recovery-Speicher, Icon-Registry sowie Browser-Tests für Toolbar, Suchen/Ersetzen, Kontextmenü, Sammeldialog, Overflow, Sitzungswiederherstellung, Konfliktschutz, Split-Breite und Synchronisation; der native Smoke startet P-Viewer zusätzlich neu und prüft die wiederhergestellte Sitzung

## 0.1.8

- Standard-Anzeigemodus **Edit**, **View** oder **Split** in den Einstellungen wählbar; wird beim Start sowie für neue und neu geöffnete Dokumente automatisch übernommen
- unter **Anzeigemodus → Erweitert** eigene Regeln pro Dateiendung hinzufügen, ändern und entfernen; Groß-/Kleinschreibung und führender Punkt werden normalisiert, zusammengesetzte Endungen wie `.d.ts` haben Vorrang vor `.ts`
- beide Vorgaben werden im vorhandenen Einstellungsbestand gespeichert; ältere Einstellungen erhalten rückwärtskompatibel den Standard **Edit** ohne Ausnahmen
- manuelle Ansicht bleibt pro Tab erhalten und reist bei Fenstertransfers mit; Startdateien und eingehende Tabs warten auf geladene Einstellungen, damit langsam geladene Defaults keinen übertragenen Modus überschreiben
- Bilder und PDFs bleiben unabhängig von den Vorgaben reine Viewer; Änderungen der Vorgaben beeinflussen keine bereits geöffneten Tabs und keine System-Dateizuordnungen
- dunklere, kontrastreiche Zeilennummernleiste im Dark Mode entsprechend dem Nutzerfeedback; Syntaxfarben und Light Mode bleiben unverändert
- Regressionstests für Persistenz, Migration, Endungsregeln, verzögerten Start, Tabwechsel/-transfer und tatsächliche CodeMirror-Farben ergänzt

## 0.1.7

- Dateien auf Netzlaufwerken und NAS-Freigaben: Textdateien, Bilder und PDFs werden direkt über den gewählten Pfad gelesen; eine fehlgeschlagene kanonische Pfadauflösung (`GetFinalPathNameByHandle` unter Windows, etwa `os error 2`) verhindert das Öffnen einer tatsächlich lesbaren Datei nicht mehr
- wenn die Pfadnormalisierung fehlschlägt, bleibt der absolute Originalpfad für erneutes Öffnen und Speichern erhalten; Größenlimits, Dateitypprüfung und Speicherkonflikterkennung bleiben aktiv, ebenso die strikt kanonischen Sicherheitsgrenzen für eingebettete Vorschau-Ressourcen
- Regressionstests für simulierte Netzwerkprovider-Fehler, UNC-/Extended-/Laufwerkspfade, relative Rückfallpfade, Speicherkonflikte und weiterhin abgewiesene fehlende Dateien, Ordner sowie übergroße Dateien ergänzt; unter Unix wird zusätzlich das Lesen und Speichern über Symlinks geprüft

## 0.1.6

- Editor in v0.1.5 unlesbar: das in v0.1.5 ergänzte Inline-`<style>` in `app.html` ließ Tauri einen Hash in die CSP schreiben, wodurch `'unsafe-inline'` ignoriert und die zur Laufzeit eingefügten CodeMirror-Stylesheets blockiert wurden (Text in Root-Farbe, Zeilennummern über statt neben dem Inhalt); der Inline-Style ist entfernt, die Fensterhintergrundfarbe kommt allein aus Rust
- Vitest prüft, dass `app.html` keine Inline-Styles oder -Skripte enthält; der native Windows-Smoke prüft, dass der Editor unter der echten CSP gestylt ist (Flex-Layout und Monospace-Schrift)

## 0.1.5

- P-Viewer merkt sich Größe, Position und Maximierung des zuletzt benutzten Dokumentfensters (`tauri-plugin-window-state`) und öffnet dort wieder; liegt die gespeicherte Position auf einem nicht mehr vorhandenen Monitor, entscheidet das System über die Platzierung
- neue Fenster (Strg/Cmd+Umschalt+N, zweiter Start ohne Datei) erscheinen um 40 px versetzt neben dem zuletzt benutzten Fenster, solange sie so vollständig auf dessen Bildschirm passen; per Tab-Drag abgelöste Fenster bleiben unter dem Zeiger und werden nie maximiert geöffnet
- kein weißer Startbildschirm mehr: Fenster starten unsichtbar, erhalten die Hintergrundfarbe des gespeicherten Designs (dunkel, hell oder System) und werden erst angezeigt, wenn Einstellungen und Startdokumente gezeichnet sind; spätestens nach 1,5 s zeigt Rust das Fenster auch ohne Rückmeldung der Oberfläche
- das Schließen des letzten Tabs läuft über eine reguläre Schließanfrage statt eines harten `destroy`, damit Fenstergröße, -position und Maximierung auch auf diesem Weg gespeichert werden
- Regressionstests für Fensterzustandsschlüssel, Starthintergrund, Einstellungslesen, Kaskadierung und den Zeitpunkt des Sichtbarmachens ergänzt; der native Windows-Smoke prüft zusätzlich, dass das Fenster tatsächlich sichtbar wird

## 0.1.4

- P-Viewer läuft als eine Instanz: Dateien, die per Doppelklick, „Öffnen mit“, Kommandozeile oder Drag-and-drop bei laufender App geöffnet werden, erscheinen als Tab im zuletzt benutzten Fenster statt in einem weiteren Programmfenster; ein Start ohne Datei öffnet bewusst ein zusätzliches Fenster
- Tabs lassen sich mit der Maus in der Leiste umsortieren und zwischen P-Viewer-Fenstern verschieben: über ein anderes Fenster gezogen wechseln sie dorthin, über den Fensterrand oder weit unter die Leiste gezogen öffnen sie ein neues Fenster; Inhalt, ungespeicherte Änderungen, Kodierung und Ansichtsmodus reisen mit, die Undo-Historie bleibt fensterbezogen
- neues Fenster über Strg/Cmd+Umschalt+N oder die Werkzeugleiste; Tabs werden nie verworfen, sondern bei vollem Zielfenster in ein frisches Fenster weitergereicht
- der letzte Tab schließt sein Fenster, statt ein leeres „Unbenannt.txt“ zu erzeugen; ungespeicherte Änderungen werden weiterhin vorher bestätigt, und aktive HTML-Vorschauen schließen zusammen mit ihrem Fenster
- externe Öffnungsanforderungen werden pro Fenster gepuffert und von jedem Fenster selbst abgeholt, sodass beim Start weder Dateien verloren gehen noch doppelt geöffnet werden
- Regressionstests für Fensterzuordnung, Tab-Warteschlangen, Tab-Drag, Fenstertransfer und das Schließen des letzten Tabs ergänzt

## 0.1.3

- schreibgeschützte Bildansicht (PNG, APNG, JPEG, GIF, WebP, BMP, ICO, AVIF) mit Zoom, Einpassen, Pixelraster und Transparenzraster sowie integrierte PDF-Ansicht für eigenständige PDF-Dateien; Inhalte werden per Dateisignatur geprüft, nie als Text gelesen und nie gespeichert oder umbenannt
- unterstützte Formate von 169 auf 306 Dateiendungen in 110 Gruppen und von 36 auf 131 spezielle Dateinamen erweitert: unter anderem Terraform/HCL, Nix und Vim Script mit eigenen Syntaxmodi, Verilog/SystemVerilog, CUDA, GLSL/HLSL, Cython, Starlark/Bazel, COBOL, Haxe, Standard ML, Racket, SPARQL/Cypher, Turtle, XQuery, SQL-Dialekte, MSBuild-/.NET-Projektdateien, Qt-, Xcode- und Apple-Konfigurations-XML, systemd-Units, PEM-Zertifikate, Prüfsummen, Lock-Dateien, Bazel-`BUILD`, `go.mod`, `nginx.conf`, `Dockerfile.*`, `justfile`, Ruby-Tooling-Dateien sowie Dutzende `.*rc`-, Ignore- und Versionsdateien
- LaTeX-Livevorschau: einzeilige Umgebungen wie `\begin{center}…\end{center}` und mehrere `\item` in einer Zeile verloren ihren Text; Argumente von `minipage`, `frame` und ähnlichen Umgebungen erscheinen nicht mehr als Fließtext
- SVG-Vorschau: „Vergrößern“ war bei pane-breiten Grafiken wirkungslos und der linke Rand wurde beim Überlauf abgeschnitten; XML-Deklarationen mit Legacy-Kodierung werden für die bereits decodierte Quelle auf UTF-8 umgeschrieben
- JSON-Vorschau: Werkzeugdateien wie `tsconfig.json`, `.babelrc`, `.eslintrc` oder VS-Code-`settings.json` werden nach JSONC-Konvention gelesen statt mit Kommentarfehler abgelehnt; Syntaxfehler erscheinen auf Deutsch, nachgestellte Kommas und mehrere Wurzelwerte erhalten einen konkreten Hinweis
- Notebook-Ausgaben vom Typ `image/svg+xml` (Matplotlib, Plotly) werden als opakes Bild dargestellt statt zu fehlen; Markdown-Codeblöcke erhalten 22 weitere Grammatiken wie NSIS, D, Nim, Prolog, AWK, Vim, GLSL, Apache, PL/pgSQL, LLVM, Haml, ERB oder G-code
- Tabulatorgetrennte `.tab`-Dateien werden als TSV erkannt; Prüfsummen, PEM-Blöcke und weitere Untertitelformate nutzen die Monospace-Leseansicht
- Editorzustand pro Tab bewahrt Undo/Redo, Auswahl, Folding und Scrollposition, ohne zusätzliche unsichtbare Editoren zu betreiben
- SHA-256-basierte Speicherkonflikterkennung verhindert das unbemerkte Überschreiben zwischenzeitlich extern geänderter Dateien; gelöschte Quelldateien werden nicht still neu angelegt
- Kodierung in der Statusleiste explizit neu wählbar, unter anderem für BOM-loses UTF-16, Windows-125x, Shift_JIS und GB18030; verlustbehaftet gelesene Dateien werden nicht ohne Weiteres zurückgespeichert
- JSON Lines (`.jsonl`) und NDJSON (`.ndjson`) mit Datensatzansicht, Syntaxhervorhebung, Fehlerzeilen und Systemzuordnungen ergänzt
- Extremfallgrenzen für JSON-Tiefe und -Knoten, CSV-Tabellenzellen, Markdown-Komplexität, Notebook-Gesamtausgabe, LaTeX-Verschachtelung und PDF-Bitmaps; vollständige Dokumentquelle bleibt im Editor verfügbar
- CSV bewahrt explizit zitierte Leerzeilen und meldet nicht geschlossene Anführungszeichen; Notebook-`text/latex` rendert auch Formeln ohne Markdown-Begrenzer
- PDF-Vorschau zeigt eine frei wählbare Seite statt alle Seiten gleichzeitig im Speicher zu halten; veraltete LaTeX-Build-Ergebnisse werden nicht als aktueller Quellstand ausgegeben
- Einstellungen und Updates sind echte Tastaturmodale mit Fokuswiederherstellung; Hintergrundkürzel sind gesperrt, und der Updater prüft vor dem Neustart erneut auf ungespeicherte Änderungen
- View-Kürzel auf Strg/Cmd+Umschalt+R verlegt, damit Einfügen ohne Formatierung nicht länger die Ansicht umschaltet
- Markdown-Gliederung passt sich der tatsächlichen Pane-Breite an, sodass Split bei 900 px lesbar bleibt; JSON-/CSV-/Notebook-Schalter besser beschriftet
- Vorschauen an Tab-Identität gebunden; lokale Markdown-Bilder und verspätet geöffnete aktive HTML-Fenster gegen veraltete Async-Ergebnisse abgesichert
- Datei-Lesegrenzen am geöffneten Handle durchgesetzt; späte Binär-NULs erkannt, kanonische Pfade und Windows-UNC-Vergleiche verbessert; externe Öffnungsanforderungen werden gepuffert statt bei Beschäftigung verworfen
- aktive HTML-Vorschauen erhalten getrennte Cookie-Namen; unnötige CORS-Freigabe entfernt
- automatisierte Browserregressionen gegen den Produktionsbuild und zusätzliche Parser-/Datei-/Editor-Extremfalltests in die Qualitätsprüfungen aufgenommen

## 0.1.2

- neue Vorschauen ergänzt: CSV/TSV als Tabelle mit Trennzeichenerkennung, Kopfzeile und Zeilennummern, Jupyter-Notebooks mit Markdown-, Code- und sicheren Ausgabezellen sowie SVG als sandboxed Bildvorschau mit Zoom, Transparenzraster und Quelltextumschaltung
- unterstützte Formate von 81 auf 167 Dateiendungen in 88 Formatgruppen erweitert, darunter Perl, Haskell, Erlang, Clojure, OCaml, F#, Julia, Groovy, Fortran, Assembler, Protobuf, Diff, CMake, NSIS, Handlebars, Jinja, Liquid, Stylus, Pug, HTTP-Anfragen, R Markdown, Quarto, JSON-LD, GeoJSON, XSLT, XAML, Feeds, reStructuredText, AsciiDoc, Org und Untertitel
- 36 spezielle Dateinamen wie `Makefile`, `CMakeLists.txt`, `Jenkinsfile`, `.gitignore`, `.editorconfig`, `.env.*`, `LICENSE` oder `Cargo.lock` werden jetzt automatisch erkannt
- eigene Syntaxmodi für Windows-Batch, Makefile, GraphQL, Elixir, BibTeX, Ignore-Dateien und CSV ergänzt; falsche Zuordnungen für `.cfg`, `.text`, `.editorconfig`, `Gemfile` und `Makefile` behoben
- LaTeX-Livevorschau überarbeitet: verschachtelte Listen, `description`-Umgebungen, Fußnoten, nummerierte Überschriften mit Inhaltsverzeichnis und Anhang, Theorem-/Beweisumgebungen, Beamer-Frames, Tabellen mit Kopfzeile, Ausrichtung, `multicolumn` und booktabs, `\newcommand`-Makros mit Argumenten und verschachtelten Klammern, Akzente ohne Klammern, Sonderzeichen, siunitx-Größen, `\textcolor`, Gruppen-Deklarationen wie `{\bfseries …}` sowie babel-abhängige Beschriftungen
- LaTeX-Darstellungsfehler behoben: `\\[2mm]` wurde als Formel gelesen, `\vspace`, `\label` und ähnliche Befehle erschienen als Text, Anführungszeichen wurden deutsch statt typografisch gesetzt und Text nach `\section{}` ging verloren
- Markdown-Fußnoten verlinken wieder korrekt (doppeltes ID-Präfix entfernt), Aufgabenlisten zeigen keine doppelten Aufzählungszeichen mehr, Codeblöcke erhalten im hellen Design lesbare Farben und zusätzliche Grammatiken wie Dockerfile, PowerShell, LaTeX, Elixir oder Haskell
- Symbolgröße skalierte versehentlich auch KaTeX-Formeln und Dokumentgrafiken; Strg/Cmd+B und Strg/Cmd+I wirken nur noch in Markdown-Dateien; JSON „Einklappen“ lässt die Wurzel geöffnet; dunkle HTML-Vorschau blitzt nicht mehr weiß auf; Log- und Untertiteldateien nutzen eine Monospace-Leseansicht
- UTF-16-Dateien ohne BOM (etwa Registry-Exporte) werden erkannt statt als Binärdatei abgelehnt; Windows-Pfade verlieren nach dem Speichern über Verknüpfungen das `\\?\`-Präfix

## 0.1.1

- vollständige HTML-/HTM-/XHTML-Vorschau nach einer expliziten Sicherheitsbestätigung ergänzt; Skripte, Stylesheets und lokale Ressourcen laufen in einem separaten WebView-Fenster ohne P-Viewer-Capabilities
- aktive HTML-Vorschauen über einen tokenisierten Loopback-Ursprung mit eigenem Zufallsport, Dokumentordner-Grenze, Symlink-/Traversal-Schutz, MIME-Typen, Byte-Ranges sowie Quelltext- und Ressourcenlimits abgesichert
- Windows-WebView2-Deadlock beim Öffnen der vollständigen Vorschau behoben; das zuvor weiße und unverschließbare Zusatzfenster lädt nun korrekt und wird über X vollständig bereinigt
- sichere statische HTML-Vorschau weiterhin als Standard beibehalten; Popups, Downloads und Navigation aus dem isolierten aktiven Vorschaufenster blockiert
- Windows-Dateizuordnungen auf reine Candidate-Registrierung umgestellt: keine Extension-Defaults und keine Manipulation von `UserChoice`; die endgültige Auswahl erfolgt auf der geschützten P-Viewer-Seite der Windows-Einstellungen
- Laufzeitregistrierung und NSIS-Deinstallation entfernen nur P-Viewer-eigene Kandidaten, bereinigen veraltete ProgIDs und erhalten vorhandene Benutzerstandards
- Dokumentverweise für UNC-, Extended-Windows- und relative Pfade gehärtet sowie percent-kodierte externe Schemes und unsichere Geräte-/Traversal-Pfade blockiert
- Regressionstests für die native HTML-Isolationsgrenze, Fenster-Lifecycle, Loopback-Server, Pfadauflösung und Candidate-only-Installerregistrierung ergänzt

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
