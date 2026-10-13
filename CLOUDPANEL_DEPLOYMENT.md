# CloudPanel & VPS Deployment Guide (Full-Stack Node.js & PaddleOCR Telegram Bot)

This guide walks you through deploying the **Payment Router & Telegram Bot System** with **100% Open-Source PaddleOCR** on any **CloudPanel** or **Ubuntu/Debian VPS** server using **PM2** or **Docker**.

---

## 1. Quick Overview

- **Web & Bot App:** Express 5 + Vite (React 19) + SQLite (LibSQL / Drizzle ORM) + Grammy (Telegram Bot)
- **OCR Engine:** 100% Open-Source PaddleOCR (FastAPI microservice, port `5000`, zero external API limits)
- **Deployment Process:** One command `./deploy.sh` builds Node.js, sets up PaddleOCR Python environment, and launches both with **PM2**!

---

## 2. Server Prerequisites (Ubuntu / Debian VPS)

Install system dependencies for Node.js and Python PaddleOCR:
```bash
sudo apt update
sudo apt install -y curl git python3 python3-pip python3-venv libgl1 libglib2.0-0
```

---

## 3. Automated Setup (Single Command)

Upload or clone the project into your server directory:
```bash
cd /home/<SITE_USER>/htdocs/<DOMAIN>   # or your project folder on VPS
chmod +x deploy.sh configure-env.sh ocr_service/start.sh
./deploy.sh
```

### What `./deploy.sh` automatically does:
1. Installs Node.js dependencies (`npm install`).
2. Builds React frontend and Express backend (`npm run build`).
3. Automatically sets up Python virtualenv (`ocr_service/venv`) and installs PaddleOCR.
4. Generates `.env` with `PADDLE_OCR_URL=http://127.0.0.1:5000/ocr` (No Gemini API key needed).
5. Launches **BOTH** the Node.js server and the PaddleOCR microservice using `pm2 start ecosystem.config.cjs`.
6. Saves PM2 configuration for automatic startup on server reboot (`pm2 save`).

---

## 4. PM2 Process Management

PM2 will manage two processes together:
1. `<app-name>`: Node.js server & Telegram Bot (Port 3010 / 3000)
2. `<app-name>-paddleocr`: PaddleOCR Python microservice (Port 5000)

```bash
# Check status of both services
pm2 status

# View live logs
pm2 logs

# View only bot logs
pm2 logs <app-name>

# View only OCR logs
pm2 logs <app-name>-paddleocr

# Restart everything
pm2 restart all
```

---

## 5. Alternative: Deploying with Docker Compose

If your VPS has Docker installed, you can launch everything in one command:
```bash
docker compose up -d --build
```
This starts:
- `telecom_bot_app` (Node.js web & bot)
- `telecom_paddleocr_engine` (PaddleOCR microservice)

---

## 6. Verification
Open your Admin Dashboard and visit **Settings**:
- In **সার্ভিস কানেকশন স্ট্যাটাস (Service Connection Health)**:
  - **PaddleOCR Engine (Open Source):** Shows `Online & Active (Unlimited • No API Limit)`.
  - **Telegram Bot API:** Shows `Healthy (Bot Polling Active)`.
