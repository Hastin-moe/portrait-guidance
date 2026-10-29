#!/usr/bin/env python3
"""T22 参考图弹窗截图 → docs/screenshots/0.4.0/"""
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
            pg.wait_for_timeout(250)
            pg.goto(base + f"/#/p/{pid}/models")
            pg.wait_for_selector("main.page")
            pg.locator("button.sm").filter(has_text=re_add(lang)).first.click()
            pg.wait_for_selector(".refpick")
            pg.wait_for_timeout(300)
            pg.screenshot(path=str(OUT / f"{lang}-t22-refpick.png"), full_page=False)
            # AI 页（无 Key，按钮灰）
            pg.locator(".refpick .edit-tab").last.click()
            pg.wait_for_timeout(250)
            pg.screenshot(path=str(OUT / f"{lang}-t22-refpick-ai.png"), full_page=False)
            pg.keyboard.press("Escape")
        pg.set_viewport_size({"width": 1280, "height": 800})
        pg.goto(base + "/#/")
        pg.select_option("select.langsel", "zh")
        pg.goto(base + f"/#/p/{pid}/models")
        pg.locator("button.sm").filter(has_text="添加参考图").first.click()
        pg.wait_for_selector(".refpick")
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT / "zh-t22-refpick-1280.png"), full_page=False)
        b.close()
    print("wrote", OUT)


def re_add(lang):
    return {"zh": "添加参考图", "en": "Add references", "ja": "参考画像を追加", "ko": "참고 이미지 추가"}[lang]


if __name__ == "__main__":
    main()
