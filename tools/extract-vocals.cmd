@echo off
setlocal
rem Pulls the singing out of a full recording and writes it as a MIDI melody for the robot voice page.
rem   extract-vocals.cmd song.mp3          writes song.vocals.wav and song.vocals.mid next to it
rem Needs Python 3.10 or 3.11 on PATH (python.org; tick "Add to PATH"). The first run makes tools\.venv and installs
rem demucs and basic-pitch into it (about 2 GB with torch); later runs skip that. A graphics card is used when torch sees it.
cd /d "%~dp0"
if "%~1"=="" (echo usage: extract-vocals.cmd song.mp3 & exit /b 1)

set PY=
py -3.11 -c "" >nul 2>nul && set PY=py -3.11
if not defined PY py -3.10 -c "" >nul 2>nul && set PY=py -3.10
if not defined PY where python >nul 2>nul && set PY=python
if not defined PY (echo Python 3.10 or 3.11 is not installed. Get it from https://python.org and run this again. & pause & exit /b 1)

if not exist .venv\Scripts\python.exe (
  echo Making tools\.venv...
  %PY% -m venv .venv || (pause & exit /b 1)
  echo Installing demucs and basic-pitch, this takes a while the first time...
  .venv\Scripts\python.exe -m pip install --quiet --upgrade pip
  .venv\Scripts\python.exe -m pip install --quiet torch torchaudio --index-url https://download.pytorch.org/whl/cu124 || .venv\Scripts\python.exe -m pip install --quiet torch torchaudio
  .venv\Scripts\python.exe -m pip install --quiet demucs==4.0.1 basic-pitch==0.4.0 || (echo The install failed. & pause & exit /b 1)
)
.venv\Scripts\python.exe extract_vocals.py %*
