@echo off
rem submail 短入口 —— 转发到 ..\src\cli.py（Windows cmd 直接双击/调用）。
rem 用法: submail.bat send --to w2 --me w1 --body "你好"
python "%~dp0..\src\cli.py" %*
