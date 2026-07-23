@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动个人工具箱...
start /min node server.js
timeout /t 1 /nobreak >nul
start http://localhost:8080
