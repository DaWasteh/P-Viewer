# v0.1.6 – Qualitätsbericht und Release-Abnahme

Prüfdatum: 20. September 2026. Ziel dieser Version: Hotfix für den in v0.1.5 unlesbaren Editor. Der Bericht zu v0.1.5 (`docs/QUALITY-v0.1.5.md`) gilt für Fensterzustand und Start weiterhin.

## Fehlerbild und Ursache

In v0.1.5 wurden Editortext in der Root-Textfarbe (im dunklen Design unsichtbar) und Zeilennummern oberhalb statt neben dem Inhalt gezeichnet; die Vorschau war intakt. Ursache: `src/app.html` erhielt ein Inline-`<style>` für den Fensterhintergrund. Tauri hasht Inline-Styles des Shell-HTML in die `style-src`-Direktive der CSP; sobald ein Hash vorhanden ist, ignorieren Browser `'unsafe-inline'`, und die Style-Elemente, die CodeMirror zur Laufzeit einfügt, werden blockiert. Die Browserregressionen laufen ohne Tauri-CSP und prüfen DOM-Text, keine Darstellung; der native Smoke prüfte den Editor nur funktional. Beides erklärt, warum v0.1.5 grün war.

## Durchgeführt

| Prüfung | Ergebnis |
| --- | --- |
| `npm audit --audit-level=low` | keine gemeldeten Schwachstellen |
| Versions-/Dateizuordnungssynchronisierung | v0.1.6; 306 Endungen in 110 Gruppen unverändert |
| Svelte/TypeScript | 0 Fehler, 0 Warnungen |
| Vitest | 124 Tests in 20 Dateien bestanden (vorher 122; neu: Shell ohne Inline-Style/-Skript) |
| Playwright / Edge, Produktionsbuild | 17 Interaktionstests bestanden (unverändert) |
| Rust-Tests unter Windows | 43 bestanden (unverändert) |
| Rustfmt / Clippy `-D warnings` | bestanden |
| Lokaler optimierter Tauri-Build | gebaut und nach `P-Viewer.exe` kopiert |
| Native Windows-/WebView2-Prüfung | Root-EXE v0.1.6 bestanden: alle Prüfungen aus v0.1.5 plus `.cm-editor` mit Flex-Layout und JetBrains Mono unter der echten Tauri-CSP |

## Was geprüft wurde

- Unter der echten CSP der nativen App hat `.cm-editor` wieder `display: flex` und `.cm-content` die Monospace-Schrift; vor dem Fix meldete dieselbe Prüfung `display: block` und die Inter-UI-Schrift.
- Die Fensterhintergrundfarbe vor dem ersten Frame kommt ausschließlich aus `windows.rs` (`set_background_color`), ein Shell-Inline-Style ist dafür nicht nötig, weil das Fenster ohnehin erst nach dem Zeichnen gezeigt wird.
- Der neue Vitest liest `app.html` und lehnt Inline-`<style>`- und `<script>`-Elemente außerhalb von HTML-Kommentaren ab.

## Bekannte Grenzen

- Die Browserregressionen laufen weiterhin ohne Tauri-CSP; Darstellungsfehler unter der echten CSP werden nur vom nativen Windows-Smoke erkannt, der lokal vor jedem Release läuft, nicht in der Linux-CI.
