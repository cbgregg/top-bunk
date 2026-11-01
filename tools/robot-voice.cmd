@echo off
setlocal
rem Opens the robot voice page: serves the project on a local port and opens the page in the default browser.
rem The page also works opened straight from disk (tools\robot-voice.html); the server is only for the demo fonts and a clean URL.
cd /d "%~dp0.."
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org and run this again. & pause & exit /b 1)
start "" http://127.0.0.1:8700/tools/robot-voice.html
echo Serving http://127.0.0.1:8700/tools/robot-voice.html  (close this window to stop)
node trailer\render.js --serve --port 8700
