mod associations;
mod document;
mod latex;
mod updater;

#[cfg(target_os = "macos")]
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(document::PendingDocumentPaths::from_startup_arguments())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            associations::apply_default_file_associations,
            document::take_pending_document_paths,
            document::read_document,
            document::read_local_images,
            document::write_document,
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
            if paths.is_empty() {
                return;
            }

            let pending = app_handle.state::<document::PendingDocumentPaths>();
            if pending.add_paths(paths.clone()).is_ok() {
                let _ = app_handle.emit("open-documents", &paths);
            }
        }

        #[cfg(not(target_os = "macos"))]
        let _ = (app_handle, event);
    });
}
