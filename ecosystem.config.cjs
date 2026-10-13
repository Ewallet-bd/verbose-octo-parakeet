const path = require('path');
const appName = process.env.PM2_APP_NAME || path.basename(__dirname);

module.exports = {
  apps: [
    {
      name: appName,
      script: "dist/server.cjs",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 3010,
        PADDLE_OCR_URL: "http://127.0.0.1:5000/ocr"
      },
      env_file: path.join(__dirname, ".env"),
      time: true
    },
    {
      name: `${appName}-paddleocr`,
      script: path.join(__dirname, "ocr_service", "start.sh"),
      cwd: path.join(__dirname, "ocr_service"),
      instances: 1,
      autorestart: true,
      watch: false,
      interpreter: "bash",
      max_memory_restart: "1500M",
      env: {
        PORT: 5000,
        PYTHONUNBUFFERED: "1"
      },
      time: true
    }
  ]
};
