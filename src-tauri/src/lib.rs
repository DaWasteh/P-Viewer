mod document;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            document::read_document,
            document::write_document
        ])
        .run(tauri::generate_context!())
        .expect("failed to run PandaViewer");
}
