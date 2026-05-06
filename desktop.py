import atexit
import multiprocessing as mp
import os
import signal
import socket
import sys
import threading
import time
import traceback
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional
from uuid import uuid4

from app_runtime import LOG_DIR, UPLOAD_DIR
from api_utils import STREAM_CHUNK_SIZE, safe_unlink
from time_utils import beijing_filename_timestamp

APP_TITLE = "办公用品采购系统"
HOST = "127.0.0.1"
WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 720
STARTUP_TIMEOUT_SECONDS = 45
BACKEND_CRASH_LOG_FILENAME = "backend_crash.log"
DESKTOP_BACKUP_TIMEOUT_SECONDS = 15 * 60
_FALLBACK_STREAM = None


def _ensure_standard_streams(
    *,
    fallback_log_path: Optional[Path] = None,
    force_redirect: bool = False,
) -> None:
    """在 --windowed 场景补齐 stdout/stderr，避免第三方库写日志时报错。"""
    global _FALLBACK_STREAM
    has_streams = sys.stdout is not None and sys.stderr is not None
    if has_streams and not force_redirect:
        return

    need_log_stream = fallback_log_path is not None
    current_stream_path = None
    if _FALLBACK_STREAM is not None:
        current_stream_path = getattr(_FALLBACK_STREAM, "name", None)

    if need_log_stream:
        target_path = str(fallback_log_path)
        if (
            _FALLBACK_STREAM is None
            or _FALLBACK_STREAM.closed
            or current_stream_path != target_path
        ):
            try:
                fallback_log_path.parent.mkdir(parents=True, exist_ok=True)
            except OSError:
                pass
            _FALLBACK_STREAM = open(fallback_log_path, "a", encoding="utf-8", buffering=1)
    elif _FALLBACK_STREAM is None or _FALLBACK_STREAM.closed:
        _FALLBACK_STREAM = open(os.devnull, "w", encoding="utf-8", buffering=1)

    if force_redirect or sys.stdout is None:
        sys.stdout = _FALLBACK_STREAM
    if force_redirect or sys.stderr is None:
        sys.stderr = _FALLBACK_STREAM


def _runtime_dir() -> Path:
    """获取运行目录（源码模式为项目目录，打包模式为 exe 所在目录）。"""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _find_free_port(host: str) -> int:
    """分配可用本地端口。"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        sock.listen(1)
        return int(sock.getsockname()[1])


def _read_text_tail(path: Path, max_chars: int = 1600) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    if len(text) <= max_chars:
        return text
    return text[-max_chars:]


def _run_fastapi_server(host: str, port: int, runtime_dir: str) -> None:
    """子进程入口：启动 FastAPI 服务。"""
    crash_log_path = LOG_DIR / BACKEND_CRASH_LOG_FILENAME
    try:
        crash_log_path.unlink(missing_ok=True)
    except OSError:
        pass
    _ensure_standard_streams(fallback_log_path=crash_log_path, force_redirect=True)

    os.chdir(runtime_dir)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    try:
        import uvicorn
        from main import app

        # 使用 Server 直接启动，避免 uvicorn.run 在启动失败时仅抛 SystemExit(3)。
        config = uvicorn.Config(
            app=app,
            host=host,
            port=port,
            reload=False,
            workers=1,
            log_level="info",
            access_log=False,
        )
        server = uvicorn.Server(config)
        server.run()
        if not server.started:
            raise RuntimeError("FastAPI 启动失败：服务未进入监听状态，请查看同文件中的 uvicorn 错误日志。")
    except BaseException:
        try:
            with crash_log_path.open("a", encoding="utf-8") as f:
                f.write("\n\n=== Python Traceback ===\n")
                f.write(traceback.format_exc())
        except OSError:
            pass
        raise


class JsApi:
    """暴露给前端 window.pywebview.api 的原生桥接方法。"""

    _FILE_TYPE_MAP = {
        ".zip": ("ZIP 压缩包 (*.zip)",),
        ".xlsx": ("Excel 文件 (*.xlsx)",),
    }

    def __init__(self, app: "DesktopApp") -> None:
        self._app = app

    def _build_internal_request(self, path: str):
        """构造附带有效认证 Cookie 的内部 FastAPI 请求。"""
        import auth_security

        token = auth_security.create_auth_cookie()
        url = f"http://{self._app.host}:{self._app.port}{path}"
        req = urllib.request.Request(url)
        req.add_header("Cookie", f"{auth_security.AUTH_COOKIE_NAME}={token}")
        return req

    def _internal_get(self, path: str, timeout: int = 60) -> tuple:
        """向内部 FastAPI 发 GET 请求，附带有效认证 Cookie，返回 (bytes, headers_dict)。"""
        req = self._build_internal_request(path)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            headers = {k.lower(): v for k, v in resp.headers.items()}
        return data, headers

    def _internal_download_to_file(
        self,
        path: str,
        destination: Path,
        timeout: int = DESKTOP_BACKUP_TIMEOUT_SECONDS,
    ) -> dict:
        """向内部 FastAPI 下载文件并流式写入磁盘，避免大备份占用内存。"""
        req = self._build_internal_request(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_destination = destination.with_name(f".{destination.name}.{uuid4().hex}.tmp")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp, temp_destination.open("wb") as buffer:
                while True:
                    chunk = resp.read(STREAM_CHUNK_SIZE)
                    if not chunk:
                        break
                    buffer.write(chunk)
                headers = {k.lower(): v for k, v in resp.headers.items()}
            os.replace(temp_destination, destination)
            return headers
        except Exception:
            safe_unlink(temp_destination)
            raise

    def _parse_filename_from_headers(self, headers: dict, fallback: str) -> str:
        """从 Content-Disposition 头解析文件名（支持 RFC 5987 编码）。"""
        import re
        from urllib.parse import unquote

        cd = headers.get("content-disposition", "")
        if not cd:
            return fallback
        m = re.search(r"filename\*\s*=\s*[Uu][Tt][Ff]-8''([^;]+)", cd)
        if m:
            return unquote(m.group(1).strip())
        m = re.search(r'filename\s*=\s*"([^"]+)"', cd)
        if m:
            return m.group(1).strip()
        m = re.search(r"filename\s*=\s*([^;]+)", cd)
        if m:
            return m.group(1).strip()
        return fallback

    def _select_save_path(self, suggested_filename: str) -> tuple[Optional[Path], Optional[str]]:
        """弹出原生另存为对话框并返回用户选择的路径。"""
        import webview

        window = self._app.window
        if window is None:
            return None, "窗口未就绪"

        ext = Path(suggested_filename).suffix.lower()
        file_types = self._FILE_TYPE_MAP.get(ext, ("All files (*.*)",))

        try:
            result = window.create_file_dialog(
                webview.SAVE_DIALOG,
                save_filename=suggested_filename,
                file_types=file_types,
            )
        except Exception as exc:
            return None, f"无法打开保存对话框: {exc}"

        if not result:
            return None, "已取消保存"

        save_path = result[0] if isinstance(result, (tuple, list)) else result
        if not save_path:
            return None, "已取消保存"

        return Path(save_path), None

    def _save_with_dialog(self, data: bytes, suggested_filename: str) -> dict:
        """弹出原生另存为对话框并将数据写入用户选择的路径。"""
        save_path, error_message = self._select_save_path(suggested_filename)
        if error_message or save_path is None:
            return {"ok": False, "message": error_message or "已取消保存"}

        try:
            save_path.write_bytes(data)
        except OSError as exc:
            return {"ok": False, "message": f"写入文件失败: {exc}"}

        return {"ok": True, "message": f"已保存到 {save_path}"}

    def download_backup(self) -> dict:
        """备份下载：Python 内部 HTTP 获取文件 → 原生另存为对话框。"""
        filename = f"office_supplies_backup_{beijing_filename_timestamp()}.zip"
        save_path, error_message = self._select_save_path(filename)
        if error_message or save_path is None:
            return {"ok": False, "message": error_message or "已取消保存"}

        try:
            self._internal_download_to_file("/api/backup", save_path)
        except (OSError, urllib.error.URLError) as exc:
            return {"ok": False, "message": f"获取备份失败: {exc}"}
        except Exception as exc:
            return {"ok": False, "message": f"获取备份失败: {exc}"}
        return {"ok": True, "message": f"已保存到 {save_path}"}

    def download_export(self, query_string: str) -> dict:
        """台账 Excel 导出：Python 内部 HTTP 获取文件 → 原生另存为对话框。"""
        path = f"/api/export?{query_string}" if query_string else "/api/export"
        try:
            data, headers = self._internal_get(path)
        except Exception as exc:
            return {"ok": False, "message": f"获取导出文件失败: {exc}"}
        filename = self._parse_filename_from_headers(headers, "office_supplies_export.xlsx")
        return self._save_with_dialog(data, filename)

    def download_supplier_report(self, query_string: str) -> dict:
        """供应商报表导出：Python 内部 HTTP 获取文件 → 原生另存为对话框。"""
        path = (
            f"/api/reports/suppliers/export?{query_string}"
            if query_string
            else "/api/reports/suppliers/export"
        )
        try:
            data, headers = self._internal_get(path)
        except Exception as exc:
            return {"ok": False, "message": f"获取报表失败: {exc}"}
        filename = self._parse_filename_from_headers(headers, "supplier_purchase_report.xlsx")
        return self._save_with_dialog(data, filename)


class DesktopApp:
    def __init__(self) -> None:
        self.host = HOST
        self.port = _find_free_port(self.host)
        self.runtime_dir = _runtime_dir()

        self.server_process: Optional[mp.Process] = None
        self.window = None

        self._shutdown_lock = threading.Lock()
        self._is_shutting_down = False

    def _wait_server_ready(self, timeout: int = STARTUP_TIMEOUT_SECONDS) -> None:
        """等待后端可访问。"""
        url = f"http://{self.host}:{self.port}/"
        deadline = time.time() + timeout

        while time.time() < deadline:
            if self.server_process and not self.server_process.is_alive():
                exitcode = self.server_process.exitcode
                crash_log = LOG_DIR / BACKEND_CRASH_LOG_FILENAME
                if crash_log.exists():
                    log_tail = _read_text_tail(crash_log)
                    tail_hint = f"\n--- 日志尾部 ---\n{log_tail}" if log_tail else ""
                    raise RuntimeError(
                        f"FastAPI 后台进程已提前退出（exitcode={exitcode}），请查看日志：{crash_log}{tail_hint}"
                    )
                raise RuntimeError(f"FastAPI 后台进程已提前退出（exitcode={exitcode}）")
            try:
                with urllib.request.urlopen(url, timeout=1):
                    return
            except Exception:
                time.sleep(0.25)

        raise TimeoutError(f"FastAPI 启动超时（>{timeout}s）：{url}")

    def start_backend(self) -> None:
        """启动后台 FastAPI 子进程。"""
        crash_log = LOG_DIR / BACKEND_CRASH_LOG_FILENAME
        try:
            crash_log.unlink(missing_ok=True)
        except OSError:
            pass

        process = mp.Process(
            target=_run_fastapi_server,
            args=(self.host, self.port, str(self.runtime_dir)),
            name="fastapi-backend",
        )
        process.start()
        self.server_process = process
        self._wait_server_ready()

    def shutdown_backend(self, *_args) -> None:
        """幂等关闭后台进程，避免遗留幽灵进程。"""
        with self._shutdown_lock:
            if self._is_shutting_down:
                return
            self._is_shutting_down = True

        process = self.server_process
        if not process:
            return

        if process.is_alive():
            process.terminate()
            process.join(timeout=5)

        if process.is_alive():
            process.kill()
            process.join(timeout=2)

        self.server_process = None

    def _on_window_closing(self, *_args) -> None:
        self.shutdown_backend()

    def _on_window_closed(self, *_args) -> None:
        self.shutdown_backend()

    def _install_signal_handlers(self) -> None:
        def _handler(signum, _frame) -> None:
            self.shutdown_backend()
            raise SystemExit(0)

        for sig_name in ("SIGINT", "SIGTERM"):
            sig = getattr(signal, sig_name, None)
            if sig is not None:
                signal.signal(sig, _handler)

    def run(self) -> None:
        atexit.register(self.shutdown_backend)
        self._install_signal_handlers()

        self.start_backend()

        import webview

        webview.settings["ALLOW_DOWNLOADS"] = True

        js_api = JsApi(self)
        url = f"http://{self.host}:{self.port}/"
        self.window = webview.create_window(
            APP_TITLE,
            url,
            width=WINDOW_WIDTH,
            height=WINDOW_HEIGHT,
            js_api=js_api,
        )

        self.window.events.closing += self._on_window_closing
        self.window.events.closed += self._on_window_closed

        try:
            webview.start(debug=False)
        finally:
            self.shutdown_backend()


def main() -> None:
    _ensure_standard_streams()
    mp.freeze_support()
    app = DesktopApp()
    app.run()


if __name__ == "__main__":
    main()
