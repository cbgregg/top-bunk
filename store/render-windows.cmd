@echo off
setlocal
rem Renders the Steam store set on this machine's GPU: the eight screenshots, the capsule sources, the capsules, the achievement icons.
rem   render-windows.cmd              everything
rem   render-windows.cmd shots        screenshots + capsule sources only
rem   render-windows.cmd capsules     capsules only (from the screenshots already in store\screenshots)
rem   render-windows.cmd icons        achievement icons only
rem Needs Node.js 18+ on PATH. Playwright and its Chromium are installed into this folder on the first run (about 300 MB).
rem Output: store\screenshots\*.png, store\capsules\src\*, store\out\* (the capsules), store\achievements\*.png

cd /d "%~dp0.."

where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org and run this again. & pause & exit /b 1)

if not exist node_modules\playwright (
  echo Installing Playwright...
  call npm install --no-save --no-audit --no-fund playwright@1.63.0 || (pause & exit /b 1)
)
if not exist "%LOCALAPPDATA%\ms-playwright" (
  echo Installing Chromium for Playwright...
  call npx playwright install chromium || (pause & exit /b 1)
)

set WHAT=%~1
if "%WHAT%"=="" set WHAT=all

if "%WHAT%"=="all" goto shots
if "%WHAT%"=="shots" goto shots
if "%WHAT%"=="capsules" goto capsules
if "%WHAT%"=="icons" goto icons
echo Unknown argument "%WHAT%". Use shots, capsules, icons or nothing. & pause & exit /b 1

:shots
echo.
echo Rendering the screenshots and the capsule sources (1920x1080, quality high)...
node store\shots.js --extra --gpu --headed || (echo Screenshot render failed. & pause & exit /b 1)
if "%WHAT%"=="shots" goto done

:capsules
echo.
echo Rendering the capsules...
node store\render_capsules.js || (echo Capsule render failed. & pause & exit /b 1)
if "%WHAT%"=="capsules" goto done

:icons
echo.
echo Rendering the achievement icons...
node store\render_achievements.js --gpu --headed || (echo Icon render failed. & pause & exit /b 1)

:done
echo.
echo Done. Screenshots in store\screenshots, capsules in store\out, icons in store\achievements
explorer store
pause
