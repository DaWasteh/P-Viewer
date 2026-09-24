//! Windows file type icons for files opened with P-Viewer (issue #3).
//!
//! Every associated extension has its own ProgID whose `DefaultIcon` names the
//! extension's icon in `assets/file-icons` next to the executable; the icon
//! registry (`src/lib/files/file-icons.json`) is shared with the frontend and
//! the NSIS hooks. Users can switch to the plain app icon instead. Windows
//! may also create `<ext>_auto_file` classes on "Open with → choose another
//! app" without any icon; those that open exactly this executable get the
//! matching icon once, and the change is logged so uninstall can undo it.

use serde::Deserialize;
use std::{collections::HashMap, path::PathBuf, sync::OnceLock};

const FILE_ICONS_JSON: &str = include_str!("../../src/lib/files/file-icons.json");
/// Group ProgIDs predate per-extension icons; they stay with the group's first extension.
const EXTENSION_PROG_ID_PREFIX: &str = "PViewer.File.";

#[derive(Deserialize)]
struct IconRegistry {
    extensions: HashMap<String, String>,
}

fn registry() -> &'static HashMap<String, String> {
    static REGISTRY: OnceLock<HashMap<String, String>> = OnceLock::new();
    REGISTRY.get_or_init(|| {
        serde_json::from_str::<IconRegistry>(FILE_ICONS_JSON)
            .map(|registry| registry.extensions)
            .unwrap_or_default()
    })
}

/// Stored icon name (without `.ico`) for a supported extension.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) fn icon_for_extension(extension: &str) -> Option<&'static str> {
    registry()
        .get(&extension.to_ascii_lowercase())
        .map(String::as_str)
}

/// ProgID of one extension: the historic group ProgID for the group's first
/// extension (existing user choices keep working), a dedicated one otherwise.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) fn prog_id_for(group_prog_id: &str, first_extension: &str, extension: &str) -> String {
    if extension == first_extension {
        group_prog_id.to_string()
    } else {
        format!("{EXTENSION_PROG_ID_PREFIX}{extension}")
    }
}

/// `assets/file-icons` next to the running executable, if it was installed there.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) fn installed_icon_dir() -> Option<PathBuf> {
    let directory = std::env::current_exe()
        .ok()?
        .parent()?
        .join("assets")
        .join("file-icons");
    directory.is_dir().then_some(directory)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum IconMode {
    FileType,
    App,
}

impl IconMode {
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "file-type" => Some(Self::FileType),
            "app" => Some(Self::App),
            _ => None,
        }
    }
}

/// The `fileIconMode` preference from the settings store; file type icons by default.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) fn icon_mode_from_settings(text: &str) -> IconMode {
    serde_json::from_str::<serde_json::Value>(text)
        .ok()
        .and_then(|value| {
            value
                .get("preferences")?
                .get("fileIconMode")?
                .as_str()
                .and_then(IconMode::parse)
        })
        .unwrap_or(IconMode::FileType)
}

/// `DefaultIcon` value for an extension: its icon file, or the app icon.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) fn default_icon_value(
    mode: IconMode,
    extension: &str,
    executable: &std::path::Path,
    icon_dir: Option<&std::path::Path>,
) -> String {
    if mode == IconMode::FileType {
        if let (Some(directory), Some(icon)) = (icon_dir, icon_for_extension(extension)) {
            let path = directory.join(format!("{icon}.ico"));
            if path.is_file() {
                return path.to_string_lossy().into_owned();
            }
        }
    }
    format!("{},0", executable.to_string_lossy())
}

/// Whether a class's open command starts this executable (quoted, case-insensitive).
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) fn command_opens(command: &str, executable: &std::path::Path) -> bool {
    let expected = format!("\"{}\"", executable.to_string_lossy()).to_lowercase();
    command.trim().to_lowercase().starts_with(&expected)
}

#[cfg(target_os = "windows")]
mod registry_windows {
    use super::*;
    use std::path::Path;
    use windows_sys::Win32::UI::Shell::{
        SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_FLUSH, SHCNF_IDLIST,
    };
    use winreg::{
        enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE},
        RegKey,
    };

    const AUTO_FILE_SUFFIX: &str = "_auto_file";
    pub(super) const AUTO_FILE_LOG: &str = "Software\\P-Viewer\\AutoFileIcons";

    fn open_command(key: &RegKey) -> Option<String> {
        key.open_subkey("shell\\open\\command")
            .ok()?
            .get_value::<String, _>("")
            .ok()
    }

    fn default_icon(key: &RegKey) -> Option<String> {
        key.open_subkey("DefaultIcon")
            .ok()?
            .get_value::<String, _>("")
            .ok()
    }

    pub(crate) fn notify_shell() {
        // SAFETY: documented call without pointers to caller-owned data.
        unsafe {
            SHChangeNotify(
                SHCNE_ASSOCCHANGED as i32,
                SHCNF_IDLIST | SHCNF_FLUSH,
                std::ptr::null(),
                std::ptr::null(),
            );
        }
    }

    /// Rewrites `DefaultIcon` of this user's P-Viewer ProgIDs that open this
    /// executable. Unchanged values are not written again.
    pub(crate) fn apply_mode(
        mode: IconMode,
        executable: &Path,
        icon_dir: Option<&Path>,
    ) -> Result<usize, String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let classes = hkcu
            .open_subkey_with_flags("Software\\Classes", KEY_READ | KEY_WRITE)
            .map_err(|error| format!("Die Windows-Dateiklassen sind nicht verfügbar: {error}"))?;
        let mut changed = 0;
        for group in crate::associations::configured_groups()? {
            let first = group.extensions.first().cloned().unwrap_or_default();
            for extension in &group.extensions {
                let prog_id = prog_id_for(&group.prog_id, &first, extension);
                let Ok(key) = classes.open_subkey_with_flags(&prog_id, KEY_READ) else {
                    continue;
                };
                if !open_command(&key).is_some_and(|command| command_opens(&command, executable)) {
                    continue;
                }
                let desired = default_icon_value(mode, extension, executable, icon_dir);
                if default_icon(&key).as_deref() == Some(desired.as_str()) {
                    continue;
                }
                classes
                    .create_subkey(format!("{prog_id}\\DefaultIcon"))
                    .and_then(|(icon, _)| icon.set_value("", &desired))
                    .map_err(|error| {
                        format!("Symbol für .{extension} konnte nicht gesetzt werden: {error}")
                    })?;
                changed += 1;
            }
        }
        changed += repair_auto_file_icons(mode, executable, icon_dir);
        if changed > 0 {
            notify_shell();
        }
        Ok(changed)
    }

    /// Gives Windows-generated `<ext>_auto_file` classes that open this
    /// executable but have no icon configuration the matching icon. Classes of
    /// other programs and existing icon settings are never touched.
    pub(crate) fn repair_auto_file_icons(
        mode: IconMode,
        executable: &Path,
        icon_dir: Option<&Path>,
    ) -> usize {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let Ok(classes) = hkcu.open_subkey_with_flags("Software\\Classes", KEY_READ | KEY_WRITE)
        else {
            return 0;
        };
        let names: Vec<String> = classes
            .enum_keys()
            .filter_map(Result::ok)
            .filter(|name| name.to_ascii_lowercase().ends_with(AUTO_FILE_SUFFIX))
            .collect();
        let mut changed = 0;
        for name in names {
            let extension = name[..name.len() - AUTO_FILE_SUFFIX.len()].to_ascii_lowercase();
            if icon_for_extension(&extension).is_none() {
                continue;
            }
            let Ok(key) = classes.open_subkey_with_flags(&name, KEY_READ) else {
                continue;
            };
            if !open_command(&key).is_some_and(|command| command_opens(&command, executable)) {
                continue;
            }
            let desired = default_icon_value(mode, &extension, executable, icon_dir);
            let current = default_icon(&key);
            let logged: Option<String> = hkcu
                .open_subkey(AUTO_FILE_LOG)
                .and_then(|log| log.get_value(&name))
                .ok();
            let ours = logged.is_some() && logged == current;
            let untouched = current.is_none() && key.open_subkey("shellex\\IconHandler").is_err();
            if !(ours || untouched) || current.as_deref() == Some(desired.as_str()) {
                continue;
            }
            let written = classes
                .create_subkey(format!("{name}\\DefaultIcon"))
                .and_then(|(icon, _)| icon.set_value("", &desired))
                .and_then(|_| hkcu.create_subkey(AUTO_FILE_LOG))
                .and_then(|(log, _)| log.set_value(&name, &desired));
            if written.is_ok() {
                changed += 1;
            }
        }
        changed
    }
}

/// Background check at start-up: re-applies the app icon mode after an update
/// reinstalled file type icons, and repairs icon-less `*_auto_file` classes.
pub(crate) fn startup_maintenance<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    #[cfg(target_os = "windows")]
    {
        use tauri::Manager;
        let settings = app
            .path()
            .app_data_dir()
            .ok()
            .and_then(|dir| std::fs::read_to_string(dir.join("settings.json")).ok());
        std::thread::spawn(move || {
            let Ok(executable) = std::env::current_exe() else {
                return;
            };
            let mode = settings
                .as_deref()
                .map_or(IconMode::FileType, icon_mode_from_settings);
            let icon_dir = installed_icon_dir();
            let result = registry_windows::apply_mode(mode, &executable, icon_dir.as_deref());
            if let Err(error) = result {
                eprintln!("Dateityp-Symbole konnten nicht geprüft werden: {error}");
            }
        });
    }
    #[cfg(not(target_os = "windows"))]
    let _ = app;
}

#[tauri::command]
pub async fn apply_file_icon_mode(mode: String) -> Result<String, String> {
    let mode = IconMode::parse(&mode).ok_or_else(|| "Unbekannter Symbolmodus.".to_string())?;
    #[cfg(target_os = "windows")]
    {
        return tauri::async_runtime::spawn_blocking(move || {
            let executable = std::env::current_exe()
                .map_err(|error| format!("Der P-Viewer-Programmpfad ist nicht verfügbar: {error}"))?;
            let icon_dir = installed_icon_dir();
            if mode == IconMode::FileType && icon_dir.is_none() {
                return Err("Die Dateityp-Symbole sind nur in der installierten App vorhanden; diese P-Viewer-Kopie verwendet das App-Symbol.".to_string());
            }
            let changed = registry_windows::apply_mode(mode, &executable, icon_dir.as_deref())?;
            Ok(if changed == 0 {
                "Die Windows-Symbole entsprechen bereits dieser Auswahl.".to_string()
            } else {
                format!("{changed} Windows-Dateitypen verwenden jetzt die gewählten Symbole. Der Explorer aktualisiert zwischengespeicherte Symbole gegebenenfalls erst nach kurzer Zeit.")
            })
        })
        .await
        .map_err(|error| format!("Die Symbolumstellung wurde abgebrochen: {error}"))?;
    }
    #[allow(unreachable_code)]
    {
        let _ = mode;
        Ok("Dateityp-Symbole betreffen nur Windows.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn every_supported_extension_has_an_icon() {
        let groups = crate::associations::configured_groups().unwrap();
        for group in groups {
            for extension in &group.extensions {
                assert!(
                    icon_for_extension(extension).is_some(),
                    "kein Symbol für .{extension}"
                );
            }
        }
        assert_eq!(icon_for_extension("MD"), Some("md"));
        assert_eq!(icon_for_extension("tex"), Some("conf"));
        assert_eq!(icon_for_extension("unknown"), None);
    }

    #[test]
    fn keeps_group_prog_ids_for_the_first_extension() {
        assert_eq!(
            prog_id_for("PViewer.Markdown", "md", "md"),
            "PViewer.Markdown"
        );
        assert_eq!(
            prog_id_for("PViewer.Markdown", "md", "markdown"),
            "PViewer.File.markdown"
        );
    }

    #[test]
    fn reads_the_icon_mode_preference() {
        assert_eq!(
            icon_mode_from_settings(r#"{"preferences":{"fileIconMode":"app"}}"#),
            IconMode::App
        );
        assert_eq!(
            icon_mode_from_settings(r#"{"preferences":{}}"#),
            IconMode::FileType
        );
        assert_eq!(icon_mode_from_settings("broken"), IconMode::FileType);
    }

    #[test]
    fn default_icons_fall_back_to_the_app_icon() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("md.ico"), b"ico").unwrap();
        let exe = Path::new("C:/Apps/P-Viewer/p-viewer.exe");
        let file_type = default_icon_value(IconMode::FileType, "md", exe, Some(directory.path()));
        assert!(file_type.ends_with("md.ico"));
        assert!(
            default_icon_value(IconMode::FileType, "json", exe, Some(directory.path()))
                .ends_with("p-viewer.exe,0")
        );
        assert!(
            default_icon_value(IconMode::App, "md", exe, Some(directory.path()))
                .ends_with("p-viewer.exe,0")
        );
        assert!(default_icon_value(IconMode::FileType, "md", exe, None).ends_with(",0"));
    }

    #[test]
    fn recognizes_commands_of_this_executable_only() {
        let exe = Path::new("C:\\Program Files\\P-Viewer\\p-viewer.exe");
        assert!(command_opens(
            "\"c:\\program files\\p-viewer\\P-Viewer.exe\" \"%1\"",
            exe
        ));
        assert!(!command_opens("\"C:\\Other\\p-viewer.exe\" \"%1\"", exe));
        assert!(!command_opens("notepad.exe \"%1\"", exe));
    }
}
