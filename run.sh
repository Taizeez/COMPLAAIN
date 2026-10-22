#!/usr/bin/env bash
set -e

echo "========================================================================="
echo "   Complaain - Compliance as an Infrastructure"
echo "   Air-Gapped PII Redaction & Spreadsheet Column Anonymizer Suite"
echo "   100% Offline - Files Never Leave Your Local Machine"
echo "========================================================================="
echo ""

if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3 is not installed."
    echo "Please install Python 3.10+ from https://www.python.org/downloads/"
    exit 1
fi

echo "[1/2] Verifying dependencies..."
pip3 install -r requirements.txt --quiet --disable-pip-version-check

echo "[2/2] Launching Complaain Intelligence Suite..."
python3 complaain.py --serve --port 8080
