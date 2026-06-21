@echo off
REM Alt Theory web launcher.
REM Starts the local server and opens it in your default browser.
REM A console window stays open (minimized) while the app runs; close it to stop.

setlocal
cd /d "%~dp0app"

REM Try to find an open port if 3000 is taken.
set PORT=3000

REM Start the server in a minimized console so it keeps running.
start "Alt Theory Server" /min "%~dp0node.exe" dist-bundle\alt-theory-app\web-server\server.js

REM Give the server a moment to come up, then open the browser.
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/"

echo Alt Theory is starting...
echo If the page does not open, go to http://127.0.0.1:%PORT%/ in your browser.
echo To stop the app, close the "Alt Theory Server" window.
endlocal
