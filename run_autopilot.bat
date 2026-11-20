@echo off
REM Shorts Factory - Windows Gorev Zamanlayicisi bunu calistirir
cd /d "%~dp0"
python autopilot.py >> autopilot.log 2>&1
