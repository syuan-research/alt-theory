@echo off
setlocal
title Alt Theory v1-alpha local
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo [Alt Theory] Node.js is not available in PATH.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\tsx.cmd" (
  echo [Alt Theory] Dependencies are missing.
  echo Open PowerShell in this folder and run: npm install
  pause
  exit /b 1
)

if /i "%~1"=="--check" (
  echo [Alt Theory] Launcher prerequisites found.
  exit /b 0
)

set "PORT=3000"
powershell.exe -NoProfile -Command "try { $c = [Net.Sockets.TcpClient]::new('127.0.0.1', 3000); $c.Close(); exit 1 } catch { exit 0 }"
if errorlevel 1 (
  echo [Alt Theory] Port 3000 is already in use.
  echo Close the existing local server, then run this file again.
  pause
  exit /b 1
)

echo [Alt Theory] Starting v1-alpha at http://127.0.0.1:3000/
echo [Alt Theory] Reusing local data and model settings under:
echo              %USERPROFILE%\.alt-theory
echo [Alt Theory] Keep this window open. Press Ctrl+C to stop.
echo.

start "" /min powershell.exe -NoProfile -WindowStyle Hidden -Command "$url='http://127.0.0.1:3000/'; for($i=0; $i -lt 60; $i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1; if($r.StatusCode -ge 200){ Start-Process $url; exit } } catch {}; Start-Sleep -Seconds 1 }"
call npm.cmd run dev:web:local:v6

echo.
echo [Alt Theory] Server stopped.
pause
endlocal
