# Signierte Releases und Updates

P-Viewer nutzt den Tauri-v2-Updater im **Fail-closed**-Modus: Lokale Builds ohne HTTPS-Endpunkt und Public Key starten keine Update-Anfragen.

## Signierschlüssel einrichten (einmalig)

```bash
npm run tauri -- signer generate --write-keys "$HOME/.tauri/p-viewer.key"
```

- Privaten Schlüssel und Passwort niemals committen und offline sichern.
- In GitHub unter **Settings → Secrets and variables → Actions** hinterlegen:
  - Secret `TAURI_SIGNING_PRIVATE_KEY`: Inhalt der privaten Schlüsseldatei
  - Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: Passwort des Schlüssels
  - Variable `P_VIEWER_UPDATER_PUBKEY`: Inhalt der `.pub`-Datei (muss mit `src-tauri/tauri.release.conf.json` übereinstimmen)

Der Update-Endpunkt wird im Release-Workflow automatisch auf `https://github.com/OWNER/REPOSITORY/releases/latest/download/latest.json` gesetzt.

## Release-Ablauf

1. Version synchron in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml` und `src-tauri/tauri.conf.json` erhöhen und `CHANGELOG.md` aktualisieren.
2. Qualitätsprüfungen lokal ausführen:

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

   Bei Änderungen an `src/lib/files/associations.json` vorher `npm run sync:associations` ausführen.
3. Root-Build erzeugen (`npm run build:launcher`) und optional gegen die echte Desktop-Runtime prüfen (`node scripts/smoke-local-launcher.mjs` unter Windows bzw. `python3 scripts/smoke-linux-launcher.py` unter Linux; vorher alle P-Viewer-Fenster schließen).
4. Commit auf `main` pushen und den erfolgreichen `Tests`-Workflow abwarten.
5. Passendes Tag (`vX.Y.Z`) erstellen und pushen. `.github/workflows/release.yml` prüft den Stand erneut, legt einen Draft-Release an, baut und signiert Windows, Linux sowie macOS (Intel & Apple Silicon), prüft alle Pakete samt `latest.json` und veröffentlicht den Release erst bei vollständigem Erfolg.

## Einstellungsbestand & Sicherheit

- Benutzereinstellungen (`settings.json`) liegen im plattformüblichen App-Datenordner (`io.github.dawasteh.pviewer`) und bleiben bei Updates erhalten.
- Es werden ausschließlich HTTPS-Endpunkte und signierte Pakete akzeptiert; vor einem Neustart prüft der Updater auf ungespeicherte Änderungen.
