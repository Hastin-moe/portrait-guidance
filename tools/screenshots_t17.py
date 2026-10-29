#!/usr/bin/env python3
"""T17 二级编辑层截图 → docs/screenshots/0.4.0/（四语 1440 + 中文 1280）。"""
import sys
import tempfile
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server  # noqa: E402

OUT = ROOT / "docs" / "screenshots" / "0.4.0"
LANGS = [("zh", "中文"), ("en", "English"), ("ja", "日本語"), ("ko", "한국어")]


def seed(data: Path) -> str:
    import subprocess
    subprocess.check_call([sys.executable, str(ROOT / "tools" / "make_demo.py"), "--data", str(data)])
    return next((data / "projects").iterdir()).name


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = tempfile.TemporaryDirectory()
    data = Path(tmp.name)
    pid = seed(data)
    srv = server.make_server(data, 0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        for lang, _ in LANGS:
            pg.set_viewport_size({"width": 1440, "height": 900})
            pg.goto(base + "/#/")
            pg.wait_for_selector("select.langsel")
            pg.select_option("select.langsel", lang)
            pg.wait_for_timeout(300)
            # 模特二级编辑
            pg.goto(base + f"/#/p/{pid}/models/mia")
            pg.wait_for_selector(".edit-layer")
            pg.wait_for_timeout(350)
            pg.screenshot(path=str(OUT / f"{lang}-t17-models-edit.png"), full_page=False)
            # 动作库二级编辑（demo 有 poses 时取第一张）
            pg.goto(base + f"/#/p/{pid}/poses")
            pg.wait_for_selector("main.page")
            card = pg.locator(".pose").first
            if card.count():
                card.click()
                pg.wait_for_selector(".edit-layer")
                pg.wait_for_timeout(300)
                pg.screenshot(path=str(OUT / f"{lang}-t17-poses-edit.png"), full_page=False)
            else:
                pg.screenshot(path=str(OUT / f"{lang}-t17-poses-list.png"), full_page=False)
        # 中文 1280：证明窄窗仍能编辑
        pg.set_viewport_size({"width": 1280, "height": 800})
        pg.goto(base + "/#/")
        pg.select_option("select.langsel", "zh")
        pg.goto(base + f"/#/p/{pid}/models/mia")
        pg.wait_for_selector(".edit-layer")
        pg.wait_for_timeout(350)
        pg.screenshot(path=str(OUT / "zh-t17-models-edit-1280.png"), full_page=False)
        b.close()
    print("wrote", OUT)


if __name__ == "__main__":
    main()
