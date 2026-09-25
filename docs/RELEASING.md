# Signierte Releases und Updates

P-Viewer verwendet den Tauri-v2-Updater. Ein Entwicklungsbuild bleibt **fail-closed**:
Ohne vollständigen HTTPS-Endpunkt und öffentlichen Signaturschlüssel wird kein
Update-Netzwerkzugriff gestartet. Der Update-Dialog weist dann auf den lokalen Build hin.

## Einmalig: Signierschlüssel erzeugen

Erzeuge den Schlüssel auf einem vertrauenswürdigen Rechner und wähle ein starkes Passwort:

```bash
npm run tauri -- signer generate --write-keys "$HOME/.tauri/p-viewer.key"
```

Dabei entstehen eine private Schlüsseldatei und eine `.pub`-Datei.

- Private Key und Passwort niemals committen oder als Build-Artefakt hochladen.
- Sichere Offline-Kopie anlegen. Geht der Key verloren, können vorhandene Installationen
  nicht nahtlos auf Releases mit einem anderen Schlüssel aktualisiert werden.
- Den öffentlichen Key darf die Anwendung enthalten; er ist kein Geheimnis.

## GitHub konfigurieren

In **Settings → Secrets and variables → Actions** des Repositorys:

| Typ | Name | Inhalt |
| --- | --- | --- |
| Secret | `TAURI_SIGNING_PRIVATE_KEY` | kompletter Inhalt der privaten Key-Datei |
| Secret | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Passwort des privaten Keys |
| Variable | `P_VIEWER_UPDATER_PUBKEY` | kompletter Inhalt der `.pub`-Datei |

Der Workflow leitet den Update-Endpunkt automatisch aus `${{ github.repository }}` ab:

```text
https://github.com/OWNER/REPOSITORY/releases/latest/download/latest.json
```

Die Release-Builds erhalten Endpunkt und Public Key über die Build-Variablen
`P_VIEWER_UPDATE_ENDPOINT` und `P_VIEWER_UPDATER_PUBKEY`. Für die Signaturerzeugung
enthält `src-tauri/tauri.release.conf.json` denselben öffentlichen Key und aktiviert
Updater-Artefakte nur in CI; der Workflow bricht bei abweichenden Keys ab. Lokale
Standard-Builds benötigen deshalb keinen privaten Key.

## Release-Ablauf

1. Version in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml` und
   `src-tauri/tauri.conf.json` erhöhen.
2. Prüfen:

   ```bash
   npm audit --audit-level=low
   npm run check:version
   npm run check:associations
   npm run check
   npm test
   npm run test:browser
   npm run build
   cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
   cargo test --manifest-path src-tauri/Cargo.toml
   cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
   ```

   Wenn sich `src/lib/files/associations.json` ändert, vorher `npm run sync:associations`
   ausführen. Die Synchronprüfung verhindert Drift zu Tauri und den NSIS-Hooks und
   prüft deren Struktur. Unter Windows kompiliert `npm run test:installer-hooks` die
   Hooks mit `makensis` und führt Installation, Update, Drüberinstallieren und
   Deinstallation unter Testnamen gegen `HKCU` aus; der `Tests`-Workflow erledigt das
   im Job „Windows installer hooks in the registry“.

3. Unter Windows den portablen Root-Build über `npm run build:launcher` bauen und mit `node scripts/smoke-local-launcher.mjs` gegen WebView2 prüfen. Das Smoke-Skript verwendet ausschließlich eigene temporäre Dokumente und einen testprozesslokalen Debug-Port; es ist kein Installer-Test. Vorher alle laufenden P-Viewer-Fenster schließen: seit v0.1.4 reicht ein zweiter Prozess seine Dateien an die laufende Instanz weiter und beendet sich sofort.
4. Commit und Branch zu GitHub pushen; den erfolgreichen `Tests`-Workflow für exakt diesen Commit abwarten. Erst danach das passende Tag erstellen, zum Beispiel `v0.1.3`.
5. Das geprüfte Tag zu GitHub pushen. `.github/workflows/release.yml` wiederholt die
   Qualitätsprüfungen, legt den Draft Release mit generierten Release-Notes an,
   baut Windows, Linux sowie macOS für Intel und Apple Silicon, signiert die Pakete
   und erzeugt `latest.json`. Der Entwurf entsteht bewusst im Verify-Job über die
   GitHub-CLI, weil das Anlegen aus tauri-action heraus bei v0.1.6 mit „Resource not
   accessible by integration“ abgelehnt wurde; die Plattform-Jobs laden nur noch hoch.
6. Die Plattform-Builds laden in einen **Draft Release**, damit der Update-Endpunkt
   nie einen halbfertigen Release sieht. Der abschließende Job `Publish release`
   prüft, dass alle vierzehn Pakete und Signaturen sowie eine `latest.json` mit den
   vier Plattformschlüsseln vorliegen, und veröffentlicht den Entwurf dann
   automatisch als aktuellen Release. Schlägt ein Build fehl, bleibt der Entwurf
   unveröffentlicht und kann nach einem Fix über ein neues Tag ersetzt werden.
   Die Installer-Abnahme erfolgt am veröffentlichten Release: P-Viewer erscheint
   unter „Öffnen mit“, Installation und Deinstallation verändern weder
   Extension-Defaults noch `UserChoice`, die geschützte P-Viewer-Seite unter
   „Standard-Apps“ öffnet sich, und die Deinstallation entfernt nur P-Viewer-Einträge.

Die Browserregressionen bauen und testen den Produktionsbuild. Unter Linux benötigen sie `npx playwright install --with-deps chromium`; Windows verwendet vorhandenes Edge. Gemockte IPC-Lifecycle-Tests ersetzen weder einen echten TeX-Compiler noch einen signierten Update-Installationslauf. Der versionsbezogene Prüfbericht `docs/QUALITY-v0.2.1.md` trennt diese Nachweise.

Der Workflow bricht ab, wenn Tag und Metadaten nicht übereinstimmen oder Key-Variablen
fehlen. Windows-Builds sind bewusst auf NSIS begrenzt, damit Candidate-Registrierung und Deinstallation über dieselben geprüften Installer-Hooks laufen, ohne vorhandene Benutzerstandards zu schreiben oder wiederherzustellen.

## Einstellungsbestand

Der Updater ersetzt ausschließlich das installierte App-Paket. `settings.json` liegt im
plattformüblichen App-Datenordner (`io.github.dawasteh.pviewer`) und nicht im
Installationsordner. Mit v0.0.7 wurde diese endgültige App-Kennung festgelegt;
Einstellungen älterer lokaler Vorab-Builds mit abweichender Kennung werden einmalig
nicht migriert. Updates ab v0.0.7 löschen oder überschreiben die Einstellungsdatei nicht.

## Sicherheit

- Nur HTTPS-Endpunkte ohne eingebettete Zugangsdaten werden akzeptiert.
- Jeder Download wird vor der Installation mit dem eingebetteten Public Key geprüft.
- Teilweise konfigurierte Release-Builds werden als Fehler behandelt.
- Vor einem Neustart muss das aktuelle Dokument gespeichert sein.
- Der Workflow veröffentlicht nur vollständige, signierte Releases; ein fehlgeschlagener Plattform-Build lässt den Entwurf unveröffentlicht.
