#!/usr/bin/env python3
"""T23 灯二级编辑 / 快捷条截图 → docs/screenshots/0.4.0/"""
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
            pg.select_option("select.langsel", lang)
            pg.wait_for_timeout(250)
            pg.goto(base + f"/#/p/{pid}/layout")
            pg.wait_for_selector("g.el[data-id='a-l1']")
            pg.click("g.el[data-id='a-l1']", force=True)
            pg.wait_for_selector(".quickbar:not(.is-hidden)")
            pg.wait_for_timeout(400)
            pg.screenshot(path=str(OUT / f"{lang}-t23-quickbar.png"), full_page=False)
            pg.goto(base + f"/#/p/{pid}/layout/a-l1")
            pg.wait_for_selector(".edit-layer")
            # T26 F6：等标题出现「灯」再截，避免截到窗
            pg.wait_for_function(
                """() => {
                  const t = document.querySelector('.edit-layer')?.innerText || '';
                  return /灯|Light|ライト|조명/.test(t);
                }"""
            )
            pg.wait_for_timeout(250)
            pg.screenshot(path=str(OUT / f"{lang}-t23-light-edit.png"), full_page=False)
            # 五个标签页
            tabs = ["pos", "head", "fx", "power", "rel"]
            for i, tab in enumerate(tabs):
                btns = pg.locator(".edit-tabs button.edit-tab")
                if btns.count() > i:
                    btns.nth(i).click()
                    pg.wait_for_timeout(280)
                    pg.screenshot(path=str(OUT / f"{lang}-t23-light-tab-{tab}.png"), full_page=False)
        pg.set_viewport_size({"width": 1280, "height": 800})
        pg.goto(base + "/#/")
        pg.select_option("select.langsel", "zh")
        pg.goto(base + f"/#/p/{pid}/layout/a-l1")
        pg.wait_for_selector(".edit-layer")
        pg.wait_for_function("() => (document.querySelector('.edit-layer')?.innerText || '').includes('灯')")
        pg.wait_for_timeout(250)
        pg.screenshot(path=str(OUT / "zh-t23-light-edit-1280.png"), full_page=False)
        for i, tab in enumerate(["pos", "head", "fx", "power", "rel"]):
            btns = pg.locator(".edit-tabs button.edit-tab")
            if btns.count() > i:
                btns.nth(i).click()
                pg.wait_for_timeout(280)
                pg.screenshot(path=str(OUT / f"zh-t23-light-tab-{tab}-1280.png"), full_page=False)
        b.close()
    print("wrote", OUT)


if __name__ == "__main__":
    main()
