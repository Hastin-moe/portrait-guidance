#!/usr/bin/env python3
"""T24 关系弧：灯 / 机位 / 人物选中 → docs/screenshots/0.4.0/"""
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
SELS = [("a-l1", "light"), ("a-c1", "camera"), ("a-p1", "person")]


def seed(data: Path) -> str:
    import subprocess
    subprocess.check_call([sys.executable, str(ROOT / "tools" / "make_demo.py"), "--data", str(data)])
    return next((data / "projects").iterdir()).name


def shot_sel(pg, base, pid, lang, el_id, name):
    pg.goto(base + "/#/")
    pg.select_option("select.langsel", lang)
    pg.wait_for_timeout(200)
    pg.goto(base + f"/#/p/{pid}/layout")
    pg.wait_for_selector(f"g.el[data-id='{el_id}']")
    pg.click(f"g.el[data-id='{el_id}']", force=True)
    pg.wait_for_selector("aside.panel h4")
    pg.wait_for_timeout(400)
    pg.screenshot(path=str(OUT / name), full_page=False)


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
            for el_id, tag in SELS:
                shot_sel(pg, base, pid, lang, el_id, f"{lang}-t24-{tag}.png")
        pg.set_viewport_size({"width": 1280, "height": 800})
        for el_id, tag in SELS:
            shot_sel(pg, base, pid, "zh", el_id, f"zh-t24-{tag}-1280.png")
        b.close()
    print("wrote", OUT)


if __name__ == "__main__":
    main()
