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
   npm run build
   cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
   cargo test --manifest-path src-tauri/Cargo.toml
   cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
   ```

   Wenn sich `src/lib/files/associations.json` ändert, vorher `npm run sync:associations`
   ausführen. Die Synchronprüfung verhindert Drift zu Tauri und den NSIS-Hooks.

3. Unter Windows den portablen Root-Build zusätzlich über `build-exe.bat` prüfen.
4. Commit und exakt passendes Tag erstellen, zum Beispiel `v0.1.1`.
5. Branch und Tag zu GitHub pushen. `.github/workflows/release.yml` wiederholt die
   Qualitätsprüfungen, baut Windows, Linux sowie macOS für Intel und Apple Silicon,
   signiert die Pakete und erzeugt `latest.json`.
6. Der Workflow erstellt absichtlich einen **Draft Release**. Installer auf allen drei
   Plattformen testen, Signaturdateien und `latest.json` kontrollieren und erst danach
   den Entwurf manuell veröffentlichen. Der Windows-Smoke-Test umfasst zusätzlich:
   P-Viewer erscheint unter „Öffnen mit“, Installation und Deinstallation verändern
   weder Extension-Defaults noch `UserChoice`, die geschützte P-Viewer-Seite unter
   „Standard-Apps“ öffnet sich, und die Deinstallation entfernt nur P-Viewer-Einträge.

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
- Release-Entwürfe nie veröffentlichen, bevor Installations-Smoke-Tests abgeschlossen sind.
