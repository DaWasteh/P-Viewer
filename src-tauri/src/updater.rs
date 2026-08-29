use serde::Serialize;
use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, WebviewWindow};
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

const UPDATE_ENDPOINT: Option<&str> = option_env!("PANDAVIEWER_UPDATE_ENDPOINT");
const UPDATE_PUBLIC_KEY: Option<&str> = option_env!("PANDAVIEWER_UPDATER_PUBKEY");
const UPDATE_PROGRESS_EVENT: &str = "pandaviewer://update-progress";

struct ReleaseChannel {
    endpoint: Url,
    public_key: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterConfiguration {
    pub configured: bool,
    pub current_version: String,
    pub endpoint_host: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub configured: bool,
    pub current_version: String,
    pub available: bool,
    pub version: Option<String>,
    pub date: Option<String>,
    pub body: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
    pub finished: bool,
}

#[tauri::command]
pub fn updater_configuration(app: AppHandle) -> UpdaterConfiguration {
    let current_version = app.package_info().version.to_string();
    match release_channel() {
        Ok(Some(channel)) => UpdaterConfiguration {
            configured: true,
            current_version,
            endpoint_host: channel.endpoint.host_str().map(str::to_string),
            error: None,
        },
        Ok(None) => UpdaterConfiguration {
            configured: false,
            current_version,
            endpoint_host: None,
            error: None,
        },
        Err(error) => UpdaterConfiguration {
            configured: false,
            current_version,
            endpoint_host: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let current_version = app.package_info().version.to_string();
    let Some(channel) = release_channel()? else {
        return Ok(UpdateCheckResult {
            configured: false,
            current_version,
            available: false,
            version: None,
            date: None,
            body: None,
        });
    };

    let updater = build_updater(&app, &channel)?;
    let update = updater
        .check()
        .await
        .map_err(|error| format!("Update-Prüfung fehlgeschlagen: {error}"))?;

    Ok(match update {
        Some(update) => UpdateCheckResult {
            configured: true,
            current_version,
            available: true,
            version: Some(update.version),
            date: update.date.map(|date| date.to_string()),
            body: update.body,
        },
        None => UpdateCheckResult {
            configured: true,
            current_version,
            available: false,
            version: None,
            date: None,
            body: None,
        },
    })
}

#[tauri::command]
pub async fn download_and_install_update(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<(), String> {
    let channel = release_channel()?
        .ok_or_else(|| "Für diesen Build ist kein Update-Kanal konfiguriert.".to_string())?;
    let updater = build_updater(&app, &channel)?;
    let update = updater
        .check()
        .await
        .map_err(|error| format!("Update-Prüfung vor dem Download fehlgeschlagen: {error}"))?
        .ok_or_else(|| "Es ist kein neueres Update verfügbar.".to_string())?;

    install_update(update, window).await
}

async fn install_update(update: Update, window: WebviewWindow) -> Result<(), String> {
    let downloaded = Arc::new(AtomicU64::new(0));
    let progress_downloaded = Arc::clone(&downloaded);
    let progress_window = window.clone();
    let finish_downloaded = Arc::clone(&downloaded);
    let finish_window = window;

    update
        .download_and_install(
            move |chunk_length, total| {
                let current = progress_downloaded.fetch_add(chunk_length as u64, Ordering::Relaxed)
                    + chunk_length as u64;
                let _ = progress_window.emit(
                    UPDATE_PROGRESS_EVENT,
                    UpdateProgress {
                        downloaded: current,
                        total,
                        finished: false,
                    },
                );
            },
            move || {
                let _ = finish_window.emit(
                    UPDATE_PROGRESS_EVENT,
                    UpdateProgress {
                        downloaded: finish_downloaded.load(Ordering::Relaxed),
                        total: None,
                        finished: true,
                    },
                );
            },
        )
        .await
        .map_err(|error| {
            format!(
                "Update konnte nicht geladen, signiert geprüft oder installiert werden: {error}"
            )
        })
}

fn build_updater(
    app: &AppHandle,
    channel: &ReleaseChannel,
) -> Result<tauri_plugin_updater::Updater, String> {
    app.updater_builder()
        .endpoints(vec![channel.endpoint.clone()])
        .map_err(|error| format!("Update-Endpunkt ist ungültig: {error}"))?
        .pubkey(channel.public_key.clone())
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| format!("Updater kann nicht initialisiert werden: {error}"))
}

fn release_channel() -> Result<Option<ReleaseChannel>, String> {
    let endpoint = UPDATE_ENDPOINT.unwrap_or_default().trim();
    let public_key = UPDATE_PUBLIC_KEY.unwrap_or_default().trim();

    if endpoint.is_empty() && public_key.is_empty() {
        return Ok(None);
    }
    if endpoint.is_empty() || public_key.is_empty() {
        return Err(
            "Der Release-Build enthält nur einen Teil der signierten Update-Konfiguration.".into(),
        );
    }

    validate_release_channel(endpoint, public_key).map(Some)
}

fn validate_release_channel(endpoint: &str, public_key: &str) -> Result<ReleaseChannel, String> {
    let endpoint = Url::parse(endpoint)
        .map_err(|error| format!("Update-Endpunkt ist keine gültige URL: {error}"))?;
    if endpoint.scheme() != "https" {
        return Err("Update-Endpunkte müssen HTTPS verwenden.".into());
    }
    if !endpoint.username().is_empty() || endpoint.password().is_some() {
        return Err("Anmeldedaten dürfen nicht im Update-Endpunkt stehen.".into());
    }
    if public_key.trim().is_empty() {
        return Err("Der öffentliche Update-Signaturschlüssel fehlt.".into());
    }

    Ok(ReleaseChannel {
        endpoint,
        public_key: public_key.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_https_release_channels() {
        let channel = validate_release_channel(
            "https://github.com/example/PandaViewer/releases/latest/download/latest.json",
            "public-key",
        )
        .unwrap();
        assert_eq!(channel.endpoint.scheme(), "https");
    }

    #[test]
    fn rejects_insecure_or_credentialed_endpoints() {
        assert!(validate_release_channel("http://example.com/latest.json", "key").is_err());
        assert!(validate_release_channel("https://user@example.com/latest.json", "key").is_err());
    }
}
