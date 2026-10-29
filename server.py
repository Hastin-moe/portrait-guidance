#!/usr/bin/env python3
"""人像策划指导（portrait-guidance）· 本机服务

和 Photo-cull 一样：只监听 127.0.0.1 的小服务器 + 浏览器里的网页界面。
只用 Python 标准库，不需要安装任何依赖。

数据目录（默认 ~/Documents/portrait-guidance，可用 --data 指定）：
  projects/<项目id>/project.json      项目数据（每个项目一个文件夹，可整体拷走或备份）
  projects/<项目id>/images/           情绪板、参考图、底图、场地照片
  projects/<项目id>/versions/         手动保存的版本
  library/poses.json  library/files/  动作库（跨项目共用）
  library/venues.json                 场地库（跨项目共用）
  library/templates/<id>.json         模板
  settings.json                       界面设置
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import secrets
import shutil
import sys
import threading
import time
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

VERSION = "0.4.0"
ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
TOKEN = secrets.token_urlsafe(16)
MAX_BODY = 60 * 1024 * 1024
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,63}$")
FILE_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,63}\.(jpg|jpeg|png|webp|gif)$")
IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
STATIC_TYPES = {".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
                ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
                ".html": "text/html; charset=utf-8", ".png": "image/png"}
SETTINGS_DEFAULT = {
    "lang": "zh", "bufferMin": 10, "gridM": 0.5,
    # T22：用户自备 Gemini API Key；模型名可改（默认按确认稿「Nano Banana」对应的图像生成模型）
    "geminiApiKey": "",
    "geminiModel": "gemini-2.5-flash-image",
}
OLD_GEMINI_MODELS = {
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.0-flash-exp-image-generation",
}
LOCK = threading.Lock()


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


class Store:
    """所有文件读写都在这里。写入一律先写临时文件再替换，断电也不会写坏。"""

    def __init__(self, data: Path):
        self.data = data
        self.projects = data / "projects"
        self.lib = data / "library"
        for p in (self.projects, self.lib / "files", self.lib / "templates"):
            p.mkdir(parents=True, exist_ok=True)

    # ---- 基础 ----
    @staticmethod
    def read_json(path: Path, default=None):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return default
        except json.JSONDecodeError:
            return default

    @staticmethod
    def write_json(path: Path, obj):
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, path)

    def pdir(self, pid: str) -> Path:
        if not ID_RE.match(pid or ""):
            raise ValueError("bad id")
        d = self.projects / pid
        if not (d / "project.json").exists():
            raise FileNotFoundError(pid)
        return d

    # ---- 设置 ----
    def settings(self) -> dict:
        s = dict(SETTINGS_DEFAULT)
        s.update(self.read_json(self.data / "settings.json", {}) or {})
        return s

    def save_settings(self, s: dict) -> dict:
        cur = self.settings()
        cur.update({k: v for k, v in s.items() if k in SETTINGS_DEFAULT})
        self.write_json(self.data / "settings.json", cur)
        return cur

    # ---- 项目 ----
    def list_projects(self) -> list:
        out = []
        for d in sorted(self.projects.iterdir()):
            p = self.read_json(d / "project.json")
            if not p:
                continue
            out.append({k: p.get(k) for k in ("id", "name", "status", "archived", "createdAt", "updatedAt", "rev")}
                       | {"date": (p.get("time") or {}).get("date", ""),
                          "cover": (p.get("mood") or [{}])[0].get("file") if p.get("mood") else None,
                          "summary": p.get("summary") or {}})
        out.sort(key=lambda x: x.get("updatedAt") or "", reverse=True)
        return out

    def create_project(self, body: dict) -> dict:
        pid = new_id()
        d = self.projects / pid
        src = None
        if body.get("data") and isinstance(body["data"], dict):
            # 导入备份 / 转换结果：内容用 data，身份字段由服务端重写
            src = dict(body["data"])
            for k in ("id", "rev", "createdAt", "updatedAt", "status", "archived"):
                src.pop(k, None)
        elif body.get("from"):                       # 复制项目
            src_dir = self.pdir(body["from"])
            src = self.read_json(src_dir / "project.json")
            shutil.copytree(src_dir / "images", d / "images", dirs_exist_ok=True) if (src_dir / "images").exists() else None
        elif body.get("template"):                 # 从模板新建
            tid = body["template"]
            if not ID_RE.match(tid):
                raise ValueError("bad id")
            src = self.read_json(self.lib / "templates" / f"{tid}.json")
            if src is None:
                raise FileNotFoundError(tid)
            tdir = self.lib / "templates" / tid
            if tdir.exists():
                shutil.copytree(tdir, d / "images", dirs_exist_ok=True)
        p = dict(src or {})
        p.update({"id": pid, "name": body.get("name") or p.get("name") or "", "status": "draft", "archived": False,
                  "createdAt": now(), "updatedAt": now(), "rev": 1})
        if src and body.get("from") and not body.get("data"):
            p["name"] = body.get("name") or (src.get("name", "") + " (2)")
        (d / "images").mkdir(parents=True, exist_ok=True)
        self.write_json(d / "project.json", p)
        return p

    def get_project(self, pid: str) -> dict:
        return self.read_json(self.pdir(pid) / "project.json")

    def put_project(self, pid: str, body: dict, base_rev) -> dict:
        d = self.pdir(pid)
        with LOCK:
            cur = self.read_json(d / "project.json")
            if base_rev is not None and int(base_rev) != int(cur.get("rev", 0)):
                return {"conflict": True, "current": cur}
            body = dict(body)
            body.update({"id": pid, "createdAt": cur.get("createdAt"), "updatedAt": now(), "rev": int(cur.get("rev", 0)) + 1})
            self.write_json(d / "project.json", body)
            return {"rev": body["rev"], "updatedAt": body["updatedAt"]}

    def set_archived(self, pid: str, archived: bool) -> dict:
        d = self.pdir(pid)
        with LOCK:
            p = self.read_json(d / "project.json")
            p["archived"] = bool(archived)
            p["rev"] = int(p.get("rev", 0)) + 1
            self.write_json(d / "project.json", p)
        return {"rev": p["rev"]}

    # ---- 版本 ----
    def list_versions(self, pid: str) -> list:
        vdir = self.pdir(pid) / "versions"
        out = []
        if vdir.exists():
            for f in sorted(vdir.glob("*.json"), reverse=True):
                v = self.read_json(f, {})
                out.append({"id": f.stem, "note": v.get("_note", ""), "at": v.get("_at", ""), "status": v.get("status")})
        return out

    def save_version(self, pid: str, note: str) -> dict:
        d = self.pdir(pid)
        p = self.read_json(d / "project.json")
        vid = time.strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(2)
        p["_note"], p["_at"] = note[:200], now()
        self.write_json(d / "versions" / f"{vid}.json", p)
        return {"id": vid, "note": p["_note"], "at": p["_at"]}

    def restore_version(self, pid: str, vid: str) -> dict:
        d = self.pdir(pid)
        if not re.match(r"^[0-9]{8}-[0-9]{6}-[0-9a-f]{4}$", vid):
            raise ValueError("bad version")
        v = self.read_json(d / "versions" / f"{vid}.json")
        if v is None:
            raise FileNotFoundError(vid)
        self.save_version(pid, "auto: before restore")
        v.pop("_note", None), v.pop("_at", None)
        cur = self.read_json(d / "project.json")
        return self.put_project(pid, v, cur.get("rev"))

    # ---- 图片 ----
    def save_file(self, folder: Path, data: bytes, ctype: str) -> str:
        ext = IMAGE_TYPES.get((ctype or "").split(";")[0].strip())
        if not ext:
            raise ValueError("unsupported image type")
        name = f"{new_id()}.{ext}"
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_bytes(data)
        return name

    @staticmethod
    def _redact_key(msg: str, key: str) -> str:
        if not key or not msg:
            return msg or ""
        return str(msg).replace(key, "***")

    def generate_ai_images(self, pid: str, prompt: str, count: int = 1, to_library: bool = False) -> dict:
        """T22：用用户设置里的 Gemini Key 生成参考图。未填 Key 时拒绝。

        Key 为字面量「stub」时写入 1×1 PNG（单测 / 离线冒烟，不联网）。
        API Key 放在请求头 x-goog-api-key，不进 URL（T26 F4）。
        """
        import base64
        import urllib.error
        import urllib.request

        prompt = (prompt or "").strip()
        if not prompt:
            raise ValueError("empty prompt")
        count = max(1, min(4, int(count or 1)))
        settings = self.settings()
        key = (settings.get("geminiApiKey") or "").strip()
        if not key:
            raise ValueError("missing geminiApiKey")
        folder = (self.lib / "files") if to_library else (self.pdir(pid) / "images")
        files = []
        if key == "stub":
            # 最小合法 PNG（与 tests/test_server.py 同源）
            png = bytes.fromhex(
                "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"
            )
            for _ in range(count):
                files.append(self.save_file(folder, png, "image/png"))
            return {"files": files, "stub": True}

        model = (settings.get("geminiModel") or SETTINGS_DEFAULT["geminiModel"]).strip()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        for _ in range(count):
            body = json.dumps({
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
            }).encode("utf-8")
            req = urllib.request.Request(url, data=body, method="POST",
                                         headers={
                                             "Content-Type": "application/json",
                                             "x-goog-api-key": key,
                                         })
            try:
                with urllib.request.urlopen(req, timeout=90) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                err = e.read().decode("utf-8", "replace")
                raise ValueError(f"gemini HTTP {e.code}: {self._redact_key(err, key)[:400]}") from e
            except urllib.error.URLError as e:
                raise ValueError(f"gemini network: {self._redact_key(str(e), key)}") from e
            inline = None
            for cand in data.get("candidates") or []:
                for part in ((cand.get("content") or {}).get("parts") or []):
                    inline = part.get("inlineData") or part.get("inline_data")
                    if inline:
                        break
                if inline:
                    break
            if not inline or not inline.get("data"):
                raise ValueError("gemini returned no image")
            raw = base64.b64decode(inline["data"])
            mime = (inline.get("mimeType") or inline.get("mime_type") or "image/png").split(";")[0].strip()
            files.append(self.save_file(folder, raw, mime))
        return {"files": files}

    # ---- 资料库 ----
    def lib_get(self, name: str):
        return self.read_json(self.lib / f"{name}.json", [])

    def lib_put(self, name: str, items: list):
        if not isinstance(items, list):
            raise ValueError("list expected")
        self.write_json(self.lib / f"{name}.json", items)
        return {"ok": True}

    def list_templates(self) -> list:
        out = []
        for f in sorted((self.lib / "templates").glob("*.json")):
            t = self.read_json(f, {})
            out.append({"id": f.stem, "name": t.get("name", ""), "createdAt": t.get("createdAt", "")})
        return out

    def save_template(self, pid: str, name: str) -> dict:
        d = self.pdir(pid)
        p = self.read_json(d / "project.json")
        # 模板保留场地、器材、布置图、常用分镜与动作；去掉日期、状态和客户信息
        t = {k: p.get(k) for k in ("venue", "gear", "props", "layout", "scenes", "shots", "people", "overview")}
        t["time"] = {k: v for k, v in (p.get("time") or {}).items() if k != "date"}
        if t.get("overview"):
            t["overview"] = {**t["overview"], "client": ""}
        t["name"], t["createdAt"] = name or p.get("name", ""), now()
        tid = new_id()
        self.write_json(self.lib / "templates" / f"{tid}.json", t)
        if (d / "images").exists():
            shutil.copytree(d / "images", self.lib / "templates" / tid, dirs_exist_ok=True)
        return {"id": tid, "name": t["name"]}


class Handler(BaseHTTPRequestHandler):
    server_version = "portrait-guidance/" + VERSION
    store: Store = None  # type: ignore

    def log_message(self, fmt, *args):
        if os.environ.get("PG_DEBUG"):
            sys.stderr.write("%s\n" % (fmt % args))

    # ---- 响应 ----
    def send(self, code: int, body: bytes, ctype: str, extra: dict | None = None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def json(self, obj, code=200):
        self.send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def error(self, code, msg):
        self.json({"error": msg}, code)

    def body(self) -> bytes:
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            raise ValueError("too large")
        return self.rfile.read(n) if n else b""

    def body_json(self):
        raw = self.body()
        return json.loads(raw.decode("utf-8")) if raw else {}

    def serve_file(self, path: Path, ctype: str | None = None):
        if not path.is_file():
            return self.error(404, "not found")
        ctype = ctype or STATIC_TYPES.get(path.suffix.lower()) or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self.send(200, path.read_bytes(), ctype)

    # ---- 路由 ----
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PUT(self):
        self.route("PUT")

    def route(self, method: str):
        url = urlparse(self.path)
        parts = [unquote(p) for p in url.path.split("/") if p]
        try:
            if method == "GET" and not parts:
                return self.index()
            if parts[0] == "static" and method == "GET":
                rel = Path(*parts[1:])
                target = (WEB / rel).resolve()
                if WEB.resolve() not in target.parents:
                    return self.error(404, "not found")
                return self.serve_file(target)
            if parts[0] == "files" and method == "GET" and len(parts) == 3:   # 项目图片
                pid, name = parts[1], parts[2]
                if not FILE_RE.match(name):
                    return self.error(404, "not found")
                return self.serve_file(self.store.pdir(pid) / "images" / name)
            if parts[0] == "lib" and method == "GET" and len(parts) == 2:     # 资料库图片
                if not FILE_RE.match(parts[1]):
                    return self.error(404, "not found")
                return self.serve_file(self.store.lib / "files" / parts[1])
            if parts[0] == "api":
                if self.headers.get("X-Token") != TOKEN:      # 防止其他网页调用本机接口
                    return self.error(403, "bad token")
                return self.api(method, parts[1:])
            return self.error(404, "not found")
        except FileNotFoundError:
            return self.error(404, "not found")
        except (ValueError, json.JSONDecodeError) as e:
            return self.error(400, str(e))
        except Exception as e:  # noqa: BLE001
            import traceback
            traceback.print_exc()
            return self.error(500, str(e))

    def index(self):
        html = (WEB / "index.html").read_text(encoding="utf-8")
        boot = {"token": TOKEN, "version": VERSION, "settings": self.store.settings(), "dataDir": str(self.store.data)}
        html = html.replace("/*BOOT*/", "window.BOOT=" + json.dumps(boot, ensure_ascii=False) + ";")
        self.send(200, html.encode("utf-8"), "text/html; charset=utf-8",
                  {"Content-Security-Policy": "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"})

    def api(self, m: str, p: list):
        s = self.store
        n = len(p)
        if p == ["settings"]:
            return self.json(s.settings() if m == "GET" else s.save_settings(self.body_json()))
        if p == ["projects"]:
            if m == "GET":
                return self.json(s.list_projects())
            if m == "POST":
                return self.json(s.create_project(self.body_json()))
        if n >= 2 and p[0] == "projects":
            pid = p[1]
            if n == 2 and m == "GET":
                return self.json(s.get_project(pid))
            if n == 2 and m == "PUT":
                res = s.put_project(pid, self.body_json(), self.headers.get("If-Rev"))
                return self.json(res, 409 if res.get("conflict") else 200)
            if n == 3 and p[2] == "archive" and m == "POST":
                return self.json(s.set_archived(pid, self.body_json().get("archived", True)))
            if n == 3 and p[2] == "files" and m == "POST":
                name = s.save_file(s.pdir(pid) / "images", self.body(), self.headers.get("Content-Type", ""))
                return self.json({"file": name})
            if n == 3 and p[2] == "ai-images" and m == "POST":
                body = self.body_json()
                return self.json(s.generate_ai_images(
                    pid, str(body.get("prompt", "")),
                    count=int(body.get("count") or 1),
                    to_library=bool(body.get("toLibrary"))))
            if n == 3 and p[2] == "versions":
                if m == "GET":
                    return self.json(s.list_versions(pid))
                if m == "POST":
                    return self.json(s.save_version(pid, str(self.body_json().get("note", ""))))
            if n == 5 and p[2] == "versions" and p[4] == "restore" and m == "POST":
                return self.json(s.restore_version(pid, p[3]))
            if n == 3 and p[2] == "template" and m == "POST":
                return self.json(s.save_template(pid, str(self.body_json().get("name", ""))))
        if p == ["templates"] and m == "GET":
            return self.json(s.list_templates())
        if n == 2 and p[0] == "library" and p[1] in ("poses", "venues"):
            return self.json(s.lib_get(p[1]) if m == "GET" else s.lib_put(p[1], self.body_json()))
        if p == ["library", "files"] and m == "POST":
            return self.json({"file": s.save_file(s.lib / "files", self.body(), self.headers.get("Content-Type", ""))})
        return self.error(404, "unknown api")


def make_server(data: Path, port: int):
    Handler.store = Store(data)
    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def is_our_server(port: int) -> bool:
    """端口上是否已是本程序（首页含 portrait-guidance）。"""
    import urllib.error
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1.5) as resp:
            body = resp.read().decode("utf-8", "replace")
        return "portrait-guidance" in body
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def main(argv=None):
    ap = argparse.ArgumentParser(description="人像策划指导 portrait-guidance")
    ap.add_argument("--data", default=str(Path.home() / "Documents" / "portrait-guidance"), help="数据目录")
    ap.add_argument("--port", type=int, default=8766)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--exact-port", action="store_true", help="端口被占用时直接报错，不换端口")
    a = ap.parse_args(argv)
    data = Path(a.data).expanduser()
    srv = None
    try:
        srv = make_server(data, a.port)
    except OSError:
        if a.exact_port:
            print(f"端口 {a.port} 已被占用。", file=sys.stderr)
            return 1
        if is_our_server(a.port):
            url = f"http://127.0.0.1:{a.port}/"
            print("人像策划指导已经在运行，已为你打开窗口")
            if not a.no_browser:
                webbrowser.open(url)
            return 0
        for p in range(8767, 8786):
            try:
                srv = make_server(data, p)
                break
            except OSError:
                continue
        if srv is None:
            print("端口 8766–8785 均不可用。", file=sys.stderr)
            return 1
    url = f"http://127.0.0.1:{srv.server_address[1]}/"
    print(f"人像策划指导 {VERSION} 已启动：{url}\n数据目录：{a.data}\n关闭这个窗口即可退出。")
    if not a.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main() or 0)
