#!/usr/bin/env bash

# ==============================================================================
# CloudPanel & VPS Deployment Script for Node.js + PaddleOCR Telegram Bot
# Sets up fullstack server and open-source PaddleOCR microservice together.
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Auto-detect folder / domain name for unique PM2 process
DIR_NAME="$(basename "$SCRIPT_DIR")"
APP_NAME="${PM2_APP_NAME:-$DIR_NAME}"
export PM2_APP_NAME="$APP_NAME"

echo "======================================================"
echo "🚀 Starting Deployment for: $APP_NAME"
echo "📂 Working Directory: $SCRIPT_DIR"
echo "======================================================"

# 1. Check Node.js version
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js (v20+ recommended)."
    exit 1
fi
echo "✅ Node.js Version: $(node -v)"
echo "✅ NPM Version: $(npm -v)"

# 2. Check Python 3 for Open-Source PaddleOCR
if command -v python3 &> /dev/null; then
    echo "✅ Python 3 Version: $(python3 --version)"
    
    # Setup virtual environment for PaddleOCR if not present
    if [ ! -d "ocr_service/venv" ]; then
        echo "📦 Setting up Python virtual environment for PaddleOCR (ocr_service/venv)..."
        python3 -m venv ocr_service/venv || true
    fi
    
    if [ -f "ocr_service/venv/bin/pip" ]; then
        echo "📦 Installing PaddleOCR Python dependencies (this may take a minute on first run)..."
        ocr_service/venv/bin/pip install --upgrade pip --quiet || true
        ocr_service/venv/bin/pip install -r ocr_service/requirements.txt --quiet || true
        echo "✅ PaddleOCR dependencies installed successfully."
    else
        echo "ℹ️  Note: If python3-venv is missing, run: sudo apt install -y python3-venv python3-pip"
    fi
else
    echo "⚠️ Python 3 not detected. PaddleOCR requires Python 3. (You can also run PaddleOCR via Docker)"
fi

# Ensure start.sh has execute permissions
chmod +x ocr_service/start.sh 2>/dev/null || true

# 3. Verify or configure .env file
if [ ! -f ".env" ]; then
    echo "⚠️ .env file not found. Let's configure it now."
    
    # Prompt for Port (Pick unique default or prompt)
    read -p "🔹 Enter Application Port (Default: 3010): " INPUT_PORT
    PORT_VAL=${INPUT_PORT:-3010}

    # Prompt for JWT Secret
    AUTO_JWT=$(openssl rand -hex 32 2>/dev/null || echo "jwt_sec_$(date +%s)_random")
    read -p "🔹 Enter JWT_SECRET (Press Enter to auto-generate): " INPUT_JWT
    JWT_VAL=${INPUT_JWT:-$AUTO_JWT}

    # Prompt for Telegram Bot Token
    echo ""
    echo "🤖 Telegram Bot Token Configuration:"
    echo "   (You can get your token from @BotFather on Telegram)"
    read -p "🔹 Enter TELEGRAM_BOT_TOKEN: " INPUT_BOT_TOKEN
    BOT_TOKEN_VAL=$(echo "$INPUT_BOT_TOKEN" | xargs)

    # Prompt for Authorized Chat ID (Optional)
    read -p "🔹 Enter Primary Chat ID / Group ID (Optional, press Enter to skip): " INPUT_CHAT_ID
    CHAT_ID_VAL=$(echo "$INPUT_CHAT_ID" | xargs)

    # PaddleOCR URL default
    PADDLE_URL_VAL="http://127.0.0.1:5000/ocr"

    cat <<EOT > .env
PORT=$PORT_VAL
JWT_SECRET=$JWT_VAL
TELEGRAM_BOT_TOKEN=$BOT_TOKEN_VAL
AUTHORIZED_CHAT_ID=$CHAT_ID_VAL
PADDLE_OCR_URL=$PADDLE_URL_VAL
EOT
    echo "✅ .env configuration saved successfully."
else
    echo "✅ Found existing .env configuration."
    
    # Ensure PADDLE_OCR_URL is present in .env
    if ! grep -q "^PADDLE_OCR_URL=" .env; then
        echo "PADDLE_OCR_URL=http://127.0.0.1:5000/ocr" >> .env
        echo "✅ Added PADDLE_OCR_URL to .env"
    fi

    # Check if TELEGRAM_BOT_TOKEN is empty in existing .env
    EXISTING_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' .env | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs || true)
    if [ -z "$EXISTING_TOKEN" ]; then
        echo ""
        echo "⚠️ Note: TELEGRAM_BOT_TOKEN is currently empty in .env"
        read -p "🔹 Do you want to enter your TELEGRAM_BOT_TOKEN now? (y/N): " SETUP_TOKEN_CHOICE
        if [[ "$SETUP_TOKEN_CHOICE" =~ ^[Yy]$ ]]; then
            read -p "👉 Paste your TELEGRAM_BOT_TOKEN: " NEW_TOKEN
            NEW_TOKEN_CLEAN=$(echo "$NEW_TOKEN" | xargs)
            if [ -n "$NEW_TOKEN_CLEAN" ]; then
                sed -i "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=$NEW_TOKEN_CLEAN|" .env
                echo "✅ TELEGRAM_BOT_TOKEN updated in .env"
            fi
        fi
    fi
fi

# 4. Create logs directory for PM2
mkdir -p logs

# 5. Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install --production=false

# 6. Build fullstack app
echo "🔨 Building frontend and backend bundles (npm run build)..."
npm run build

if [ ! -f "dist/server.cjs" ] || [ ! -f "dist/index.html" ]; then
    echo "❌ Build verification failed! Make sure dist/server.cjs and dist/index.html exist."
    exit 1
fi
echo "✅ Build verified successfully."

# 7. Check and install PM2 if missing
if ! command -v pm2 &> /dev/null; then
    echo "⚡ PM2 not found. Installing PM2 globally..."
    npm install -g pm2
fi

# 8. Start/Restart application and PaddleOCR service via PM2 ecosystem
echo "🔄 Managing PM2 processes via ecosystem.config.cjs..."
pm2 startOrReload ecosystem.config.cjs --update-env

# 9. Save PM2 state for automatic reboot persistence
pm2 save

echo "======================================================"
echo "🎉 Deployment Completed Successfully!"
echo "📡 Node.js Server: Port $(grep '^PORT=' .env | cut -d '=' -f2 || echo '3010')"
echo "🔍 PaddleOCR Service: Port 5000 (Open-Source Unlimited)"
echo "📊 Run 'pm2 logs' to view real-time logs."
echo "======================================================"
