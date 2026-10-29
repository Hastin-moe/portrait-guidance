#!/usr/bin/env python3
"""0.4.0 收口：补缺的中文 1280×800 验收图 → docs/screenshots/0.4.0/"""
import sys
import tempfile
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server  # noqa: E402

OUT = ROOT / "docs" / "screenshots" / "0.4.0"


def seed(data: Path) -> str:
    import subprocess
    subprocess.check_call([sys.executable, str(ROOT / "tools" / "make_demo.py"), "--data", str(data)])
    return next((data / "projects").iterdir()).name


def set_lang(pg, base, lang="zh"):
    pg.goto(base + "/#/")
    pg.wait_for_selector("select.langsel")
    pg.select_option("select.langsel", lang)
    pg.wait_for_timeout(200)


def shot(pg, name):
    path = OUT / name
    pg.screenshot(path=str(path), full_page=False)
    print("wrote", path.name)


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
        pg = b.new_page(viewport={"width": 1280, "height": 800})
        set_lang(pg, base, "zh")
        # T17 动作库二级层
        pg.goto(base + f"/#/p/{pid}/poses")
        pg.wait_for_selector("main.page")
        pg.wait_for_timeout(400)
        # 点第一张动作卡
        loc = pg.locator(".pcard, .pose-card")
        if loc.count() == 0:
            loc = pg.locator("main.page [tabindex='0']")
        loc.first.click()
        pg.wait_for_selector(".edit-layer", timeout=10000)
        pg.wait_for_timeout(350)
        shot(pg, "zh-t17-poses-edit-1280.png")
        # T25 分镜详情
        pg.goto(base + f"/#/p/{pid}/shots")
        pg.wait_for_selector("tr.shot[data-id='s1']")
        pg.locator("tr.shot[data-id='s1']").click()
        pg.wait_for_timeout(400)
        shot(pg, "zh-t25-shot-1280.png")
        # T25 进度
        pg.goto(base + f"/#/p/{pid}/progress")
        pg.wait_for_selector(".prog-board")
        pg.wait_for_timeout(350)
        shot(pg, "zh-t25-prog-1280.png")
        # T25 导出
        pg.goto(base + f"/#/p/{pid}/export")
        pg.wait_for_selector(".export-wrap")
        pg.wait_for_timeout(400)
        shot(pg, "zh-t25-ex-1280.png")
        # T19 站位
        pg.goto(base + f"/#/p/{pid}/layout")
        pg.wait_for_selector("g.el[data-id='a-m1']")
        pg.click("g.el[data-id='a-m1']", force=True)
        pg.wait_for_timeout(400)
        shot(pg, "zh-t19-mark-1280.png")
        b.close()
    print("done", OUT)


if __name__ == "__main__":
    main()
