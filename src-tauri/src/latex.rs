use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::Serialize;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::{
    env,
    ffi::OsString,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::{Command, ExitStatus, Stdio},
    time::{Duration, Instant},
};
use tempfile::TempDir;
use wait_timeout::ChildExt;

const COMPILE_TIMEOUT: Duration = Duration::from_secs(90);
const VERSION_TIMEOUT: Duration = Duration::from_secs(4);
const MAX_LOG_BYTES: usize = 500_000;
const MAX_PDF_BYTES: u64 = 100 * 1024 * 1024;
const MAX_TEX_SOURCE_BYTES: usize = 16 * 1024 * 1024;

#[derive(Clone, Copy)]
enum EngineKind {
    LatexMk,
    Tectonic,
    Direct,
}

#[derive(Clone, Copy)]
struct EngineSpec {
    id: &'static str,
    label: &'static str,
    executable: &'static str,
    kind: EngineKind,
}

const ENGINES: [EngineSpec; 5] = [
    EngineSpec {
        id: "latexmk",
        label: "latexmk (empfohlen)",
        executable: "latexmk",
        kind: EngineKind::LatexMk,
    },
    EngineSpec {
        id: "tectonic",
        label: "Tectonic",
        executable: "tectonic",
        kind: EngineKind::Tectonic,
    },
    EngineSpec {
        id: "lualatex",
        label: "LuaLaTeX",
        executable: "lualatex",
        kind: EngineKind::Direct,
    },
    EngineSpec {
        id: "xelatex",
        label: "XeLaTeX",
        executable: "xelatex",
        kind: EngineKind::Direct,
    },
    EngineSpec {
        id: "pdflatex",
        label: "pdfLaTeX",
        executable: "pdflatex",
        kind: EngineKind::Direct,
    },
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexEngineInfo {
    pub id: String,
    pub label: String,
    pub available: bool,
    pub version: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexCompileResult {
    pub success: bool,
    pub engine: String,
    pub engine_label: String,
    pub pdf_base64: Option<String>,
    pub log: String,
    pub duration_ms: u128,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn detect_latex_engines() -> Result<Vec<LatexEngineInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        ENGINES
            .iter()
            .map(|engine| {
                let version = engine_version(*engine);
                LatexEngineInfo {
                    id: engine.id.to_string(),
                    label: engine.label.to_string(),
                    available: version.is_some(),
                    version,
                }
            })
            .collect()
    })
    .await
    .map_err(|error| format!("LaTeX-Compilerprüfung wurde abgebrochen: {error}"))
}

#[tauri::command]
pub async fn compile_latex(
    path: String,
    content: String,
    engine: String,
) -> Result<LatexCompileResult, String> {
    tauri::async_runtime::spawn_blocking(move || compile_latex_inner(path, content, engine))
        .await
        .map_err(|error| format!("LaTeX-Build-Task wurde abgebrochen: {error}"))?
}

fn compile_latex_inner(
    path: String,
    content: String,
    engine: String,
) -> Result<LatexCompileResult, String> {
    if content.trim().is_empty() {
        return Err("Das LaTeX-Dokument ist leer.".into());
    }

    if content.len() > MAX_TEX_SOURCE_BYTES {
        return Err(format!(
            "Das TeX-Dokument ist größer als {} MiB und wird nicht kompiliert.",
            MAX_TEX_SOURCE_BYTES / 1024 / 1024
        ));
    }

    let selected = select_engine(&engine).ok_or_else(|| {
        if engine == "auto" {
            "Kein LaTeX-Compiler wurde gefunden. Bitte MiKTeX, MacTeX, TeX Live oder Tectonic installieren."
                .to_string()
        } else {
            format!("Der gewählte LaTeX-Compiler „{engine}“ ist nicht verfügbar.")
        }
    })?;

    let started = Instant::now();
    let workspace = tempfile::tempdir()
        .map_err(|error| format!("Temporärer LaTeX-Ordner kann nicht erstellt werden: {error}"))?;
    let source_path = workspace.path().join("preview.tex");
    fs::write(&source_path, content.as_bytes())
        .map_err(|error| format!("Temporäre TeX-Datei kann nicht geschrieben werden: {error}"))?;

    let working_directory = source_working_directory(&path, &workspace);
    let log_path = workspace.path().join("compile.log");
    let execution = run_engine(
        selected,
        &source_path,
        workspace.path(),
        &working_directory,
        &log_path,
    );
    let log = read_bounded_log(&log_path);
    let duration_ms = started.elapsed().as_millis();

    match execution {
        Ok(status) if status.success() => {
            let pdf_path = workspace.path().join("preview.pdf");
            let metadata = fs::metadata(&pdf_path).map_err(|_| {
                "Der Compiler meldete Erfolg, hat aber keine PDF-Datei erzeugt.".to_string()
            })?;
            if metadata.len() > MAX_PDF_BYTES {
                return Err(format!(
                    "Die erzeugte PDF ist größer als {} MiB und wird nicht in die Vorschau geladen.",
                    MAX_PDF_BYTES / 1024 / 1024
                ));
            }
            let pdf = fs::read(&pdf_path)
                .map_err(|error| format!("Die erzeugte PDF kann nicht gelesen werden: {error}"))?;

            Ok(LatexCompileResult {
                success: true,
                engine: selected.id.to_string(),
                engine_label: selected.label.to_string(),
                pdf_base64: Some(BASE64.encode(pdf)),
                log,
                duration_ms,
                error: None,
            })
        }
        Ok(status) => Ok(LatexCompileResult {
            success: false,
            engine: selected.id.to_string(),
            engine_label: selected.label.to_string(),
            pdf_base64: None,
            log,
            duration_ms,
            error: Some(format!(
                "LaTeX wurde mit Status {} beendet.",
                exit_status_label(status)
            )),
        }),
        Err(error) => Ok(LatexCompileResult {
            success: false,
            engine: selected.id.to_string(),
            engine_label: selected.label.to_string(),
            pdf_base64: None,
            log,
            duration_ms,
            error: Some(error),
        }),
    }
}

fn select_engine(requested: &str) -> Option<EngineSpec> {
    if requested == "auto" {
        return ENGINES
            .iter()
            .copied()
            .find(|engine| engine_version(*engine).is_some());
    }

    ENGINES
        .iter()
        .copied()
        .find(|engine| engine.id == requested && engine_version(*engine).is_some())
}

fn engine_version(engine: EngineSpec) -> Option<String> {
    if matches!(engine.kind, EngineKind::LatexMk) && resolve_executable("pdflatex").is_none() {
        return None;
    }
    executable_version(engine.executable)
}

fn executable_version(executable: &str) -> Option<String> {
    let workspace = tempfile::tempdir().ok()?;
    let log_path = workspace.path().join("version.log");
    let executable = resolve_executable(executable)?;
    let mut command = Command::new(executable);
    command
        .arg("--version")
        .current_dir(workspace.path())
        .env("PATH", sanitized_path()?);
    let status = run_command(&mut command, &log_path, VERSION_TIMEOUT).ok()?;
    if !status.success() {
        return None;
    }

    let output = read_bounded_log(&log_path);
    output
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with("---"))
        .map(|line| truncate_chars(line, 160))
}

fn source_working_directory(path: &str, workspace: &TempDir) -> PathBuf {
    if !path.trim().is_empty() {
        let source = Path::new(path);
        if let Some(parent) = source.parent().filter(|parent| parent.is_dir()) {
            return parent
                .canonicalize()
                .unwrap_or_else(|_| parent.to_path_buf());
        }
    }
    workspace.path().to_path_buf()
}

fn run_engine(
    engine: EngineSpec,
    source_path: &Path,
    output_directory: &Path,
    project_directory: &Path,
    log_path: &Path,
) -> Result<ExitStatus, String> {
    let executable = resolve_executable(engine.executable).ok_or_else(|| {
        format!(
            "Compiler „{}“ wurde nicht in einem vertrauenswürdigen PATH-Ordner gefunden.",
            engine.executable
        )
    })?;

    match engine.kind {
        EngineKind::LatexMk => {
            let mut command = Command::new(executable);
            configure_tex_command(&mut command, output_directory, project_directory)?;
            command
                .arg("-norc")
                .arg("-pdf")
                .arg("-pdflatex=pdflatex -no-shell-escape %O %S")
                .arg("-interaction=nonstopmode")
                .arg("-halt-on-error")
                .arg("-file-line-error")
                .arg(format!("-outdir={}", output_directory.display()))
                .arg(source_path);
            run_command(&mut command, log_path, COMPILE_TIMEOUT)
        }
        EngineKind::Tectonic => {
            let mut command = Command::new(executable);
            configure_tex_command(&mut command, output_directory, project_directory)?;
            command
                .arg("-X")
                .arg("compile")
                .arg("--untrusted")
                .arg("--keep-logs")
                .arg("--outdir")
                .arg(output_directory)
                .arg(source_path);
            run_command(&mut command, log_path, COMPILE_TIMEOUT)
        }
        EngineKind::Direct => {
            let mut final_status = None;
            for pass in 1..=2 {
                append_log_header(log_path, &format!("{} – Durchlauf {pass}", engine.label))?;
                let mut command = Command::new(&executable);
                configure_tex_command(&mut command, output_directory, project_directory)?;
                command
                    .arg("-interaction=nonstopmode")
                    .arg("-halt-on-error")
                    .arg("-file-line-error")
                    .arg("-no-shell-escape")
                    .arg(format!("-output-directory={}", output_directory.display()))
                    .arg(source_path);
                let status = run_command(&mut command, log_path, COMPILE_TIMEOUT)?;
                final_status = Some(status);
                if !status.success() {
                    break;
                }
            }
            final_status.ok_or_else(|| "Der LaTeX-Compiler wurde nicht gestartet.".to_string())
        }
    }
}

fn configure_tex_command(
    command: &mut Command,
    output_directory: &Path,
    project_directory: &Path,
) -> Result<(), String> {
    let path = sanitized_path().ok_or_else(|| {
        "PATH enthält keine vertrauenswürdigen absoluten Programmordner.".to_string()
    })?;
    let separator = if cfg!(windows) { ';' } else { ':' };
    let project = project_directory.to_string_lossy();
    let tex_inputs = format!(".{separator}{project}{separator}{project}//{separator}");

    command
        .current_dir(output_directory)
        .env("PATH", path)
        .env("TEXINPUTS", &tex_inputs)
        .env("BIBINPUTS", &tex_inputs)
        .env("BSTINPUTS", &tex_inputs)
        .env("TEXMFOUTPUT", output_directory)
        .env("openout_any", "p")
        .env("shell_escape", "f");
    Ok(())
}

fn resolve_executable(name: &str) -> Option<PathBuf> {
    for directory in trusted_path_directories() {
        for candidate_name in executable_names(name) {
            let candidate = directory.join(candidate_name);
            let Ok(metadata) = fs::metadata(&candidate) else {
                continue;
            };
            if !metadata.is_file() {
                continue;
            }
            #[cfg(unix)]
            if metadata.permissions().mode() & 0o111 == 0 {
                continue;
            }
            if let Ok(canonical) = candidate.canonicalize() {
                return Some(canonical);
            }
        }
    }
    None
}

fn trusted_path_directories() -> Vec<PathBuf> {
    let directories: Vec<PathBuf> = env::var_os("PATH")
        .map(|value| {
            env::split_paths(&value)
                .filter(|path| path.is_absolute() && path.is_dir())
                .collect()
        })
        .unwrap_or_default();

    #[cfg(target_os = "macos")]
    let directories = {
        let mut directories = directories;
        let tex_path = PathBuf::from("/Library/TeX/texbin");
        if tex_path.is_dir() {
            directories.push(tex_path);
        }
        directories
    };

    let mut unique = Vec::new();
    for directory in directories {
        if !unique.contains(&directory) {
            unique.push(directory);
        }
    }
    unique
}

fn sanitized_path() -> Option<OsString> {
    env::join_paths(trusted_path_directories()).ok()
}

#[cfg(windows)]
fn executable_names(name: &str) -> Vec<String> {
    if Path::new(name).extension().is_some() {
        vec![name.to_string()]
    } else {
        vec![format!("{name}.exe"), format!("{name}.com")]
    }
}

#[cfg(not(windows))]
fn executable_names(name: &str) -> Vec<String> {
    vec![name.to_string()]
}

fn run_command(
    command: &mut Command,
    log_path: &Path,
    timeout: Duration,
) -> Result<ExitStatus, String> {
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|error| format!("Build-Log kann nicht erstellt werden: {error}"))?;
    let error_log = log
        .try_clone()
        .map_err(|error| format!("Build-Log kann nicht dupliziert werden: {error}"))?;

    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(error_log))
        .spawn()
        .map_err(|error| format!("Compiler kann nicht gestartet werden: {error}"))?;

    match child
        .wait_timeout(timeout)
        .map_err(|error| format!("Compilerstatus kann nicht gelesen werden: {error}"))?
    {
        Some(status) => Ok(status),
        None => {
            let _ = child.kill();
            let _ = child.wait();
            Err(format!(
                "LaTeX-Build wurde nach {} Sekunden abgebrochen.",
                timeout.as_secs()
            ))
        }
    }
}

fn append_log_header(path: &Path, title: &str) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("Build-Log kann nicht geöffnet werden: {error}"))?;
    writeln!(file, "\n--- {title} ---")
        .map_err(|error| format!("Build-Log kann nicht geschrieben werden: {error}"))
}

fn read_bounded_log(path: &Path) -> String {
    let Ok(bytes) = fs::read(path) else {
        return String::new();
    };
    if bytes.len() <= MAX_LOG_BYTES {
        return String::from_utf8_lossy(&bytes).into_owned();
    }

    let tail = &bytes[bytes.len() - MAX_LOG_BYTES..];
    format!(
        "[Frühere Log-Ausgabe wurde gekürzt.]\n{}",
        String::from_utf8_lossy(tail)
    )
}

fn exit_status_label(status: ExitStatus) -> String {
    status
        .code()
        .map(|code| code.to_string())
        .unwrap_or_else(|| "ohne Exit-Code".into())
}

fn truncate_chars(value: &str, max: usize) -> String {
    let mut chars = value.chars();
    let truncated: String = chars.by_ref().take(max).collect();
    if chars.next().is_some() {
        format!("{truncated}…")
    } else {
        truncated
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_engine() {
        assert!(select_engine("definitely-not-a-compiler").is_none());
    }

    #[test]
    fn truncates_long_version_lines() {
        let value = "x".repeat(200);
        let result = truncate_chars(&value, 20);
        assert_eq!(result.chars().count(), 21);
        assert!(result.ends_with('…'));
    }

    #[test]
    fn falls_back_to_workspace_for_untitled_documents() {
        let workspace = tempfile::tempdir().unwrap();
        assert_eq!(source_working_directory("", &workspace), workspace.path());
    }
}
