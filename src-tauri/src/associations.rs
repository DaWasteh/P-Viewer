#[cfg(target_os = "linux")]
use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
#[cfg(target_os = "linux")]
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

const ASSOCIATIONS_JSON: &str = include_str!("../../src/lib/files/associations.json");
#[cfg(target_os = "linux")]
const MAX_MIMEAPPS_BYTES: u64 = 1024 * 1024;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AssociationGroup {
    id: String,
    prog_id: String,
    description: String,
    extensions: Vec<String>,
    mime_type: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssociationApplyResult {
    pub platform: String,
    pub selected_groups: usize,
    pub applied_types: usize,
    pub requires_user_confirmation: bool,
    pub message: String,
}

#[tauri::command]
pub async fn apply_default_file_associations(
    association_ids: Vec<String>,
) -> Result<AssociationApplyResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        apply_default_file_associations_inner(association_ids)
    })
    .await
    .map_err(|error| format!("Die Systemzuordnung wurde abgebrochen: {error}"))?
}

fn apply_default_file_associations_inner(
    association_ids: Vec<String>,
) -> Result<AssociationApplyResult, String> {
    let selected = select_associations(&association_ids)?;

    #[cfg(target_os = "windows")]
    {
        return apply_on_windows(&selected);
    }

    #[cfg(target_os = "linux")]
    {
        return apply_on_linux(&selected);
    }

    #[cfg(target_os = "macos")]
    {
        return apply_on_macos(&selected);
    }

    #[allow(unreachable_code)]
    Err("Systemweite Dateizuordnungen werden auf dieser Plattform nicht unterstützt.".into())
}

fn select_associations(ids: &[String]) -> Result<Vec<AssociationGroup>, String> {
    if ids.is_empty() {
        return Err("Wähle mindestens ein Dateiformat aus.".into());
    }

    let configured: Vec<AssociationGroup> = serde_json::from_str(ASSOCIATIONS_JSON)
        .map_err(|error| format!("Die gebündelten Dateizuordnungen sind ungültig: {error}"))?;
    if configured.iter().any(|association| {
        association.prog_id.is_empty()
            || association.description.is_empty()
            || association.extensions.is_empty()
            || !association.mime_type.contains('/')
    }) {
        return Err("Die gebündelten Dateizuordnungen sind unvollständig.".into());
    }
    let by_id: HashMap<&str, &AssociationGroup> = configured
        .iter()
        .map(|association| (association.id.as_str(), association))
        .collect();
    let mut seen = HashSet::new();
    let mut selected = Vec::with_capacity(ids.len());

    for id in ids {
        if !seen.insert(id.as_str()) {
            continue;
        }
        let association = by_id
            .get(id.as_str())
            .ok_or_else(|| format!("Unbekannte Dateiformatgruppe: {id}"))?;
        selected.push((*association).clone());
    }

    Ok(selected)
}

#[cfg(target_os = "windows")]
fn apply_on_windows(selected: &[AssociationGroup]) -> Result<AssociationApplyResult, String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    const DEFAULT_APPS_URI: &str = "ms-settings:defaultapps?registeredAppUser=P-Viewer";
    const CAPABILITIES_PATH: &str = "Software\\P-Viewer\\Capabilities";

    let executable = std::env::current_exe()
        .map_err(|error| format!("Der P-Viewer-Programmpfad ist nicht verfügbar: {error}"))?;
    let executable = executable.to_string_lossy();
    let executable_name = std::path::Path::new(executable.as_ref())
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("p-viewer.exe");
    let command = format!("\"{executable}\" \"%1\"");
    let icon = format!("{executable},0");
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    let (capabilities, _) = hkcu
        .create_subkey(CAPABILITIES_PATH)
        .map_err(|error| format!("Windows-Capabilities konnten nicht erstellt werden: {error}"))?;
    capabilities
        .set_value("ApplicationName", &"P-Viewer")
        .and_then(|_| {
            capabilities.set_value(
                "ApplicationDescription",
                &"Schneller Editor und Dokumentbetrachter",
            )
        })
        .and_then(|_| capabilities.set_value("ApplicationIcon", &icon.as_str()))
        .map_err(|error| {
            format!("Windows-Capabilities konnten nicht geschrieben werden: {error}")
        })?;

    let (file_associations, _) = hkcu
        .create_subkey(format!("{CAPABILITIES_PATH}\\FileAssociations"))
        .map_err(|error| format!("Windows-Dateiformate konnten nicht geöffnet werden: {error}"))?;
    let old_values: Vec<String> = file_associations
        .enum_values()
        .filter_map(Result::ok)
        .map(|(name, _)| name)
        .filter(|name| name.starts_with('.'))
        .collect();
    for name in old_values {
        file_associations.delete_value(name).map_err(|error| {
            format!("Eine alte Windows-Dateizuordnung konnte nicht entfernt werden: {error}")
        })?;
    }

    let (registered, _) = hkcu
        .create_subkey("Software\\RegisteredApplications")
        .map_err(|error| {
            format!("Windows-Standardprogramme konnten nicht geöffnet werden: {error}")
        })?;
    registered
        .set_value("P-Viewer", &CAPABILITIES_PATH)
        .map_err(|error| {
            format!("P-Viewer konnte nicht als Standardprogramm registriert werden: {error}")
        })?;

    let application_path = format!("Software\\Classes\\Applications\\{executable_name}");
    let (application, _) = hkcu
        .create_subkey(&application_path)
        .map_err(|error| format!("Windows-Open-With-Registrierung ist fehlgeschlagen: {error}"))?;
    application
        .set_value("FriendlyAppName", &"P-Viewer")
        .and_then(|_| {
            hkcu.create_subkey(format!("{application_path}\\DefaultIcon"))
                .and_then(|(key, _)| key.set_value("", &icon.as_str()))
        })
        .map_err(|error| {
            format!("Windows-App-Metadaten konnten nicht geschrieben werden: {error}")
        })?;
    hkcu.create_subkey(format!("{application_path}\\shell\\open\\command"))
        .and_then(|(key, _)| key.set_value("", &command.as_str()))
        .map_err(|error| {
            format!("Der Windows-Öffnen-Befehl konnte nicht registriert werden: {error}")
        })?;

    for association in selected {
        let prog_id_path = format!("Software\\Classes\\{}", association.prog_id);
        let (prog_id, _) = hkcu.create_subkey(&prog_id_path).map_err(|error| {
            format!(
                "ProgID {} konnte nicht erstellt werden: {error}",
                association.prog_id
            )
        })?;
        prog_id
            .set_value("", &association.description.as_str())
            .and_then(|_| {
                hkcu.create_subkey(format!("{prog_id_path}\\DefaultIcon"))
                    .and_then(|(key, _)| key.set_value("", &icon.as_str()))
            })
            .and_then(|_| {
                hkcu.create_subkey(format!("{prog_id_path}\\shell\\open\\command"))
                    .and_then(|(key, _)| key.set_value("", &command.as_str()))
            })
            .map_err(|error| {
                format!("ProgID {} ist unvollständig: {error}", association.prog_id)
            })?;

        for extension in &association.extensions {
            let dotted = format!(".{extension}");
            file_associations
                .set_value(&dotted, &association.prog_id.as_str())
                .map_err(|error| format!("{dotted} konnte nicht ausgewählt werden: {error}"))?;
            hkcu.create_subkey(format!("Software\\Classes\\{dotted}\\OpenWithProgids"))
                .and_then(|(key, _)| key.set_value(&association.prog_id, &""))
                .map_err(|error| {
                    format!("{dotted} konnte nicht für Öffnen mit registriert werden: {error}")
                })?;
        }
    }

    std::process::Command::new("explorer.exe")
        .arg(DEFAULT_APPS_URI)
        .spawn()
        .map_err(|error| format!("Windows-Einstellungen konnten nicht geöffnet werden: {error}"))?;

    Ok(AssociationApplyResult {
        platform: "windows".into(),
        selected_groups: selected.len(),
        applied_types: selected
            .iter()
            .map(|association| association.extensions.len())
            .sum(),
        requires_user_confirmation: true,
        message: "Windows schützt die Standard-App-Auswahl. Nur die ausgewählten P-Viewer-Formate wurden im Systemdialog angeboten; bestätige sie dort.".into(),
    })
}

#[cfg(target_os = "linux")]
fn apply_on_linux(selected: &[AssociationGroup]) -> Result<AssociationApplyResult, String> {
    let desktop_id = find_linux_desktop_id().ok_or_else(|| {
        "Der installierte P-Viewer-Desktop-Eintrag wurde nicht gefunden. Installiere das DEB-/RPM-Paket oder integriere das AppImage zuerst in das Anwendungsmenü.".to_string()
    })?;
    let config_home = linux_config_home()?;
    fs::create_dir_all(&config_home).map_err(|error| {
        format!("Der Linux-Konfigurationsordner kann nicht erstellt werden: {error}")
    })?;
    let path = config_home.join("mimeapps.list");
    let existing = if path.exists() {
        let metadata = fs::metadata(&path)
            .map_err(|error| format!("mimeapps.list kann nicht geprüft werden: {error}"))?;
        if metadata.len() > MAX_MIMEAPPS_BYTES {
            return Err(
                "mimeapps.list ist unerwartet groß und wird nicht automatisch geändert.".into(),
            );
        }
        fs::read_to_string(&path)
            .map_err(|error| format!("mimeapps.list kann nicht gelesen werden: {error}"))?
    } else {
        String::new()
    };

    let mut seen_mime_types = HashSet::new();
    let mime_types: Vec<String> = selected
        .iter()
        .map(|association| association.mime_type.clone())
        .filter(|mime_type| seen_mime_types.insert(mime_type.clone()))
        .collect();
    let updated_defaults =
        update_mimeapps_section(&existing, "Default Applications", &mime_types, &desktop_id);
    let updated = update_mimeapps_section(
        &updated_defaults,
        "Added Associations",
        &mime_types,
        &desktop_id,
    );
    atomic_write(&path, updated.as_bytes())?;

    Ok(AssociationApplyResult {
        platform: "linux".into(),
        selected_groups: selected.len(),
        applied_types: mime_types.len(),
        requires_user_confirmation: false,
        message: format!(
            "P-Viewer wurde für {} MIME-Typen als Standard eingetragen.",
            mime_types.len()
        ),
    })
}

#[cfg(target_os = "linux")]
fn linux_config_home() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from) {
        if path.is_absolute() {
            return Ok(path);
        }
    }
    let home = std::env::var_os("HOME").map(PathBuf::from).ok_or_else(|| {
        "HOME ist nicht gesetzt; mimeapps.list kann nicht gefunden werden.".to_string()
    })?;
    Ok(home.join(".config"))
}

#[cfg(target_os = "linux")]
fn find_linux_desktop_id() -> Option<String> {
    let mut data_roots = Vec::new();
    if let Some(path) = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from) {
        if path.is_absolute() {
            data_roots.push(path);
        }
    } else if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        data_roots.push(home.join(".local/share"));
    }
    data_roots.extend(
        std::env::var_os("XDG_DATA_DIRS")
            .map(|value| std::env::split_paths(&value).collect())
            .unwrap_or_else(|| {
                vec![
                    PathBuf::from("/usr/local/share"),
                    PathBuf::from("/usr/share"),
                ]
            }),
    );

    const CANDIDATES: [&str; 3] = [
        "P-Viewer.desktop",
        "p-viewer.desktop",
        "io.github.dawasteh.pviewer.desktop",
    ];
    for root in &data_roots {
        let applications = root.join("applications");
        for candidate in CANDIDATES {
            if applications.join(candidate).is_file() {
                return Some(candidate.to_string());
            }
        }
    }

    for root in data_roots {
        let applications = root.join("applications");
        let Ok(entries) = fs::read_dir(applications) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name()?.to_str()?;
            if !name.ends_with(".desktop") {
                continue;
            }
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if !metadata.is_file() || metadata.len() > 256 * 1024 {
                continue;
            }
            let Ok(content) = fs::read_to_string(path) else {
                continue;
            };
            if content.lines().any(|line| line.trim() == "Name=P-Viewer")
                && content.lines().any(|line| {
                    line.strip_prefix("Exec=")
                        .is_some_and(|command| command.contains("p-viewer"))
                })
            {
                return Some(name.to_string());
            }
        }
    }
    None
}

#[cfg(any(target_os = "linux", test))]
fn update_mimeapps_section(
    source: &str,
    section: &str,
    mime_types: &[String],
    desktop_id: &str,
) -> String {
    let mut lines: Vec<String> = source.lines().map(str::to_owned).collect();
    let heading = format!("[{section}]");
    let start = lines.iter().position(|line| line.trim() == heading);

    let (section_start, section_end) = if let Some(start) = start {
        let end = lines[start + 1..]
            .iter()
            .position(|line| {
                let trimmed = line.trim();
                trimmed.starts_with('[') && trimmed.ends_with(']')
            })
            .map_or(lines.len(), |offset| start + 1 + offset);
        (start + 1, end)
    } else {
        if !lines.is_empty() && lines.last().is_some_and(|line| !line.is_empty()) {
            lines.push(String::new());
        }
        lines.push(heading);
        let start = lines.len();
        (start, start)
    };

    let selected: HashSet<&str> = mime_types.iter().map(String::as_str).collect();
    let mut existing_values = HashMap::new();
    let mut retained = Vec::new();
    for line in &lines[section_start..section_end] {
        let Some((key, value)) = line.split_once('=') else {
            retained.push(line.clone());
            continue;
        };
        if selected.contains(key.trim()) {
            existing_values.insert(key.trim().to_string(), value.trim().to_string());
        } else {
            retained.push(line.clone());
        }
    }

    for mime_type in mime_types {
        let mut applications = existing_values
            .get(mime_type)
            .map(|value| {
                value
                    .split(';')
                    .filter(|entry| !entry.is_empty())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        applications.retain(|entry| *entry != desktop_id);
        applications.insert(0, desktop_id);
        retained.push(format!("{mime_type}={};", applications.join(";")));
    }

    lines.splice(section_start..section_end, retained);
    let mut output = lines.join("\n");
    output.push('\n');
    output
}

#[cfg(target_os = "linux")]
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = AtomicWriteFile::open(path)
        .map_err(|error| format!("Temporäre mimeapps.list kann nicht erstellt werden: {error}"))?;
    file.write_all(bytes)
        .map_err(|error| format!("mimeapps.list kann nicht geschrieben werden: {error}"))?;
    file.commit()
        .map_err(|error| format!("mimeapps.list kann nicht atomar ersetzt werden: {error}"))
}

#[cfg(target_os = "macos")]
fn apply_on_macos(selected: &[AssociationGroup]) -> Result<AssociationApplyResult, String> {
    let mut applied = 0usize;
    for extension in selected
        .iter()
        .flat_map(|association| association.extensions.iter())
    {
        set_macos_default_for_extension(extension)?;
        applied += 1;
    }

    Ok(AssociationApplyResult {
        platform: "macos".into(),
        selected_groups: selected.len(),
        applied_types: applied,
        requires_user_confirmation: false,
        message: format!("P-Viewer wurde für {applied} Dateiendungen als Standard gesetzt."),
    })
}

#[cfg(target_os = "macos")]
fn set_macos_default_for_extension(extension: &str) -> Result<(), String> {
    use std::{ffi::c_void, ffi::CString, ptr};

    type CfStringRef = *const c_void;
    const UTF8_ENCODING: u32 = 0x0800_0100;
    const ALL_ROLES: u32 = u32::MAX;

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFStringCreateWithCString(
            allocator: *const c_void,
            value: *const i8,
            encoding: u32,
        ) -> CfStringRef;
        fn CFRelease(value: *const c_void);
    }

    #[link(name = "CoreServices", kind = "framework")]
    unsafe extern "C" {
        static kUTTagClassFilenameExtension: CfStringRef;
        fn UTTypeCreatePreferredIdentifierForTag(
            tag_class: CfStringRef,
            tag: CfStringRef,
            conforming_to: CfStringRef,
        ) -> CfStringRef;
        fn LSSetDefaultRoleHandlerForContentType(
            content_type: CfStringRef,
            roles: u32,
            bundle_identifier: CfStringRef,
        ) -> i32;
    }

    struct OwnedCf(CfStringRef);
    impl Drop for OwnedCf {
        fn drop(&mut self) {
            unsafe { CFRelease(self.0) };
        }
    }

    fn cf_string(value: &str) -> Result<OwnedCf, String> {
        let value = CString::new(value)
            .map_err(|_| "Eine Dateiendung enthält ein ungültiges Nullzeichen.".to_string())?;
        let reference =
            unsafe { CFStringCreateWithCString(ptr::null(), value.as_ptr(), UTF8_ENCODING) };
        if reference.is_null() {
            Err("macOS konnte keinen Dateityp-String erstellen.".into())
        } else {
            Ok(OwnedCf(reference))
        }
    }

    let extension_string = cf_string(extension)?;
    let bundle_identifier = cf_string("io.github.dawasteh.pviewer")?;
    let content_type = unsafe {
        UTTypeCreatePreferredIdentifierForTag(
            kUTTagClassFilenameExtension,
            extension_string.0,
            ptr::null(),
        )
    };
    if content_type.is_null() {
        return Err(format!("macOS erkennt die Dateiendung .{extension} nicht."));
    }
    let content_type = OwnedCf(content_type);
    let status = unsafe {
        LSSetDefaultRoleHandlerForContentType(content_type.0, ALL_ROLES, bundle_identifier.0)
    };
    if status != 0 {
        return Err(format!(
            "macOS konnte .{extension} nicht zuordnen (LaunchServices-Status {status})."
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_and_empty_selections() {
        assert!(select_associations(&[]).unwrap_err().contains("mindestens"));
        assert!(select_associations(&["unknown".into()])
            .unwrap_err()
            .contains("Unbekannte"));
    }

    #[test]
    fn deduplicates_valid_selections() {
        let selected =
            select_associations(&["markdown".into(), "markdown".into(), "json".into()]).unwrap();
        assert_eq!(selected.len(), 2);
        assert_eq!(selected[0].id, "markdown");
        assert!(selected[0].extensions.contains(&"md".to_string()));
    }

    #[test]
    fn updates_existing_mimeapps_sections_without_losing_fallbacks() {
        let source = "# comment\n[Default Applications]\ntext/plain=editor.desktop;\nimage/png=images.desktop;\n\n[Added Associations]\ntext/plain=editor.desktop;\n";
        let mime_types = vec!["text/plain".to_string(), "text/markdown".to_string()];
        let defaults = update_mimeapps_section(
            source,
            "Default Applications",
            &mime_types,
            "P-Viewer.desktop",
        );
        let updated = update_mimeapps_section(
            &defaults,
            "Added Associations",
            &mime_types,
            "P-Viewer.desktop",
        );

        assert!(updated.contains("# comment"));
        assert!(updated.contains("image/png=images.desktop;"));
        assert!(updated.contains("text/plain=P-Viewer.desktop;editor.desktop;"));
        assert!(updated.contains("text/markdown=P-Viewer.desktop;"));
        assert_eq!(
            updated.matches("P-Viewer.desktop;editor.desktop;").count(),
            2
        );
    }
}
