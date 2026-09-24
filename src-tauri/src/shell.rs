//! "Open terminal here" for the tab context menu.
//!
//! The terminal is started in the document's folder without a shell command
//! line: the folder is passed as working directory, never interpolated.

use std::path::{Path, PathBuf};

fn terminal_directory(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if !path.is_absolute() {
        return Err("Für ein nicht gespeichertes Dokument gibt es keinen Ordner.".into());
    }
    let directory = if path.is_dir() {
        path
    } else {
        path.parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "Der Ordner des Dokuments ist unbekannt.".to_string())?
    };
    if !directory.is_dir() {
        return Err("Der Ordner des Dokuments ist nicht erreichbar.".into());
    }
    Ok(directory)
}

#[tauri::command]
pub async fn open_terminal_at(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let directory = terminal_directory(&path)?;
        launch_terminal(&directory)
    })
    .await
    .map_err(|error| format!("Das Terminal konnte nicht gestartet werden: {error}"))?
}

/// Windows Terminal when installed, otherwise PowerShell, otherwise cmd. The
/// shell starts them like Explorer does, so each gets its own console window.
#[cfg(target_os = "windows")]
fn launch_terminal(directory: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};

    fn wide(value: &std::ffi::OsStr) -> Vec<u16> {
        value.encode_wide().chain(std::iter::once(0)).collect()
    }

    let folder = wide(directory.as_os_str());
    let verb = wide("open".as_ref());
    for (program, parameters) in [
        ("wt.exe", Some("-d .")),
        ("powershell.exe", Some("-NoExit")),
        ("cmd.exe", None),
    ] {
        let file = wide(program.as_ref());
        let parameters = parameters.map(|value| wide(value.as_ref()));
        // SAFETY: all strings are NUL-terminated UTF-16 buffers that outlive the call.
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                verb.as_ptr(),
                file.as_ptr(),
                parameters
                    .as_ref()
                    .map_or(std::ptr::null(), |value| value.as_ptr()),
                folder.as_ptr(),
                SW_SHOWNORMAL,
            )
        };
        // Values above 32 signal success.
        if result as isize > 32 {
            return Ok(());
        }
    }
    Err("Es wurde kein Terminal gefunden.".into())
}

#[cfg(target_os = "macos")]
fn launch_terminal(directory: &Path) -> Result<(), String> {
    std::process::Command::new("open")
        .args(["-a", "Terminal"])
        .arg(directory)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Terminal konnte nicht geöffnet werden: {error}"))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn launch_terminal(directory: &Path) -> Result<(), String> {
    // The configured default terminal first, then common desktop terminals.
    for program in [
        "x-terminal-emulator",
        "gnome-terminal",
        "konsole",
        "xfce4-terminal",
        "kitty",
        "alacritty",
        "xterm",
    ] {
        if std::process::Command::new(program)
            .current_dir(directory)
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
    }
    Err("Es wurde kein Terminal gefunden.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn terminal_opens_in_the_document_folder() {
        let directory = tempdir().unwrap();
        let file = directory.path().join("notes.md");
        fs::write(&file, "# Notes").unwrap();
        assert_eq!(
            terminal_directory(&file.to_string_lossy()).unwrap(),
            directory.path()
        );
        assert_eq!(
            terminal_directory(&directory.path().to_string_lossy()).unwrap(),
            directory.path()
        );
        assert!(terminal_directory("").is_err());
        assert!(terminal_directory("relative/notes.md").is_err());
        assert!(
            terminal_directory(&directory.path().join("gone").join("x.md").to_string_lossy())
                .is_err()
        );
    }
}
