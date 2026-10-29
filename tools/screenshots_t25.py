#!/usr/bin/env python3
"""T25 S2/S5/S7/S8/S9 配套 → docs/screenshots/0.4.0/"""
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
PACK = {"zh": "打包清单", "en": "Packing list", "ja": "持ち物リスト", "ko": "챙길 목록"}
GEAR = {"zh": "器材", "en": "Gear", "ja": "機材", "ko": "장비"}
EDIT = {"zh": "编辑", "en": "Edit", "ja": "編集", "ko": "편집"}


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
            # S2 器材二级编辑
            pg.goto(base + f"/#/p/{pid}/site")
            pg.wait_for_selector("main.page h2.pt")
            pg.get_by_role("radio", name=GEAR[lang]).click()
            pg.wait_for_timeout(250)
            pg.locator("button.sm").filter(has_text=EDIT[lang]).first.click()
            pg.wait_for_selector(".edit-layer")
            pg.wait_for_timeout(450)
            pg.screenshot(path=str(OUT / f"{lang}-t25-gear.png"), full_page=False)
            pg.click("button.edit-back")
            # 打包清单
            pg.get_by_role("radio", name=PACK[lang]).click()
            pg.wait_for_timeout(300)
            pg.screenshot(path=str(OUT / f"{lang}-t25-pack.png"), full_page=False)
            # S5 分镜详情（角色 / 灯位关系）
            pg.goto(base + f"/#/p/{pid}/shots")
            pg.wait_for_selector("tr.shot")
            pg.locator("tr.shot[data-id='s1']").click()
            pg.wait_for_timeout(450)
            pg.screenshot(path=str(OUT / f"{lang}-t25-shot.png"), full_page=False)
            # S7 工时条
            pg.goto(base + f"/#/p/{pid}/schedule")
            pg.wait_for_selector(".gantt")
            pg.wait_for_timeout(350)
            pg.screenshot(path=str(OUT / f"{lang}-t25-sch.png"), full_page=False)
            # S8 站位缩略 / 收工提醒
            pg.goto(base + f"/#/p/{pid}/progress")
            pg.wait_for_selector(".prog-board")
            pg.wait_for_timeout(350)
            pg.screenshot(path=str(OUT / f"{lang}-t25-prog.png"), full_page=False)
            # S9 导出（模特资料 / 通告单 / 隐私）
            pg.goto(base + f"/#/p/{pid}/export")
            pg.wait_for_selector(".export-wrap")
            pg.wait_for_timeout(400)
            pg.screenshot(path=str(OUT / f"{lang}-t25-ex.png"), full_page=False)
        # 中文窄窗
        pg.set_viewport_size({"width": 1280, "height": 800})
        set_lang(pg, base, "zh")
        pg.goto(base + f"/#/p/{pid}/site/ogear/og1")
        pg.wait_for_selector(".edit-layer")
        pg.wait_for_timeout(350)
        pg.screenshot(path=str(OUT / "zh-t25-gear-1280.png"), full_page=False)
        pg.goto(base + f"/#/p/{pid}/schedule")
        pg.wait_for_selector(".gantt")
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT / "zh-t25-sch-1280.png"), full_page=False)
        b.close()
    print("wrote", OUT)


if __name__ == "__main__":
    main()
