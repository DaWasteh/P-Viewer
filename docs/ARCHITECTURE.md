# Architekturentscheidung

**Status:** angenommen  
**Version:** v0.0.1

## Entscheidung

PandaViewer wird als **Tauri-2-App mit Rust-Backend und Svelte-5-/TypeScript-Frontend** umgesetzt.

Diese Kombination liefert native, kleine Desktop-Pakete und direkten, kontrollierten Datei-/Prozesszugriff, ohne eine komplette Browser-Runtime wie Electron auszuliefern. Svelte hält die Oberfläche klein; TypeScript erschließt das ausgereifte Editor- und Dokument-Ökosystem.

## Kernbausteine

| Bereich | Entscheidung |
| --- | --- |
| Desktop-Shell | Tauri 2 |
| Native Logik | Rust |
| Oberfläche | Svelte 5, TypeScript, Vite |
| Editor | CodeMirror 6, Sprachen bei Bedarf geladen |
| Markdown | unified, remark-gfm, remark-math, rehype-katex, rehype-sanitize |
| JSON | CodeMirror plus eigene einklappbare Baumansicht |
| LaTeX | lokale Compilersteuerung in Rust, PDF.js-Vorschau |
| Einstellungen | Tauri Store im plattformüblichen App-Konfigurationspfad |
| Updates | signiertes Tauri-Updater-Manifest aus GitHub Releases |
| Icons | lokal gebündelte Lucide-Icons |

## Produktprinzipien

1. **Schnell öffnen:** unbekannte Textformate fallen auf Plaintext zurück; schwere Renderer werden erst bei Bedarf geladen.
2. **Ein Dokument, wenig Ablenkung:** Edit-, View- und Split-Modus stehen im Mittelpunkt.
3. **Keine Ausführung von Dokumentcode:** Markdown-HTML wird sanitisiert; HTML-/Script-Inhalte laufen nicht im App-Kontext.
4. **Minimale native Rechte:** Dateioperationen laufen über eng begrenzte Rust-Commands statt pauschaler Dateisystemfreigaben.
5. **Einstellungen getrennt vom Programm:** Updates ersetzen nur Anwendungsartefakte. Einstellungen bleiben in `%APPDATA%`, `~/Library/Application Support` beziehungsweise `$XDG_CONFIG_HOME` erhalten.
6. **Sichere TeX-Vorgaben:** Compiler werden ohne Shell-String gestartet, temporäre Ausgaben isoliert und `shell-escape` bleibt aus.

## LaTeX-Grenze

„Volle LaTeX-Unterstützung“ bedeutet in PandaViewer:

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

Tectonic kann später als optionale portable Engine ergänzt werden, ersetzt aber nicht jede spezialisierte TeX-Live-Konfiguration.

## Geplante Modulgrenzen

```text
src/lib/
  editor/       CodeMirror-Integration und Sprachauflösung
  files/        Dateitypen, Dokumentzustand und Dialoge
  preview/      Markdown-, JSON-, Text- und PDF-Ansichten
  settings/     persistente UI-/Editor-Einstellungen
  update/       signierter GitHub-Release-Updater
src-tauri/src/
  commands/     schmale Tauri-Commands
  document.rs   Encoding-sichere Datei-E/A
  latex.rs      sichere Compilersteuerung
```

## Verworfene Alternativen

- **Electron:** sehr gutes Ökosystem, aber zu hohe Runtime-/Speicherkosten für das Produktziel.
- **reine Rust-GUI (egui, iced, Slint):** kleine Runtime, jedoch deutlich höherer Aufwand und schwächeres Ökosystem für Editor, Markdown, KaTeX und PDF.
- **Monaco Editor:** leistungsfähig, aber näher am ausdrücklich unerwünschten VS-Code-Gewicht; CodeMirror ist modularer.
