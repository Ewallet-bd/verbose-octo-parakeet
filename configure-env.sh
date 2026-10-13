#!/usr/bin/env bash

# ==============================================================================
# Interactive Environment & Token Configuration Tool
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================================"
echo "⚙️  Environment & Telegram Bot Token Configuration"
echo "======================================================"

# Read existing values if .env exists
CURRENT_PORT="3010"
CURRENT_JWT=""
CURRENT_TOKEN=""
CURRENT_CHAT_ID=""

if [ -f ".env" ]; then
    CURRENT_PORT=$(grep '^PORT=' .env | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs || echo "3010")
    CURRENT_JWT=$(grep '^JWT_SECRET=' .env | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs || true)
    CURRENT_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' .env | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs || true)
    CURRENT_CHAT_ID=$(grep '^AUTHORIZED_CHAT_ID=' .env | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs || true)
    CURRENT_GEMINI_KEY=$(grep '^GEMINI_API_KEY=' .env | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs || true)
fi

echo ""
echo "1️⃣  Application Port:"
read -p "   Port (Current: ${CURRENT_PORT:-3010}): " IN_PORT
FINAL_PORT=${IN_PORT:-${CURRENT_PORT:-3010}}

echo ""
echo "2️⃣  JWT Secret (Authentication Security):"
if [ -z "$CURRENT_JWT" ]; then
    AUTO_JWT=$(openssl rand -hex 32 2>/dev/null || echo "jwt_sec_$(date +%s)_random")
    read -p "   Enter JWT_SECRET (Press Enter to auto-generate): " IN_JWT
    FINAL_JWT=${IN_JWT:-$AUTO_JWT}
else
    read -p "   Enter JWT_SECRET (Press Enter to keep current): " IN_JWT
    FINAL_JWT=${IN_JWT:-$CURRENT_JWT}
fi

echo ""
echo "3️⃣  Telegram Bot Token:"
echo "   (Open @BotFather in Telegram -> /mybots -> API Token)"
if [ -n "$CURRENT_TOKEN" ]; then
    echo "   Current Token: ${CURRENT_TOKEN:0:10}..."
fi
read -p "   Paste TELEGRAM_BOT_TOKEN (Press Enter to keep current): " IN_TOKEN
FINAL_TOKEN=${IN_TOKEN:-$CURRENT_TOKEN}
FINAL_TOKEN=$(echo "$FINAL_TOKEN" | xargs)

echo ""
echo "4️⃣  Primary Authorized Chat ID / Group ID (Optional):"
read -p "   Chat ID (Current: ${CURRENT_CHAT_ID}): " IN_CHAT_ID
FINAL_CHAT_ID=${IN_CHAT_ID:-$CURRENT_CHAT_ID}
FINAL_CHAT_ID=$(echo "$FINAL_CHAT_ID" | xargs)

echo ""
echo "5️⃣  Open-Source PaddleOCR Service Endpoint:"
echo "   (Local microservice URL; default is http://127.0.0.1:5000/ocr)"
CURRENT_PADDLE_URL=$(grep '^PADDLE_OCR_URL=' .env 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs || echo "http://127.0.0.1:5000/ocr")
read -p "   PaddleOCR URL (Current: ${CURRENT_PADDLE_URL:-http://127.0.0.1:5000/ocr}): " IN_PADDLE
FINAL_PADDLE_URL=${IN_PADDLE:-${CURRENT_PADDLE_URL:-http://127.0.0.1:5000/ocr}}
FINAL_PADDLE_URL=$(echo "$FINAL_PADDLE_URL" | xargs)

echo ""
echo "6️⃣  Database Engine (CloudPanel MySQL / phpMyAdmin or SQLite Fallback):"
CURRENT_DB_TYPE=$(grep '^DB_TYPE=' .env 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs || echo "sqlite")
CURRENT_DB_HOST=$(grep '^MYSQL_HOST=' .env 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs || echo "127.0.0.1")
CURRENT_DB_PORT=$(grep '^MYSQL_PORT=' .env 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs || echo "3306")
CURRENT_DB_NAME=$(grep '^MYSQL_DATABASE=' .env 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs || echo "payment_gateway")
CURRENT_DB_USER=$(grep '^MYSQL_USER=' .env 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs || echo "payment_user")
CURRENT_DB_PASS=$(grep '^MYSQL_PASSWORD=' .env 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs || echo "")

read -p "   Enable CloudPanel MySQL for phpMyAdmin? (Current: ${CURRENT_DB_TYPE}) (y/n, press Enter to keep current): " IN_USE_MYSQL
if [[ "$IN_USE_MYSQL" =~ ^[Yy]$ ]] || ([ -z "$IN_USE_MYSQL" ] && [ "$CURRENT_DB_TYPE" = "mysql" ]); then
    FINAL_DB_TYPE="mysql"
    read -p "   MySQL Host (Current: ${CURRENT_DB_HOST:-127.0.0.1}): " IN_DB_HOST
    FINAL_DB_HOST=${IN_DB_HOST:-${CURRENT_DB_HOST:-127.0.0.1}}
    read -p "   MySQL Port (Current: ${CURRENT_DB_PORT:-3306}): " IN_DB_PORT
    FINAL_DB_PORT=${IN_DB_PORT:-${CURRENT_DB_PORT:-3306}}
    read -p "   Database Name (Current: ${CURRENT_DB_NAME:-payment_gateway}): " IN_DB_NAME
    FINAL_DB_NAME=${IN_DB_NAME:-${CURRENT_DB_NAME:-payment_gateway}}
    read -p "   Database User (Current: ${CURRENT_DB_USER:-payment_user}): " IN_DB_USER
    FINAL_DB_USER=${IN_DB_USER:-${CURRENT_DB_USER:-payment_user}}
    read -p "   Database Password: " IN_DB_PASS
    FINAL_DB_PASS=${IN_DB_PASS:-$CURRENT_DB_PASS}
else
    FINAL_DB_TYPE="sqlite"
    FINAL_DB_HOST=${CURRENT_DB_HOST:-"127.0.0.1"}
    FINAL_DB_PORT=${CURRENT_DB_PORT:-"3306"}
    FINAL_DB_NAME=${CURRENT_DB_NAME:-"payment_gateway"}
    FINAL_DB_USER=${CURRENT_DB_USER:-"payment_user"}
    FINAL_DB_PASS=${CURRENT_DB_PASS:-""}
fi

# Write to .env
cat <<EOT > .env
PORT=$FINAL_PORT
JWT_SECRET=$FINAL_JWT
TELEGRAM_BOT_TOKEN=$FINAL_TOKEN
AUTHORIZED_CHAT_ID=$FINAL_CHAT_ID
PADDLE_OCR_URL=$FINAL_PADDLE_URL
DB_TYPE=$FINAL_DB_TYPE
MYSQL_HOST=$FINAL_DB_HOST
MYSQL_PORT=$FINAL_DB_PORT
MYSQL_DATABASE=$FINAL_DB_NAME
MYSQL_USER=$FINAL_DB_USER
MYSQL_PASSWORD=$FINAL_DB_PASS
EOT

echo ""
echo "======================================================"
echo "✅ .env file successfully configured!"
echo "======================================================"

# Ask to restart PM2 if running
DIR_NAME="$(basename "$SCRIPT_DIR")"
APP_NAME="${PM2_APP_NAME:-$DIR_NAME}"

if command -v pm2 &> /dev/null && pm2 list | grep -q "[[:space:]]$APP_NAME[[:space:]]"; then
    echo ""
    read -p "🔄 Would you like to restart PM2 app ($APP_NAME) now to apply changes? (Y/n): " RESTART_CHOICE
    if [[ ! "$RESTART_CHOICE" =~ ^[Nn]$ ]]; then
        pm2 restart "$APP_NAME"
        echo "🚀 $APP_NAME restarted successfully!"
        echo "📊 Showing logs (Press Ctrl+C to exit):"
        sleep 1
        pm2 logs "$APP_NAME" --lines 15
    fi
fi
