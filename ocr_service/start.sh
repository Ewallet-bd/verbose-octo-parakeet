#!/usr/bin/env bash

# Startup script for PaddleOCR microservice
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PORT="${PORT:-5000}"

# Find Python executable
if [ -d "venv" ] && [ -f "venv/bin/python" ]; then
    PYTHON_CMD="venv/bin/python"
    UVICORN_CMD="venv/bin/uvicorn"
elif command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
    UVICORN_CMD="uvicorn"
else
    echo "❌ Python 3 is not installed. Please install Python 3."
    exit 1
fi

echo "🚀 Starting PaddleOCR microservice on port $PORT..."

# Run via uvicorn module if available, or direct python
if [ -f "$UVICORN_CMD" ]; then
    exec "$UVICORN_CMD" app:app --host 0.0.0.0 --port "$PORT"
else
    exec "$PYTHON_CMD" -m uvicorn app:app --host 0.0.0.0 --port "$PORT"
fi
