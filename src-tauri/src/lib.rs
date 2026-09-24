mod associations;
mod document;
mod file_icons;
mod html_preview;
mod latex;
mod session;
mod shell;
mod updater;
mod windows;

use tauri_plugin_window_state::StateFlags;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // Must stay the first plugin: a second process forwards its arguments
        // to the running instance and exits before anything else initializes.
        .plugin(tauri_plugin_single_instance::init(|app, arguments, cwd| {
            windows::handle_second_instance(app, arguments, cwd);
        }))
        .manage(windows::WindowRouter::from_startup_arguments())
        .manage(html_preview::FullHtmlPreviewState::default())
        .manage(session::SessionState::default())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Remembers where the last used document window was. Visibility stays
        // ours: windows are shown once their frontend has painted.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .map_label(windows::window_state_key)
                .with_filter(windows::is_document_window)
                .build(),
        )
        .setup(|app| {
            windows::prepare_main_window(app.handle());
            file_icons::startup_maintenance(app.handle());
            Ok(())
        })
        .on_window_event(windows::handle_window_event)
        .invoke_handler(tauri::generate_handler![
            associations::apply_default_file_associations,
            file_icons::apply_file_icon_mode,
            windows::take_pending_document_paths,
            windows::take_transferred_tabs,
            windows::open_new_window,
            windows::reveal_window,
            windows::move_tab_to_window,
            document::read_document,
            document::read_binary_document,
            document::read_local_images,
            document::write_document,
            html_preview::open_full_html_preview,
            html_preview::update_full_html_preview,
            html_preview::focus_full_html_preview,
            html_preview::close_full_html_preview,
            session::session_take_restore,
            session::session_store,
            session::session_clear,
            session::session_resume,
            session::session_has_recovery,
            session::session_write_recovery,
            session::session_read_recovery,
            session::session_remove_recovery,
            shell::open_terminal_at,
            latex::compile_latex,
            latex::detect_latex_engines,
            updater::check_for_update,
            updater::download_and_install_update,
            updater::updater_configuration
        ])
        .build(tauri::generate_context!())
        .expect("failed to build P-Viewer");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = event {
            let paths: Vec<String> = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .filter(|path| path.is_file())
                .map(|path| path.to_string_lossy().into_owned())
                .collect();
            if !paths.is_empty() {
                windows::dispatch_documents(app_handle.clone(), paths);
            }
        }

        #[cfg(not(target_os = "macos"))]
        let _ = (app_handle, event);
    });
}
