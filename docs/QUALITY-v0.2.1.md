# v0.2.1 – Qualitätsbericht und Release-Abnahme

Prüfdatum: 25. September 2026. Ziel: Issue #6 (HTML in Markdown-Dateien) und Issue #7 (Windows-Kontextmenü und „Öffnen mit“, Dateizuordnung nach Neuinstallation) beheben. Alle Funktionen, Grenzen und offenen Abnahmen aus [`QUALITY-v0.2.0.md`](QUALITY-v0.2.0.md) gelten unverändert weiter.

## Ursachen

- **#6:** `remark-rehype` verwarf Roh-HTML absichtlich; nur `<div|p align>` wurde über eine Sonderlogik übernommen. Zusätzlich überstimmte `th, td { text-align: left }` jedes `align`-Attribut, auch die GFM-Spaltenausrichtung, und die App-CSP ließ keine externen Bilder zu.
- **#7:** Der Generator schrieb Anführungszeichen in Öffnen-Befehlen als `$"`. NSIS kennt dieses Escape nicht, warnt nur (Warnung 6000) und übernimmt die Zeichen wörtlich. Seit v0.1.0 enthielten deshalb alle vom Installer geschriebenen Befehle (ProgIDs und `Applications\p-viewer.exe`) den Wert `$"…\p-viewer.exe$" $"%1$"`, den Windows nicht starten kann. Mit einem Probe-Installer aus dem ausgelieferten Makro reproduziert. Wählte ein Nutzer die EXE manuell aus, legte Windows einen korrekten Befehl an – den die nächste Installation wieder überschrieb. Außerdem löschte der beim Drüberinstallieren gestartete alte Uninstaller alle ProgIDs, obwohl die neue Version sie sofort wieder anlegt.
- Registry-Beleg auf dem Entwicklungsrechner: Die Standard-App-Wahl (`UserChoiceLatest`, 31.08.) überstand mehrfaches Neuschreiben der ProgID (01.09., 24.09.); reines Neuschreiben ist also unkritisch, gelöscht wird beim Update deshalb nichts mehr.

## Änderungen

- Markdown-Pipeline: `allowDangerousHtml` + `rehype-raw` vor `rehype-sanitize` mit GitHubs Allowlist; `<style>`-Inhalt wird gestrippt; IDs/Namen aus Roh-HTML erhalten idempotent `user-content-` (Fußnoten unverändert); Gliederung aus dem gerenderten Baum (HTML-Überschriften inklusive, IDs identisch mit der Vorschau); Sprungmarken fallen auf `user-content-<id>` bzw. `name` zurück; relative `<picture>`-Quellen weichen dem aufgelösten `<img>`; die Kompaktform `<p align>` behält korrekte Quellzeilen.
- CSS: `text-align: left` nur noch für `th` ohne `align`; `<details>`/`<summary>` erhalten Abstand und Zeiger.
- CSP: `img-src 'self' data: blob: https:` – externe Bilder nur verschlüsselt; die HTML-/SVG-Iframes behalten ihre eigene `img-src data:`-Policy.
- Installer-Hooks (`scripts/nsis-hooks.mjs`): korrektes `$\"`, Kontextmenü „Mit P-Viewer öffnen“ unter `SystemFileAssociations\.<ext>\shell\PViewer` für alle 306 Endungen, Deinstallation nur noch außerhalb von `/UPDATE` und In-place-Aufrufen (`_?=`, `$EXEDIR == $INSTDIR`), Warnung 6000 in den Hooks als Fehler, strukturelle Selbstprüfung in `npm run check:associations`.

## Lokal durchgeführt

| Prüfung | Ergebnis |
| --- | --- |
| `npm audit --audit-level=low` | keine gemeldeten Schwachstellen |
| Versions-/Zuordnungs-/Symbolsynchronisierung | v0.2.1; 110 Formatgruppen, 306 Endungen mit ProgID, „Öffnen mit“ und Kontextmenü geprüft; 136 Symbole |
| Svelte/TypeScript | 0 Fehler, 0 Warnungen |
| Vitest | 196 Tests in 26 Dateien bestanden (neu: Roh-HTML, XSS, Bildpfade, Tabellen, README-Struktur, Gliederung, CSP, Installer-Hooks inkl. absichtlich kaputter Varianten) |
| Playwright / Edge, Produktionsbuild | 37 Tests bestanden (neu: Roh-HTML mit berechneter Ausrichtung, entschärftem `onerror`, `<details>`, Gliederung und Sprungmarke) |
| Installer-Hooks in der Registry (`npm run test:installer-hooks`, makensis 3.11) | bestanden: exakte Werte nach Installation (Pfad mit Leerzeichen, Umlaute, Anführungszeichen), idempotente zweite Installation, Update- und In-place-Deinstallation lassen alles stehen, echte Deinstallation entfernt nur P-Viewer-Einträge, fremde Standardzuordnung/OpenWithProgids/Verben/`PerceivedType` bleiben; Gegenproben mit altem Escape (Build-Abbruch) und ohne Reinstall-Schutz (Test schlägt an) |
| Rust unter Windows | 63 Tests bestanden |
| Rustfmt / Clippy `-D warnings` | bestanden |
| NSIS-Installer mit Tauris Template (`tauri build --bundles nsis`) | `P-Viewer_0.2.1_x64-setup.exe` gebaut; Hooks kompilieren ohne Warnung 6000 |
| Lokale Root-EXE | `P-Viewer.exe` als v0.2.1 neu gebaut |
| Nativer Windows-/WebView2-Smoke | bestanden (wie v0.2.0, einschließlich Sitzung und Neustart) |
| Native Markdown-Prüfung unter echter Tauri-CSP | README aus Issue #6 mit den fünf Original-Screenshots: externes HTTPS-Headerbild geladen, alle fünf relativen Tabellenbilder als Data-URL mit 75 %/60 % Breite, Zellen zentriert, keine CSP-Verstöße, 21 HTML-Überschriften in der Gliederung; Editor `display: flex`, JetBrains Mono |
| Visuelle Prüfung | Split- und View-Screenshot der Root-EXE angesehen: Editor mit Gutter und sichtbarem Text, README-Layout entspricht GitHub |

## Nicht lokal geprüft

- Den fertigen Installer habe ich nicht auf dem Entwicklungsrechner installiert, weil er dort die bestehende, auf die Root-EXE zeigende `.md`-Zuordnung verändert hätte. Die Hook-Logik ist über `npm run test:installer-hooks` mit denselben generierten Makros in der Registry geprüft, der Installer-Build über Tauris Template.
- Windows 11 zeigt klassische Verben wie „Mit P-Viewer öffnen“ nur unter „Weitere Optionen anzeigen“; ein Eintrag im kompakten Menü würde ein signiertes Paket mit `IExplorerCommand` erfordern.
- Beim manuellen Upgrade von v0.2.0 oder älter läuft noch der alte Deinstaller, der die ProgIDs löscht; eine dadurch verlorene Standard-App muss einmalig neu gewählt werden. In-App-Updates deinstallieren nicht und sind nicht betroffen.
