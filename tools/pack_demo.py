#!/usr/bin/env python3
"""打一包可试用的 Demo 目录 + zip（第一次封包试验用，可整包删除）。

输出：
  dist/portrait-guidance-<ver>-demo/
  dist/portrait-guidance-<ver>-demo.zip

目录内自带：
  - 程序本体（server.py + web/ + make_demo）
  - 一键启动脚本（会写入本包 data-demo/，并自动生成「春日窗边人像」示例）
  - 试用说明

用法：python3 tools/pack_demo.py
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server  # noqa: E402

VER = getattr(server, "VERSION", "0.4.0")
NAME = f"portrait-guidance-{VER}-demo"
DIST = ROOT / "dist"
OUT = DIST / NAME

# 打进包里的相对路径（不含截图、测试、.git）
COPY_FILES = [
    "server.py",
    "README.md",
    "启动人像策划指导.command",
    "启动人像策划指导.bat",
]
COPY_DIRS = [
    "web",
]


LAUNCH_MAC = r'''#!/bin/bash
# 试用 Demo：数据写在本包 data-demo/，首次自动生成示例项目。关掉窗口即退出。
cd "$(dirname "$0")" || exit 1
printf '\033]0;人像策划指导 · Demo\007'
PY="$(command -v python3 || true)"
if [ -z "$PY" ] || ! "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
  echo "需要 Python 3.9+。请安装后重试：https://www.python.org/downloads/"
  read -r -p "按回车关闭…" _
  exit 1
fi
DATA="$(pwd)/data-demo"
mkdir -p "$DATA"
if [ ! -d "$DATA/projects" ] || [ -z "$(ls -A "$DATA/projects" 2>/dev/null)" ]; then
  echo "首次启动：正在生成示例项目「春日窗边人像」…"
  "$PY" tools/make_demo.py --data "$DATA" || exit 1
fi
echo "数据目录：$DATA"
exec "$PY" server.py --data "$DATA" "$@"
'''

LAUNCH_WIN = r'''@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem 试用 Demo：数据在本包 data-demo\，首次自动生成示例。
set "DATA=%cd%\data-demo"
if not exist "%DATA%" mkdir "%DATA%"
dir /b "%DATA%\projects" >nul 2>nul
if errorlevel 1 goto seed
goto run
:seed
echo 首次启动：正在生成示例项目…
where py >nul 2>nul && (py -3 tools\make_demo.py --data "%DATA%" & goto run)
python tools\make_demo.py --data "%DATA%"
:run
where py >nul 2>nul && (py -3 server.py --data "%DATA%" %* & goto end)
python server.py --data "%DATA%" %*
:end
pause
'''

README_DEMO = f"""# 人像策划指导 · 试用 Demo（{VER}）

这是**第一次封包试验包**。整夹可删，数据只写在本包的 `data-demo/`，不会动你的「文稿/Documents」。

## 怎么开

| 系统 | 操作 |
|------|------|
| macOS | 双击 `启动试用Demo.command`（若提示无法打开：右键 → 打开） |
| Windows | 双击 `启动试用Demo.bat` |

需要本机已装 **Python 3.9+**（只用标准库，不用 pip）。

首次启动会自动生成示例项目「春日窗边人像」，浏览器会打开界面。

## 试用建议点这些

1. 首页打开「春日窗边人像」
2. S6 场地图：点灯 L1，看浮条与关系标注；双击进二级编辑
3. S3 模特 / S4 动作库：点卡片开二级层
4. S7 时间轴、S8 进度、S9 导出预览

## 关掉

关掉终端窗口即退出服务。要清数据：删掉本包里的 `data-demo/`，或直接删整个 Demo 夹。

## 版本

程序版本 **{VER}**（与 `server.py` 内 `VERSION` 一致）。来自分支试验封包，非正式安装程序。
"""


def clean_copy_tree(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    def ignore(dirpath, names):
        skip = {"__pycache__", ".DS_Store", ".git"}
        return [n for n in names if n in skip or n.endswith(".pyc")]
    shutil.copytree(src, dst, ignore=ignore)


def main() -> int:
    DIST.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    for rel in COPY_FILES:
        src = ROOT / rel
        if src.is_file():
            shutil.copy2(src, OUT / rel)

    for rel in COPY_DIRS:
        clean_copy_tree(ROOT / rel, OUT / rel)

    tools = OUT / "tools"
    tools.mkdir(exist_ok=True)
    shutil.copy2(ROOT / "tools" / "make_demo.py", tools / "make_demo.py")

    mac = OUT / "启动试用Demo.command"
    mac.write_text(LAUNCH_MAC, encoding="utf-8")
    mac.chmod(0o755)

    (OUT / "启动试用Demo.bat").write_text(LAUNCH_WIN, encoding="utf-8")
    (OUT / "试用说明.md").write_text(README_DEMO, encoding="utf-8")

    # 预置示例，开箱即有项目（启动脚本也会在空目录时再生成）
    data = OUT / "data-demo"
    data.mkdir(exist_ok=True)
    print("预置示例项目…")
    subprocess.check_call([sys.executable, str(tools / "make_demo.py"), "--data", str(data)], cwd=str(OUT))

    zip_path = DIST / f"{NAME}.zip"
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for f in OUT.rglob("*"):
            if f.is_file() and "__pycache__" not in f.parts and not f.name.endswith(".pyc"):
                zf.write(f, f.relative_to(DIST).as_posix())

    # 体积
    def du(p: Path) -> int:
        return sum(x.stat().st_size for x in p.rglob("*") if x.is_file())

    print(f"目录：{OUT}  ({du(OUT)/1024:.0f} KB)")
    print(f"压缩：{zip_path}  ({zip_path.stat().st_size/1024:.0f} KB)")
    print("试用：打开目录后双击「启动试用Demo.command」")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
