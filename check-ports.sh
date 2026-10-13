#!/bin/bash
# ==============================================================================
# Port Diagnostic & Binding Utility for 7bot.smsbd.io
# Checks ports 3000 and 3010, shows listening processes, and tests HTTP responses.
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "======================================================"
echo "🔍 7bot Diagnostic: Checking Ports & Processes"
echo "   Directory: $DIR"
echo "======================================================"

# 1. Check .env PORT setting
echo ""
echo "--- [1] Checking .env configuration ---"
if [ -f ".env" ]; then
    ENV_PORT=$(grep -E "^PORT=" .env | cut -d '=' -f2 | tr -d ' "' || true)
    echo "✅ .env file found. Defined PORT = ${ENV_PORT:-<empty>}"
else
    echo "⚠️  No .env file found in $DIR"
fi

# 2. Check Port 3000
echo ""
echo "--- [2] Inspecting Port 3000 ---"
P3000_PID=$(ss -tulpn 2>/dev/null | grep ':3000 ' | awk '{print $NF}' || true)
if [ -n "$P3000_PID" ]; then
    echo "⚠️  Port 3000 is IN USE by:"
    ss -tulpn | grep ':3000 '
    echo "Testing HTTP response on 3000:"
    curl -I -s --connect-timeout 2 http://127.0.0.1:3000 | head -n 4 || echo "Failed to connect to 3000"
else
    echo "✅ Port 3000 is FREE (No process listening)"
fi

# 3. Check Port 3010
echo ""
echo "--- [3] Inspecting Port 3010 ---"
P3010_PID=$(ss -tulpn 2>/dev/null | grep ':3010 ' | awk '{print $NF}' || true)
if [ -n "$P3010_PID" ]; then
    echo "✅ Port 3010 is ACTIVE and listening:"
    ss -tulpn | grep ':3010 '
    echo "Testing HTTP response on 3010:"
    curl -I -s --connect-timeout 2 http://127.0.0.1:3010 | head -n 4 || echo "Failed to connect to 3010"
else
    echo "❌ Port 3010 is NOT listening"
fi

# 4. Check PM2 status
echo ""
echo "--- [4] PM2 Process Status ---"
if command -v pm2 >/dev/null 2>&1; then
    pm2 status || true
else
    echo "pm2 command not found in current environment."
fi

echo ""
echo "======================================================"
echo "🎯 Diagnostic check completed."
echo "======================================================"
