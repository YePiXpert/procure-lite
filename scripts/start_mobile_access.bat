@echo off
setlocal EnableExtensions

set "OFFICE_SUPPLIES_LAN=1"
set "OFFICE_SUPPLIES_PORT=8000"

set "APP_EXE=%~dp0OfficeSuppliesTracker.exe"
if exist "%APP_EXE%" (
  call :launch "%APP_EXE%"
  exit /b %errorlevel%
)

for %%F in ("%~dp0*.exe") do (
  echo %%~nxF | findstr /I /C:"unins" /C:"setup" >nul
  if errorlevel 1 (
    call :launch "%%~fF"
    exit /b %errorlevel%
  )
)

echo Could not find the Office Supplies Tracker executable in:
echo %~dp0
pause
exit /b 1

:launch
tasklist /FI "IMAGENAME eq %~nx1" 2>NUL | find /I "%~nx1" >NUL
if not errorlevel 1 (
  echo Office Supplies Tracker is already running.
  echo Close the existing desktop window, then start Mobile Access again.
  pause
  exit /b 1
)
start "" "%~1"
exit /b 0
