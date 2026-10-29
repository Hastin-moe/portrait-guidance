#!/usr/bin/env python3
"""T18 模特档案：列表 + 基本 / 工作照 / 服装 / 角色 → docs/screenshots/0.4.0/"""
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
# 标签文案随语言变；用 tab 顺序索引
TABS = ["basic", "photos", "looks", "role"]


def seed(data: Path) -> str:
    import subprocess
    subprocess.check_call([sys.executable, str(ROOT / "tools" / "make_demo.py"), "--data", str(data)])
    return next((data / "projects").iterdir()).name


def set_lang(pg, base, lang):
    pg.goto(base + "/#/")
    pg.wait_for_selector("select.langsel")
    pg.select_option("select.langsel", lang)
    pg.wait_for_timeout(200)


def open_person(pg, base, pid):
    pg.goto(base + f"/#/p/{pid}/models/mia")
    pg.wait_for_selector(".edit-layer")
    pg.wait_for_timeout(300)


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
            set_lang(pg, base, lang)
            # 列表（封面 / 角标）
            pg.goto(base + f"/#/p/{pid}/models")
            pg.wait_for_selector(".pcard")
            pg.wait_for_timeout(300)
            pg.screenshot(path=str(OUT / f"{lang}-t18-list.png"), full_page=False)
            open_person(pg, base, pid)
            for i, tag in enumerate(TABS):
                tabs = pg.locator(".edit-tabs button.edit-tab")
                tabs.nth(i).click()
                pg.wait_for_timeout(280)
                pg.screenshot(path=str(OUT / f"{lang}-t18-{tag}.png"), full_page=False)
        # 中文 1280：列表 + 服装页
        pg.set_viewport_size({"width": 1280, "height": 800})
        set_lang(pg, base, "zh")
        pg.goto(base + f"/#/p/{pid}/models")
        pg.wait_for_selector(".pcard")
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT / "zh-t18-list-1280.png"), full_page=False)
        open_person(pg, base, pid)
        pg.locator(".edit-tabs button.edit-tab").nth(2).click()  # 服装
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT / "zh-t18-looks-1280.png"), full_page=False)
        b.close()
    print("wrote", OUT)


if __name__ == "__main__":
    main()
