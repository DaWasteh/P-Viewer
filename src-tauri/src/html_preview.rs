use percent_encoding::percent_decode_str;
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};
use tauri::{
    webview::{DownloadEvent, NewWindowResponse, WebviewWindowBuilder},
    Manager, WebviewUrl, WindowEvent,
};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};
use url::Url;
use uuid::Uuid;

const MAX_FULL_HTML_BYTES: usize = 64 * 1024 * 1024;
const MAX_LOCAL_ASSET_BYTES: u64 = 64 * 1024 * 1024;
const MAX_ACTIVE_PREVIEWS: usize = 8;
const SERVER_POLL_INTERVAL: Duration = Duration::from_millis(250);
const PREVIEW_HOST: &str = "127.0.0.1";

#[derive(Clone)]
pub struct FullHtmlPreviewState {
    entries: Arc<Mutex<HashMap<String, PreviewSession>>>,
}

struct PreviewSession {
    entry: Arc<Mutex<PreviewEntry>>,
    server: PreviewServer,
}

#[derive(Clone)]
struct PreviewEntry {
    source: Arc<Vec<u8>>,
    file_name: String,
    content_type: String,
    root: Option<PathBuf>,
    window_label: String,
    revision: u64,
}

struct PreviewServer {
    port: u16,
    server: Arc<Server>,
    shutdown: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

struct PreparedPreview {
    token: String,
    window_label: String,
    host: String,
    port: u16,
    url: Url,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FullHtmlPreviewSession {
    pub token: String,
}

impl Default for FullHtmlPreviewState {
    fn default() -> Self {
        Self {
            entries: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl PreviewServer {
    fn start(token: String, entry: Arc<Mutex<PreviewEntry>>) -> Result<Self, String> {
        let server = Arc::new(Server::http((PREVIEW_HOST, 0)).map_err(|error| {
            format!("Der lokale HTML-Vorschaudienst konnte nicht gestartet werden: {error}")
        })?);
        let port = server
            .server_addr()
            .to_ip()
            .map(|address| address.port())
            .ok_or_else(|| {
                "Der HTML-Vorschaudienst besitzt keine lokale TCP-Adresse.".to_string()
            })?;
        let shutdown = Arc::new(AtomicBool::new(false));
        let worker_server = Arc::clone(&server);
        let worker_shutdown = Arc::clone(&shutdown);
        let thread_name = format!("p-viewer-html-{}", &token[..8]);
        let thread = thread::Builder::new()
            .name(thread_name)
            .spawn(move || run_preview_server(worker_server, worker_shutdown, entry, token, port))
            .map_err(|error| {
                format!("Der HTML-Vorschaudienst konnte nicht ausgeführt werden: {error}")
            })?;

        Ok(Self {
            port,
            server,
            shutdown,
            thread: Some(thread),
        })
    }
}

impl Drop for PreviewServer {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::Release);
        self.server.unblock();
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl FullHtmlPreviewState {
    fn prepare(
        &self,
        document_path: &str,
        file_name: &str,
        content: String,
    ) -> Result<PreparedPreview, String> {
        validate_source_size(&content)?;
        let file_name = safe_file_name(file_name);
        let root = preview_root(document_path)?;
        let token = Uuid::new_v4().simple().to_string();
        let window_label = format!("html-preview-{token}");
        let content_type = html_content_type(&file_name).to_string();
        let entry = Arc::new(Mutex::new(PreviewEntry {
            source: Arc::new(content.into_bytes()),
            file_name: file_name.clone(),
            content_type,
            root,
            window_label: window_label.clone(),
            revision: 0,
        }));

        let mut entries = self
            .entries
            .lock()
            .map_err(|_| "Die Liste vollständiger HTML-Vorschauen ist gesperrt.".to_string())?;
        if entries.len() >= MAX_ACTIVE_PREVIEWS {
            return Err(format!(
                "Es sind bereits {MAX_ACTIVE_PREVIEWS} vollständige HTML-Vorschauen geöffnet. Schließe zuerst ein Vorschaufenster."
            ));
        }
        let server = PreviewServer::start(token.clone(), Arc::clone(&entry))?;
        let port = server.port;
        let host = PREVIEW_HOST.to_string();
        let url = preview_url(&token, &file_name, port, None)?;
        entries.insert(token.clone(), PreviewSession { entry, server });

        Ok(PreparedPreview {
            token,
            window_label,
            host,
            port,
            url,
        })
    }

    fn update(
        &self,
        token: &str,
        document_path: &str,
        file_name: &str,
        content: String,
    ) -> Result<Option<(String, Url)>, String> {
        validate_token(token)?;
        validate_source_size(&content)?;
        let root = preview_root(document_path)?;
        let file_name = safe_file_name(file_name);
        let content_type = html_content_type(&file_name).to_string();

        let entries = self
            .entries
            .lock()
            .map_err(|_| "Die Liste vollständiger HTML-Vorschauen ist gesperrt.".to_string())?;
        let Some(session) = entries.get(token) else {
            return Ok(None);
        };
        let mut entry = session
            .entry
            .lock()
            .map_err(|_| "Die vollständige HTML-Vorschau ist gesperrt.".to_string())?;
        entry.source = Arc::new(content.into_bytes());
        entry.file_name = file_name.clone();
        entry.content_type = content_type;
        entry.root = root;
        entry.revision = entry.revision.wrapping_add(1);

        let url = preview_url(token, &file_name, session.server.port, Some(entry.revision))?;
        Ok(Some((entry.window_label.clone(), url)))
    }

    fn window_label(&self, token: &str) -> Result<Option<String>, String> {
        validate_token(token)?;
        let entries = self
            .entries
            .lock()
            .map_err(|_| "Die Liste vollständiger HTML-Vorschauen ist gesperrt.".to_string())?;
        let Some(session) = entries.get(token) else {
            return Ok(None);
        };
        let entry = session
            .entry
            .lock()
            .map_err(|_| "Die vollständige HTML-Vorschau ist gesperrt.".to_string())?;
        Ok(Some(entry.window_label.clone()))
    }

    fn release(&self, token: &str) {
        if !is_valid_token(token) {
            return;
        }
        if let Ok(mut entries) = self.entries.lock() {
            entries.remove(token);
        }
    }
}

#[tauri::command]
// Must remain async: WebviewWindowBuilder deadlocks a synchronous Windows
// command, leaving an uncloseable white WebView2 window.
pub async fn open_full_html_preview(
    app: tauri::AppHandle,
    state: tauri::State<'_, FullHtmlPreviewState>,
    document_path: String,
    file_name: String,
    content: String,
) -> Result<FullHtmlPreviewSession, String> {
    let prepared = state.prepare(&document_path, &file_name, content)?;
    let expected_host = prepared.host.clone();
    let expected_port = prepared.port;
    let expected_origin = format!("http://{expected_host}:{expected_port}");
    let window = WebviewWindowBuilder::new(
        &app,
        prepared.window_label.clone(),
        WebviewUrl::External(prepared.url.clone()),
    )
    .title(format!(
        "Vollständige HTML-Vorschau — {}",
        safe_window_title(&file_name)
    ))
    .inner_size(1100.0, 760.0)
    .min_inner_size(480.0, 320.0)
    .center()
    .incognito(true)
    .devtools(false)
    .on_navigation(move |url| {
        allowed_preview_navigation(url, &expected_host, expected_port, &expected_origin)
    })
    // A document-created native child could outlive the isolated preview and has
    // no trustworthy browser chrome, so popups and downloads remain disabled.
    .on_new_window(|_, _| NewWindowResponse::Deny)
    .on_download(|_, event| !matches!(event, DownloadEvent::Requested { .. }))
    .build()
    .map_err(|error| {
        state.release(&prepared.token);
        format!("Das isolierte HTML-Vorschaufenster konnte nicht geöffnet werden: {error}")
    })?;

    let cleanup_state = state.inner().clone();
    let cleanup_token = prepared.token.clone();
    let cleanup_app = app.clone();
    let cleanup_label = prepared.window_label.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            if let Some(window) = cleanup_app.get_webview_window(&cleanup_label) {
                let _ = window.destroy();
            }
            cleanup_state.release(&cleanup_token);
        }
        WindowEvent::Destroyed => cleanup_state.release(&cleanup_token),
        _ => {}
    });

    Ok(FullHtmlPreviewSession {
        token: prepared.token,
    })
}

#[tauri::command]
pub async fn update_full_html_preview(
    app: tauri::AppHandle,
    state: tauri::State<'_, FullHtmlPreviewState>,
    token: String,
    document_path: String,
    file_name: String,
    content: String,
) -> Result<bool, String> {
    let Some((window_label, url)) = state.update(&token, &document_path, &file_name, content)?
    else {
        return Ok(false);
    };
    let Some(window) = app.get_webview_window(&window_label) else {
        state.release(&token);
        return Ok(false);
    };
    window.navigate(url).map_err(|error| {
        format!("Die vollständige HTML-Vorschau konnte nicht aktualisiert werden: {error}")
    })?;
    Ok(true)
}

#[tauri::command]
pub async fn focus_full_html_preview(
    app: tauri::AppHandle,
    state: tauri::State<'_, FullHtmlPreviewState>,
    token: String,
) -> Result<bool, String> {
    let Some(window_label) = state.window_label(&token)? else {
        return Ok(false);
    };
    let Some(window) = app.get_webview_window(&window_label) else {
        state.release(&token);
        return Ok(false);
    };
    window
        .unminimize()
        .and_then(|_| window.show())
        .and_then(|_| window.set_focus())
        .map_err(|error| {
            format!("Das HTML-Vorschaufenster konnte nicht fokussiert werden: {error}")
        })?;
    Ok(true)
}

#[tauri::command]
pub async fn close_full_html_preview(
    app: tauri::AppHandle,
    state: tauri::State<'_, FullHtmlPreviewState>,
    token: String,
) -> Result<(), String> {
    let window_label = state.window_label(&token)?;
    if let Some(window) = window_label.and_then(|label| app.get_webview_window(&label)) {
        window.destroy().map_err(|error| {
            format!("Das HTML-Vorschaufenster konnte nicht geschlossen werden: {error}")
        })?;
    }
    state.release(&token);
    Ok(())
}

fn preview_url(
    token: &str,
    file_name: &str,
    port: u16,
    revision: Option<u64>,
) -> Result<Url, String> {
    let mut url = Url::parse(&format!("http://{PREVIEW_HOST}:{port}/"))
        .map_err(|error| format!("Die lokale HTML-Vorschau-URL ist ungültig: {error}"))?;
    url.path_segments_mut()
        .map_err(|_| "Die lokale HTML-Vorschau-URL kann nicht aufgebaut werden.".to_string())?
        .push(token)
        .push(file_name);
    if let Some(revision) = revision {
        url.query_pairs_mut()
            .append_pair("revision", &revision.to_string());
    }
    Ok(url)
}

fn run_preview_server(
    server: Arc<Server>,
    shutdown: Arc<AtomicBool>,
    entry: Arc<Mutex<PreviewEntry>>,
    token: String,
    port: u16,
) {
    while !shutdown.load(Ordering::Acquire) {
        match server.recv_timeout(SERVER_POLL_INTERVAL) {
            Ok(Some(request)) => handle_preview_request(request, &entry, &token, port),
            Ok(None) => {}
            Err(_) if shutdown.load(Ordering::Acquire) => break,
            Err(_) => break,
        }
    }
}

fn handle_preview_request(
    request: Request,
    entry: &Arc<Mutex<PreviewEntry>>,
    token: &str,
    port: u16,
) {
    if !request
        .remote_addr()
        .is_some_and(|address| address.ip().is_loopback())
    {
        respond_error(request, 403, "Nur lokale Vorschauzugriffe sind erlaubt.");
        return;
    }
    if request.method() != &Method::Get && request.method() != &Method::Head {
        respond_error(request, 405, "Nur GET- und HEAD-Anfragen sind erlaubt.");
        return;
    }
    if !has_expected_host(&request, port) {
        respond_error(request, 404, "Unbekannte HTML-Vorschau.");
        return;
    }

    let request_path = request.url().split(['?', '#']).next().unwrap_or("/");
    let decoded = match decode_request_path(request_path) {
        Ok(path) => path,
        Err(message) => {
            respond_error(request, 400, message);
            return;
        }
    };
    let token_root = format!("/{token}");
    let requested_name = if decoded == token_root {
        ""
    } else if let Some(path) = decoded.strip_prefix(&format!("{token_root}/")) {
        path
    } else if has_preview_cookie(&request, token) {
        decoded.strip_prefix('/').unwrap_or(&decoded)
    } else {
        respond_error(request, 404, "Unbekannte HTML-Vorschau.");
        return;
    };
    let entry = match entry.lock() {
        Ok(entry) => entry.clone(),
        Err(_) => {
            respond_error(
                request,
                503,
                "Der HTML-Vorschaudienst ist vorübergehend gesperrt.",
            );
            return;
        }
    };
    let asset = if requested_name.is_empty() || requested_name == entry.file_name {
        Ok((entry.source.as_ref().clone(), entry.content_type.clone()))
    } else {
        read_preview_asset(&entry, requested_name)
    };

    match asset {
        Ok((bytes, content_type)) => respond_asset(request, bytes, &content_type, token),
        Err(AssetError::NotFound) => {
            respond_error(request, 404, "Lokale Ressource nicht gefunden.")
        }
        Err(AssetError::Forbidden) => respond_error(
            request,
            403,
            "Lokale Ressource liegt außerhalb des Dokumentordners.",
        ),
        Err(AssetError::TooLarge) => respond_error(
            request,
            413,
            "Lokale Ressource ist für die Vorschau zu groß.",
        ),
        Err(AssetError::Io(message)) => respond_error(request, 500, &message),
    }
}

#[derive(Debug, PartialEq, Eq)]
enum AssetError {
    NotFound,
    Forbidden,
    TooLarge,
    Io(String),
}

fn read_preview_asset(
    entry: &PreviewEntry,
    request_path: &str,
) -> Result<(Vec<u8>, String), AssetError> {
    let root = entry.root.as_ref().ok_or(AssetError::NotFound)?;
    let relative = safe_relative_path(request_path)?;
    let mut candidate = root.join(relative);
    if candidate.is_dir() {
        candidate = candidate.join("index.html");
    }
    let candidate = candidate.canonicalize().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            AssetError::NotFound
        } else {
            AssetError::Io(format!(
                "Lokale Ressource kann nicht aufgelöst werden: {error}"
            ))
        }
    })?;
    if !candidate.starts_with(root) || !candidate.is_file() {
        return Err(AssetError::Forbidden);
    }
    let metadata = fs::metadata(&candidate).map_err(|error| {
        AssetError::Io(format!(
            "Lokale Ressource kann nicht geprüft werden: {error}"
        ))
    })?;
    if metadata.len() > MAX_LOCAL_ASSET_BYTES {
        return Err(AssetError::TooLarge);
    }
    let bytes = fs::read(&candidate).map_err(|error| {
        AssetError::Io(format!(
            "Lokale Ressource kann nicht gelesen werden: {error}"
        ))
    })?;
    let content_type = mime_guess::from_path(&candidate)
        .first_or_octet_stream()
        .essence_str()
        .to_string();
    Ok((bytes, content_type))
}

fn safe_relative_path(value: &str) -> Result<PathBuf, AssetError> {
    if value.is_empty() || value.len() > 4_096 || value.contains('\0') {
        return Err(AssetError::Forbidden);
    }
    let mut path = PathBuf::new();
    for component in Path::new(value).components() {
        match component {
            Component::Normal(part) => path.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(AssetError::Forbidden)
            }
        }
    }
    if path.as_os_str().is_empty() {
        Err(AssetError::Forbidden)
    } else {
        Ok(path)
    }
}

fn has_expected_host(request: &Request, port: u16) -> bool {
    request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Host"))
        .is_some_and(|header| header.value.as_str() == format!("{PREVIEW_HOST}:{port}"))
}

fn has_preview_cookie(request: &Request, token: &str) -> bool {
    let expected = format!("PViewerPreview={token}");
    request
        .headers()
        .iter()
        .filter(|header| header.field.equiv("Cookie"))
        .flat_map(|header| header.value.as_str().split(';'))
        .any(|cookie| cookie.trim() == expected)
}

fn respond_asset(request: Request, bytes: Vec<u8>, content_type: &str, token: &str) {
    let range = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Range"))
        .map(|header| header.value.as_str().to_string());
    let total = bytes.len();
    let mut status = 200;
    let mut body = bytes;
    let mut content_range = None;

    if let Some(range) = range {
        match parse_byte_range(&range, total) {
            Some((start, end)) => {
                body = body[start..=end].to_vec();
                status = 206;
                content_range = Some(format!("bytes {start}-{end}/{total}"));
            }
            None => {
                let response = base_response(
                    Response::from_data(Vec::new()).with_status_code(StatusCode(416)),
                    "text/plain; charset=utf-8",
                )
                .with_header(header("Content-Range", &format!("bytes */{total}")));
                let _ = request.respond(response);
                return;
            }
        }
    }

    let mut response = base_response(
        Response::from_data(body).with_status_code(StatusCode(status)),
        content_type,
    )
    .with_header(header("Accept-Ranges", "bytes"))
    .with_header(header(
        "Set-Cookie",
        &format!("PViewerPreview={token}; Path=/; HttpOnly; SameSite=Strict"),
    ));
    if let Some(value) = content_range {
        response = response.with_header(header("Content-Range", &value));
    }
    let _ = request.respond(response);
}

fn respond_error(request: Request, status: u16, message: &str) {
    let response = base_response(
        Response::from_string(message.to_string()).with_status_code(StatusCode(status)),
        "text/plain; charset=utf-8",
    );
    let _ = request.respond(response);
}

fn base_response<R: Read>(response: Response<R>, content_type: &str) -> Response<R> {
    response
        .with_header(header("Content-Type", content_type))
        .with_header(header("Cache-Control", "no-store, max-age=0"))
        .with_header(header("Pragma", "no-cache"))
        .with_header(header("Access-Control-Allow-Origin", "*"))
        .with_header(header("X-Content-Type-Options", "nosniff"))
        .with_header(header("Referrer-Policy", "no-referrer"))
        .with_header(header("Content-Security-Policy", "frame-ancestors 'none'"))
        .with_header(header("Cross-Origin-Opener-Policy", "same-origin"))
        .with_header(header("Cross-Origin-Resource-Policy", "same-origin"))
        .with_header(header("Origin-Agent-Cluster", "?1"))
        .with_header(header(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()",
        ))
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes())
        .expect("statische HTTP-Vorschauheader müssen ASCII sein")
}

fn parse_byte_range(value: &str, length: usize) -> Option<(usize, usize)> {
    if length == 0 {
        return None;
    }
    let range = value.strip_prefix("bytes=")?;
    if range.contains(',') {
        return None;
    }
    let (start, end) = range.split_once('-')?;
    if start.is_empty() {
        let suffix = end.parse::<usize>().ok()?;
        if suffix == 0 {
            return None;
        }
        let start = length.saturating_sub(suffix);
        return Some((start, length - 1));
    }
    let start = start.parse::<usize>().ok()?;
    if start >= length {
        return None;
    }
    let end = if end.is_empty() {
        length - 1
    } else {
        end.parse::<usize>().ok()?.min(length - 1)
    };
    (start <= end).then_some((start, end))
}

fn decode_request_path(value: &str) -> Result<String, &'static str> {
    percent_decode_str(value)
        .decode_utf8()
        .map(|value| value.into_owned())
        .map_err(|_| "Die Ressourcen-URL enthält ungültige UTF-8-Zeichen.")
}

fn preview_root(document_path: &str) -> Result<Option<PathBuf>, String> {
    if document_path.trim().is_empty() {
        return Ok(None);
    }
    if document_path.contains('\0') {
        return Err("Der Dokumentpfad enthält ein ungültiges Nullzeichen.".into());
    }
    let requested_document = PathBuf::from(document_path);
    match requested_document.canonicalize() {
        Ok(document) if document.is_file() => Ok(document.parent().map(Path::to_path_buf)),
        Ok(_) => Err("Der Dokumentpfad der vollständigen Vorschau ist keine Datei.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let parent = requested_document.parent().ok_or_else(|| {
                "Der Dokumentpfad besitzt keinen auflösbaren Dokumentordner.".to_string()
            })?;
            let root = parent.canonicalize().map_err(|parent_error| {
                format!(
                    "Der Dokumentordner kann für die vollständige Vorschau nicht aufgelöst werden: {parent_error}"
                )
            })?;
            if root.is_dir() {
                Ok(Some(root))
            } else {
                Err("Der Dokumentordner der vollständigen Vorschau ist kein Ordner.".into())
            }
        }
        Err(error) => Err(format!(
            "Der Dokumentpfad kann für die vollständige Vorschau nicht aufgelöst werden: {error}"
        )),
    }
}

fn validate_source_size(content: &str) -> Result<(), String> {
    let bytes = content.len();
    if bytes > MAX_FULL_HTML_BYTES {
        return Err(format!(
            "Die vollständige HTML-Vorschau ist auf {} MiB Quelltext begrenzt; dieses Dokument umfasst {:.2} MiB.",
            MAX_FULL_HTML_BYTES / 1024 / 1024,
            bytes as f64 / 1024.0 / 1024.0
        ));
    }
    Ok(())
}

fn safe_file_name(value: &str) -> String {
    let candidate = value
        .trim()
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("")
        .chars()
        .filter(|character| !is_unsafe_display_character(*character))
        .take(180)
        .collect::<String>();
    if candidate.is_empty() || candidate == "." || candidate == ".." {
        "preview.html".into()
    } else {
        candidate
    }
}

fn safe_window_title(value: &str) -> String {
    safe_file_name(value)
}

fn is_unsafe_display_character(character: char) -> bool {
    character.is_control()
        || matches!(
            character,
            '\u{061c}'
                | '\u{200e}'
                | '\u{200f}'
                | '\u{202a}'..='\u{202e}'
                | '\u{2066}'..='\u{2069}'
        )
}

fn html_content_type(file_name: &str) -> &'static str {
    if file_name
        .rsplit_once('.')
        .is_some_and(|(_, extension)| extension.eq_ignore_ascii_case("xhtml"))
    {
        "application/xhtml+xml; charset=utf-8"
    } else {
        "text/html; charset=utf-8"
    }
}

fn validate_token(token: &str) -> Result<(), String> {
    if is_valid_token(token) {
        Ok(())
    } else {
        Err("Die Kennung der vollständigen HTML-Vorschau ist ungültig.".into())
    }
}

fn is_valid_token(token: &str) -> bool {
    token.len() == 32 && token.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn allowed_preview_navigation(url: &Url, host: &str, port: u16, origin: &str) -> bool {
    (url.scheme() == "http" && url.host_str() == Some(host) && url.port() == Some(port))
        || (url.scheme() == "blob" && url.as_str().starts_with(&format!("blob:{origin}/")))
        || url.as_str() == "about:blank"
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::Write as _, net::TcpStream};
    use tempfile::tempdir;

    #[test]
    fn sanitizes_preview_names_and_preserves_xhtml_type() {
        assert_eq!(safe_file_name("C:\\site\\index.html"), "index.html");
        assert_eq!(safe_file_name("../\u{202e}evil.xhtml"), "evil.xhtml");
        assert_eq!(safe_file_name(".."), "preview.html");
        assert_eq!(
            html_content_type("page.XHTML"),
            "application/xhtml+xml; charset=utf-8"
        );
    }

    #[test]
    fn parses_single_http_byte_ranges() {
        assert_eq!(parse_byte_range("bytes=2-5", 10), Some((2, 5)));
        assert_eq!(parse_byte_range("bytes=7-", 10), Some((7, 9)));
        assert_eq!(parse_byte_range("bytes=-3", 10), Some((7, 9)));
        assert_eq!(parse_byte_range("bytes=20-30", 10), None);
        assert_eq!(parse_byte_range("bytes=1-2,4-5", 10), None);
    }

    #[test]
    fn confines_resources_to_the_document_directory() {
        let directory = tempdir().unwrap();
        let root = directory.path().join("site");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("index.html"), "<h1>disk</h1>").unwrap();
        fs::write(root.join("style.css"), "body { color: red; }").unwrap();
        fs::write(directory.path().join("secret.txt"), "secret").unwrap();
        let entry = PreviewEntry {
            source: Arc::new(b"<h1>live</h1>".to_vec()),
            file_name: "index.html".into(),
            content_type: "text/html; charset=utf-8".into(),
            root: Some(root.canonicalize().unwrap()),
            window_label: "test".into(),
            revision: 0,
        };

        let (style, mime) = read_preview_asset(&entry, "style.css").unwrap();
        assert_eq!(style, b"body { color: red; }");
        assert_eq!(mime, "text/css");
        assert_eq!(
            read_preview_asset(&entry, "../secret.txt"),
            Err(AssetError::Forbidden)
        );
        let encoded_traversal = decode_request_path("%2e%2e/secret.txt").unwrap();
        assert_eq!(
            read_preview_asset(&entry, &encoded_traversal),
            Err(AssetError::Forbidden)
        );
        assert_eq!(
            preview_root(root.join("new-file.html").to_str().unwrap()).unwrap(),
            Some(root.canonicalize().unwrap())
        );
    }

    #[test]
    fn serves_live_html_and_local_assets_only_for_the_secret_host() {
        let directory = tempdir().unwrap();
        let document = directory.path().join("index.html");
        fs::write(&document, "disk").unwrap();
        fs::write(directory.path().join("app.js"), "window.loaded = true;").unwrap();
        let state = FullHtmlPreviewState::default();
        let prepared = state
            .prepare(
                document.to_str().unwrap(),
                "index.html",
                "<!doctype html><script src=\"app.js\"></script>".into(),
            )
            .unwrap();

        let html = http_get(prepared.port, &prepared.host, prepared.url.path(), None);
        assert!(html.starts_with("HTTP/1.1 200"));
        assert!(html.contains("Content-Type: text/html; charset=utf-8"));
        assert!(html.contains("<!doctype html><script src=\"app.js\"></script>"));

        let script_path = format!("/{}/app.js", prepared.token);
        let script = http_get(
            prepared.port,
            &prepared.host,
            &script_path,
            Some("bytes=0-5"),
        );
        assert!(script.starts_with("HTTP/1.1 206"));
        assert!(script.contains("Content-Range: bytes 0-5/21"));
        assert!(script.ends_with("window"));

        let cookie = format!("PViewerPreview={}", prepared.token);
        let absolute_script = http_get_with_cookie(
            prepared.port,
            &prepared.host,
            "/app.js",
            None,
            Some(&cookie),
        );
        assert!(absolute_script.starts_with("HTTP/1.1 200"));
        assert!(absolute_script.ends_with("window.loaded = true;"));
        let missing_cookie = http_get(prepared.port, &prepared.host, "/app.js", None);
        assert!(missing_cookie.starts_with("HTTP/1.1 404"));

        let denied = http_get(prepared.port, "wrong.localhost", prepared.url.path(), None);
        assert!(denied.starts_with("HTTP/1.1 404"));
        let traversal_path = format!("/{}/%2e%2e/secret.txt", prepared.token);
        let traversal = http_get(prepared.port, &prepared.host, &traversal_path, None);
        assert!(traversal.starts_with("HTTP/1.1 403"));
        state.release(&prepared.token);
    }

    fn http_get(port: u16, host: &str, path: &str, range: Option<&str>) -> String {
        http_get_with_cookie(port, host, path, range, None)
    }

    fn http_get_with_cookie(
        port: u16,
        host: &str,
        path: &str,
        range: Option<&str>,
        cookie: Option<&str>,
    ) -> String {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        let range = range
            .map(|value| format!("Range: {value}\r\n"))
            .unwrap_or_default();
        let cookie = cookie
            .map(|value| format!("Cookie: {value}\r\n"))
            .unwrap_or_default();
        write!(
            stream,
            "GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\n{range}{cookie}Connection: close\r\n\r\n"
        )
        .unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).unwrap();
        response
    }
}
