@echo off
setlocal
rem Renders both TOP BUNK trailers at full size on this machine's GPU.
rem   render-windows.cmd                 placeholder music
rem   render-windows.cmd C:\path\song.wav   a licensed recording instead
rem Needs Node.js 18+ (nodejs.org) and ffmpeg on PATH (winget install Gyan.FFmpeg, then open a new window).
rem Playwright and its Chromium are installed into this folder on the first run (about 300 MB).
rem Output: trailer\out\topbunk-trailer-1080p30.mp4 and trailer\out\topbunk-social-1080x1920-30.mp4, plus 10 s teasers.

cd /d "%~dp0.."

where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org and run this again. & pause & exit /b 1)
where ffmpeg >nul 2>nul || (echo ffmpeg is not on PATH. Run:  winget install Gyan.FFmpeg   then open a new window and run this again. & pause & exit /b 1)

if not exist node_modules\playwright (
  echo Installing Playwright...
  call npm install --no-save --no-audit --no-fund playwright@1.63.0 || (pause & exit /b 1)
)
if not exist "%LOCALAPPDATA%\ms-playwright" (
  echo Installing Chromium for Playwright...
  call npx playwright install chromium || (pause & exit /b 1)
)

set MUSIC=
if not "%~1"=="" set MUSIC=--music "%~1"

echo.
echo Rendering the landscape trailer (1920x1080, 30 fps)...
node trailer\render.js --preset steam --gpu --headed --frames jpg %MUSIC% || (echo Landscape render failed. & pause & exit /b 1)

echo.
echo Rendering the portrait cut (1080x1920, 30 fps)...
node trailer\render.js --preset social --gpu --headed --frames jpg %MUSIC% || (echo Portrait render failed. & pause & exit /b 1)

echo.
echo Done. The videos are in trailer\out
explorer trailer\out
pause
