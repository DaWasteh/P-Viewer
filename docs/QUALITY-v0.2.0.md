# v0.2.0 – Qualitätsbericht und Release-Abnahme

Prüfdatum: 24. September 2026. Ziel: Suchen und Ersetzen in der Werkzeugleiste auffindbar machen und den Hinweisbox-Knopf der Formatierungsleiste korrigieren. Alle Funktionen, Grenzen und offenen Abnahmen aus [`QUALITY-v0.1.9.md`](QUALITY-v0.1.9.md) gelten unverändert weiter.

## Änderungen

- Knopf **Suchen** neben Edit/View/Split: Menü mit Suchen, Ersetzen und „Mehrfach ersetzen und Makros …“ samt Tastenkürzeln. Er ruft dieselben Editorbefehle wie die Kürzel auf; in View wechselt er zuerst in Split, weil der Editor dort ausgeblendet ist. Für Bilder, PDF und noch nicht geladene wiederhergestellte Tabs ist er deaktiviert.
- Hinweisbox: Ohne Auswahl entsteht der Block unter dem aktuellen Absatz bzw. der aktuellen Box (keine Zeilenteilung, keine Verschachtelung bei wiederholtem Klicken), mit Auswahl werden die ganzen Zeilen zum Hinweistext; Leerzeilen bleiben als `>` Teil der Box.

## Lokal durchgeführt

| Prüfung | Ergebnis |
| --- | --- |
| `npm audit --audit-level=low` | keine gemeldeten Schwachstellen |
| Versions-/Zuordnungs-/Symbolsynchronisierung | v0.2.0; 110 Formatgruppen, 136 Symbole für 306 Endungen synchron |
| Svelte/TypeScript | 0 Fehler, 0 Warnungen |
| Vitest | 180 Tests in 25 Dateien bestanden |
| Playwright / Edge, Produktionsbuild | 36 Tests bestanden (1 neuer Fall: Werkzeugleisten-Suche inklusive Wechsel aus View) |
| Rust unter Windows | 63 Tests bestanden |
| Rustfmt / Clippy `-D warnings` | bestanden |
| Lokale Root-EXE | `P-Viewer.exe` als v0.2.0 neu gebaut |
| Nativer Windows-/WebView2-Smoke | bestanden (wie v0.1.9, einschließlich JavaScript-Makro, Sitzung und Neustart) |
| Visuelle Prüfung | Suchen-Knopf im nativen Smoke-Screenshot geprüft |
