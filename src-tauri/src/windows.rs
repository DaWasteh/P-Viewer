//! Document window routing.
//!
//! P-Viewer runs as a single process with any number of document windows
//! (`main`, `main-2`, `main-3`, …). This module decides which window receives
//! externally opened files, hands tabs from one window to another and creates
//! new windows from the configured main window template.
//!
//! Every window pulls its queued paths and tabs itself via commands. Queues are
//! only signalled with payload-free events, so a window that has not yet
//! registered its listeners still receives everything on start-up, and a window
//! that is already running is never sent large documents through `eval`.
//!
//! Document windows are created hidden. They get the background colour of the
//! stored theme and are shown by [`reveal_window`] once the frontend has painted
//! its UI, so no white or wrongly themed frame ever appears; a fallback timer
//! shows a window whose frontend never reports readiness. Size, position and
//! maximised state of the last used document window are remembered by
//! `tauri-plugin-window-state` under the shared key [`MAIN_WINDOW_LABEL`].

use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{
    webview::Color, AppHandle, Emitter, Manager, PhysicalPosition, Runtime, Theme, WebviewWindow,
    WebviewWindowBuilder, Window, WindowEvent,
};

pub const MAIN_WINDOW_LABEL: &str = "main";
const WINDOW_LABEL_PREFIX: &str = "main-";
const MAX_DOCUMENT_WINDOWS: usize = 16;
const MAX_QUEUED_PATHS: usize = 256;
const MAX_QUEUED_TABS: usize = 128;
/// Offset (CSS pixels) between the cursor and the origin of a window created by
/// dragging a tab out, so the dropped tab appears roughly under the pointer.
const DETACHED_WINDOW_OFFSET: (f64, f64) = (60.0, 140.0);
/// Offset (CSS pixels) between the most recently used window and a new window
/// opened without an explicit position, so the new window is visibly separate.
const CASCADE_OFFSET: f64 = 40.0;
/// A window whose frontend has not called [`reveal_window`] by then is shown
/// anyway, so a broken or very slow frontend never leaves an invisible app.
const REVEAL_FALLBACK: Duration = Duration::from_millis(1500);
/// Store file of `tauri-plugin-store` holding the frontend preferences.
const SETTINGS_FILE: &str = "settings.json";
/// `--background` of the dark and light UI theme in `app.css`.
const DARK_BACKGROUND: Color = Color(0x11, 0x13, 0x18, 0xff);
const LIGHT_BACKGROUND: Color = Color(0xfb, 0xfb, 0xfc, 0xff);

pub const OPEN_DOCUMENTS_EVENT: &str = "open-documents";
pub const TABS_TRANSFERRED_EVENT: &str = "tabs-transferred";

/// A tab handed over by another window. `tab` is the opaque JSON the frontend
/// serialized; Rust never interprets document content.
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QueuedTab {
    pub tab: String,
    /// Drop position in CSS pixels relative to the target window's client
    /// area, when the tab was dropped onto an existing window.
    pub drop_x: Option<f64>,
    pub drop_y: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabMoveResult {
    pub moved: bool,
    pub window: Option<String>,
    pub created: bool,
}

#[derive(Default)]
struct RouterState {
    pending_paths: HashMap<String, Vec<String>>,
    pending_tabs: HashMap<String, Vec<QueuedTab>>,
    /// Document window labels in focus order, most recently focused last.
    focus_order: Vec<String>,
}

#[derive(Default)]
pub struct WindowRouter {
    state: Mutex<RouterState>,
    sequence: AtomicU64,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct WindowRect {
    pub label: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    /// Higher means focused more recently.
    pub focus_rank: usize,
}

pub(crate) fn is_document_window(label: &str) -> bool {
    label == MAIN_WINDOW_LABEL
        || label
            .strip_prefix(WINDOW_LABEL_PREFIX)
            .is_some_and(|rest| !rest.is_empty() && rest.bytes().all(|byte| byte.is_ascii_digit()))
}

/// Key under which `tauri-plugin-window-state` remembers a window. All document
/// windows share one entry, so every new window opens where the last used
/// document window was; other windows keep their own label.
pub(crate) fn window_state_key(label: &str) -> &str {
    if is_document_window(label) {
        MAIN_WINDOW_LABEL
    } else {
        label
    }
}

/// Colour the native window and webview paint before the frontend renders.
/// `system` is the OS theme, used when the preference follows the system.
pub(crate) fn background_for(theme_preference: Option<&str>, system: Option<Theme>) -> Color {
    match theme_preference {
        Some("light") => LIGHT_BACKGROUND,
        Some("dark") => DARK_BACKGROUND,
        _ if matches!(system, Some(Theme::Light)) => LIGHT_BACKGROUND,
        _ => DARK_BACKGROUND,
    }
}

/// Theme preference from the serialized settings store (`preferences.theme`).
pub(crate) fn theme_preference_from_settings(text: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(text).ok()?;
    value
        .get("preferences")?
        .get("theme")?
        .as_str()
        .map(str::to_owned)
}

fn stored_theme_preference<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    let path = app.path().app_data_dir().ok()?.join(SETTINGS_FILE);
    theme_preference_from_settings(&std::fs::read_to_string(path).ok()?)
}

/// Prepares a freshly created, still hidden document window: a theme-matching
/// background so nothing white is ever painted, and a safety net that shows the
/// window even if the frontend never reports readiness.
pub(crate) fn prepare_document_window<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) {
    let color = background_for(stored_theme_preference(app).as_deref(), window.theme().ok());
    let _ = window.set_background_color(Some(color));
    let fallback = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(REVEAL_FALLBACK);
        reveal(&fallback);
    });
}

/// The main window is created from the configuration before `setup` runs.
pub(crate) fn prepare_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        prepare_document_window(app, &window);
    }
}

fn reveal<R: Runtime>(window: &WebviewWindow<R>) {
    if window.is_visible().unwrap_or(false) {
        return;
    }
    let _ = window.show();
    let _ = window.set_focus();
}

/// Origin of a window cascaded from `origin` by `offset`, if a window of `size`
/// still fits entirely inside `area` (`x`, `y`, `width`, `height`) there.
pub(crate) fn cascaded_origin(
    origin: (f64, f64),
    size: (f64, f64),
    area: (f64, f64, f64, f64),
    offset: f64,
) -> Option<(f64, f64)> {
    let candidate = (origin.0 + offset, origin.1 + offset);
    let fits = candidate.0 + size.0 <= area.0 + area.2 && candidate.1 + size.1 <= area.1 + area.3;
    fits.then_some(candidate)
}

/// Where a new window should appear relative to `reference`, the most recently
/// used window. `None` keeps the remembered position, e.g. for a maximised
/// reference or when the cascade would leave the monitor's work area.
fn cascade_position<R: Runtime>(reference: &WebviewWindow<R>) -> Option<PhysicalPosition<f64>> {
    if reference.is_maximized().ok()? || reference.is_minimized().ok()? {
        return None;
    }
    let origin = reference.outer_position().ok()?;
    let size = reference.outer_size().ok()?;
    let monitor = reference.current_monitor().ok()??;
    let area = monitor.work_area();
    cascaded_origin(
        (f64::from(origin.x), f64::from(origin.y)),
        (f64::from(size.width), f64::from(size.height)),
        (
            f64::from(area.position.x),
            f64::from(area.position.y),
            f64::from(area.size.width),
            f64::from(area.size.height),
        ),
        CASCADE_OFFSET * monitor.scale_factor(),
    )
    .map(|(x, y)| PhysicalPosition::new(x, y))
}

impl WindowRouter {
    /// Queues the start-up arguments for the configured main window.
    pub(crate) fn from_startup_arguments() -> Self {
        let router = Self::default();
        let paths = resolve_document_arguments(
            std::env::args_os()
                .skip(1)
                .map(|argument| argument.to_string_lossy().into_owned()),
            None,
        );
        let _ = router.queue_paths(MAIN_WINDOW_LABEL, paths);
        router
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, RouterState>, String> {
        self.state
            .lock()
            .map_err(|_| "Die Fensterverwaltung ist gesperrt.".to_string())
    }

    pub(crate) fn queue_paths(&self, label: &str, paths: Vec<String>) -> Result<(), String> {
        if paths.is_empty() {
            return Ok(());
        }
        let mut state = self.lock()?;
        let queue = state.pending_paths.entry(label.to_string()).or_default();
        for path in paths {
            if queue.len() >= MAX_QUEUED_PATHS {
                return Err(format!(
                    "Es warten bereits {MAX_QUEUED_PATHS} Dokumente auf dieses Fenster."
                ));
            }
            if !queue.contains(&path) {
                queue.push(path);
            }
        }
        Ok(())
    }

    pub(crate) fn take_paths(&self, label: &str) -> Result<Vec<String>, String> {
        Ok(self.lock()?.pending_paths.remove(label).unwrap_or_default())
    }

    pub(crate) fn queue_tab(&self, label: &str, tab: QueuedTab) -> Result<(), String> {
        let mut state = self.lock()?;
        let queue = state.pending_tabs.entry(label.to_string()).or_default();
        if queue.len() >= MAX_QUEUED_TABS {
            return Err(format!(
                "Es warten bereits {MAX_QUEUED_TABS} Tabs auf dieses Fenster."
            ));
        }
        queue.push(tab);
        Ok(())
    }

    pub(crate) fn take_tabs(&self, label: &str) -> Result<Vec<QueuedTab>, String> {
        Ok(self.lock()?.pending_tabs.remove(label).unwrap_or_default())
    }

    pub(crate) fn note_focus(&self, label: &str) {
        if !is_document_window(label) {
            return;
        }
        if let Ok(mut state) = self.lock() {
            state.focus_order.retain(|entry| entry != label);
            state.focus_order.push(label.to_string());
        }
    }

    /// Drops all bookkeeping for a destroyed window and returns tabs that were
    /// still waiting for it so the caller can re-route them.
    pub(crate) fn forget_window(&self, label: &str) -> Vec<QueuedTab> {
        let Ok(mut state) = self.lock() else {
            return Vec::new();
        };
        state.focus_order.retain(|entry| entry != label);
        state.pending_paths.remove(label);
        state.pending_tabs.remove(label).unwrap_or_default()
    }

    /// The most recently focused live document window, falling back to the
    /// lowest label so behaviour stays deterministic before any focus event.
    pub(crate) fn preferred_target(&self, live: &[String]) -> Option<String> {
        let live: Vec<&String> = live
            .iter()
            .filter(|label| is_document_window(label))
            .collect();
        if let Ok(state) = self.lock() {
            if let Some(label) = state
                .focus_order
                .iter()
                .rev()
                .find(|label| live.contains(label))
            {
                return Some(label.clone());
            }
        }
        live.into_iter()
            .min_by_key(|label| label_order(label))
            .cloned()
    }

    pub(crate) fn focus_rank(&self, label: &str) -> usize {
        self.lock()
            .ok()
            .and_then(|state| state.focus_order.iter().position(|entry| entry == label))
            .map_or(0, |index| index + 1)
    }

    pub(crate) fn next_label(&self, existing: &HashSet<String>) -> String {
        loop {
            let number = self.sequence.fetch_add(1, Ordering::SeqCst) + 2;
            let label = format!("{WINDOW_LABEL_PREFIX}{number}");
            if !existing.contains(&label) {
                return label;
            }
        }
    }
}

pub(crate) fn label_order(label: &str) -> u64 {
    if label == MAIN_WINDOW_LABEL {
        return 1;
    }
    label
        .strip_prefix(WINDOW_LABEL_PREFIX)
        .and_then(|rest| rest.parse().ok())
        .unwrap_or(u64::MAX)
}

/// Turns process arguments into openable file paths. Relative paths are
/// resolved against the working directory of the process that passed them,
/// which differs from ours when a second instance forwards its arguments.
pub(crate) fn resolve_document_arguments(
    arguments: impl IntoIterator<Item = String>,
    cwd: Option<&Path>,
) -> Vec<String> {
    let mut paths = Vec::new();
    for argument in arguments {
        if argument.trim().is_empty() {
            continue;
        }
        let candidate = PathBuf::from(&argument);
        let candidate = match cwd {
            Some(base) if candidate.is_relative() => base.join(candidate),
            _ => candidate,
        };
        if !candidate.is_file() {
            continue;
        }
        let text = candidate.to_string_lossy().into_owned();
        if !paths.contains(&text) {
            paths.push(text);
        }
    }
    paths
}

/// The window whose outer frame contains `point`. Overlaps are resolved in
/// favour of the most recently focused window because Tauri exposes no z-order.
pub(crate) fn window_at_point(point: (f64, f64), candidates: &[WindowRect]) -> Option<String> {
    candidates
        .iter()
        .filter(|rect| {
            point.0 >= rect.x
                && point.0 < rect.x + rect.width
                && point.1 >= rect.y
                && point.1 < rect.y + rect.height
        })
        .max_by_key(|rect| rect.focus_rank)
        .map(|rect| rect.label.clone())
}

fn document_windows<R: Runtime>(app: &AppHandle<R>) -> Vec<WebviewWindow<R>> {
    let mut windows: Vec<WebviewWindow<R>> = app
        .webview_windows()
        .into_values()
        .filter(|window| is_document_window(window.label()))
        .collect();
    windows.sort_by_key(|window| label_order(window.label()));
    windows
}

fn bring_to_front<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

/// Creates a document window from the configured main window. `before_show`
/// runs once the label is known but before the webview exists, so anything
/// queued there is guaranteed to be available on the window's first pull.
pub(crate) fn create_document_window<R: Runtime>(
    app: &AppHandle<R>,
    position: Option<PhysicalPosition<f64>>,
    before_show: impl FnOnce(&str) -> Result<(), String>,
) -> Result<String, String> {
    let router = app.state::<WindowRouter>();
    let existing: HashSet<String> = app.webview_windows().into_keys().collect();
    if existing
        .iter()
        .filter(|label| is_document_window(label))
        .count()
        >= MAX_DOCUMENT_WINDOWS
    {
        return Err(format!(
            "Es sind bereits {MAX_DOCUMENT_WINDOWS} P-Viewer-Fenster geöffnet. Bitte zuerst ein Fenster schließen."
        ));
    }
    let mut config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW_LABEL)
        .cloned()
        .ok_or_else(|| "Die Hauptfensterkonfiguration fehlt.".to_string())?;
    let label = router.next_label(&existing);
    config.label = label.clone();
    // Stays hidden until the frontend has painted (see `reveal_window`).
    config.visible = false;
    if position.is_some() {
        config.center = false;
    }
    // Without an explicit position the window is cascaded from the most
    // recently used window instead of covering it exactly.
    let live: Vec<String> = document_windows(app)
        .iter()
        .map(|window| window.label().to_string())
        .collect();
    let reference = position
        .is_none()
        .then(|| router.preferred_target(&live))
        .flatten()
        .and_then(|label| app.get_webview_window(&label));

    before_show(&label)?;
    let window = WebviewWindowBuilder::from_config(app, &config)
        .map_err(|error| {
            format!("Das neue P-Viewer-Fenster kann nicht vorbereitet werden: {error}")
        })?
        .build()
        .map_err(|error| {
            router.forget_window(&label);
            format!("Das neue P-Viewer-Fenster kann nicht geöffnet werden: {error}")
        })?;
    // The window-state plugin has restored the remembered geometry by now.
    if let Some(position) = position {
        let _ = window.unmaximize();
        let _ = window.set_position(position);
    } else if let Some(position) = reference.as_ref().and_then(cascade_position) {
        let _ = window.set_position(position);
    }
    prepare_document_window(app, &window);
    Ok(label)
}

/// Opens externally requested documents in the most recently used window or,
/// without any file, opens a fresh window: launching P-Viewer again while it is
/// running is an explicit request for another window.
pub(crate) fn route_documents<R: Runtime>(
    app: &AppHandle<R>,
    paths: Vec<String>,
) -> Result<(), String> {
    let router = app.state::<WindowRouter>();
    if paths.is_empty() {
        return create_document_window(app, None, |_| Ok(())).map(|_| ());
    }
    let live: Vec<String> = document_windows(app)
        .iter()
        .map(|window| window.label().to_string())
        .collect();
    match router.preferred_target(&live) {
        Some(label) => {
            router.queue_paths(&label, paths)?;
            let _ = app.emit_to(label.as_str(), OPEN_DOCUMENTS_EVENT, ());
            if let Some(window) = app.get_webview_window(&label) {
                bring_to_front(&window);
            }
            Ok(())
        }
        None => {
            create_document_window(app, None, |label| router.queue_paths(label, paths)).map(|_| ())
        }
    }
}

fn route_tabs<R: Runtime>(app: &AppHandle<R>, tabs: Vec<QueuedTab>) -> Result<(), String> {
    if tabs.is_empty() {
        return Ok(());
    }
    let router = app.state::<WindowRouter>();
    let live: Vec<String> = document_windows(app)
        .iter()
        .map(|window| window.label().to_string())
        .collect();
    match router.preferred_target(&live) {
        Some(label) => {
            for tab in tabs {
                router.queue_tab(&label, tab)?;
            }
            let _ = app.emit_to(label.as_str(), TABS_TRANSFERRED_EVENT, ());
            Ok(())
        }
        None => create_document_window(app, None, |label| {
            for tab in tabs {
                router.queue_tab(label, tab)?;
            }
            Ok(())
        })
        .map(|_| ()),
    }
}

/// Focus bookkeeping and clean-up for every window of the app.
pub(crate) fn handle_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    let label = window.label();
    if !is_document_window(label) {
        return;
    }
    let app = window.app_handle();
    match event {
        WindowEvent::Focused(true) => app.state::<WindowRouter>().note_focus(label),
        WindowEvent::Destroyed => {
            let others_open = document_windows(app)
                .iter()
                .any(|window| window.label() != label);
            crate::session::forget_window(app, label, others_open);
            let orphaned = app.state::<WindowRouter>().forget_window(label);
            app.state::<crate::html_preview::FullHtmlPreviewState>()
                .close_owned_by(app, label);
            if !orphaned.is_empty() {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = route_tabs(&app, orphaned) {
                        eprintln!("Verwaiste Tabs konnten nicht weitergereicht werden: {error}");
                    }
                });
            }
        }
        _ => {}
    }
}

/// Entry point for a second process instance: its arguments are opened in the
/// running instance instead of a new process.
pub(crate) fn handle_second_instance<R: Runtime>(
    app: &AppHandle<R>,
    arguments: Vec<String>,
    cwd: String,
) {
    let paths = resolve_document_arguments(arguments.into_iter().skip(1), Some(Path::new(&cwd)));
    dispatch_documents(app.clone(), paths);
}

/// Window creation must not run inside a native callback, so routing is moved
/// onto the async runtime; `WebviewWindowBuilder` then dispatches to the main
/// thread itself.
pub(crate) fn dispatch_documents<R: Runtime>(app: AppHandle<R>, paths: Vec<String>) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = route_documents(&app, paths) {
            eprintln!("Dokumente konnten nicht an ein Fenster übergeben werden: {error}");
        }
    });
}

#[tauri::command]
pub fn take_pending_document_paths<R: Runtime>(
    window: WebviewWindow<R>,
    router: tauri::State<'_, WindowRouter>,
) -> Result<Vec<String>, String> {
    router.take_paths(window.label())
}

#[tauri::command]
pub fn take_transferred_tabs<R: Runtime>(
    window: WebviewWindow<R>,
    router: tauri::State<'_, WindowRouter>,
) -> Result<Vec<QueuedTab>, String> {
    router.take_tabs(window.label())
}

#[tauri::command]
// Async on purpose: window creation from a synchronous command deadlocks WebView2.
pub async fn open_new_window<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    create_document_window(&app, None, |_| Ok(()))
}

/// Shows the calling window. The frontend calls this once its stored theme and
/// start-up documents are rendered; calling it again is harmless.
#[tauri::command]
pub async fn reveal_window<R: Runtime>(window: WebviewWindow<R>) {
    reveal(&window);
}

/// Moves a serialized tab to another window.
///
/// * `target` names an explicit window; otherwise the window under the cursor
///   is used. `inside_source` tells us the pointer is still over the source
///   window, in which case no other window can be under it.
/// * Without a target window a new window is created unless `allow_new_window`
///   is false (the source would otherwise be left empty). It appears under the
///   cursor for a dragged tab and cascaded otherwise (`at_cursor: false`, used
///   by the context menu and by session restore).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn move_tab_to_window<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    router: tauri::State<'_, WindowRouter>,
    tab: String,
    target: Option<String>,
    inside_source: bool,
    allow_new_window: bool,
    at_cursor: Option<bool>,
) -> Result<TabMoveResult, String> {
    let source = window.label().to_string();
    if !is_document_window(&source) {
        return Err("Nur Dokumentfenster können Tabs weitergeben.".into());
    }
    let cursor = app.cursor_position().ok();

    let target_label = match target {
        Some(label) => {
            if label == source
                || !is_document_window(&label)
                || app.get_webview_window(&label).is_none()
            {
                return Err("Das Zielfenster ist nicht mehr geöffnet.".into());
            }
            Some(label)
        }
        None if inside_source => None,
        None => cursor.and_then(|cursor| {
            let candidates: Vec<WindowRect> = document_windows(&app)
                .iter()
                .filter(|candidate| candidate.label() != source)
                .filter(|candidate| {
                    candidate.is_visible().unwrap_or(false)
                        && !candidate.is_minimized().unwrap_or(true)
                })
                .filter_map(|candidate| {
                    let position = candidate.outer_position().ok()?;
                    let size = candidate.outer_size().ok()?;
                    Some(WindowRect {
                        label: candidate.label().to_string(),
                        x: f64::from(position.x),
                        y: f64::from(position.y),
                        width: f64::from(size.width),
                        height: f64::from(size.height),
                        focus_rank: router.focus_rank(candidate.label()),
                    })
                })
                .collect();
            window_at_point((cursor.x, cursor.y), &candidates)
        }),
    };

    if let Some(label) = target_label {
        let Some(target_window) = app.get_webview_window(&label) else {
            return Err("Das Zielfenster ist nicht mehr geöffnet.".into());
        };
        let drop_point = cursor.and_then(|cursor| {
            let inner = target_window.inner_position().ok()?;
            let scale = target_window.scale_factor().ok()?;
            Some((
                (cursor.x - f64::from(inner.x)) / scale,
                (cursor.y - f64::from(inner.y)) / scale,
            ))
        });
        router.queue_tab(
            &label,
            QueuedTab {
                tab,
                drop_x: drop_point.map(|point| point.0),
                drop_y: drop_point.map(|point| point.1),
            },
        )?;
        let _ = app.emit_to(label.as_str(), TABS_TRANSFERRED_EVENT, ());
        bring_to_front(&target_window);
        return Ok(TabMoveResult {
            moved: true,
            window: Some(label),
            created: false,
        });
    }

    if !allow_new_window {
        return Ok(TabMoveResult {
            moved: false,
            window: None,
            created: false,
        });
    }

    let position = cursor.filter(|_| at_cursor.unwrap_or(true)).map(|cursor| {
        let scale = app
            .monitor_from_point(cursor.x, cursor.y)
            .ok()
            .flatten()
            .map_or(1.0, |monitor| monitor.scale_factor());
        PhysicalPosition::new(
            (cursor.x - DETACHED_WINDOW_OFFSET.0 * scale).max(0.0),
            (cursor.y - DETACHED_WINDOW_OFFSET.1 * scale).max(0.0),
        )
    });
    let queued = QueuedTab {
        tab,
        drop_x: None,
        drop_y: None,
    };
    let label = create_document_window(&app, position, |label| router.queue_tab(label, queued))?;
    Ok(TabMoveResult {
        moved: true,
        window: Some(label),
        created: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn rect(label: &str, x: f64, y: f64, focus_rank: usize) -> WindowRect {
        WindowRect {
            label: label.into(),
            x,
            y,
            width: 800.0,
            height: 600.0,
            focus_rank,
        }
    }

    #[test]
    fn recognizes_document_window_labels_only() {
        assert!(is_document_window("main"));
        assert!(is_document_window("main-2"));
        assert!(is_document_window("main-17"));
        assert!(!is_document_window("main-"));
        assert!(!is_document_window("main-x"));
        assert!(!is_document_window("html-preview-abc"));
        assert!(!is_document_window(""));
    }

    #[test]
    fn document_windows_share_one_remembered_window_state() {
        assert_eq!(window_state_key("main"), "main");
        assert_eq!(window_state_key("main-7"), "main");
        assert_eq!(window_state_key("html-preview-abc"), "html-preview-abc");
    }

    #[test]
    fn start_background_follows_the_stored_theme_then_the_system() {
        assert_eq!(
            background_for(Some("dark"), Some(Theme::Light)),
            DARK_BACKGROUND
        );
        assert_eq!(
            background_for(Some("light"), Some(Theme::Dark)),
            LIGHT_BACKGROUND
        );
        assert_eq!(
            background_for(Some("system"), Some(Theme::Light)),
            LIGHT_BACKGROUND
        );
        assert_eq!(
            background_for(Some("system"), Some(Theme::Dark)),
            DARK_BACKGROUND
        );
        assert_eq!(background_for(None, None), DARK_BACKGROUND);
        assert_eq!(background_for(Some("neon"), None), DARK_BACKGROUND);
    }

    #[test]
    fn reads_the_theme_preference_from_the_settings_store() {
        assert_eq!(
            theme_preference_from_settings(r#"{"preferences":{"theme":"light","iconSize":17}}"#)
                .as_deref(),
            Some("light")
        );
        assert_eq!(
            theme_preference_from_settings(r#"{"preferences":{}}"#),
            None
        );
        assert_eq!(
            theme_preference_from_settings(r#"{"preferences":{"theme":3}}"#),
            None
        );
        assert_eq!(theme_preference_from_settings("not json"), None);
    }

    #[test]
    fn cascades_new_windows_only_while_they_fit_the_work_area() {
        let area = (0.0, 0.0, 1920.0, 1040.0);
        assert_eq!(
            cascaded_origin((100.0, 80.0), (1280.0, 820.0), area, 40.0),
            Some((140.0, 120.0))
        );
        // Would run past the right edge.
        assert_eq!(
            cascaded_origin((620.0, 80.0), (1280.0, 820.0), area, 40.0),
            None
        );
        // Would run past the bottom edge.
        assert_eq!(
            cascaded_origin((100.0, 200.0), (1280.0, 820.0), area, 40.0),
            None
        );
        // Secondary monitor to the left of the primary one.
        assert_eq!(
            cascaded_origin(
                (-1900.0, 10.0),
                (800.0, 600.0),
                (-1920.0, 0.0, 1920.0, 1080.0),
                40.0
            ),
            Some((-1860.0, 50.0))
        );
    }

    #[test]
    fn allocates_unused_labels_in_sequence() {
        let router = WindowRouter::default();
        let mut existing: HashSet<String> = ["main", "main-2", "main-3"]
            .into_iter()
            .map(String::from)
            .collect();
        assert_eq!(router.next_label(&existing), "main-4");
        existing.insert("main-5".into());
        assert_eq!(router.next_label(&existing), "main-6");
    }

    #[test]
    fn queued_paths_are_deduplicated_and_taken_once() {
        let router = WindowRouter::default();
        router
            .queue_paths("main", vec!["a.txt".into(), "b.txt".into()])
            .unwrap();
        router.queue_paths("main", vec!["a.txt".into()]).unwrap();
        router.queue_paths("main-2", vec!["c.txt".into()]).unwrap();
        assert_eq!(router.take_paths("main").unwrap(), vec!["a.txt", "b.txt"]);
        assert!(router.take_paths("main").unwrap().is_empty());
        assert_eq!(router.take_paths("main-2").unwrap(), vec!["c.txt"]);
    }

    #[test]
    fn queued_paths_are_capped_per_window() {
        let router = WindowRouter::default();
        let many: Vec<String> = (0..MAX_QUEUED_PATHS).map(|i| format!("{i}.txt")).collect();
        router.queue_paths("main", many).unwrap();
        assert!(router
            .queue_paths("main", vec!["overflow.txt".into()])
            .is_err());
    }

    #[test]
    fn prefers_the_most_recently_focused_live_window() {
        let router = WindowRouter::default();
        let live = vec![
            "main".to_string(),
            "main-2".to_string(),
            "main-3".to_string(),
        ];
        assert_eq!(router.preferred_target(&live).as_deref(), Some("main"));
        router.note_focus("main-3");
        router.note_focus("main-2");
        router.note_focus("html-preview-1");
        assert_eq!(router.preferred_target(&live).as_deref(), Some("main-2"));
        assert_eq!(router.focus_rank("main-2"), 2);
        assert_eq!(router.focus_rank("main-3"), 1);
        assert_eq!(router.focus_rank("main"), 0);
        router.forget_window("main-2");
        assert_eq!(router.preferred_target(&live).as_deref(), Some("main-3"));
        assert_eq!(
            router.preferred_target(&["main-9".to_string()]).as_deref(),
            Some("main-9")
        );
        assert_eq!(router.preferred_target(&[]), None);
    }

    #[test]
    fn forgetting_a_window_returns_its_orphaned_tabs() {
        let router = WindowRouter::default();
        let tab = QueuedTab {
            tab: "{}".into(),
            drop_x: Some(12.0),
            drop_y: None,
        };
        router.queue_tab("main-2", tab.clone()).unwrap();
        router.queue_paths("main-2", vec!["a.txt".into()]).unwrap();
        assert_eq!(router.forget_window("main-2"), vec![tab]);
        assert!(router.take_paths("main-2").unwrap().is_empty());
        assert!(router.take_tabs("main-2").unwrap().is_empty());
        assert!(router.forget_window("main-2").is_empty());
    }

    #[test]
    fn queued_tabs_are_capped_per_window() {
        let router = WindowRouter::default();
        for _ in 0..MAX_QUEUED_TABS {
            router
                .queue_tab(
                    "main",
                    QueuedTab {
                        tab: "{}".into(),
                        drop_x: None,
                        drop_y: None,
                    },
                )
                .unwrap();
        }
        assert!(router
            .queue_tab(
                "main",
                QueuedTab {
                    tab: "{}".into(),
                    drop_x: None,
                    drop_y: None,
                }
            )
            .is_err());
        assert_eq!(router.take_tabs("main").unwrap().len(), MAX_QUEUED_TABS);
    }

    #[test]
    fn picks_the_window_under_the_point_preferring_recent_focus() {
        let candidates = vec![
            rect("main", 0.0, 0.0, 1),
            rect("main-2", 400.0, 300.0, 3),
            rect("main-3", 400.0, 300.0, 2),
        ];
        assert_eq!(
            window_at_point((100.0, 100.0), &candidates).as_deref(),
            Some("main")
        );
        assert_eq!(
            window_at_point((500.0, 400.0), &candidates).as_deref(),
            Some("main-2")
        );
        assert_eq!(window_at_point((1300.0, 950.0), &candidates), None);
        assert_eq!(window_at_point((800.0, 100.0), &candidates), None);
        assert_eq!(window_at_point((0.0, 0.0), &[]), None);
    }

    #[test]
    fn resolves_relative_arguments_against_the_caller_directory() {
        let directory = tempdir().unwrap();
        let file = directory.path().join("notes.md");
        fs::write(&file, "# Notes").unwrap();
        fs::create_dir(directory.path().join("folder")).unwrap();

        let resolved = resolve_document_arguments(
            vec![
                "notes.md".to_string(),
                "missing.md".to_string(),
                "folder".to_string(),
                "  ".to_string(),
                file.to_string_lossy().into_owned(),
            ],
            Some(directory.path()),
        );
        assert_eq!(resolved, vec![file.to_string_lossy().into_owned()]);

        let absolute_only = resolve_document_arguments(
            vec!["notes.md".to_string(), file.to_string_lossy().into_owned()],
            None,
        );
        assert_eq!(absolute_only, vec![file.to_string_lossy().into_owned()]);
    }
}
