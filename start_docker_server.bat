@echo off
setlocal EnableExtensions

cd /d "%~dp0" || (
  echo [ERROR] Cannot enter project directory.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start_docker_server.ps1" %*
exit /b %errorlevel%
