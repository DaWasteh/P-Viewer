//! Session restore and recovery storage.
//!
//! Every document window stores its tab list (opaque JSON written by the
//! frontend) under its label. All windows share one `session.json`, written
//! atomically whenever a window reports a change. Unsaved text lives in
//! separate recovery files so the session metadata stays small and a damaged
//! session never loses document content.
//!
//! A window that is closed while other windows stay open is forgotten; the
//! last window keeps its entry, which is what the next start restores. The
//! previous session is handed out once per process, to the first window that
//! asks. Everything stays in the local app data folder and is never uploaded.

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, SystemTime},
};
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

const SESSION_DIR: &str = "session";
const SESSION_FILE: &str = "session.json";
const RECOVERY_DIR: &str = "recovery";
const SESSION_VERSION: u64 = 1;
const MAX_WINDOW_SESSION_BYTES: usize = 4 * 1024 * 1024;
const MAX_SESSION_FILE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_RECOVERY_BYTES: usize = 64 * 1024 * 1024;
/// Unreferenced recovery files are only removed once they are this old, so a
/// crash right after start-up can never cost unsaved text.
const ORPHAN_RECOVERY_AGE: Duration = Duration::from_secs(7 * 24 * 60 * 60);

#[derive(Default)]
pub struct SessionState {
    inner: Mutex<SessionInner>,
    restore_taken: AtomicBool,
}

#[derive(Default)]
struct SessionInner {
    /// Window label → the window's session JSON, for windows of this run.
    windows: BTreeMap<String, Value>,
    /// Set by "clear saved session": nothing is persisted until the next start.
    suspended: bool,
    /// Labels of windows closed in this run. Labels are never reused within a
    /// run, so a late write from a closing window cannot resurrect its entry.
    closed: HashSet<String>,
}

#[derive(Serialize, Deserialize)]
struct SessionFile {
    version: u64,
    windows: Vec<StoredWindow>,
}

#[derive(Serialize, Deserialize)]
struct StoredWindow {
    label: String,
    session: Value,
}

fn session_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    // Portable setups and the native smoke test keep the session elsewhere.
    if let Some(directory) =
        std::env::var_os("P_VIEWER_SESSION_DIR").filter(|value| !value.is_empty())
    {
        return Ok(PathBuf::from(directory));
    }
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(SESSION_DIR))
        .map_err(|error| format!("Der App-Datenordner ist nicht verfügbar: {error}"))
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Sitzungsordner kann nicht angelegt werden: {error}"))?;
    }
    let mut file = AtomicWriteFile::open(path)
        .map_err(|error| format!("Sitzungsdatei kann nicht vorbereitet werden: {error}"))?;
    file.write_all(bytes)
        .map_err(|error| format!("Sitzungsdatei kann nicht geschrieben werden: {error}"))?;
    file.commit()
        .map_err(|error| format!("Sitzungsdatei kann nicht atomar ersetzt werden: {error}"))
}

pub(crate) fn is_recovery_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

fn recovery_path(dir: &Path, id: &str) -> Result<PathBuf, String> {
    if !is_recovery_id(id) {
        return Err("Ungültige Wiederherstellungskennung.".into());
    }
    Ok(dir.join(RECOVERY_DIR).join(format!("{id}.txt")))
}

/// Reads the stored session; a damaged file is set aside instead of failing the start.
fn read_session_file(dir: &Path) -> Vec<StoredWindow> {
    let path = dir.join(SESSION_FILE);
    let Ok(metadata) = fs::metadata(&path) else {
        return Vec::new();
    };
    if metadata.len() > MAX_SESSION_FILE_BYTES {
        let _ = fs::rename(&path, dir.join("session.too-large.json"));
        return Vec::new();
    }
    let parsed = fs::read(&path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<SessionFile>(&bytes).ok());
    match parsed {
        Some(file) if file.version == SESSION_VERSION => file.windows,
        _ => {
            let _ = fs::rename(&path, dir.join("session.corrupt.json"));
            Vec::new()
        }
    }
}

/// Recovery ids a window session refers to (`tabs[].recoveryId`).
pub(crate) fn referenced_recovery_ids(session: &Value) -> HashSet<String> {
    session
        .get("tabs")
        .and_then(Value::as_array)
        .map(|tabs| {
            tabs.iter()
                .filter_map(|tab| tab.get("recoveryId").and_then(Value::as_str))
                .filter(|id| is_recovery_id(id))
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn prune_orphaned_recovery(dir: &Path, keep: &HashSet<String>, now: SystemTime) {
    let Ok(entries) = fs::read_dir(dir.join(RECOVERY_DIR)) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(id) = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .map(str::to_owned)
        else {
            continue;
        };
        if keep.contains(&id) {
            continue;
        }
        let old_enough = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age >= ORPHAN_RECOVERY_AGE);
        if old_enough {
            let _ = fs::remove_file(path);
        }
    }
}

impl SessionState {
    fn lock(&self) -> Result<std::sync::MutexGuard<'_, SessionInner>, String> {
        self.inner
            .lock()
            .map_err(|_| "Die Sitzungsverwaltung ist gesperrt.".to_string())
    }

    fn persist(&self, dir: &Path) -> Result<(), String> {
        let inner = self.lock()?;
        if inner.suspended {
            return Ok(());
        }
        let mut windows: Vec<StoredWindow> = inner
            .windows
            .iter()
            .map(|(label, session)| StoredWindow {
                label: label.clone(),
                session: session.clone(),
            })
            .collect();
        windows.sort_by_key(|window| crate::windows::label_order(&window.label));
        let bytes = serde_json::to_vec(&SessionFile {
            version: SESSION_VERSION,
            windows,
        })
        .map_err(|error| format!("Sitzung kann nicht serialisiert werden: {error}"))?;
        atomic_write(&dir.join(SESSION_FILE), &bytes)
    }

    /// The previous run's windows, once per process. Pruning happens here, before
    /// any window of this run has written anything.
    fn take_restore(&self, dir: &Path) -> Vec<String> {
        if self.restore_taken.swap(true, Ordering::SeqCst) {
            return Vec::new();
        }
        let mut windows = read_session_file(dir);
        windows.sort_by_key(|window| crate::windows::label_order(&window.label));
        let keep: HashSet<String> = windows
            .iter()
            .flat_map(|window| referenced_recovery_ids(&window.session))
            .collect();
        prune_orphaned_recovery(dir, &keep, SystemTime::now());
        windows
            .into_iter()
            .map(|window| window.session.to_string())
            .collect()
    }

    fn store(&self, dir: &Path, label: &str, session: Option<Value>) -> Result<(), String> {
        {
            let mut inner = self.lock()?;
            if inner.suspended || inner.closed.contains(label) {
                return Ok(());
            }
            match session {
                Some(session) => {
                    inner.windows.insert(label.to_string(), session);
                }
                None => {
                    inner.windows.remove(label);
                }
            }
        }
        self.persist(dir)
    }

    /// Deletes the stored session. With `suspend`, nothing is persisted again
    /// until the next start (or [`SessionState::resume`]), so the next start is empty.
    fn clear(&self, dir: &Path, include_recovery: bool, suspend: bool) -> Result<(), String> {
        {
            let mut inner = self.lock()?;
            inner.windows.clear();
            inner.suspended = suspend;
        }
        match fs::remove_file(dir.join(SESSION_FILE)) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Sitzung kann nicht gelöscht werden: {error}")),
        }
        if include_recovery {
            match fs::remove_dir_all(dir.join(RECOVERY_DIR)) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    return Err(format!(
                        "Wiederherstellungsdaten können nicht gelöscht werden: {error}"
                    ))
                }
            }
        }
        Ok(())
    }
}

impl SessionState {
    fn resume(&self) -> Result<(), String> {
        self.lock()?.suspended = false;
        Ok(())
    }

    fn close_window(&self, dir: &Path, label: &str) -> Result<(), String> {
        let changed = {
            let mut inner = self.lock()?;
            inner.closed.insert(label.to_string());
            inner.windows.remove(label).is_some()
        };
        if changed {
            self.persist(dir)
        } else {
            Ok(())
        }
    }
}

/// Called when a document window is gone: while other windows stay open the
/// closed window was dismissed on purpose and leaves the session.
pub(crate) fn forget_window<R: Runtime>(app: &AppHandle<R>, label: &str, others_open: bool) {
    if !others_open {
        return;
    }
    let Ok(dir) = session_dir(app) else {
        return;
    };
    if let Err(error) = app.state::<SessionState>().close_window(&dir, label) {
        eprintln!("Sitzung konnte nicht aktualisiert werden: {error}");
    }
}

#[tauri::command]
pub async fn session_take_restore<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, SessionState>,
) -> Result<Vec<String>, String> {
    let dir = session_dir(&app)?;
    Ok(state.take_restore(&dir))
}

#[tauri::command]
pub async fn session_store<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    state: tauri::State<'_, SessionState>,
    session: Option<String>,
) -> Result<(), String> {
    let label = window.label().to_string();
    if !crate::windows::is_document_window(&label) {
        return Err("Nur Dokumentfenster besitzen eine Sitzung.".into());
    }
    let value = match session {
        Some(text) => {
            if text.len() > MAX_WINDOW_SESSION_BYTES {
                return Err("Die Sitzung dieses Fensters ist zu groß.".into());
            }
            let value: Value = serde_json::from_str(&text)
                .map_err(|error| format!("Ungültige Sitzungsdaten: {error}"))?;
            if !value.is_object() {
                return Err("Ungültige Sitzungsdaten.".into());
            }
            Some(value)
        }
        None => None,
    };
    let dir = session_dir(&app)?;
    state.store(&dir, &label, value)
}

#[tauri::command]
pub async fn session_clear<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, SessionState>,
    include_recovery: bool,
    suspend: bool,
) -> Result<(), String> {
    let dir = session_dir(&app)?;
    state.clear(&dir, include_recovery, suspend)
}

#[tauri::command]
pub async fn session_resume(state: tauri::State<'_, SessionState>) -> Result<(), String> {
    state.resume()
}

/// Whether unsaved text from the recovery store exists (for the clear confirmation).
#[tauri::command]
pub async fn session_has_recovery<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    let dir = session_dir(&app)?;
    Ok(fs::read_dir(dir.join(RECOVERY_DIR))
        .map(|mut entries| entries.next().is_some())
        .unwrap_or(false))
}

#[tauri::command]
pub async fn session_write_recovery<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, SessionState>,
    id: String,
    content: String,
) -> Result<(), String> {
    if content.len() > MAX_RECOVERY_BYTES {
        return Err("Das Dokument ist für die Wiederherstellung zu groß.".into());
    }
    if state.lock()?.suspended {
        return Ok(());
    }
    let path = recovery_path(&session_dir(&app)?, &id)?;
    tauri::async_runtime::spawn_blocking(move || atomic_write(&path, content.as_bytes()))
        .await
        .map_err(|error| format!("Wiederherstellung wurde abgebrochen: {error}"))?
}

#[tauri::command]
pub async fn session_read_recovery<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> Result<Option<String>, String> {
    let path = recovery_path(&session_dir(&app)?, &id)?;
    match fs::read(&path) {
        Ok(bytes) if bytes.len() <= MAX_RECOVERY_BYTES => Ok(Some(
            String::from_utf8(bytes).map_err(|_| "Wiederherstellungsdaten sind beschädigt.")?,
        )),
        Ok(_) => Err("Wiederherstellungsdaten sind zu groß.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!(
            "Wiederherstellungsdaten können nicht gelesen werden: {error}"
        )),
    }
}

#[tauri::command]
pub async fn session_remove_recovery<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> Result<(), String> {
    let path = recovery_path(&session_dir(&app)?, &id)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Wiederherstellungsdaten können nicht entfernt werden: {error}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;

    fn stored(dir: &Path) -> Value {
        serde_json::from_slice(&fs::read(dir.join(SESSION_FILE)).unwrap()).unwrap()
    }

    #[test]
    fn validates_recovery_ids() {
        assert!(is_recovery_id("0b6c6f5e-1d2a-4c6e-9a7b-2f1c3d4e5f60"));
        assert!(is_recovery_id("r-abc123"));
        assert!(!is_recovery_id(""));
        assert!(!is_recovery_id("../secret"));
        assert!(!is_recovery_id("a/b"));
        assert!(!is_recovery_id(&"a".repeat(65)));
        assert!(recovery_path(Path::new("x"), "..\\evil").is_err());
    }

    #[test]
    fn stores_windows_in_label_order_and_forgets_removed_ones() {
        let dir = tempdir().unwrap();
        let state = SessionState::default();
        state
            .store(dir.path(), "main-2", Some(json!({ "tabs": [] })))
            .unwrap();
        state
            .store(
                dir.path(),
                "main",
                Some(json!({ "tabs": [{ "recoveryId": "a" }] })),
            )
            .unwrap();
        let file = stored(dir.path());
        assert_eq!(file["version"], 1);
        assert_eq!(file["windows"][0]["label"], "main");
        assert_eq!(file["windows"][1]["label"], "main-2");
        state.store(dir.path(), "main-2", None).unwrap();
        assert_eq!(stored(dir.path())["windows"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn closed_windows_cannot_be_resurrected_by_late_writes() {
        let dir = tempdir().unwrap();
        let state = SessionState::default();
        state
            .store(
                dir.path(),
                "main-3",
                Some(json!({ "tabs": [{ "recoveryId": "x" }] })),
            )
            .unwrap();
        state.close_window(dir.path(), "main-3").unwrap();
        state
            .store(
                dir.path(),
                "main-3",
                Some(json!({ "tabs": [{ "recoveryId": "x" }] })),
            )
            .unwrap();
        assert!(stored(dir.path())["windows"].as_array().unwrap().is_empty());
    }

    #[test]
    fn hands_out_the_previous_session_once() {
        let dir = tempdir().unwrap();
        let first = SessionState::default();
        first
            .store(
                dir.path(),
                "main",
                Some(json!({ "tabs": [{ "recoveryId": "keep" }] })),
            )
            .unwrap();
        let next = SessionState::default();
        let restored = next.take_restore(dir.path());
        assert_eq!(restored.len(), 1);
        assert!(restored[0].contains("keep"));
        assert!(next.take_restore(dir.path()).is_empty());
        // Restoring does not remove the file: a crash right after start loses nothing.
        assert!(dir.path().join(SESSION_FILE).exists());
    }

    #[test]
    fn damaged_session_files_are_set_aside() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join(SESSION_FILE), b"{ not json").unwrap();
        assert!(SessionState::default().take_restore(dir.path()).is_empty());
        assert!(!dir.path().join(SESSION_FILE).exists());
        assert!(dir.path().join("session.corrupt.json").exists());
    }

    #[test]
    fn prunes_only_old_unreferenced_recovery_files() {
        let dir = tempdir().unwrap();
        let recovery = dir.path().join(RECOVERY_DIR);
        fs::create_dir_all(&recovery).unwrap();
        for id in ["kept", "recent", "stale"] {
            fs::write(recovery.join(format!("{id}.txt")), id).unwrap();
        }
        let keep: HashSet<String> = ["kept".to_string()].into_iter().collect();
        prune_orphaned_recovery(dir.path(), &keep, SystemTime::now());
        assert!(recovery.join("recent.txt").exists());
        prune_orphaned_recovery(
            dir.path(),
            &keep,
            SystemTime::now() + ORPHAN_RECOVERY_AGE + Duration::from_secs(60),
        );
        assert!(recovery.join("kept.txt").exists());
        assert!(!recovery.join("recent.txt").exists());
        assert!(!recovery.join("stale.txt").exists());
    }

    #[test]
    fn clearing_suspends_persistence_for_this_run() {
        let dir = tempdir().unwrap();
        let state = SessionState::default();
        state
            .store(dir.path(), "main", Some(json!({ "tabs": [] })))
            .unwrap();
        let recovery = recovery_path(dir.path(), "abc").unwrap();
        atomic_write(&recovery, b"unsaved").unwrap();
        state.clear(dir.path(), false, true).unwrap();
        assert!(!dir.path().join(SESSION_FILE).exists());
        assert!(recovery.exists());
        state
            .store(dir.path(), "main", Some(json!({ "tabs": [] })))
            .unwrap();
        assert!(!dir.path().join(SESSION_FILE).exists());
        state.clear(dir.path(), true, true).unwrap();
        assert!(!recovery.exists());
        state.resume().unwrap();
        state
            .store(dir.path(), "main", Some(json!({ "tabs": [] })))
            .unwrap();
        assert!(dir.path().join(SESSION_FILE).exists());
    }

    #[test]
    fn collects_referenced_recovery_ids() {
        let ids = referenced_recovery_ids(&json!({
            "tabs": [{ "recoveryId": "a" }, { "recoveryId": "../b" }, { "path": "x" }]
        }));
        assert_eq!(ids, ["a".to_string()].into_iter().collect());
    }
}
