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
    use std::ffi::{OsStr, OsString};
    use windows_sys::Win32::UI::Shell::{
        SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_FLUSH, SHCNF_IDLIST,
    };
    use winreg::{
        enums::{HKEY_CURRENT_USER, KEY_WRITE},
        RegKey,
    };

    const APP_REGISTRATION_NAME: &str = "P-Viewer";
    const CAPABILITIES_PATH: &str = "Software\\P-Viewer\\Capabilities";
    const DEFAULT_APPS_URI: &str = "ms-settings:defaultapps?registeredAppUser=P-Viewer";
    const DEFAULT_APPS_FALLBACK_URI: &str = "ms-settings:defaultapps";

    fn child_key(parent: &OsStr, suffix: &str) -> OsString {
        let mut path = parent.to_os_string();
        path.push("\\");
        path.push(suffix);
        path
    }

    let executable = std::env::current_exe()
        .map_err(|error| format!("Der P-Viewer-Programmpfad ist nicht verfügbar: {error}"))?;
    let executable_name = executable
        .file_name()
        .unwrap_or_else(|| OsStr::new("p-viewer.exe"));
    let mut command = OsString::from("\"");
    command.push(executable.as_os_str());
    command.push("\" \"%1\"");
    let mut icon = executable.as_os_str().to_os_string();
    icon.push(",0");
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    let (capabilities, _) = hkcu
        .create_subkey(CAPABILITIES_PATH)
        .map_err(|error| format!("Windows-Capabilities konnten nicht erstellt werden: {error}"))?;
    capabilities
        .set_value("ApplicationName", &APP_REGISTRATION_NAME)
        .and_then(|_| {
            capabilities.set_value(
                "ApplicationDescription",
                &"Schneller Editor und Dokumentbetrachter",
            )
        })
        .and_then(|_| capabilities.set_value("ApplicationIcon", &icon.as_os_str()))
        .map_err(|error| {
            format!("Windows-Capabilities konnten nicht geschrieben werden: {error}")
        })?;

    let (file_associations, _) = hkcu
        .create_subkey(format!("{CAPABILITIES_PATH}\\FileAssociations"))
        .map_err(|error| format!("Windows-Dateiformate konnten nicht geöffnet werden: {error}"))?;
    let old_capability_values: Vec<(String, String)> = file_associations
        .enum_values()
        .filter_map(Result::ok)
        .map(|(name, _)| name)
        .filter(|name| name.starts_with('.'))
        .filter_map(|name| {
            file_associations
                .get_value::<String, _>(&name)
                .ok()
                .map(|prog_id| (name, prog_id))
        })
        .collect();

    let (registered, _) = hkcu
        .create_subkey("Software\\RegisteredApplications")
        .map_err(|error| {
            format!("Windows-Standardprogramme konnten nicht geöffnet werden: {error}")
        })?;
    registered
        .set_value(APP_REGISTRATION_NAME, &CAPABILITIES_PATH)
        .map_err(|error| {
            format!("P-Viewer konnte nicht als Standardprogramm registriert werden: {error}")
        })?;

    let mut application_path = OsString::from("Software\\Classes\\Applications\\");
    application_path.push(executable_name);
    let (application, _) = hkcu
        .create_subkey(&application_path)
        .map_err(|error| format!("Windows-Open-With-Registrierung ist fehlgeschlagen: {error}"))?;
    application
        .set_value("FriendlyAppName", &APP_REGISTRATION_NAME)
        .and_then(|_| {
            hkcu.create_subkey(child_key(&application_path, "DefaultIcon"))
                .and_then(|(key, _)| key.set_value("", &icon.as_os_str()))
        })
        .map_err(|error| {
            format!("Windows-App-Metadaten konnten nicht geschrieben werden: {error}")
        })?;
    hkcu.create_subkey(child_key(&application_path, "shell\\open\\command"))
        .and_then(|(key, _)| key.set_value("", &command.as_os_str()))
        .map_err(|error| {
            format!("Der Windows-Öffnen-Befehl konnte nicht registriert werden: {error}")
        })?;
    let (supported_types, _) = hkcu
        .create_subkey(child_key(&application_path, "SupportedTypes"))
        .map_err(|error| format!("Windows-Dateitypen konnten nicht registriert werden: {error}"))?;
    let old_supported_types: Vec<String> = supported_types
        .enum_values()
        .filter_map(Result::ok)
        .map(|(name, _)| name)
        .filter(|name| name.starts_with('.'))
        .collect();

    let mut selected_extensions = HashSet::new();
    let mut selected_mappings = HashMap::new();
    let selected_prog_ids: HashSet<&str> = selected
        .iter()
        .map(|association| association.prog_id.as_str())
        .collect();
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
                    .and_then(|(key, _)| key.set_value("", &icon.as_os_str()))
            })
            .and_then(|_| {
                hkcu.create_subkey(format!("{prog_id_path}\\shell\\open\\command"))
                    .and_then(|(key, _)| key.set_value("", &command.as_os_str()))
            })
            .map_err(|error| {
                format!("ProgID {} ist unvollständig: {error}", association.prog_id)
            })?;

        for extension in &association.extensions {
            let dotted = format!(".{extension}");
            selected_extensions.insert(dotted.clone());
            selected_mappings.insert(dotted.clone(), association.prog_id.clone());
            file_associations
                .set_value(&dotted, &association.prog_id.as_str())
                .and_then(|_| supported_types.set_value(&dotted, &""))
                .map_err(|error| format!("{dotted} konnte nicht ausgewählt werden: {error}"))?;
            hkcu.create_subkey(format!("Software\\Classes\\{dotted}\\OpenWithProgids"))
                .and_then(|(key, _)| key.set_value(&association.prog_id, &""))
                .map_err(|error| {
                    format!("{dotted} konnte nicht für Öffnen mit registriert werden: {error}")
                })?;
        }
    }

    // Remove stale values only after every selected mapping has been written. A
    // mid-operation registry error therefore retains old entries instead of first
    // deleting the complete offer set and exposing only a partial new selection.
    let mut stale_prog_ids = HashSet::new();
    for (name, old_prog_id) in old_capability_values {
        if selected_mappings.get(&name) == Some(&old_prog_id) {
            continue;
        }
        if !selected_extensions.contains(&name) {
            file_associations.delete_value(&name).map_err(|error| {
                format!("Eine alte Windows-Dateizuordnung konnte nicht entfernt werden: {error}")
            })?;
        }
        if old_prog_id.starts_with("PViewer.") {
            let open_with_path = format!("Software\\Classes\\{name}\\OpenWithProgids");
            match hkcu.open_subkey_with_flags(&open_with_path, KEY_WRITE) {
                Ok(key) => match key.delete_value(&old_prog_id) {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => {
                        return Err(format!(
                            "Eine alte Öffnen-mit-Zuordnung für {name} konnte nicht entfernt werden: {error}"
                        ));
                    }
                },
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    return Err(format!(
                        "Die alte Öffnen-mit-Zuordnung für {name} konnte nicht geöffnet werden: {error}"
                    ));
                }
            }
            stale_prog_ids.insert(old_prog_id);
        }
    }
    for prog_id in stale_prog_ids {
        if !selected_prog_ids.contains(prog_id.as_str()) {
            match hkcu.delete_subkey_all(format!("Software\\Classes\\{prog_id}")) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    return Err(format!(
                        "Die alte Windows-ProgID {prog_id} konnte nicht entfernt werden: {error}"
                    ));
                }
            }
        }
    }
    for name in old_supported_types {
        if !selected_extensions.contains(&name) {
            supported_types.delete_value(&name).map_err(|error| {
                format!("Ein alter Windows-Dateityp konnte nicht entfernt werden: {error}")
            })?;
        }
    }

    // Flush the Shell association cache before opening Settings so the app-specific
    // confirmation page sees registrations made by a portable build immediately.
    unsafe {
        SHChangeNotify(
            SHCNE_ASSOCCHANGED as i32,
            SHCNF_IDLIST | SHCNF_FLUSH,
            std::ptr::null(),
            std::ptr::null(),
        );
    }

    let settings_message = match tauri_plugin_opener::open_url(DEFAULT_APPS_URI, None::<&str>) {
        Ok(()) => "Die Windows-Bestätigung für P-Viewer wurde geöffnet. Wähle dort bei den angebotenen Dateitypen P-Viewer aus; Windows erlaubt diese letzte Bestätigung ausschließlich in den Systemeinstellungen.".to_string(),
        Err(targeted_error) => {
            tauri_plugin_opener::open_url(DEFAULT_APPS_FALLBACK_URI, None::<&str>).map_err(
                |fallback_error| {
                    format!(
                        "P-Viewer wurde als mögliche Standard-App registriert, aber die Windows-Einstellungen konnten nicht geöffnet werden ({targeted_error}; Fallback: {fallback_error}). Öffne Einstellungen → Apps → Standard-Apps und suche nach P-Viewer."
                    )
                },
            )?;
            "Die allgemeine Windows-Seite „Standard-Apps“ wurde geöffnet. Suche dort nach P-Viewer und bestätige die gewünschten Dateitypen.".to_string()
        }
    };

    Ok(AssociationApplyResult {
        platform: "windows".into(),
        selected_groups: selected.len(),
        applied_types: selected
            .iter()
            .map(|association| association.extensions.len())
            .sum(),
        requires_user_confirmation: true,
        message: settings_message,
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
            let Ok(content) = fs::read_to_string(&path) else {
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
