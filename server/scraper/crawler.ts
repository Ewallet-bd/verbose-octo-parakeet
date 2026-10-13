import { chromium, Browser, BrowserContext, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { paymentRequests, auditLogs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { bot, getActionKeyboard } from '../bot';
import { scheduleOrderReminder } from '../bot/reminderService';
import { 
  AutomationStatusType, 
  ScraperConfig, 
  AutomationLog, 
  ScrapedOrder, 
  AutomationStatus 
} from './types';
import { parseRawOrder } from './orderParser';
import { 
  getSessionFilePath, 
  hasStoredSession, 
  clearStoredSession, 
  loadSavedConfig, 
  saveConfigToFile 
} from './sessionManager';

export class AutomationCrawler {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  
  private status: AutomationStatusType = 'IDLE';
  private isRunning: boolean = false;
  private isLoggedIn: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  
  private otpResolver: ((otp: string) => void) | null = null;
  private otpRejecter: ((err: any) => void) | null = null;
  private otpTimeoutTimer: NodeJS.Timeout | null = null;
  private otpRequestedAt: number | null = null;
  private otpExpiresAt: number | null = null;
  private otpPromptMessage: string = '';
  private hasCaptcha: boolean = false;
  private captchaDetails: string = '';

  private logs: AutomationLog[] = [];
  private maxLogs = 100;

  private totalOrdersFetched: number = 0;
  private totalOrdersImported: number = 0;
  private totalOrdersDuplicates: number = 0;
  private lastPollAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private lastError: string | null = null;

  private config: ScraperConfig = {
    portalUrl: process.env.SCRAPER_PORTAL_URL || 'https://example.com/portal/login',
    username: process.env.SCRAPER_USERNAME || '',
    password: process.env.SCRAPER_PASSWORD || '',
    pollIntervalSeconds: parseInt(process.env.SCRAPER_POLL_INTERVAL || '20', 10),
    enabled: process.env.SCRAPER_ENABLED === 'true',
    headless: true,
    autoLogin: true,
    notifyTelegramOnNewOrders: true,
    notifyTelegramOnLoginLogout: true,
    usernameSelector: 'input[name="username"], input[name="email"], input[type="text"]',
    passwordSelector: 'input[name="password"], input[type="password"]',
    submitSelector: 'button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("সাইন ইন")',
    otpSelector: 'input[name="otp"], input[name="code"], input[placeholder*="OTP"], input[placeholder*="কোড"]',
    otpSubmitSelector: 'button:has-text("Verify"), button:has-text("Submit"), button:has-text("যাচাই")',
    ordersUrl: process.env.SCRAPER_ORDERS_URL || '',
    tableSelector: 'table, .withdrawal-table, .order-list',
    autoReloadOnCaptcha: true,
    captchaSelector: '',
  };

  constructor() {
    const saved = loadSavedConfig();
    if (saved) {
      this.config = { ...this.config, ...saved };
    }
    this.addLog('INFO', 'Playwright automation daemon initialized');
  }

  public addLog(level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string, details?: any) {
    const entry: AutomationLog = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      level,
      message,
      details,
    };
    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
    if (level === 'ERROR') {
      this.lastError = message;
      console.error(`[Scraper ${level}]`, message, details || '');
    } else {
      console.log(`[Scraper ${level}]`, message);
    }
  }

  public getLogs(limit: number = 50): AutomationLog[] {
    return this.logs.slice(0, limit);
  }

  public clearLogs() {
    this.logs = [];
    this.addLog('INFO', 'Logs cleared by operator');
  }

  public getStatus(): AutomationStatus {
    return {
      status: this.status,
      isRunning: this.isRunning,
      isLoggedIn: this.isLoggedIn,
      hasStoredSession: hasStoredSession(),
      awaitingOtp: this.status === 'AWAITING_OTP',
      hasCaptcha: this.hasCaptcha,
      captchaDetails: this.captchaDetails || undefined,
      otpPromptMessage: this.otpPromptMessage,
      otpRequestedAt: this.otpRequestedAt || undefined,
      otpExpiresAt: this.otpExpiresAt || undefined,
      lastPollAt: this.lastPollAt || undefined,
      lastSuccessAt: this.lastSuccessAt || undefined,
      lastError: this.lastError || undefined,
      totalOrdersFetched: this.totalOrdersFetched,
      totalOrdersImported: this.totalOrdersImported,
      totalOrdersDuplicates: this.totalOrdersDuplicates,
      currentUrl: this.page ? this.page.url() : undefined,
      screenshot: this.page ? (() => {
        try {
          // Return base64 png asynchronously or cached if possible, but getStatus is synchronous.
          // Instead, let's keep a cached latest screenshot base64 property on the class!
          return (this as any).cachedScreenshotBase64 || undefined;
        } catch {
          return undefined;
        }
      })() : undefined,
      config: {
        ...this.config,
        password: this.config.password ? '••••••••' : '',
      },
    };
  }

  public getConfig(): ScraperConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<ScraperConfig>) {
    // Preserve password if empty string provided
    const password = newConfig.password && newConfig.password !== '••••••••' 
      ? newConfig.password 
      : this.config.password;

    this.config = {
      ...this.config,
      ...newConfig,
      password,
    };

    saveConfigToFile(this.config);
    this.addLog('INFO', 'Scraper configuration updated');
    return this.getStatus();
  }

  /**
   * Initializes Playwright browser and context
   */
  private async initBrowser(): Promise<boolean> {
    try {
      if (this.browser && this.browser.isConnected()) {
        return true;
      }

      this.addLog('INFO', 'Launching Playwright Chromium browser...');
      this.browser = await chromium.launch({
        headless: this.config.headless !== false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
        ],
      });

      const sessionPath = getSessionFilePath();
      const sessionExists = hasStoredSession();

      if (sessionExists) {
        this.addLog('INFO', 'Restoring authenticated session from storage_state');
        this.context = await this.browser.newContext({
          storageState: sessionPath,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          viewport: { width: 1280, height: 800 },
        });
      } else {
        this.context = await this.browser.newContext({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          viewport: { width: 1280, height: 800 },
        });
      }

      this.page = await this.context.newPage();

      // Start periodic screenshot updater for live live dashboard view
      this.startScreenshotLoop();

      // Intercept API responses for high-speed direct JSON order ingestion
      this.page.on('response', async (response) => {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const url = response.url();
            if (url.includes('withdraw') || url.includes('payout') || url.includes('orders') || url.includes('cashout')) {
              const json = await response.json();
              if (Array.isArray(json) || (json && (Array.isArray(json.data) || Array.isArray(json.orders) || Array.isArray(json.list)))) {
                this.addLog('INFO', `Discovered orders JSON API response from ${url}`);
                const items = Array.isArray(json) ? json : (json.data || json.orders || json.list);
                await this.processRawOrderItems(items);
              }
            }
          }
        } catch {
          // Ignore non-json or aborted response errors
        }
      });

      return true;
    } catch (err: any) {
      this.addLog('ERROR', `Failed to launch Playwright browser: ${err.message}`, err.stack);
      return false;
    }
  }

  /**
   * Starts the automation crawler
   */
  public async start(): Promise<{ success: boolean; message: string }> {
    if (this.isRunning) {
      return { success: true, message: 'Automation crawler is already running' };
    }

    this.isRunning = true;
    this.status = 'LOGGING_IN';
    this.addLog('INFO', 'Starting automation crawler service');

    // Launch in background
    this.runAutomationLoop().catch((err) => {
      this.addLog('ERROR', `Fatal error in automation loop: ${err.message}`);
      this.status = 'ERROR';
    });

    return { success: true, message: 'Automation crawler started successfully' };
  }

  private cachedScreenshotBase64: string | null = null;
  private screenshotTimer: NodeJS.Timeout | null = null;

  private startScreenshotLoop() {
    if (this.screenshotTimer) clearInterval(this.screenshotTimer);
    this.screenshotTimer = setInterval(async () => {
      if (!this.page || !this.isRunning) return;
      try {
        const buf = await this.page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
        this.cachedScreenshotBase64 = `data:image/jpeg;base64,${buf.toString('base64')}`;
      } catch {
        // Ignore screenshot errors when navigating or closed
      }
    }, 2000);
  }

  /**
   * Stops the automation crawler and clears timers
   */
  public async stop(): Promise<{ success: boolean; message: string }> {
    this.isRunning = false;
    this.status = 'PAUSED';

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.screenshotTimer) {
      clearInterval(this.screenshotTimer);
      this.screenshotTimer = null;
    }
    this.cachedScreenshotBase64 = null;

    if (this.otpTimeoutTimer) {
      clearTimeout(this.otpTimeoutTimer);
      this.otpTimeoutTimer = null;
    }

    if (this.otpRejecter) {
      this.otpRejecter(new Error('Automation stopped by user'));
      this.otpResolver = null;
      this.otpRejecter = null;
    }

    try {
      if (this.context) {
        await this.context.close().catch(() => {});
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }
      this.page = null;
    } catch (e) {
      // Ignore close errors
    }

    this.addLog('INFO', 'Automation crawler stopped');
    return { success: true, message: 'Automation crawler stopped' };
  }

  /**
   * Clears saved cookies session state
   */
  public clearSession(): boolean {
    const cleared = clearStoredSession();
    this.isLoggedIn = false;
    this.addLog('INFO', 'Cleared stored browser session state');
    return cleared;
  }

  /**
   * Submits OTP code received via Telegram Bot or Web UI
   */
  public async submitOtp(code: string, source: 'TELEGRAM' | 'WEB'): Promise<{ success: boolean; message: string }> {
    const cleanCode = code.trim().replace(/\D/g, '') || code.trim();

    if (!cleanCode || cleanCode.length < 2) {
      return { 
        success: false, 
        message: 'Invalid OTP format. Please provide a valid code.' 
      };
    }

    this.addLog('SUCCESS', `Received OTP code (${cleanCode}) via ${source}`);

    if (this.otpResolver) {
      // Resolve active prompt so ensureAuthenticated handles filling and submitting once cleanly without double submit / reload
      const resolver = this.otpResolver;
      this.otpResolver = null;
      this.otpRejecter = null;
      if (this.otpTimeoutTimer) {
        clearTimeout(this.otpTimeoutTimer);
        this.otpTimeoutTimer = null;
      }
      this.status = 'LOGGING_IN';
      resolver(cleanCode);

      return { 
        success: true, 
        message: `OTP (${cleanCode}) accepted and submitted to login flow!` 
      };
    }

    // Fallback if not currently awaiting in promise: fill DOM directly
    if (this.page) {
      try {
        const otpSelectors = [
          'input[name*="otp" i]', 'input[placeholder*="otp" i]', 'input[id*="otp" i]',
          'input[type="number"]', '#otp', '.otp-input', 'input[name*="code" i]',
          'input[name*="token" i]', 'input.otp', 'input[maxlength="6"]'
        ];
        for (const sel of otpSelectors) {
          const el = await this.page.$(sel);
          if (el) {
            await el.fill(cleanCode);
            this.addLog('INFO', `Filled OTP into selector: ${sel}`);
            const submitBtn = await this.page.$('button[type="submit"], input[type="submit"], button:has-text("Verify"), button:has-text("Submit"), button:has-text("ওটিপি")');
            if (submitBtn) {
              await submitBtn.click();
              this.addLog('INFO', 'Clicked OTP submit button');
            }
            break;
          }
        }
      } catch (fillErr) {
        console.warn('Could not auto-fill OTP in DOM:', fillErr);
      }
    }

    this.status = 'LOGGING_IN';

    return { 
      success: true, 
      message: `OTP (${cleanCode}) submitted to browser successfully!` 
    };
  }

  /**
   * Manually reloads the browser page
   */
  public async reloadPage(): Promise<{ success: boolean; message: string }> {
    if (!this.page) {
      return { success: false, message: 'Browser page not available' };
    }
    try {
      this.addLog('INFO', 'Manual page reload requested by operator');
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      this.addLog('SUCCESS', 'Page reloaded successfully');
      return { success: true, message: 'Page reloaded successfully' };
    } catch (err: any) {
      this.addLog('ERROR', `Failed to reload page: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  /**
   * Captures screenshot of current browser page for live view
   */
  public async getScreenshot(): Promise<string | null> {
    if (!this.page) return null;
    try {
      const buffer = await this.page.screenshot({ type: 'jpeg', quality: 70 });
      const base64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
      (this as any).cachedScreenshotBase64 = base64;
      return base64;
    } catch (err) {
      return null;
    }
  }

  /**
   * Core automation lifecycle loop
   */
  private async runAutomationLoop() {
    const browserReady = await this.initBrowser();
    if (!browserReady || !this.page) {
      this.status = 'ERROR';
      return;
    }

    try {
      // Check if current session is authenticated or needs login
      const authenticated = await this.ensureAuthenticated();
      if (!authenticated) {
        if (this.isRunning) {
          this.status = 'ERROR';
          this.addLog('ERROR', 'Authentication failed. Please verify credentials or OTP.');
        }
        return;
      }

      this.status = 'ACTIVE_POLLING';
      this.isLoggedIn = true;
      this.addLog('SUCCESS', 'Authentication verified. Starting withdrawal order polling loop.');

      // Run initial scrape immediately
      await this.scrapeOrdersOnce();

      // Schedule periodic polling
      const intervalMs = Math.max(10, this.config.pollIntervalSeconds) * 1000;
      this.pollTimer = setInterval(async () => {
        if (!this.isRunning) return;
        try {
          await this.scrapeOrdersOnce();
        } catch (err: any) {
          this.addLog('WARN', `Error during scheduled poll: ${err.message}`);
        }
      }, intervalMs);

    } catch (err: any) {
      this.status = 'ERROR';
      this.addLog('ERROR', `Automation runtime error: ${err.message}`);
    }
  }

  /**
   * Detects if a CAPTCHA or verification challenge is present on the active page
   */
  private async checkForCaptcha(): Promise<{ detected: boolean; details?: string }> {
    if (!this.page) return { detected: false };

    try {
      // 1. Check custom selector if provided
      if (this.config.captchaSelector && this.config.captchaSelector.trim()) {
        const customEl = await this.page.$(this.config.captchaSelector.trim());
        if (customEl) {
          const isVis = await customEl.isVisible().catch(() => true);
          if (isVis) return { detected: true, details: `Custom selector: ${this.config.captchaSelector}` };
        }
      }

      // 2. Common captcha input fields
      const inputSelectors = [
        'input[name*="captcha" i]',
        'input[id*="captcha" i]',
        'input[placeholder*="captcha" i]',
        'input[name*="verification" i]',
        'input[id*="verification" i]',
        'input[placeholder*="ভেরিফিকেশন" i]',
        'input[placeholder*="ক্যাপচা" i]',
        'input[name*="security_code" i]',
        'input[name*="auth_code" i]'
      ];

      for (const sel of inputSelectors) {
        const el = await this.page.$(sel);
        if (el) {
          const isVis = await el.isVisible().catch(() => true);
          if (isVis) return { detected: true, details: `Captcha input field (${sel})` };
        }
      }

      // 3. Captcha images, canvases, or widgets
      const mediaSelectors = [
        'img[src*="captcha" i]',
        'img[id*="captcha" i]',
        'img[class*="captcha" i]',
        'img[alt*="captcha" i]',
        'img[src*="verification" i]',
        'canvas[id*="captcha" i]',
        'canvas[class*="captcha" i]',
        '.captcha',
        '#captcha',
        '.captcha-box',
        '.g-recaptcha',
        '.h-recaptcha',
        '.cf-turnstile',
        '.geetest_holder',
        'iframe[src*="recaptcha" i]',
        'iframe[src*="hcaptcha" i]',
        'iframe[src*="turnstile" i]',
        'iframe[src*="captcha" i]'
      ];

      for (const sel of mediaSelectors) {
        const el = await this.page.$(sel);
        if (el) {
          const isVis = await el.isVisible().catch(() => true);
          if (isVis) return { detected: true, details: `Captcha element/widget (${sel})` };
        }
      }

      // 4. Text-based detection on page
      const hasCaptchaText = await this.page.evaluate(() => {
        const text = (document.body?.innerText || '').toLowerCase();
        return (
          text.includes('enter captcha') ||
          text.includes('invalid captcha') ||
          text.includes('ক্যাপচা') ||
          text.includes('enter the code shown') ||
          text.includes('please solve the captcha')
        );
      }).catch(() => false);

      if (hasCaptchaText) {
        return { detected: true, details: 'Captcha text detected on page' };
      }
    } catch {
      // Ignore detection errors
    }

    return { detected: false };
  }

  /**
   * Ensures the session is logged in, prompting for OTP if required
   */
  private async ensureAuthenticated(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const targetUrl = this.config.ordersUrl || this.config.portalUrl;
      this.addLog('INFO', `Navigating to ${targetUrl} to check session...`);
      await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Check if already on authenticated page
      const currentUrl = this.page.url();
      const hasLoginForm = await this.page.$(this.config.usernameSelector || 'input[name="username"]');

      if (!hasLoginForm && (currentUrl.includes('dashboard') || currentUrl.includes('admin') || currentUrl.includes('withdraw') || hasStoredSession())) {
        this.addLog('SUCCESS', 'Active session restored without requiring login');
        return true;
      }

      // Needs login
      if (!this.config.username || !this.config.password) {
        this.addLog('WARN', 'No portal credentials configured. Set username and password in settings.');
        return false;
      }

      if (this.config.portalUrl && currentUrl !== this.config.portalUrl) {
        await this.page.goto(this.config.portalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }

      await this.page.waitForTimeout(1000);

      // 1. Check for CAPTCHA (No automatic reload, prompt manual intervention)
      const preCheck = await this.checkForCaptcha();
      if (preCheck.detected) {
        this.hasCaptcha = true;
        this.captchaDetails = preCheck.details || 'Captcha detected on login page';
        this.status = 'AWAITING_CAPTCHA';
        this.addLog('ERROR', `🚨 CAPTCHA DETECTED! Manual intervention required: ${this.captchaDetails}`);
        await this.sendTelegramNotification(
          `⚠️ <b>[AUTOMATION] ক্যাপচা ডিটেক্ট হয়েছে! (CAPTCHA Alert)</b>\n\n` +
          `🔒 পোর্টাল লগইনে ক্যাপচা ভেরিফিকেশন এসেছে: <code>${this.captchaDetails}</code>\n` +
          `👤 ইউজার: <code>${this.config.username || 'N/A'}</code>\n` +
          `💻 অনুগ্রহ করে ড্যাশবোর্ডে গিয়ে ম্যানুয়ালি ক্যাপচা সমাধান করুন।`
        );
      }

      this.addLog('INFO', 'Submitting username and password credentials...');

      // Fill credentials
      await this.page.fill(this.config.usernameSelector || 'input[name="username"]', this.config.username);
      await this.page.fill(this.config.passwordSelector || 'input[name="password"]', this.config.password);
      
      // Click submit
      await this.page.click(this.config.submitSelector || 'button[type="submit"]');
      await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await this.page.waitForTimeout(1500);

      // 2. Check if CAPTCHA appeared AFTER submitting login credentials
      const postSubmitCaptcha = await this.checkForCaptcha();
      if (postSubmitCaptcha.detected) {
        this.hasCaptcha = true;
        this.captchaDetails = postSubmitCaptcha.details || 'Captcha detected after login submit';
        this.status = 'AWAITING_CAPTCHA';
        this.addLog('ERROR', `🚨 CAPTCHA DETECTED! Manual intervention required after login: ${this.captchaDetails}`);
        await this.sendTelegramNotification(
          `⚠️ <b>[AUTOMATION] ক্যাপচা ডিটেক্ট হয়েছে (লগিন সাবমিট করার পর)!</b>\n\n` +
          `🔒 ক্যাপচা: <code>${this.captchaDetails}</code>\n` +
          `👤 ইউজার: <code>${this.config.username || 'N/A'}</code>\n` +
          `💻 অনুগ্রহ করে ড্যাশবোর্ডে গিয়ে ম্যানুয়ালি ক্যাপচা সমাধান করুন।`
        );
      }

      // Check if OTP input or dashboard appeared (with polling wait)
      const otpSelector = this.config.otpSelector || 'input[name="otp"], input[name*="otp" i], input[id*="otp" i], input[placeholder*="otp" i], input[name*="code" i], input[name*="token" i]';
      
      let isOtpPage = false;
      let isDashboard = false;

      for (let attempt = 0; attempt < 12; attempt++) {
        const currentUrl = this.page.url();
        const hasOtp = await this.page.$(otpSelector).catch(() => null);
        const hasDashboard = await this.page.$('table, .withdrawal-table, .order-list, .dashboard, a[href*="logout"], .user-profile').catch(() => null);

        if (hasOtp) {
          isOtpPage = true;
          break;
        }
        if (hasDashboard && !currentUrl.includes('login') && !currentUrl.includes('signin')) {
          isDashboard = true;
          break;
        }
        await this.page.waitForTimeout(1000);
      }

      if (isOtpPage) {
        this.addLog('WARN', '2FA / OTP verification requested by portal. Awaiting operator input...');
        const otpCode = await this.requestOtpFromUser();
        
        this.addLog('INFO', `Filling OTP code into login form...`);
        const otpEl = await this.page.$(otpSelector);
        if (otpEl) {
          await otpEl.fill(otpCode);
        } else {
          await this.page.type(otpSelector, otpCode);
        }
        
        const otpSubmit = await this.page.$(this.config.otpSubmitSelector || 'button[type="submit"], button:has-text("Verify"), button:has-text("Submit"), button:has-text("ওটিপি")');
        if (otpSubmit) {
          await otpSubmit.click();
        } else {
          await this.page.press(otpSelector, 'Enter');
        }

        await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        await this.page.waitForTimeout(2000);
      }

      // Save new authenticated state
      if (this.context) {
        const sessionPath = getSessionFilePath();
        await this.context.storageState({ path: sessionPath });
        this.addLog('SUCCESS', 'Saved authenticated session cookies to storage_state.json');
      }

      // Notify Telegram on successful login
      await this.sendTelegramNotification(
        `🟢 <b>[AUTOMATION] পোর্টাল লগইন সফল!</b>\n\n` +
        `👤 ইউজার: <code>${this.config.username || 'N/A'}</code>\n` +
        `🌐 পোর্টাল: <a href="${this.config.portalUrl}">${this.config.portalUrl}</a>\n` +
        `⏰ সময়: ${new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' })}`
      );

      return true;
    } catch (err: any) {
      this.addLog('ERROR', `Authentication check failed: ${err.message}`);
      
      // Notify Telegram on logout / auth failure
      await this.sendTelegramNotification(
        `🔴 <b>[AUTOMATION] পোর্টাল লগআউট বা সেশন এক্সপায়ারড!</b>\n\n` +
        `⚠️ কারণ: ${err.message}\n` +
        `👤 ইউজার: <code>${this.config.username || 'N/A'}</code>\n` +
        `⏰ সময়: ${new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' })}`
      );

      return false;
    }
  }

  /**
   * Helper to send Telegram notifications if enabled
   */
  private async sendTelegramNotification(htmlMessage: string): Promise<void> {
    if (this.config.notifyTelegramOnLoginLogout === false) return;
    if (bot && process.env.AUTHORIZED_CHAT_ID) {
      try {
        await bot.api.sendMessage(process.env.AUTHORIZED_CHAT_ID, htmlMessage, { parse_mode: 'HTML' });
      } catch (tgErr: any) {
        console.error('Failed to send Telegram notification:', tgErr);
      }
    }
  }

  /**
   * Suspends flow and requests OTP from Telegram Bot and Web Dashboard
   */
  private async requestOtpFromUser(): Promise<string> {
    this.status = 'AWAITING_OTP';
    this.otpRequestedAt = Date.now();
    this.otpExpiresAt = Date.now() + 3 * 60 * 1000; // 3 minutes timeout
    this.otpPromptMessage = 'লগিনের জন্য OTP কোড প্রদান করুন (Telegram চ্যাটে অথবা ড্যাশবোর্ডে)';

    // Send Telegram Notification
    if (bot && process.env.AUTHORIZED_CHAT_ID) {
      const msg = `⚠️ <b>[AUTOMATION] OTP কোড প্রয়োজন!</b>\n\n` +
        `সাইটে লগিন করার জন্য ২-স্টেপ ভেরিফিকেশন (OTP) কোড চাওয়া হয়েছে।\n\n` +
        `📱 <b>Telegram-এ দেওয়ার নিয়ম:</b>\n` +
        `এই চ্যাটে সরাসরি শুধু OTP কোডটি টাইপ করে পাঠান (যেমন: <code>123456</code>)।\n\n` +
        `💻 অথবা ড্যাশবোর্ডের <b>Automation Tab</b> এ গিয়ে সাবমিট করুন।\n` +
        `⏱️ <i>মেয়াদ: ৩ মিনিট</i>`;

      try {
        await bot.api.sendMessage(process.env.AUTHORIZED_CHAT_ID, msg, { parse_mode: 'HTML' });
      } catch (tgErr: any) {
        console.error('Failed to dispatch OTP notification to Telegram:', tgErr);
      }
    }

    return new Promise<string>((resolve, reject) => {
      this.otpResolver = resolve;
      this.otpRejecter = reject;

      this.otpTimeoutTimer = setTimeout(() => {
        this.status = 'ERROR';
        this.otpResolver = null;
        this.otpRejecter = null;
        this.addLog('ERROR', 'OTP input timed out after 3 minutes');
        reject(new Error('OTP input timed out after 3 minutes'));
      }, 3 * 60 * 1000);
    });
  }

  /**
   * Scrapes withdrawal orders from the active portal page
   */
  public async scrapeOrdersOnce(): Promise<{ fetched: number; imported: number; duplicates: number }> {
    this.lastPollAt = Date.now();

    if (!this.page) {
      this.addLog('WARN', 'Browser page not available for scraping');
      return { fetched: 0, imported: 0, duplicates: 0 };
    }

    try {
      const targetUrl = this.config.ordersUrl || this.config.portalUrl;
      this.addLog('INFO', `Refreshing orders page: ${targetUrl}`);
      
      await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await this.page.waitForTimeout(2000); // Allow dynamic table rendering

      // Extract rows from DOM table
      const rawRows = await this.page.$$eval('table tr, .withdrawal-row, .order-item', (elements) => {
        return elements.map((el) => {
          const cells = Array.from(el.querySelectorAll('td, th, span, div')).map((c) => c.textContent?.trim() || '');
          const rowText = el.textContent?.trim() || '';
          return { text: rowText, cells };
        });
      });

      this.addLog('INFO', `Extracted ${rawRows.length} raw rows from portal table`);

      const parsedOrders: ScrapedOrder[] = [];

      for (const row of rawRows) {
        if (!row.text || row.cells.length < 3) continue;

        // Try extracting order pattern
        // e.g., ["#10023", "01712345678", "BKASH", "5000", "Pending"]
        let potentialId = '';
        let potentialPhone = '';
        let potentialAmount = 0;
        let potentialMethod = 'BKASH';

        for (const cell of row.cells) {
          if (!potentialId && (/^(ORD|WD|REQ|TX|#)?\d{4,12}$/i.test(cell) || /^#\w+/.test(cell))) {
            potentialId = cell.replace(/^#/, '');
          }
          if (!potentialPhone && /(^01[3-9]\d{8}$)|(^\+?8801[3-9]\d{8}$)/.test(cell.replace(/\s+/g, ''))) {
            potentialPhone = cell.replace(/\s+/g, '');
          }
          if (potentialAmount === 0 && (/^(?:BDT|TK|৳)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:BDT|TK|৳)?$/i.test(cell))) {
            const num = parseFloat(cell.replace(/[^0-9.]/g, ''));
            if (!isNaN(num) && num > 0) potentialAmount = num;
          }
          if (/(bkash|বিকাশ|nagad|নগদ|rocket|রকেট|upay)/i.test(cell)) {
            potentialMethod = cell;
          }
        }

        if (potentialId && potentialPhone && potentialAmount > 0) {
          const order = parseRawOrder({
            orderId: potentialId,
            walletNumber: potentialPhone,
            amount: potentialAmount,
            paymentMethod: potentialMethod,
            status: 'PENDING',
          });
          if (order) {
            parsedOrders.push(order);
          }
        }
      }

      const result = await this.processRawOrderItems(parsedOrders);
      this.lastSuccessAt = Date.now();
      return result;

    } catch (err: any) {
      this.addLog('WARN', `Scrape cycle error: ${err.message}`);
      return { fetched: 0, imported: 0, duplicates: 0 };
    }
  }

  /**
   * Processes a list of raw or scraped orders and stores new ones into MySQL / SQLite
   */
  public async processRawOrderItems(items: any[]): Promise<{ fetched: number; imported: number; duplicates: number }> {
    if (!Array.isArray(items) || items.length === 0) {
      return { fetched: 0, imported: 0, duplicates: 0 };
    }

    let fetched = items.length;
    let imported = 0;
    let duplicates = 0;

    for (const item of items) {
      const order = parseRawOrder(item);
      if (!order) continue;

      // Check for deduplication in database
      const existing = await db
        .select()
        .from(paymentRequests)
        .where(eq(paymentRequests.requestId, String(order.orderId)))
        .limit(1);

      if (existing.length === 0) {
        // New order! Insert into database
        const insertData = {
          requestId: String(order.orderId),
          paymentMethod: order.paymentMethod,
          walletNumber: order.walletNumber,
          amount: order.amount,
          status: 'PENDING',
          createdAt: Date.now(),
          rawMessage: JSON.stringify(order.raw || order),
        };

        await db.insert(paymentRequests).values(insertData);
        imported++;

        // Schedule order reminder (1-minute reminder)
        scheduleOrderReminder(String(order.orderId));

        // Dispatch instant Telegram notification
        if (this.config.notifyTelegramOnNewOrders && bot && process.env.AUTHORIZED_CHAT_ID) {
          const alertMessage = 
            `🔔 <b>[NEW WITHDRAW ORDER]</b>\n\n` +
            `🆔 <b>Order ID:</b> <code>${order.orderId}</code>\n` +
            `📱 <b>Method:</b> <code>${order.paymentMethod}</code>\n` +
            `📞 <b>Wallet:</b> <code>${order.walletNumber}</code>\n` +
            `💰 <b>Amount:</b> ৳${order.amount.toLocaleString()}\n` +
            `🕒 <b>Time:</b> ${new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka' })}`;

          try {
            await bot.api.sendMessage(process.env.AUTHORIZED_CHAT_ID, alertMessage, {
              parse_mode: 'HTML',
              reply_markup: getActionKeyboard(insertData),
            });
          } catch (tgNotifyErr) {
            console.error(`Failed to send Telegram alert for order ${order.orderId}:`, tgNotifyErr);
          }
        }
      } else {
        duplicates++;
      }
    }

    this.totalOrdersFetched += fetched;
    this.totalOrdersImported += imported;
    this.totalOrdersDuplicates += duplicates;

    if (imported > 0) {
      this.addLog('SUCCESS', `Imported ${imported} new withdrawal orders into database (${duplicates} duplicates skipped)`);
      await db.insert(auditLogs).values({
        action: 'AUTOMATION_SYNC',
        details: `Imported ${imported} orders via Playwright scraper (${duplicates} duplicates)`,
        createdAt: Date.now(),
      });
    }

    return { fetched, imported, duplicates };
  }
}

export const automationCrawler = new AutomationCrawler();
