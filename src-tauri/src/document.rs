use atomic_write_file::AtomicWriteFile;
use chardetng::{EncodingDetector, Iso2022JpDetection, Utf8Detection};
use encoding_rs::Encoding;
use serde::Serialize;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

const UTF8_BOM: &[u8] = &[0xEF, 0xBB, 0xBF];
const UTF16_LE_BOM: &[u8] = &[0xFF, 0xFE];
const UTF16_BE_BOM: &[u8] = &[0xFE, 0xFF];

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

struct DecodedText {
    content: String,
    encoding: String,
    has_bom: bool,
    lossy: bool,
}

#[tauri::command]
pub fn read_document(path: String) -> Result<DocumentPayload, String> {
    let path = checked_path(&path)?;
    let metadata =
        fs::metadata(&path).map_err(|error| format!("Datei kann nicht gelesen werden: {error}"))?;

    if !metadata.is_file() {
        return Err("Der gewählte Pfad ist keine Datei.".into());
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
    if bytes.len() % 2 != 0 {
        return Err("Die UTF-16-Datei besitzt eine unvollständige Bytefolge.".into());
    }

    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| {
            if little_endian {
                u16::from_le_bytes([pair[0], pair[1]])
            } else {
                u16::from_be_bytes([pair[0], pair[1]])
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
        let original = "Panda \u{1F43C}\nFormel";
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
}
