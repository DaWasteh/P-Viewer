#!/usr/bin/env python3
"""Native Linux/WebKitGTK smoke, stdlib only. Close P-Viewer first.

Requires WebKitWebDriver (Ubuntu: webkitgtk-webdriver, older: webkit2gtk-driver).
Usage: python3 scripts/smoke-linux-launcher.py [path/to/p-viewer]
"""
import base64
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
binary = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "src-tauri/target/release/p-viewer").resolve()
assert sys.platform == "linux" and binary.is_file(), "Build the Linux launcher first."
assert shutil.which("WebKitWebDriver"), "Install WebKitWebDriver first."
# Never forward disposable test files into an already running user's session.
for process in Path("/proc").glob("[0-9]*/exe"):
    try:
        assert process.resolve().name not in (binary.name, "p-viewer", "P-Viewer"), "Close P-Viewer before running this test."
    except (FileNotFoundError, PermissionError):
        pass

with tempfile.TemporaryDirectory(prefix="p-viewer-smoke-") as temporary:
    directory = Path(temporary)
    text = directory / "Notizen ä.txt"
    text.write_bytes(b"Original\r\n")
    (directory / "records.jsonl").write_text('{"record":"Alpha"}\n{"record":"Beta"}', encoding="utf-8")
    (directory / "pixel.png").write_bytes(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVQIW2P8z8Dwn4GBgYGJAQoAADgVAgLkOfJKAAAAAElFTkSuQmCC"))
    env = {**os.environ, "TAURI_WEBVIEW_AUTOMATION": "true"}
    for variable in ("XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME"):
        env[variable] = str(directory / variable)
        Path(env[variable]).mkdir()
    env["P_VIEWER_SESSION_DIR"] = str(directory / "session")
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    driver = subprocess.Popen(["WebKitWebDriver", "--host=127.0.0.1", f"--port={port}"], env=env)
    session = ""

    def request(path, data=None, method=None):
        body = json.dumps(data).encode() if data is not None else None
        req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", body, {"Content-Type": "application/json"}, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.load(response)["value"]
        except urllib.error.HTTPError as error:
            raise AssertionError(error.read().decode()) from error

    def wait(check, timeout=15):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            if check():
                return
            time.sleep(0.1)
        raise AssertionError(f"Timed out: {check}")

    def ready():
        try:
            return request("/status")["ready"]
        except urllib.error.URLError:
            return False

    def js(script, *args):
        return request(f"/session/{session}/execute/sync", {"script": script, "args": args})

    def click(label):
        js("const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===arguments[0] || b.getAttribute('aria-label')===arguments[0]); if(!b) throw Error(arguments[0]); b.click();", label)

    def replace_editor(value):
        # ponytail: WebKitGTK send-keys uses the real Wayland clipboard; insert
        # through the editing API instead. Browser tests cover physical shortcuts.
        js("document.querySelector('.cm-content').focus(); document.execCommand('selectAll'); document.execCommand('insertText',false,arguments[0]);", value)

    def script_source(value):
        js("const e=document.querySelector('#batch-script'); e.value=arguments[0]; e.dispatchEvent(new Event('input',{bubbles:true}));", value)

    def open_macros():
        js("document.querySelector('.cm-content').dispatchEvent(new KeyboardEvent('keydown',{key:'h',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}))")
        wait(lambda: js("return !!document.querySelector('#batch-rules')"))
        click("JavaScript")

    def editor_contains(value):
        return js("return document.querySelector('.editor-pane .cm-content')?.textContent.includes(arguments[0])", value)

    def forward(*paths):
        subprocess.run([str(binary), *map(str, paths)], cwd=directory, env=env, check=True, timeout=15)

    try:
        wait(ready)
        result = request("/session", {"capabilities": {"alwaysMatch": {"webkitgtk:browserOptions": {
            "binary": str(binary), "args": [str(text), str(directory / "records.jsonl"), str(directory / "pixel.png")],
        }}}})
        session = result["sessionId"]
        wait(lambda: js("return document.querySelectorAll('[role=tab]').length===3 && document.visibilityState==='visible'"))
        version = json.loads((ROOT / "package.json").read_text())["version"]
        assert js("return document.querySelector('.version').textContent") == f"v{version}"
        click("pixel.png")
        wait(lambda: js("return document.querySelector('.image-preview .dimensions')?.textContent.includes('2 × 2 px')"))
        assert js("return !document.querySelector('.editor-pane')")
        click("records.jsonl")
        click("Split")
        wait(lambda: js("return document.querySelector('[aria-label=\"JSON-Struktur\"]')?.textContent.includes('Beta')"))
        click(text.name)
        replace_editor("Saved ä 😀\nSecond line\n")
        click("Dokument speichern")
        wait(lambda: text.read_bytes() == "Saved ä 😀\r\nSecond line\r\n".encode())
        assert js("return getComputedStyle(document.querySelector('.cm-editor')).display") == "flex"

        # Real Unix filenames: case and a literal backslash must NOT alias another tab.
        (directory / "notes").mkdir()
        paths = [directory / "notes/draft.txt", directory / "notes\\draft.txt", directory / "Notes.txt", directory / "notes.txt"]
        for index, path in enumerate(paths):
            path.write_text(f"Distinct file {index}", encoding="utf-8")
        click("Einstellungen öffnen")
        forward(*paths, paths[-1])
        assert js("return document.querySelectorAll('[role=tab]').length") == 3
        click("Fertig")
        wait(lambda: js("return document.querySelectorAll('[role=tab]').length===7"))
        wait(lambda: editor_contains("Distinct file 3"))
        click(text.name)
        text.write_text("External change\n", encoding="utf-8")
        replace_editor("Saved ä 😀\nSecond line\nDo not overwrite external text")
        click("Dokument speichern")
        wait(lambda: js("return [...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('außerhalb'))"))
        assert text.read_text() == "External change\n"

        # Exercise the actual CSP, worker, and timeout without changing any real document.
        open_macros()
        script_source("return text.toUpperCase();")
        click("Anwenden")
        wait(lambda: editor_contains("DO NOT OVERWRITE EXTERNAL TEXT"))
        open_macros()
        script_source("while (true) {}")
        click("Anwenden")
        wait(lambda: js("return document.querySelector('dialog [role=status]')?.textContent.includes('abgebrochen')"))
        click("Abbrechen")
        assert text.read_text() == "External change\n"
        wait(lambda: (directory / "session/session.json").is_file())
        wait(lambda: bool(list((directory / "session/recovery").glob("*"))))
        screenshot = ROOT / "test-results/native-linux-smoke.png"
        screenshot.parent.mkdir(exist_ok=True)
        screenshot.write_bytes(base64.b64decode(request(f"/session/{session}/screenshot")))
        print(f"PASS native Linux v{version}: startup, PNG, JSONL, Unicode/CRLF save, distinct POSIX paths, single-instance/modal queue, save conflict, macro/timeout, session recovery; {binary}")
    except Exception:
        if session:
            print("Native UI:", js("return document.body.innerText.slice(-6000)"), file=sys.stderr)
            print("Saved bytes:", repr(text.read_bytes()), file=sys.stderr)
        raise
    finally:
        try:
            if session:
                request(f"/session/{session}", method="DELETE")
        finally:
            driver.terminate()
            driver.wait(timeout=10)
