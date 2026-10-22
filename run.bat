@echo off
setlocal
title Complaain - Compliance as an Infrastructure

echo =========================================================================
echo    Complaain - Compliance as an Infrastructure
echo    Air-Gapped PII Redaction & Spreadsheet Column Anonymizer Suite
echo    100%% Offline - Files Never Leave Your Local Machine
echo =========================================================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python 3.10+ from https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [1/2] Verifying dependencies...
pip install -r requirements.txt --quiet --disable-pip-version-check

echo [2/2] Launching Complaain Intelligence Suite...
python complaain.py --serve --port 8080

pause
