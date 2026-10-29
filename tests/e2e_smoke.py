"""浏览器冒烟测试：从空数据目录开始，走一遍新建项目 → 填信息 → 布置图 → 分镜 → 时间表 → 导出。

需要 Playwright（pip install playwright && playwright install chromium）。
用法：python3 tests/e2e_smoke.py
"""
import sys
import tempfile
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402


def main(shots_dir=None):
    tmp = tempfile.TemporaryDirectory()
    srv = server.make_server(Path(tmp.name), 0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    errors = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        pg.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
        snap = lambda name: shots_dir and pg.screenshot(path=f"{shots_dir}/e2e-{name}.png")
        pg.goto(base + "/")
        pg.get_by_role("button", name="＋ 新建项目").first.click()
        pg.fill(".dlg input", "测试项目")
        pg.click(".dlg button.primary")
        # 新导航：1 basics 2 site 3 models 4 poses 5 shots 6 layout 7 schedule 8 progress 9 export
        def go_step(n, title):
            pg.click(f"nav.steps a:nth-child({n})")
            pg.wait_for_selector(f"main.page h2.pt:has-text('{title}')")

        pg.wait_for_url("**/basics")
        pg.wait_for_selector("main.page h2.pt:has-text('基础信息')")
        pg.fill("textarea", "窗光下的安静人像")
        pg.keyboard.press("Tab")
        pg.fill(".chips input", "窗光"); pg.keyboard.press("Enter")
        pg.fill("input[type=date]", "2026-11-08")
        # S3 模特与样图
        go_step(3, "模特与样图")
        pg.get_by_role("button", name="＋ 添加模特").click()
        pg.get_by_role("button", name="＋ 添加模特").click()
        # S2 场地与器材（场地标签填尺寸；器材标签加灯）
        go_step(2, "场地与器材")
        inputs = pg.locator("input[type=text]")
        inputs.nth(0).fill("白棚")
        pg.locator("input[type=number]").nth(0).fill("8")
        pg.locator("input[type=number]").nth(1).fill("6")
        pg.keyboard.press("Tab")
        pg.get_by_role("radio", name="器材").click()
        pg.get_by_role("button", name="＋ 添加器材").first.click()
        pg.locator("table.grid input[type=text]").first.fill("Godox AD600")
        pg.keyboard.press("Tab")
        # S6 场地图：加灯、机位、人物
        go_step(6, "场地图")
        pg.wait_for_selector(".palette button.bindable")
        snap("layout0")
        pg.click(".palette button.bindable >> nth=0")
        pg.click(".palette button:has-text('机位')")
        pg.click(".palette button.bindable:has-text('模特 1')")
        # 拖动刚放下的人物（已选中），再按 R 旋转；右侧面板里的坐标和朝向应随之变化
        xin = lambda: pg.locator("aside.panel input[type=number]").nth(0).input_value()
        rin = lambda: pg.locator("aside.panel input[type=number]").nth(2).input_value()
        x0 = float(xin())
        el = pg.locator("g.el").last
        bb = el.bounding_box()
        cx, cy = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
        pg.mouse.move(cx, cy); pg.mouse.down(); pg.mouse.move(cx + 80, cy + 40, steps=5); pg.mouse.up()
        pg.wait_for_timeout(200)
        assert float(xin()) > x0, "拖动后 X 变大"
        pg.keyboard.press("r")
        pg.wait_for_timeout(200)
        assert rin() == "15", "R 旋转 15°"
        snap("layout")
        # EX 光比：同一份布置；在 EX 里移动灯，回到场地图位置也变了（T14）
        pg.click("nav.steps a.extra")
        pg.wait_for_selector("main.page h2.pt:has-text('EX 光比')")
        pg.wait_for_selector("aside.panel h4:has-text('光比')")
        assert pg.locator("aside.panel .lr-card").count() == 1, "光比面板列出这一盏灯"
        pg.click("aside.panel .lr-card")                      # 点卡片选中灯
        pg.wait_for_selector("aside.panel h4:has-text('测光读数')")
        pg.locator("aside.panel input[type=number]").nth(0).fill("3.5")   # X
        pg.keyboard.press("Tab")
        pg.wait_for_timeout(300)
        go_step(6, "场地图")
        xs = pg.locator("g.el").evaluate_all("els => els.map(e => e.getAttribute('transform'))")
        assert any(t.startswith("translate(3.5 ") for t in xs), ("EX 改的灯位在场地图同步", xs)
        snap("ex")
        # S5 分镜：按布光方案生成场景，加两个镜头
        go_step(5, "分镜表")
        pg.get_by_role("button", name="按布光方案生成场景").click()
        pg.get_by_role("button", name="＋ 新镜头").click()
        pg.keyboard.press("Meta+n") if sys.platform == "darwin" else pg.keyboard.press("Control+n")
        pg.wait_for_timeout(200)
        assert pg.locator("tr.shot").count() == 2, "两个镜头"
        # ⌘K 动作库：新建一个动作并选用
        pg.click("tr.shot >> nth=0")
        pg.keyboard.press("Control+k")
        pg.get_by_role("button", name="＋ 新建动作").click()
        pg.fill(".dlg >> nth=1 >> input", "回眸")
        pg.click(".dlg >> nth=1 >> button.primary")
        pg.wait_for_timeout(200)
        assert "回眸" in pg.locator("tr.shot >> nth=0").inner_text()
        # 多选 + 批量改优先级
        pg.click("tr.shot >> nth=1", modifiers=["Shift"])
        pg.get_by_role("button", name="改优先级").click()
        pg.click(".menu button:has-text('可选')")
        assert pg.locator("tr.shot.opt").count() == 2
        # 撤销
        pg.click("main.page h2")
        pg.keyboard.press("Control+z")
        pg.wait_for_timeout(200)
        assert pg.locator("tr.shot.opt").count() == 0, "撤销批量修改"
        snap("shots")
        # S2 从尺寸库添加一条器材
        go_step(2, "场地与器材")
        pg.get_by_role("radio", name="器材").click()
        pg.get_by_role("button", name="从尺寸库添加").first.click()
        pg.wait_for_selector(".menu input[type=search]")
        pg.fill(".menu input[type=search]", "QR-P90T")
        pg.wait_for_timeout(200)
        pg.locator(".menu button").filter(has_text="QR-P90T").first.click()
        pg.wait_for_timeout(400)
        # 器材名在 input 里，inner_text 读不到；用 value / 尺寸列 ø90 断言
        vals = pg.locator("main.page table.grid input[type=text]").evaluate_all("els => els.map(e => e.value)")
        assert any("QR-P90T" in (v or "") for v in vals), vals
        assert "ø90" in pg.locator("main.page").inner_text()
        # S8 进度：开始并完成一个镜头
        go_step(8, "进度看板")
        pg.wait_for_selector(".prog-board .pcard")
        pg.locator(".prog-col").first.get_by_role("button", name="开始").first.click()
        pg.wait_for_timeout(300)
        assert pg.locator(".prog-col").nth(1).locator(".pcard").count() >= 1, "开始后进入拍摄中"
        pg.locator(".prog-col").nth(1).get_by_role("button", name="完成").first.click()
        pg.wait_for_timeout(400)
        assert pg.locator(".prog-col").nth(2).locator(".pcard").count() >= 1, "完成后进入已完成"
        # S7 时间轴与 S9 导出
        go_step(7, "时间轴")
        pg.wait_for_timeout(300)
        snap("schedule")
        assert pg.locator(".gantt .bar").count() >= 2
        go_step(9, "预览导出")
        pg.select_option(".opts select", "ja")
        pg.wait_for_timeout(200)
        assert "ショットリスト" in pg.locator(".doc").inner_text()
        snap("export")
        # 等自动保存完，再刷新确认数据已写入
        pg.wait_for_timeout(1800)
        assert pg.inner_text("[data-save]") == "已保存"
        pg.reload(); pg.wait_for_timeout(800)
        go_step(5, "分镜表")
        pg.wait_for_selector("tr.shot")
        assert pg.locator("tr.shot").count() == 2, "刷新后数据还在"
        assert "回眸" in pg.locator("tr.shot >> nth=0").inner_text()
        # S0 导入 Grok 样例
        pg.goto(base + "/#/")
        pg.wait_for_selector("h2.pt, .plist, button:has-text('导入')")
        fixture = Path(__file__).resolve().parent / "fixtures" / "demo-project.json"
        with pg.expect_file_chooser() as fc:
            pg.get_by_role("button", name="导入").click()
        fc.value.set_files(str(fixture))
        pg.wait_for_selector(".dlg h3:has-text('导入报告')", timeout=15000)
        assert "已转换" in pg.locator(".dlg").inner_text()
        pg.locator(".dlg").get_by_role("button", name="关闭").click()
        pg.wait_for_url("**/basics", timeout=15000)
        pg.wait_for_function(
            """() => {
              const t = document.querySelector('header .title');
              return t && t.textContent && t.textContent.includes('窗边人像试拍');
            }""",
            timeout=15000,
        )
        # 带图片的 Grok 文件：场地照片和情绪板都要落盘（T11-C1）
        pg.goto(base + "/#/")
        pg.wait_for_selector("button:has-text('导入')")
        with pg.expect_file_chooser() as fc:
            pg.get_by_role("button", name="导入").click()
        fc.value.set_files(str(fixture.parent / "grok-with-images.json"))
        pg.wait_for_selector(".dlg h3:has-text('导入报告')", timeout=15000)
        assert pg.locator(".plist .proj").count() >= 3, "导入报告弹出时背后的列表已刷新（T11-B8）"
        pg.locator(".dlg").get_by_role("button", name="关闭").click()
        pg.wait_for_url("**/basics", timeout=15000)
        pg.wait_for_timeout(1500)
        import json as _json
        pj = [d for d in (Path(tmp.name) / "projects").iterdir() if "带图样例" in (d / "project.json").read_text(encoding="utf-8")]
        assert pj, "带图样例已建立"
        data = _json.loads((pj[0] / "project.json").read_text(encoding="utf-8"))
        assert len(data["venue"]["photos"]) == 1 and len(data["mood"]) == 2, (data["venue"]["photos"], len(data["mood"]))
        for name in data["venue"]["photos"] + [m["file"] for m in data["mood"]]:
            assert (pj[0] / "images" / name).exists(), name
        b.close()
    srv.shutdown()
    # 过滤文件选择器等无害噪音
    real = [e for e in errors if "FileChooser" not in e and "net::ERR" not in e]
    if real:
        print("\n".join(real))
        raise SystemExit(1)
    print("e2e ok")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
