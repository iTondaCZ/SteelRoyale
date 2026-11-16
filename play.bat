@echo off
rem Double-click to play SteelRoyale: starts the local game server and opens your browser.
cd /d "%~dp0"
where node >/dev/null 2>nul
if errorlevel 1 (
  echo SteelRoyale needs Node.js to run its small local server.
  echo Download it from https://nodejs.org, then double-click play.bat again.
  pause
  exit /b 1
)
node server.js --open
pause
