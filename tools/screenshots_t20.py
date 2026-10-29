#!/usr/bin/env python3
"""T20 情绪板：说明条 + 图旁备注/借鉴点 → docs/screenshots/0.4.0/"""
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


def set_lang(pg, base, lang):
    pg.goto(base + "/#/")
    pg.wait_for_selector("select.langsel")
    pg.select_option("select.langsel", lang)
    pg.wait_for_timeout(200)


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
            # 强制展开说明条
            pg.evaluate("() => localStorage.setItem('pg.moodHelpCollapsed', '0')")
            pg.goto(base + f"/#/p/{pid}/models")
            pg.wait_for_selector(".mood-card")
            pg.wait_for_timeout(300)
            pg.locator(".mood-card").first.scroll_into_view_if_needed()
            pg.wait_for_timeout(250)
            pg.screenshot(path=str(OUT / f"{lang}-t20-board.png"), full_page=False)
            card = pg.locator(".mood-card").first
            if card.count():
                card.locator(".mood-card-media").click()
                pg.wait_for_selector(".edit-layer")
                pg.wait_for_timeout(300)
                pg.screenshot(path=str(OUT / f"{lang}-t20-edit.png"), full_page=False)
                pg.click("button.edit-back")
        pg.set_viewport_size({"width": 1280, "height": 800})
        set_lang(pg, base, "zh")
        pg.evaluate("() => localStorage.setItem('pg.moodHelpCollapsed', '0')")
        pg.goto(base + f"/#/p/{pid}/models")
        pg.wait_for_selector(".mood-card")
        pg.locator("h3").filter(has_text="情绪板").first.scroll_into_view_if_needed()
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT / "zh-t20-board-1280.png"), full_page=False)
        b.close()
    print("wrote", OUT)


def re_mood(lang):
    return {"zh": "情绪板", "en": "Mood", "ja": "ムード", "ko": "무드"}[lang]


if __name__ == "__main__":
    main()
