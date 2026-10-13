import fs from "fs";
import util from "util";
const logFile = fs.createWriteStream("server.log", { flags: "a" });
console.log = function(...args) { const d = util.format(...args); logFile.write(d + "\n"); process.stdout.write(d + "\n"); };
console.error = function(...args) { const d = util.format(...args); logFile.write(d + "\n"); process.stderr.write(d + "\n"); };
import dotenv from 'dotenv';
import path from 'path';

// Always explicitly resolve .env relative to current working directory or file directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config(); // fallback

import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { startBot } from './server/bot/index';
import { apiRouter } from './server/api/routes';
import { initializeDb } from './server/db/index';
import { startWithdrawalSyncInterval } from './server/withdrawalSync';
import { automationService } from './server/scraper';

async function startServer() {
  await initializeDb();
  
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';
  const rawPort = process.env.PORT;
  const PORT = isProduction ? (rawPort ? parseInt(rawPort, 10) : 3010) : (rawPort ? parseInt(rawPort, 10) : 3000);

  console.log(`[Startup] Mode: ${process.env.NODE_ENV || 'development'}, Binding to PORT: ${PORT}`);

  app.set('trust proxy', 1);

  // Middleware
  // CORS: set CORS_ORIGINS (comma-separated) to restrict; the dashboard is same-origin so
  // production defaults to no cross-origin access. Browser extensions (chrome-extension://) are allowed.
  const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || !isProduction && corsOrigins.length === 0) return cb(null, true);
      if (origin.startsWith('chrome-extension://') || corsOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
  }));
  app.use(express.json());

  // Public health endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // API Routes
  app.use('/api', apiRouter);

  // Unhandled API routes should return JSON 404, not HTML
  app.use('/api/*all', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Serve Vite in development, or static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    
    // Start Telegram Bot in the background
    startBot();

    // Start Withdrawal File Sync (every 30 seconds)
    startWithdrawalSyncInterval(30000);

    // Auto-start Playwright Scraper if enabled
    if (process.env.SCRAPER_ENABLED === 'true' || automationService.getConfig().enabled) {
      console.log('🤖 Starting Playwright withdrawal scraper on server launch...');
      automationService.start().catch((err) => {
        console.error('Failed to auto-start automation crawler:', err);
      });
    }
  });
}

startServer();
