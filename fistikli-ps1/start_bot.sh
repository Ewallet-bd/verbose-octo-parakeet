#!/bin/bash
set -e

cd "$(dirname "$0")"

# load credentials safely (handles spaces/quotes)
if [ -f credentials.env ]; then
    set -a
    . ./credentials.env
    set +a
fi

# venv layout differs: Linux/macOS = bin, Windows (git-bash) = Scripts
if [ -f .venv/bin/activate ]; then
    . .venv/bin/activate
elif [ -f .venv/Scripts/activate ]; then
    . .venv/Scripts/activate
fi

mkdir -p logs

echo "Starting OTP Collector..."
python3 otp_collector.py >> logs/otp_console.log 2>&1 &
sleep 3

echo "Starting Main Bot..."
exec python3 main.py >> logs/main_console.log 2>&1
