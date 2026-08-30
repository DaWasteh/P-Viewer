use atomic_write_file::AtomicWriteFile;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chardetng::{EncodingDetector, Iso2022JpDetection, Utf8Detection};
use encoding_rs::Encoding;
use percent_encoding::percent_decode_str;
use serde::Serialize;
use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};

const UTF8_BOM: &[u8] = &[0xEF, 0xBB, 0xBF];
const UTF16_LE_BOM: &[u8] = &[0xFF, 0xFE];
const UTF16_BE_BOM: &[u8] = &[0xFE, 0xFF];
const MAX_LOCAL_IMAGE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_LOCAL_IMAGE_TOTAL_BYTES: u64 = 10 * 1024 * 1024;
const MAX_LOCAL_IMAGE_COUNT: usize = 32;
const MAX_LOCAL_IMAGE_SOURCE_LENGTH: usize = 2_048;
const MAX_DOCUMENT_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPayload {
    pub path: String,
    pub name: String,
    pub content: String,
    pub encoding: String,
    pub has_bom: bool,
    pub line_ending: String,
    pub size: u64,
    pub lossy: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub path: String,
    pub size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalImagePayload {
    pub source: String,
    pub data_url: Option<String>,
    pub path: Option<String>,
    pub error: Option<String>,
}

struct DecodedText {
    content: String,
    encoding: String,
    has_bom: bool,
    lossy: bool,
}

#[derive(Default)]
pub(crate) struct PendingDocumentPaths(Mutex<Vec<String>>);

impl PendingDocumentPaths {
    pub(crate) fn from_startup_arguments() -> Self {
        Self(Mutex::new(
            std::env::args_os()
                .skip(1)
                .map(PathBuf::from)
                .filter(|path| path.is_file())
                .map(|path| path.to_string_lossy().into_owned())
                .collect(),
        ))
    }

    #[cfg(target_os = "macos")]
    pub(crate) fn add_paths(&self, paths: Vec<String>) -> Result<(), String> {
        let mut pending = self
            .0
            .lock()
            .map_err(|_| "Die Liste zu öffnender Dokumente ist gesperrt.".to_string())?;
        for path in paths {
            if !pending.contains(&path) {
                pending.push(path);
            }
        }
        Ok(())
    }

    fn take(&self) -> Result<Vec<String>, String> {
        let mut pending = self
            .0
            .lock()
            .map_err(|_| "Die Liste zu öffnender Dokumente ist gesperrt.".to_string())?;
        Ok(std::mem::take(&mut *pending))
    }
}

#[tauri::command]
pub fn take_pending_document_paths(
    pending: tauri::State<'_, PendingDocumentPaths>,
) -> Result<Vec<String>, String> {
    pending.take()
}

#[tauri::command]
pub fn read_document(path: String) -> Result<DocumentPayload, String> {
    let path = checked_path(&path)?;
    let metadata =
        fs::metadata(&path).map_err(|error| format!("Datei kann nicht gelesen werden: {error}"))?;

    if !metadata.is_file() {
        return Err("Der gewählte Pfad ist keine Datei.".into());
    }
    if metadata.len() > MAX_DOCUMENT_BYTES {
        return Err(format!(
            "Die Datei ist größer als {} MiB und wird zum Schutz des Editors nicht geöffnet.",
            MAX_DOCUMENT_BYTES / 1024 / 1024
        ));
    }

    let bytes =
        fs::read(&path).map_err(|error| format!("Datei kann nicht geöffnet werden: {error}"))?;
    let decoded = decode_text(&bytes)?;

    Ok(DocumentPayload {
        path: path.to_string_lossy().into_owned(),
        name: display_name(&path),
        line_ending: detect_line_ending(&decoded.content).to_string(),
        content: decoded.content,
        encoding: decoded.encoding,
        has_bom: decoded.has_bom,
        size: metadata.len(),
        lossy: decoded.lossy,
    })
}

#[tauri::command]
pub fn write_document(
    path: String,
    content: String,
    encoding: String,
    has_bom: bool,
    line_ending: String,
) -> Result<SaveResult, String> {
    let mut path = checked_path(&path)?;

    if path.exists() && path.is_dir() {
        return Err("Der gewählte Pfad ist ein Ordner.".into());
    }

    if path.exists() {
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Dateimetadaten können nicht gelesen werden: {error}"))?;
        if metadata.file_type().is_symlink() {
            path = path.canonicalize().map_err(|error| {
                format!("Dateiverknüpfung kann nicht aufgelöst werden: {error}")
            })?;
        }
    }

    let parent = path
        .parent()
        .ok_or_else(|| "Der Zielpfad besitzt keinen gültigen übergeordneten Ordner.".to_string())?;
    if !parent.is_dir() {
        return Err("Der Zielordner existiert nicht.".into());
    }

    let normalized = normalize_line_endings(&content, &line_ending)?;
    let bytes = encode_text(&normalized, &encoding, has_bom)?;
    let size = bytes.len() as u64;
    if size > MAX_DOCUMENT_BYTES {
        return Err(format!(
            "Das Dokument ist größer als {} MiB und wird nicht gespeichert.",
            MAX_DOCUMENT_BYTES / 1024 / 1024
        ));
    }

    let mut file = AtomicWriteFile::open(&path)
        .map_err(|error| format!("Temporäre Speicherdatei kann nicht erstellt werden: {error}"))?;
    file.write_all(&bytes)
        .map_err(|error| format!("Datei kann nicht geschrieben werden: {error}"))?;
    file.commit()
        .map_err(|error| format!("Datei kann nicht atomar ersetzt werden: {error}"))?;

    Ok(SaveResult {
        path: path.to_string_lossy().into_owned(),
        size,
    })
}

#[tauri::command]
pub fn read_local_images(
    document_path: String,
    sources: Vec<String>,
) -> Result<Vec<LocalImagePayload>, String> {
    if sources.len() > MAX_LOCAL_IMAGE_COUNT {
        return Err(format!(
            "Pro Vorschau werden höchstens {MAX_LOCAL_IMAGE_COUNT} lokale Bilder geladen."
        ));
    }

    let document_path = checked_path(&document_path)?
        .canonicalize()
        .map_err(|error| format!("Dokumentpfad kann nicht aufgelöst werden: {error}"))?;
    if !document_path.is_file() {
        return Err("Der Dokumentpfad zeigt nicht auf eine Datei.".into());
    }
    let parent = document_path
        .parent()
        .ok_or_else(|| "Das Dokument besitzt keinen gültigen übergeordneten Ordner.".to_string())?;

    let mut seen = HashSet::new();
    let mut total_bytes = 0u64;
    let mut payloads = Vec::with_capacity(sources.len());

    for source in sources {
        if !seen.insert(source.clone()) {
            continue;
        }
        payloads.push(
            match resolve_local_image(parent, &source, &mut total_bytes) {
                Ok((data_url, path)) => LocalImagePayload {
                    source,
                    data_url: Some(data_url),
                    path: Some(path),
                    error: None,
                },
                Err(error) => LocalImagePayload {
                    source,
                    data_url: None,
                    path: None,
                    error: Some(error),
                },
            },
        );
    }

    Ok(payloads)
}

fn resolve_local_image(
    parent: &Path,
    source: &str,
    total_bytes: &mut u64,
) -> Result<(String, String), String> {
    if source.trim().is_empty() {
        return Err("Die Bildreferenz ist leer.".into());
    }
    if source.len() > MAX_LOCAL_IMAGE_SOURCE_LENGTH {
        return Err("Die Bildreferenz ist zu lang.".into());
    }

    let source_without_suffix = source
        .split(['?', '#'])
        .next()
        .ok_or_else(|| "Die Bildreferenz ist leer.".to_string())?;
    let decoded_source = percent_decode_str(source_without_suffix)
        .decode_utf8()
        .map_err(|_| "Die Bildreferenz enthält ungültige URL-Zeichen.".to_string())?;
    let source_path = PathBuf::from(decoded_source.as_ref());
    if source_path.is_absolute()
        || source_path
            .components()
            .any(|component| matches!(component, Component::Prefix(_) | Component::RootDir))
    {
        return Err("Aus Sicherheitsgründen sind nur relative Bildpfade erlaubt.".into());
    }

    let canonical = parent
        .join(source_path)
        .canonicalize()
        .map_err(|error| format!("Lokales Bild kann nicht gefunden werden: {error}"))?;
    if !canonical.starts_with(parent) {
        return Err("Die Bildreferenz liegt außerhalb des Dokumentordners.".into());
    }

    let metadata = fs::metadata(&canonical)
        .map_err(|error| format!("Bildmetadaten können nicht gelesen werden: {error}"))?;
    if !metadata.is_file() {
        return Err("Die Bildreferenz zeigt nicht auf eine Datei.".into());
    }
    if metadata.len() > MAX_LOCAL_IMAGE_BYTES {
        return Err(format!(
            "Das Bild ist größer als {} MiB.",
            MAX_LOCAL_IMAGE_BYTES / 1024 / 1024
        ));
    }
    if total_bytes.saturating_add(metadata.len()) > MAX_LOCAL_IMAGE_TOTAL_BYTES {
        return Err(format!(
            "Lokale Bilder überschreiten zusammen das Limit von {} MiB.",
            MAX_LOCAL_IMAGE_TOTAL_BYTES / 1024 / 1024
        ));
    }

    let bytes = fs::read(&canonical)
        .map_err(|error| format!("Lokales Bild kann nicht gelesen werden: {error}"))?;
    if bytes.len() as u64 > MAX_LOCAL_IMAGE_BYTES
        || total_bytes.saturating_add(bytes.len() as u64) > MAX_LOCAL_IMAGE_TOTAL_BYTES
    {
        return Err("Das lokale Bildlimit wurde während des Lesens überschritten.".into());
    }
    let mime = image_mime(&bytes)?;
    *total_bytes += bytes.len() as u64;

    Ok((
        format!("data:{mime};base64,{}", BASE64.encode(bytes)),
        canonical.to_string_lossy().into_owned(),
    ))
}

fn image_mime(bytes: &[u8]) -> Result<&'static str, String> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Ok("image/png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Ok("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Ok("image/gif")
    } else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        Ok("image/webp")
    } else if bytes.starts_with(b"BM") {
        Ok("image/bmp")
    } else if bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]) {
        Ok("image/x-icon")
    } else {
        Err("Aus Sicherheitsgründen werden nur geprüfte PNG-, JPEG-, GIF-, WebP-, BMP- und ICO-Bilder geladen.".into())
    }
}

fn checked_path(value: &str) -> Result<PathBuf, String> {
    if value.trim().is_empty() {
        return Err("Es wurde kein Dateipfad angegeben.".into());
    }
    Ok(PathBuf::from(value))
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

fn decode_text(bytes: &[u8]) -> Result<DecodedText, String> {
    if bytes.starts_with(UTF8_BOM) {
        let content = std::str::from_utf8(&bytes[UTF8_BOM.len()..])
            .map_err(|_| "Die Datei enthält ungültiges UTF-8 nach dem BOM.".to_string())?;
        return Ok(DecodedText {
            content: content.to_owned(),
            encoding: "UTF-8".into(),
            has_bom: true,
            lossy: false,
        });
    }

    if bytes.starts_with(UTF16_LE_BOM) {
        return decode_utf16(&bytes[UTF16_LE_BOM.len()..], true, true);
    }

    if bytes.starts_with(UTF16_BE_BOM) {
        return decode_utf16(&bytes[UTF16_BE_BOM.len()..], false, true);
    }

    if looks_binary(bytes) {
        return Err("Binärdateien werden derzeit nicht als Text geöffnet.".into());
    }

    if let Ok(content) = std::str::from_utf8(bytes) {
        return Ok(DecodedText {
            content: content.to_owned(),
            encoding: "UTF-8".into(),
            has_bom: false,
            lossy: false,
        });
    }

    let mut detector = EncodingDetector::new(Iso2022JpDetection::Allow);
    detector.feed(bytes, true);
    let encoding = detector.guess(None, Utf8Detection::Allow);
    let (content, lossy) = encoding.decode_without_bom_handling(bytes);

    Ok(DecodedText {
        content: content.into_owned(),
        encoding: encoding.name().to_string(),
        has_bom: false,
        lossy,
    })
}

fn decode_utf16(bytes: &[u8], little_endian: bool, has_bom: bool) -> Result<DecodedText, String> {
    if !bytes.len().is_multiple_of(2) {
        return Err("Die UTF-16-Datei besitzt eine unvollständige Bytefolge.".into());
    }

    let units: Vec<u16> = bytes
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| {
            if little_endian {
                u16::from_le_bytes(*pair)
            } else {
                u16::from_be_bytes(*pair)
            }
        })
        .collect();

    let content = String::from_utf16(&units)
        .map_err(|_| "Die Datei enthält ungültige UTF-16-Zeichen.".to_string())?;

    Ok(DecodedText {
        content,
        encoding: if little_endian {
            "UTF-16LE"
        } else {
            "UTF-16BE"
        }
        .into(),
        has_bom,
        lossy: false,
    })
}

fn looks_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8_192).any(|byte| *byte == 0)
}

fn detect_line_ending(content: &str) -> &'static str {
    let bytes = content.as_bytes();
    let mut crlf = 0usize;
    let mut lf = 0usize;
    let mut cr = 0usize;
    let mut index = 0usize;

    while index < bytes.len() {
        match bytes[index] {
            b'\r' if bytes.get(index + 1) == Some(&b'\n') => {
                crlf += 1;
                index += 2;
            }
            b'\r' => {
                cr += 1;
                index += 1;
            }
            b'\n' => {
                lf += 1;
                index += 1;
            }
            _ => index += 1,
        }
    }

    if crlf >= lf && crlf >= cr && crlf > 0 {
        "crlf"
    } else if cr > lf && cr > 0 {
        "cr"
    } else {
        "lf"
    }
}

fn normalize_line_endings(content: &str, line_ending: &str) -> Result<String, String> {
    let normalized = content.replace("\r\n", "\n").replace('\r', "\n");
    match line_ending {
        "lf" => Ok(normalized),
        "crlf" => Ok(normalized.replace('\n', "\r\n")),
        "cr" => Ok(normalized.replace('\n', "\r")),
        _ => Err(format!("Unbekannter Zeilenumbruch: {line_ending}")),
    }
}

fn encode_text(content: &str, encoding_name: &str, has_bom: bool) -> Result<Vec<u8>, String> {
    let normalized_name = encoding_name.trim().to_ascii_uppercase();

    match normalized_name.as_str() {
        "UTF-8" | "UTF8" => {
            let mut bytes =
                Vec::with_capacity(content.len() + usize::from(has_bom) * UTF8_BOM.len());
            if has_bom {
                bytes.extend_from_slice(UTF8_BOM);
            }
            bytes.extend_from_slice(content.as_bytes());
            Ok(bytes)
        }
        "UTF-16LE" | "UTF16LE" => encode_utf16(content, true, has_bom),
        "UTF-16BE" | "UTF16BE" => encode_utf16(content, false, has_bom),
        _ => {
            let encoding = Encoding::for_label(encoding_name.as_bytes())
                .ok_or_else(|| format!("Nicht unterstützte Zeichenkodierung: {encoding_name}"))?;
            let (bytes, _, had_errors) = encoding.encode(content);
            if had_errors {
                return Err(format!(
                    "Der Text enthält Zeichen, die nicht als {} gespeichert werden können. Bitte UTF-8 wählen.",
                    encoding.name()
                ));
            }
            Ok(bytes.into_owned())
        }
    }
}

fn encode_utf16(content: &str, little_endian: bool, has_bom: bool) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::with_capacity(content.len() * 2 + usize::from(has_bom) * 2);
    if has_bom {
        bytes.extend_from_slice(if little_endian {
            UTF16_LE_BOM
        } else {
            UTF16_BE_BOM
        });
    }

    for unit in content.encode_utf16() {
        let encoded = if little_endian {
            unit.to_le_bytes()
        } else {
            unit.to_be_bytes()
        };
        bytes.extend_from_slice(&encoded);
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_utf8_and_detects_crlf() {
        let decoded = decode_text(b"hello\r\nworld\r\n").unwrap();
        assert_eq!(decoded.content, "hello\r\nworld\r\n");
        assert_eq!(decoded.encoding, "UTF-8");
        assert_eq!(detect_line_ending(&decoded.content), "crlf");
    }

    #[test]
    fn round_trips_utf16_le_with_bom() {
        let original = "P-Viewer \u{1F43C}\nFormel";
        let encoded = encode_text(original, "UTF-16LE", true).unwrap();
        let decoded = decode_text(&encoded).unwrap();
        assert_eq!(decoded.content, original);
        assert_eq!(decoded.encoding, "UTF-16LE");
        assert!(decoded.has_bom);
    }

    #[test]
    fn normalizes_line_endings() {
        let normalized = normalize_line_endings("a\r\nb\nc\r", "crlf").unwrap();
        assert_eq!(normalized, "a\r\nb\r\nc\r\n");
    }

    #[test]
    fn rejects_binary_input() {
        let error = decode_text(&[0x41, 0x00, 0x42]).err().unwrap();
        assert!(error.contains("Binärdateien"));
    }

    #[test]
    fn legacy_encoding_reports_unrepresentable_text() {
        let error = encode_text("snowman: \u{2603}", "windows-1252", false)
            .err()
            .unwrap();
        assert!(error.contains("UTF-8"));
    }

    #[test]
    fn command_round_trip_preserves_utf16_bom_and_crlf() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("paper.txt");
        let path_string = path.to_string_lossy().into_owned();

        let saved = write_document(
            path_string.clone(),
            "Alpha α\nBeta β\n".into(),
            "UTF-16LE".into(),
            true,
            "crlf".into(),
        )
        .unwrap();
        let raw = fs::read(&path).unwrap();
        let opened = read_document(path_string).unwrap();

        assert_eq!(saved.size, raw.len() as u64);
        assert!(raw.starts_with(UTF16_LE_BOM));
        assert_eq!(opened.content, "Alpha α\r\nBeta β\r\n");
        assert_eq!(opened.encoding, "UTF-16LE");
        assert!(opened.has_bom);
        assert_eq!(opened.line_ending, "crlf");
    }

    #[test]
    fn local_image_loader_uses_content_type_and_reports_individual_errors() {
        let directory = tempfile::tempdir().unwrap();
        let document = directory.path().join("paper.md");
        let image = directory.path().join("figure.asset");
        let disguised_svg = directory.path().join("figure.png");
        fs::write(&document, "![figure](figure.asset)").unwrap();
        fs::write(&image, b"\x89PNG\r\n\x1a\ncontent").unwrap();
        fs::write(&disguised_svg, "<svg/>").unwrap();

        let payloads = read_local_images(
            document.to_string_lossy().into_owned(),
            vec!["figure.asset".into(), "figure.png".into()],
        )
        .unwrap();

        assert_eq!(payloads.len(), 2);
        assert!(payloads[0]
            .data_url
            .as_deref()
            .unwrap()
            .starts_with("data:image/png;base64,"));
        assert!(payloads[0].error.is_none());
        assert!(payloads[1].data_url.is_none());
        assert!(payloads[1]
            .error
            .as_deref()
            .unwrap()
            .contains("Sicherheitsgründen"));
    }

    #[test]
    fn local_image_loader_blocks_paths_outside_document_directory() {
        let directory = tempfile::tempdir().unwrap();
        let document_directory = directory.path().join("document");
        fs::create_dir(&document_directory).unwrap();
        let document = document_directory.join("paper.html");
        let outside = directory.path().join("outside.png");
        fs::write(&document, "<img src=\"../outside.png\">").unwrap();
        fs::write(&outside, b"\x89PNG\r\n\x1a\ncontent").unwrap();

        let payloads = read_local_images(
            document.to_string_lossy().into_owned(),
            vec!["../outside.png".into()],
        )
        .unwrap();

        assert!(payloads[0].data_url.is_none());
        assert!(payloads[0].error.as_deref().unwrap().contains("außerhalb"));
    }

    #[test]
    fn local_image_loader_enforces_aggregate_size() {
        let directory = tempfile::tempdir().unwrap();
        let document = directory.path().join("paper.html");
        fs::write(&document, "<p>Preview</p>").unwrap();
        let mut image = vec![0u8; 4 * 1024 * 1024];
        image[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
        for index in 0..3 {
            fs::write(directory.path().join(format!("image-{index}.png")), &image).unwrap();
        }

        let payloads = read_local_images(
            document.to_string_lossy().into_owned(),
            vec![
                "image-0.png".into(),
                "image-1.png".into(),
                "image-2.png".into(),
            ],
        )
        .unwrap();

        assert!(payloads[0].data_url.is_some());
        assert!(payloads[1].data_url.is_some());
        assert!(payloads[2].data_url.is_none());
        assert!(payloads[2].error.as_deref().unwrap().contains("zusammen"));
    }

    #[test]
    fn local_image_loader_limits_source_count() {
        let directory = tempfile::tempdir().unwrap();
        let document = directory.path().join("paper.html");
        fs::write(&document, "<p>Preview</p>").unwrap();
        let sources = (0..=MAX_LOCAL_IMAGE_COUNT)
            .map(|index| format!("image-{index}.png"))
            .collect();

        let error =
            read_local_images(document.to_string_lossy().into_owned(), sources).unwrap_err();
        assert!(error.contains("höchstens"));
    }
}
