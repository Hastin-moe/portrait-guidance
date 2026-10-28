#!/bin/bash
# 双击启动「人像策划指导」（macOS）。只需要系统自带的 Python 3.9 或更高版本，不用安装其他东西。
# 浏览器会自动打开；关掉这个终端窗口即可退出。
cd "$(dirname "$0")" || exit 1
printf '\033]0;人像策划指导\007'
PY="$(command -v python3 || true)"
if [ -z "$PY" ] || ! "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
  echo "没有找到 Python 3.9 或更高版本。请从 https://www.python.org/downloads/ 安装后重试。"
  read -r -p "按回车键关闭…" _
  exit 1
fi
exec "$PY" server.py "$@"
