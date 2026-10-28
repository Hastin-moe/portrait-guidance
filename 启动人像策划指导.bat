@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem 双击启动「人像策划指导」（Windows）。需要 Python 3.9 或更高版本。
where py >nul 2>nul && (py -3 server.py %* & goto :end)
python server.py %*
:end
pause
