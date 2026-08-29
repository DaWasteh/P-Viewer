mod document;
mod latex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            document::initial_document_path,
            document::read_document,
            document::read_local_image,
            document::write_document,
            latex::compile_latex,
            latex::detect_latex_engines
        ])
        .run(tauri::generate_context!())
        .expect("failed to run PandaViewer");
}
