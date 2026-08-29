# Architekturentscheidung

**Status:** angenommen  
**Version:** v0.0.8

## Entscheidung

P-Viewer wird als **Tauri-2-App mit Rust-Backend und Svelte-5-/TypeScript-Frontend** umgesetzt.

Diese Kombination liefert native, kleine Desktop-Pakete und direkten, kontrollierten Datei-/Prozesszugriff, ohne eine komplette Browser-Runtime wie Electron auszuliefern. Svelte hält die Oberfläche klein; TypeScript erschließt das ausgereifte Editor- und Dokument-Ökosystem.

## Kernbausteine

| Bereich | Entscheidung |
| --- | --- |
| Desktop-Shell | Tauri 2 |
| Native Logik | Rust |
| Oberfläche | Svelte 5, TypeScript, Vite |
| Editor | CodeMirror 6, Sprachen bei Bedarf geladen |
| Markdown | unified, remark-gfm, remark-math, rehype-katex, rehype-sanitize |
| HTML | nicht ladender HAST-Parser, Allowlist-Sanitizer, leeres Iframe-Sandbox und innere CSP |
| Webkomponenten | lazy Astro-/Svelte-/Vue-Mischsyntax; keine Ausführung von Projektcode |
| JSON | CodeMirror plus eigene einklappbare Baumansicht |
| LaTeX | lokale Compilersteuerung in Rust, PDF.js-Vorschau |
| Einstellungen | Tauri Store im plattformüblichen App-Konfigurationspfad |
| Updates | signiertes Tauri-Updater-Manifest aus GitHub Releases |
| Icons | lokal gebündelte Lucide-Icons |

## Produktprinzipien

1. **Schnell öffnen:** unbekannte Textformate fallen auf Plaintext zurück; schwere Renderer werden erst bei Bedarf geladen.
2. **Ein Dokument, wenig Ablenkung:** Edit-, View- und Split-Modus stehen im Mittelpunkt.
3. **Keine Ausführung von Dokumentcode:** Markdown-HTML wird sanitisiert; HTML läuft nur als statischer, bereinigter Inhalt in einem Iframe ohne Sandbox-Rechte; Astro-/Svelte-/Vue-Projektcode bleibt Quelltext.
4. **Minimale native Rechte:** Dateioperationen laufen über eng begrenzte Rust-Commands statt pauschaler Dateisystemfreigaben.
5. **Einstellungen getrennt vom Programm:** Updates ersetzen nur Anwendungsartefakte. Einstellungen bleiben in `%APPDATA%`, `~/Library/Application Support` beziehungsweise `$XDG_DATA_HOME` erhalten.
6. **Sichere TeX-Vorgaben:** Compiler werden über absolute Programme aus bereinigten PATH-Ordnern ohne Benutzershell gestartet. Arbeitsausgaben bleiben temporär, Projektdateien werden nur als Inputs gesucht, und `shell-escape` bleibt aus.
7. **Defense in depth:** App- und HTML-Vorschau besitzen getrennte restriktive Content Security Policies. Allowlist-Sanitizing, opaque Iframe-Origin, Größen-/Ressourcenlimits und eng zugeschnittene Tauri-Capabilities begrenzen Dokument- und WebView-Inhalte.
8. **Fail-closed Updates:** Lokale Builds laden nichts. Release-Builds benötigen HTTPS-Endpunkt, Public Key und signierte Pakete; unvollständige Konfiguration wird abgelehnt.

## LaTeX-Grenze

„Volle LaTeX-Unterstützung“ bedeutet in P-Viewer:

- TeX-Syntax, Bearbeitung, Suche und Folding,
- Wahl und Erkennung des Compilers,
- Mehrpass-Builds über `latexmk`,
- verständliche Build-Diagnosen,
- integrierte PDF-Vorschau,
- Unterstützung wissenschaftlicher Projekte mit relativen Includes.

Eine vollständige TeX-Live-Installation kann mehrere Gigabyte groß sein und widerspricht einer schlanken App. Daher bleibt die eigentliche Distribution extern:

- Windows: MiKTeX oder TeX Live
- macOS: MacTeX
- Linux: TeX Live

Tectonic wird als optionale Engine im `--untrusted`-Modus unterstützt, ersetzt aber nicht jede spezialisierte TeX-Live-Konfiguration.

## Geplante Modulgrenzen

```text
src/lib/
  editor/       CodeMirror-Integration und lazy Sprachauflösung
  files/        Dateitypen, Dokumentzustand, Pfade und Dialoge
  preview/      isolierte HTML-, Markdown-, JSON-, Text-, LaTeX- und PDF-Ansichten
  settings/     persistente UI-/Editor-Einstellungen
  update/       Oberfläche des signierten Release-Updaters
src-tauri/src/
  document.rs   Encoding-sichere und atomare Datei-E/A
  latex.rs      isolierte Compilersteuerung mit Timeouts
  updater.rs    HTTPS-, Signatur- und Installationsgrenze
```

## Verworfene Alternativen

- **Electron:** sehr gutes Ökosystem, aber zu hohe Runtime-/Speicherkosten für das Produktziel.
- **reine Rust-GUI (egui, iced, Slint):** kleine Runtime, jedoch deutlich höherer Aufwand und schwächeres Ökosystem für Editor, Markdown, KaTeX und PDF.
- **Monaco Editor:** leistungsfähig, aber näher am ausdrücklich unerwünschten VS-Code-Gewicht; CodeMirror ist modularer.
