#!/usr/bin/env python3
"""截取各页四语截图（+ 中文 1280×800 / 深色），版本号取 server.VERSION。

用法：python3 tools/screenshots.py
输出：docs/screenshots/<版本>/{lang}-s{n}.png、{lang}-ex.png、{lang}-3d.png 等
"""
import shutil
import sys
import tempfile
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server  # noqa: E402

OUT = ROOT / "docs" / "screenshots" / server.VERSION
LANGS = [("zh", "中文"), ("en", "English"), ("ja", "日本語"), ("ko", "한국어")]
# S0–S9：列表 + 九步（标题用于等待；S0 无步骤导航）
STEPS = [
    ("s0", None, None),
    ("s1", 1, {"zh": "基础信息", "en": "Basics", "ja": "基本情報", "ko": "기본 정보"}),
    ("s2", 2, {"zh": "场地与器材", "en": "Venue & gear", "ja": "会場と機材", "ko": "공간과 장비"}),
    ("s3", 3, {"zh": "模特与样图", "en": "Models & references", "ja": "モデルと参考画像", "ko": "모델과 참고 이미지"}),
    ("s4", 4, {"zh": "动作库", "en": "Pose library", "ja": "ポーズ集", "ko": "포즈 라이브러리"}),
    ("s5", 5, {"zh": "分镜表", "en": "Shot list", "ja": "ショットリスト", "ko": "샷 리스트"}),
    ("s6", 6, {"zh": "场地图", "en": "Floor plan", "ja": "配置図", "ko": "배치도"}),
    ("s7", 7, {"zh": "时间轴", "en": "Timeline", "ja": "タイムライン", "ko": "타임라인"}),
    ("s8", 8, {"zh": "进度看板", "en": "Progress board", "ja": "進行ボード", "ko": "진행 보드"}),
    ("s9", 9, {"zh": "预览导出", "en": "Preview & export", "ja": "プレビューと出力", "ko": "미리보기와 내보내기"}),
    ("ex", "ex", {"zh": "EX 光比", "en": "EX lighting ratios", "ja": "EX 光比", "ko": "EX 조명비"}),
]
ROUTES = ['', 'basics', 'site', 'models', 'poses', 'shots', 'layout', 'schedule', 'progress', 'export']


def seed(data: Path) -> str:
    import subprocess
    subprocess.check_call([sys.executable, str(ROOT / "tools" / "make_demo.py"), "--data", str(data)])
    # 取唯一项目 id
    projects = list((data / "projects").iterdir())
    assert projects, "demo project missing"
    return projects[0].name


def shot_set(pg, base, pid, lang, tag, viewport, color_scheme="light"):
    pg.set_viewport_size(viewport)
    # 语言：顶栏 select
    pg.goto(base + "/#/")
    pg.wait_for_selector("select.langsel")
    pg.select_option("select.langsel", lang)
    pg.wait_for_timeout(400)
    for key, nth, titles in STEPS:
        if nth is None:
            pg.goto(base + "/#/")
            pg.wait_for_selector("h2.pt, .plist, button:has-text('＋')")
        else:
            pg.goto(base + f"/#/p/{pid}/{nth if isinstance(nth, str) else ROUTES[nth]}")
            title = titles[lang]
            pg.wait_for_selector(f"main.page h2.pt:has-text('{title}')", timeout=8000)
        pg.wait_for_timeout(350)
        name = f"{lang}-{key}" + (f"-{tag}" if tag else "") + ".png"
        pg.screenshot(path=str(OUT / name), full_page=False)
    if tag:
        return
    # 场地图里的机位三维预览（布光 A 的 C1）
    pg.goto(base + f"/#/p/{pid}/layout")
    pg.wait_for_selector("g.el[data-id='a-c1']")
    pg.click("g.el[data-id='a-c1']", force=True)
    pg.locator("aside.panel button.primary").first.click()
    pg.wait_for_selector(".dlg canvas")
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(OUT / f"{lang}-s6-3d.png"))
    pg.keyboard.press("Escape")


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    tmp = tempfile.TemporaryDirectory()
    data = Path(tmp.name)
    pid = seed(data)
    srv = server.make_server(data, 0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        # 四语 1440×900
        for lang, _ in LANGS:
            ctx = browser.new_context(viewport={"width": 1440, "height": 900}, color_scheme="light")
            pg = ctx.new_page()
            shot_set(pg, base, pid, lang, "", {"width": 1440, "height": 900})
            ctx.close()
        # 中文 1280×800
        ctx = browser.new_context(viewport={"width": 1280, "height": 800}, color_scheme="light")
        pg = ctx.new_page()
        shot_set(pg, base, pid, "zh", "1280", {"width": 1280, "height": 800})
        ctx.close()
        # 中文深色 1440×900
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, color_scheme="dark")
        pg = ctx.new_page()
        shot_set(pg, base, pid, "zh", "dark", {"width": 1440, "height": 900}, color_scheme="dark")
        ctx.close()
        browser.close()
    srv.shutdown()
    n = len(list(OUT.glob("*.png")))
    print(f"wrote {n} screenshots → {OUT}")


if __name__ == "__main__":
    main()
