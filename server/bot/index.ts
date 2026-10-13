import { extractTextFromImage } from './ocr';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { parsePaymentRequest } from './parser';
import { db } from '../db';
import { paymentRequests, auditLogs, groupBalances, groupLedgerEntries, systemSettings, routingRules } from '../db/schema';
import { eq, sql, gte, lte, and, inArray } from 'drizzle-orm';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getBDDayRange, formatBDDateTime, formatBDDate, formatBDTime, getBDDateString } from '../utils/timezone';
import { scheduleOrderReminder, cancelOrderReminder, startReminderWatchdog } from './reminderService';
import { startAutoBalScheduler, stopAutoBalScheduler } from './autoBalScheduler';
import fs from 'fs';
import path from 'path';
import { handleSupergroupMigration } from '../migrateChat';
import { validateTransactionIdFormat } from '../utils/txValidator';
import { trackCompletionMessage, findReqIdByMessage, cleanupCompletionMessages } from './completionTracker';
import { automationService } from '../scraper';


function escapeHtml(unsafe: string) {
  return unsafe
       .replace(/&/g, "&amp;")
       .replace(/</g, "&lt;")
       .replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;")
       .replace(/'/g, "&#039;");
}

function normalizeTelegramChatId(rawChatId: string | number | undefined | null): string {
  if (!rawChatId) return '';
  let id = String(rawChatId).trim();
  if (/^\d{9,15}$/.test(id)) {
    id = `-100${id}`;
  } else if (/^100\d{9,15}$/.test(id)) {
    id = `-${id}`;
  }
  return id;
}

export async function isUserAdmin(ctx: any): Promise<boolean> {
  if (ctx.chat?.type === 'private') return true;
  if (!ctx.chat?.id || !ctx.from?.id) return false;

  try {
    const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
    if (member.status === 'creator' || member.status === 'administrator') {
      return true;
    }
    if (process.env.AUTHORIZED_CHAT_ID && String(ctx.from.id) === String(process.env.AUTHORIZED_CHAT_ID)) {
      return true;
    }
    return false;
  } catch (err) {
    console.error("Error verifying admin status:", err);
    return false;
  }
}

export let bot: Bot | null = null;
let currentBotUsername: string | null = null;
let botLastError: string | null = null;
let botStartedAt: number | null = null;

export const getBotStatus = () => {
  const activeToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const isPlaceholder = !activeToken || 
    activeToken === 'your_bot_token_here' || 
    activeToken === 'your_telegram_bot_token' || 
    activeToken.includes('your_bot_token') ||
    activeToken.length < 20;

  const maskedToken = (!isPlaceholder && activeToken.length > 10) 
    ? `${activeToken.substring(0, 7)}...${activeToken.substring(activeToken.length - 4)}` 
    : null;

  return {
    isRunning: !!bot && !!currentBotUsername,
    username: currentBotUsername,
    tokenMasked: maskedToken,
    hasConfiguredToken: !isPlaceholder,
    lastError: botLastError,
    startedAt: botStartedAt,
    authorizedChatId: process.env.AUTHORIZED_CHAT_ID || null,
  };
};

export async function dispatchNextOrderForGroup(chatId: string) {
  if (!bot) return;

  try {
    const activeOrders = await db.select().from(paymentRequests).where(
      and(
        eq(paymentRequests.telegramChatId, chatId),
        eq(paymentRequests.status, 'PENDING'),
        sql`telegram_message_id IS NOT NULL`
      )
    ).limit(1);

    if (activeOrders.length > 0) {
      return; // Group is busy
    }

    const candidateIds = [chatId];
    if (!chatId.startsWith('-') && /^\d+$/.test(chatId)) {
      candidateIds.push(`-100${chatId}`);
      candidateIds.push(`-${chatId}`);
    } else if (chatId.startsWith('-') && !chatId.startsWith('-100')) {
      candidateIds.push(`-100${chatId.substring(1)}`);
    } else if (chatId.startsWith('-100')) {
      candidateIds.push(`-${chatId.substring(4)}`);
    }

    // Get the routing rules for this group using candidate IDs to handle supergroup migration mismatch
    const rules = await db.select().from(routingRules).where(inArray(routingRules.chatId, candidateIds)).limit(1);
    const rule = rules[0];
    if (!rule || rule.isActive === 0) return; // No active rule for this group

    // Get ALL globally waiting orders
    const waitingOrders = await db.select().from(paymentRequests).where(
      and(
        sql`telegram_chat_id IS NULL`,
        eq(paymentRequests.status, 'PENDING'),
        sql`(telegram_message_id IS NULL OR telegram_message_id = '')`
      )
    ).orderBy(sql`created_at ASC`);
    
    // Find the first order that matches this group's rules
    let nextOrder = null;
    const allowedMethodsStr = rule.paymentMethods || 'BKASH,NAGAD,ROCKET,UPAY';
    const allowedMethods = allowedMethodsStr.split(',').map(m => m.trim().toUpperCase());
    
    for (const order of waitingOrders) {
      const amountMatches = order.amount >= rule.minAmount && order.amount <= rule.maxAmount;
      const method = (order.paymentMethod || 'UNKNOWN').toUpperCase();
      const methodMatches = allowedMethods.includes(method);
      
      let dailyLimitReached = false;
      if (rule.dailyLimit && rule.dailyLimit > 0) {
        const { startTs, endTs } = getBDDayRange();
        const groupOrdersResult: any = await db.all(sql`
          SELECT SUM(amount) as total_amount 
          FROM payment_requests 
          WHERE (telegram_chat_id = ${rule.chatId} OR telegram_chat_id = ${normalizeTelegramChatId(rule.chatId)})
            AND created_at >= ${startTs} 
            AND created_at <= ${endTs}
            AND status != 'CANCELLED'
        `);
        const groupTotalToday = groupOrdersResult[0]?.total_amount || 0;
        if (groupTotalToday >= rule.dailyLimit) {
          dailyLimitReached = true;
        }
      }

      if (amountMatches && methodMatches && !dailyLimitReached) {
        nextOrder = order;
        break;
      }
    }

    if (!nextOrder) {
      return; // No matching waiting orders for this group
    }
    const messageText = `📌 <b>NEW QUEUED ORDER DISPATCHED</b>\n\nID: <code>${nextOrder.requestId}</code>\nWallet: <code>${nextOrder.walletNumber}</code>\nAmount: ৳${nextOrder.amount}\nMethod: ${nextOrder.paymentMethod}`;
    const keyboard = getActionKeyboard(nextOrder);

    let sentMsg: any = null;
    let finalTargetId = chatId;

    for (let i = 0; i < candidateIds.length; i++) {
      const targetId = candidateIds[i];
      try {
        sentMsg = await bot.api.sendMessage(targetId, messageText, {
          reply_markup: keyboard,
          parse_mode: 'HTML'
        });
        finalTargetId = targetId;
        break;
      } catch (err: any) {
        console.warn(`Telegram dispatchNextOrderForGroup sendMessage to ${targetId} failed:`, err?.description || err?.message);
        // Handle supergroup migration dynamically if provided by API
        if (err?.parameters?.migrate_to_chat_id && !candidateIds.includes(err.parameters.migrate_to_chat_id.toString())) {
          candidateIds.push(err.parameters.migrate_to_chat_id.toString());
        }
      }
    }

    if (sentMsg && sentMsg.message_id) {
      if (finalTargetId !== chatId) {
        await handleSupergroupMigration(chatId, finalTargetId);
      }
      
      await db.update(paymentRequests).set({
        telegramMessageId: sentMsg.message_id.toString(),
        telegramChatId: finalTargetId,
        assignedUser: rule.chatName || 'Manual User',
        createdAt: Date.now()
      }).where(eq(paymentRequests.id, nextOrder.id));

      scheduleOrderReminder(nextOrder.requestId);
    }
  } catch (err) {
    console.error("Error in dispatchNextOrderForGroup:", err);
  }
}

export function updateEnvFile(key: string, value: string): boolean {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const safeValue = value.includes(' ') || value.includes('#') ? `"${value}"` : value;
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${safeValue}`);
    } else {
      content = content ? `${content.trim()}\n${key}=${safeValue}\n` : `${key}=${safeValue}\n`;
    }
    fs.writeFileSync(envPath, content, 'utf8');
    process.env[key] = value;
    return true;
  } catch (err) {
    console.warn(`Could not update .env file on disk:`, err);
    process.env[key] = value;
    return false;
  }
}

// Helper to generate the standard inline keyboard
export const getActionKeyboard = (req: any) => {
  const reqId = req.requestId || req.request_id || 'unknown';
  const wallet = String(req.walletNumber || req.wallet_number || '').trim();
  const amountVal = req.amount !== undefined && req.amount !== null ? req.amount : 0;
  const amountStr = amountVal > 0 ? String(amountVal) : '';

  const walletBtnText = wallet ? `📱 ${wallet}` : '📱 Number';
  const amountBtnText = amountStr ? `💰 ৳${amountStr}` : '💰 Amount';

  return new InlineKeyboard()
    .row(
      { text: walletBtnText, copy_text: { text: wallet || '0' } },
      { text: amountBtnText, copy_text: { text: amountStr || '0' } }
    )
    .row(
      { text: '✅ Complete', callback_data: `complete:${reqId}` },
      { text: '❌ Cancel', callback_data: `cancel:${reqId}` }
    )
    .row(
      { text: '⚠️ Limit', callback_data: `limit:${reqId}` }
    );
};

export const stopActiveBot = async () => {
  stopAutoBalScheduler();
  if (bot) {
    const oldBot = bot;
    bot = null;
    currentBotUsername = null;
    try {
      await oldBot.stop();
    } catch (err) {
      console.warn('Error stopping previous bot instance:', err);
    }
    try {
      await oldBot.api.deleteWebhook({ drop_pending_updates: true });
    } catch (e) {
      // ignore
    }
    // Allow Telegram servers 1.2s to cleanly release the existing getUpdates socket
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
};

const launchBotPolling = async (botInstance: Bot, expectedUsername?: string, attempt = 1): Promise<void> => {
  try {
    // 1. Clear any hanging webhooks or pending lock
    try {
      await botInstance.api.deleteWebhook({ drop_pending_updates: true });
    } catch (e) {
      // ignore
    }

    botInstance.start({
      drop_pending_updates: true,
      allowed_updates: ['message', 'callback_query'],
      onStart: (botInfo) => {
        currentBotUsername = botInfo.username;
        botStartedAt = Date.now();
        botLastError = null;
        console.log(`🤖 Telegram Bot started successfully as @${botInfo.username}`);
        startReminderWatchdog();
        startAutoBalScheduler();
      }
    }).catch(async (err: any) => {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('401') || errMsg.includes('Unauthorized')) {
        botLastError = 'Telegram Bot Authentication failed (401: Unauthorized). Please check your token in Dashboard Settings.';
        console.warn(`⚠️ [Telegram Bot] ${botLastError}`);
        bot = null;
        currentBotUsername = null;
      } else if (errMsg.includes('409') || errMsg.includes('Conflict')) {
        console.warn(`⚠️ [Telegram Bot] 409 Conflict detected (another getUpdates session is terminating). Retry attempt ${attempt}/3...`);
        if (attempt <= 3) {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
          if (bot === botInstance) {
            return launchBotPolling(botInstance, expectedUsername, attempt + 1);
          }
        } else {
          botLastError = 'Telegram Bot 409 Conflict: another instance of this bot is already polling. Make sure only one bot process is running.';
          console.warn(`⚠️ [Telegram Bot] ${botLastError}`);
        }
      } else {
        botLastError = `Bot error: ${errMsg}`;
        console.error('❌ Telegram Bot error:', errMsg);
      }
    });
  } catch (err: any) {
    botLastError = err?.message || 'Error launching Telegram Bot';
    console.error('❌ [Telegram Bot] Failed to launch bot polling:', botLastError);
  }
};

export const startBot = async () => {
  // 1. Check if token was saved in system_settings database
  try {
    const dbTokenSetting = await db.select().from(systemSettings).where(eq(systemSettings.key, 'telegram_bot_token')).limit(1);
    if (dbTokenSetting.length > 0 && dbTokenSetting[0].value) {
      process.env.TELEGRAM_BOT_TOKEN = dbTokenSetting[0].value.trim();
    }
    const dbChatId = await db.select().from(systemSettings).where(eq(systemSettings.key, 'authorized_chat_id')).limit(1);
    if (dbChatId.length > 0 && dbChatId[0].value) {
      process.env.AUTHORIZED_CHAT_ID = dbChatId[0].value.trim();
    }
  } catch (dbErr) {
    console.warn('Could not read token from database settings on startup:', dbErr);
  }

  const rawToken = process.env.TELEGRAM_BOT_TOKEN;
  const token = (rawToken || '').trim();

  // Validate bot token to prevent 401 Unauthorized crashes on placeholder or missing token
  const isPlaceholder = !token || 
    token === 'your_bot_token_here' || 
    token === 'your_telegram_bot_token' || 
    token.includes('your_bot_token') ||
    token.length < 20;

  if (isPlaceholder) {
    console.warn('⚠️ [Telegram Bot] TELEGRAM_BOT_TOKEN is not configured or contains placeholder text. You can configure it directly from the Web Dashboard Settings page.');
    bot = null;
    currentBotUsername = null;
    botLastError = 'Token not configured. Please set a valid bot token in Dashboard Settings.';
    return;
  }

  // Telegram bot tokens must be in format <bot_id>:<secret_hash>
  const tokenFormatRegex = /^\d+:[A-Za-z0-9_-]{20,}$/;
  if (!tokenFormatRegex.test(token)) {
    const errText = 'Invalid Telegram Bot token format. Expected format: 123456789:ABCdef...';
    console.warn(`⚠️ [Telegram Bot] ${errText}`);
    bot = null;
    currentBotUsername = null;
    botLastError = errText;
    return;
  }

  try {
    await stopActiveBot();

    const newBot = new Bot(token);

    // Verify token validity first via getMe
    try {
      const botInfo = await newBot.api.getMe();
      currentBotUsername = botInfo.username;
    } catch (authErr: any) {
      const errMsg = authErr?.message || String(authErr);
      botLastError = 'Telegram Bot Authentication failed (401: Unauthorized). Please check your token in Dashboard Settings.';
      console.warn(`⚠️ [Telegram Bot] ${botLastError}`);
      bot = null;
      currentBotUsername = null;
      return;
    }

    // Global error handler for Grammy
    newBot.catch((err) => {
      const ctx = err.ctx;
      const e = err.error;
      const errorMsg = (e as any)?.message || String(e);
      if (errorMsg.includes('409') || errorMsg.includes('Conflict')) {
        console.warn(`⚠️ [Telegram Bot update] 409 Conflict handled.`);
        return;
      }
      console.error(`⚠️ [Telegram Bot] Error while handling update ${ctx?.update?.update_id}:`, errorMsg);
    });

    // Auto-record connected group info into groupBalances whenever bot sees activity
    newBot.use(async (ctx, next) => {
      if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup' || ctx.chat.type === 'channel')) {
        const chatIdStr = ctx.chat.id.toString();
        const chatTitle = ctx.chat.title || '';
        if (chatIdStr && chatTitle) {
          try {
            const existing = await db.select().from(groupBalances).where(eq(groupBalances.chatId, chatIdStr)).limit(1);
            if (existing.length === 0) {
              await db.insert(groupBalances).values({
                chatId: chatIdStr,
                chatName: chatTitle,
                balance: 0,
                updatedAt: Date.now(),
              });
            } else if (existing[0].chatName !== chatTitle) {
              await db.update(groupBalances).set({ chatName: chatTitle }).where(eq(groupBalances.chatId, chatIdStr));
            }
          } catch (e) {
            console.error('Error auto-syncing group name from message activity:', e);
          }
        }
      }
      return next();
    });

    registerBotHandlers(newBot);

    bot = newBot;
    botLastError = null;

    await launchBotPolling(newBot);
  } catch (initErr: any) {
    botLastError = initErr?.message || 'Error initializing Telegram Bot instance';
    console.error('❌ [Telegram Bot] Error initializing Telegram Bot instance:', botLastError);
    bot = null;
    currentBotUsername = null;
  }
};

export const restartBotWithToken = async (newToken: string): Promise<{ success: boolean; botUsername?: string; error?: string }> => {
  const cleanToken = (newToken || '').trim();
  if (!cleanToken || cleanToken.length < 20 || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(cleanToken)) {
    return { 
      success: false, 
      error: 'টোকেনের ফরম্যাট সঠিক নয়। সঠিক টেলিগ্রাম বট টোকেন দিন (e.g. 1234567890:ABCdefGhIjkLmNoPqRsTuVwXyZ)।' 
    };
  }

  try {
    // 1. Verify token against Telegram API getMe()
    const testBot = new Bot(cleanToken);
    const botInfo = await testBot.api.getMe();

    if (!botInfo || !botInfo.username) {
      return { success: false, error: 'বটের তথ্য পাওয়া যায়নি। টোকেনটি সঠিক কিনা যাচাই করুন।' };
    }

    // 2. Stop running bot cleanly if active
    await stopActiveBot();

    // 3. Persist to DB and .env
    process.env.TELEGRAM_BOT_TOKEN = cleanToken;
    updateEnvFile('TELEGRAM_BOT_TOKEN', cleanToken);

    try {
      await db.insert(systemSettings)
        .values({ key: 'telegram_bot_token', value: cleanToken, updatedAt: Date.now() })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: cleanToken, updatedAt: Date.now() }
        });
    } catch (dbErr) {
      console.warn('Error saving token to DB:', dbErr);
    }

    // 4. Setup error handling & handlers
    testBot.catch((err) => {
      const ctx = err.ctx;
      const e = err.error;
      const errorMsg = (e as any)?.message || String(e);
      if (errorMsg.includes('409') || errorMsg.includes('Conflict')) {
        console.warn(`⚠️ [Telegram Bot update] 409 Conflict handled.`);
        return;
      }
      console.error(`⚠️ [Telegram Bot] Error while handling update ${ctx?.update?.update_id}:`, errorMsg);
    });

    testBot.use(async (ctx, next) => {
      if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup' || ctx.chat.type === 'channel')) {
        const chatIdStr = ctx.chat.id.toString();
        const chatTitle = ctx.chat.title || '';
        if (chatIdStr && chatTitle) {
          try {
            const existing = await db.select().from(groupBalances).where(eq(groupBalances.chatId, chatIdStr)).limit(1);
            if (existing.length === 0) {
              await db.insert(groupBalances).values({
                chatId: chatIdStr,
                chatName: chatTitle,
                balance: 0,
                updatedAt: Date.now(),
              });
            } else if (existing[0].chatName !== chatTitle) {
              await db.update(groupBalances).set({ chatName: chatTitle }).where(eq(groupBalances.chatId, chatIdStr));
            }
          } catch (e) {
            console.error('Error auto-syncing group name from message activity:', e);
          }
        }
      }
      return next();
    });

    registerBotHandlers(testBot);

    bot = testBot;
    currentBotUsername = botInfo.username;
    botStartedAt = Date.now();
    botLastError = null;

    // 5. Start polling with auto-retry on 409
    launchBotPolling(testBot, botInfo.username);

    return {
      success: true,
      botUsername: botInfo.username
    };
  } catch (apiErr: any) {
    const errorMsg = apiErr?.description || apiErr?.message || String(apiErr);
    if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
      return { 
        success: false, 
        error: 'ভুল টেলিগ্রাম টোকেন (401: Unauthorized)। @BotFather থেকে সঠিক টোকেন কপি করে বসান।' 
      };
    }
    return { success: false, error: `টেলিগ্রাম API কানেকশন ত্রুটি: ${errorMsg}` };
  }
};

function registerBotHandlers(botInstance: Bot) {
  botInstance.command('start', async (ctx) => {
    await ctx.reply(`👋 Hello! I am the automated payment gateway bot.\n\n📍 Chat ID: \`${ctx.chat.id}\`\n👥 Chat Title: ${ctx.chat.title || 'Private'}\n\nI am ready to process payment requests and route orders!`, { parse_mode: 'Markdown' });
  });

  botInstance.command('id', async (ctx) => {
    await ctx.reply(`📍 Chat ID: \`${ctx.chat.id}\`\n🏷️ Chat Title: ${ctx.chat.title || 'Private'}\nType: ${ctx.chat.type}`, { parse_mode: 'Markdown' });
  });

  
  botInstance.on('message:photo', async (ctx) => {
    try {
      // Find the authorized admin/target chat ID
      const dbChatId = await db.select().from(systemSettings).where(eq(systemSettings.key, 'authorized_chat_id')).limit(1);
      const targetChatId = dbChatId[0]?.value;

      if (!targetChatId) {
        // Nowhere to forward the scanned text
        await ctx.reply(`⚠️ No 'Bound Telegram ID' configured in the Dashboard. Please set it to forward scanned texts.`);
        return;
      }

      const photos = ctx.message.photo;
      if (!photos || photos.length === 0) return;

      // Get the highest resolution photo
      const largestPhoto = photos[photos.length - 1];
      const fileId = largestPhoto.file_id;
      
      const file = await ctx.api.getFile(fileId);
      if (!file.file_path) return;

      const fileUrl = `https://api.telegram.org/file/bot${botInstance.token}/${file.file_path}`;
      const response = await fetch(fileUrl);
      if (!response.ok) {
        console.error("Failed to download photo from Telegram", response.status);
        return;
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      let mimeType = response.headers.get('content-type') || 'image/jpeg';
      if (mimeType === 'application/octet-stream' || !mimeType.startsWith('image/')) {
        mimeType = 'image/jpeg'; // Fallback to jpeg for Telegram photos
      }
      
      // Notify the group that we are scanning? Or just silent?
      // "এআই মাধ্যমে স্ক্যানিং করে লেখাগুলো ট্রান্সফার করবে"
      
      const text = await extractTextFromImage(buffer, mimeType);
      
      if (text) {
        let sourceInfo = "";
        if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
           sourceInfo = `[Source: Group '${ctx.chat.title}']\n`;
        }
        try {
          // Forward the original image message
          await ctx.api.forwardMessage(targetChatId, ctx.chat.id, ctx.message.message_id);
          
          await ctx.api.sendMessage(targetChatId, `🔍 <b>AI Scanned Text:</b>\n${sourceInfo}\n<pre>${escapeHtml(text)}</pre>`, {
            parse_mode: 'HTML'
          });
        } catch (sendErr: any) {
          console.log(`Failed to send OCR text to target chat ${targetChatId}:`, sendErr.message);
          await ctx.reply(`⚠️ AI scanned the image, but could not forward the text to the Bound ID (${targetChatId}). Please ensure the bot is started in that chat, or update the Bound ID in the Dashboard.`, {
             reply_to_message_id: ctx.message.message_id
          });
        }
      }
    } catch (e) {
      console.error("Error handling photo message:", e);
    }
  });

  function parseDateFromMessage(text: string): { dateStr: string; displayDate: string; startTs: number; endTs: number } | null {
    if (!text) return null;
    const raw = text.trim();

    // Avoid parsing payment requests / notifications as date queries
    if (
      raw.includes('NEW REQUEST') || 
      raw.includes('নতুন রিকুয়েস্ট') || 
      raw.includes('Withdrawal Request') || 
      raw.includes('BankTransfer Agents') ||
      raw.includes('Cash In') ||
      raw.includes('Cash Out')
    ) {
      return null;
    }

    // Convert Bengali numerals (০-৯) to English (0-9)
    const bnToEn = (str: string) => str.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d).toString());
    const normalized = bnToEn(raw);

    // Pattern 1: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (e.g., 12/09/2026, 12-09-2026, 12.09.2026)
    const dmyMatch = normalized.match(/(?:^|\s|\/|pdf|report|trx|date|তারিখ[:\s]*)([0-3]?[0-9])[\/\-\.]([0-1]?[0-9])[\/\-\.](20\d{2}|\d{2})(?:\s|$)/i);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10);
      let year = parseInt(dmyMatch[3], 10);
      if (year < 100) year += 2000;
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2020 && year <= 2099) {
        const dd = String(day).padStart(2, '0');
        const mm = String(month).padStart(2, '0');
        const dateStr = `${year}-${mm}-${dd}`;
        const { startTs, endTs } = getBDDayRange(dateStr);
        return {
          dateStr,
          displayDate: `${dd}/${mm}/${year}`,
          startTs,
          endTs
        };
      }
    }

    // Pattern 2: YYYY-MM-DD or YYYY/MM/DD
    const ymdMatch = normalized.match(/(?:^|\s|\/|pdf|report|trx|date|তারিখ[:\s]*)(20\d{2})[\/\-\.]([0-1]?[0-9])[\/\-\.]([0-3]?[0-9])(?:\s|$)/i);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10);
      const day = parseInt(ymdMatch[3], 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2020 && year <= 2099) {
        const dd = String(day).padStart(2, '0');
        const mm = String(month).padStart(2, '0');
        const dateStr = `${year}-${mm}-${dd}`;
        const { startTs, endTs } = getBDDayRange(dateStr);
        return {
          dateStr,
          displayDate: `${dd}/${mm}/${year}`,
          startTs,
          endTs
        };
      }
    }

    return null;
  }

  async function handleDatePdfExport(
    ctx: any,
    targetDateInfo: { dateStr: string; displayDate: string; startTs: number; endTs: number }
  ) {
    const chatIdStr = ctx.chat.id.toString();
    const { dateStr, displayDate, startTs, endTs } = targetDateInfo;

    try {
      let requests = await db.select().from(paymentRequests).where(
        and(
          eq(paymentRequests.telegramChatId, chatIdStr),
          gte(paymentRequests.createdAt, startTs),
          lte(paymentRequests.createdAt, endTs)
        )
      );

      if (requests.length === 0) {
        requests = await db.select().from(paymentRequests).where(
          and(
            gte(paymentRequests.createdAt, startTs),
            lte(paymentRequests.createdAt, endTs)
          )
        );
      }

      const completedRequests = requests.filter(r => r.status === 'COMPLETED');
      const totalCompletedAmount = completedRequests.reduce((sum, r) => sum + (r.amount || 0), 0);
      const totalTransactions = requests.length;

      if (totalTransactions === 0) {
        await ctx.reply(
          `📄 <b>Transaction Report (${displayDate})</b>\n` +
          `📅 তারিখ: <b>${displayDate}</b>\n` +
          `👥 গ্রুপ: <b>${ctx.chat.title || 'Private Chat'}</b>\n\n` +
          `ℹ️ <i>এই তারিখে (${displayDate}) কোনো ট্রানজেকশন রেকর্ড পাওয়া যায়নি।</i>\n\n` +
          `📊 <b>টোটাল ট্রানজেকশন: 0 টি</b>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      let pdfSent = false;
      try {
        const doc = new jsPDF();
        const safeTitle = (ctx.chat.title || 'Group Report').replace(/[^\x20-\x7E]/g, '').trim() || 'Group Report';
        
        doc.setFontSize(15);
        doc.text(`Transaction Report - ${safeTitle}`, 14, 18);
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Date (BD Time): ${displayDate}`, 14, 24);
        doc.text(`Total Transactions: ${totalTransactions} orders`, 14, 30);
        doc.text(`Completed Orders: ${completedRequests.length} orders | Total: Tk ${totalCompletedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 14, 36);
        doc.text(`Exported At: ${formatBDDateTime(Date.now(), true)}`, 14, 42);

        const tableColumn = ["Req ID", "Method", "Wallet", "Amount (Tk)", "Trx ID", "Status", "Time (BST)"];
        const tableRows = requests.map(r => [
          String(r.requestId || '').slice(0, 20),
          String(r.paymentMethod || 'N/A'),
          String(r.walletNumber || 'N/A'),
          (r.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
          String(r.transactionId || '-'),
          String(r.status || 'PENDING'),
          formatBDTime(r.createdAt)
        ]);

        tableRows.push([
          'Total Completed',
          '',
          '',
          totalCompletedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
          '',
          `${completedRequests.length} orders`,
          ''
        ]);

        const applyAutoTable = (autoTable as any)?.default || autoTable;
        if (typeof applyAutoTable === 'function') {
          applyAutoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 48,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            didParseCell: function(data: any) {
              if (data.row.index === tableRows.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [240, 240, 240];
              }
            }
          });
        } else if (typeof (doc as any).autoTable === 'function') {
          (doc as any).autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 48,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
          });
        }

        const pdfArrayBuffer = doc.output('arraybuffer');
        const buffer = Buffer.from(pdfArrayBuffer);

        const caption = 
          `📄 <b>Transaction Report PDF (${displayDate})</b>\n` +
          `📅 তারিখ: <b>${displayDate}</b>\n` +
          `👥 গ্রুপ: <b>${ctx.chat.title || 'Private Chat'}</b>\n\n` +
          `📊 <b>টোটাল ট্রানজেকশন: ${totalTransactions} টি</b>\n` +
          `✅ কমপ্লিট ট্রানজেকশন: <b>${completedRequests.length} টি</b>\n` +
          `💰 মোট কমপ্লিট অ্যামাউন্ট: <b>৳${totalCompletedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</b>`;

        const safeFilenameDate = displayDate.replace(/\//g, '-');
        await ctx.replyWithDocument(new InputFile(buffer, `trx_report_${safeFilenameDate}.pdf`), {
          caption,
          parse_mode: 'HTML'
        });
        pdfSent = true;
      } catch (pdfErr) {
        console.error("PDF generation/dispatch warning, falling back to rich text summary:", pdfErr);
      }

      // If sending PDF failed or group doesn't allow document uploads, send structured text
      if (!pdfSent) {
        const summaryLines = requests.slice(0, 25).map(r => 
          `• <code>${r.requestId}</code> | ৳${(r.amount || 0).toLocaleString('en-IN')} [${r.status}] (${r.walletNumber})${r.transactionId ? ` Trx: <code>${r.transactionId}</code>` : ''} - ${formatBDTime(r.createdAt)}`
        ).join('\n');

        const fallbackMsg = 
          `📄 <b>Transaction Report (${displayDate})</b>\n` +
          `📅 তারিখ: <b>${displayDate}</b>\n` +
          `👥 গ্রুপ: <b>${ctx.chat.title || 'Private Chat'}</b>\n\n` +
          `📊 <b>টোটাল ট্রানজেকশন: ${totalTransactions} টি</b>\n` +
          `✅ কমপ্লিট ট্রানজেকশন: <b>${completedRequests.length} টি</b>\n` +
          `💰 মোট কমপ্লিট অ্যামাউন্ট: <b>৳${totalCompletedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</b>\n\n` +
          `<b>ট্রানজেকশন তালিকা:</b>\n${summaryLines}` +
          (requests.length > 25 ? `\n<i>...এবং আরও ${requests.length - 25} টি ট্রানজেকশন</i>` : '');

        await ctx.reply(fallbackMsg, { parse_mode: 'HTML' });
      }
    } catch (err: any) {
      console.error("Error generating TRX report for date:", err);
      await ctx.reply(`⚠️ Failed to fetch transaction list: ${err.message || 'Unknown error'}`);
    }
  }

  botInstance.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    const textTrimmed = text.trim();
    const textLower = textTrimmed.toLowerCase();

    // 1. Playwright Automation OTP Interceptor & Command
    if (textLower === '/automation' || textLower === '/scraper' || textLower === 'automation') {
      const s = automationService.getStatus();
      await ctx.reply(
        `🤖 <b>Playwright Automation Status</b>\n\n` +
        `• Status: <code>${s.status}</code>\n` +
        `• Running: ${s.isRunning ? '🟢 Active' : '⏸️ Paused'}\n` +
        `• Session: ${s.hasStoredSession ? '🍪 Active (Saved)' : '❌ No Session'}\n` +
        `• Awaiting OTP: ${s.awaitingOtp ? '⚠️ <b>YES (Needs OTP)</b>' : 'No'}\n` +
        `• Total Imported: <b>${s.totalOrdersImported}</b>\n` +
        `• Duplicates Skipped: <b>${s.totalOrdersDuplicates}</b>\n\n` +
        `<i>Tip: OTP আসলে এই চ্যাটে সরাসরি কোডটি লিখুন বা /otp &lt;code&gt; পাঠান।</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const autoStatus = automationService.getStatus();
    const isExplicitOtpCommand = textTrimmed.startsWith('/otp') || textTrimmed.startsWith('otp:');
    
    if (autoStatus.awaitingOtp || isExplicitOtpCommand) {
      let candidate = textTrimmed;
      if (isExplicitOtpCommand) {
        candidate = candidate.replace(/^(\/otp|otp:)\s*/i, '').trim();
      }
      
      // Convert Bengali digits to English
      const bnDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
      let normCode = '';
      for (const char of candidate) {
        const idx = bnDigits.indexOf(char);
        if (idx !== -1) {
          normCode += idx.toString();
        } else {
          normCode += char;
        }
      }
      normCode = normCode.replace(/\D/g, '');

      if (normCode.length >= 4 && normCode.length <= 8) {
        const result = await automationService.submitOtp(normCode, 'TELEGRAM');
        if (result.success) {
          await ctx.reply(`✅ <b>OTP গৃহীত হয়েছে!</b> (<code>${normCode}</code>)\n${result.message}`, { parse_mode: 'HTML' });
          return;
        } else if (isExplicitOtpCommand) {
          await ctx.reply(`⚠️ ${result.message}`);
          return;
        }
      }
    }

    if (textLower === 'stop' || textLower === '/stop') {
      const chatIdStr = ctx.chat.id.toString();
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        try {
          const candidateIds = [chatIdStr];
          if (!chatIdStr.startsWith('-') && /^\d+$/.test(chatIdStr)) {
            candidateIds.push(`-100${chatIdStr}`);
            candidateIds.push(`-${chatIdStr}`);
          } else if (chatIdStr.startsWith('-') && !chatIdStr.startsWith('-100')) {
            candidateIds.push(`-100${chatIdStr.substring(1)}`);
          } else if (chatIdStr.startsWith('-100')) {
            candidateIds.push(`-${chatIdStr.substring(4)}`);
            candidateIds.push(chatIdStr.substring(4));
          }

          const existingRules = await db.select().from(routingRules).where(inArray(routingRules.chatId, candidateIds));
          if (existingRules.length > 0) {
            await db.update(routingRules)
              .set({ isActive: 0 })
              .where(inArray(routingRules.chatId, candidateIds));
            await ctx.reply(`🔴 <b>Group Status: STOPPED</b>\n\nThis group is now offline and will no longer receive automated orders.`, { parse_mode: 'HTML' });
          } else {
            await ctx.reply(`⚠️ No routing rules configured for this group. Please configure it in the dashboard first.`);
          }
        } catch (e) {
          console.error('Error stopping group:', e);
          await ctx.reply(`⚠️ Failed to stop group.`);
        }
      }
      return;
    }

    if (textLower === 'start' || textLower === '/start') {
      const chatIdStr = ctx.chat.id.toString();
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        try {
          const candidateIds = [chatIdStr];
          if (!chatIdStr.startsWith('-') && /^\d+$/.test(chatIdStr)) {
            candidateIds.push(`-100${chatIdStr}`);
            candidateIds.push(`-${chatIdStr}`);
          } else if (chatIdStr.startsWith('-') && !chatIdStr.startsWith('-100')) {
            candidateIds.push(`-100${chatIdStr.substring(1)}`);
          } else if (chatIdStr.startsWith('-100')) {
            candidateIds.push(`-${chatIdStr.substring(4)}`);
            candidateIds.push(chatIdStr.substring(4));
          }

          const existingRules = await db.select().from(routingRules).where(inArray(routingRules.chatId, candidateIds));
          if (existingRules.length > 0) {
            await db.update(routingRules)
              .set({ isActive: 1 })
              .where(inArray(routingRules.chatId, candidateIds));
            await ctx.reply(`🟢 <b>Group Status: STARTED</b>\n\nThis group is now online and will receive automated orders.`, { parse_mode: 'HTML' });
            
            // Dispatch any pending orders immediately
            const activeId = existingRules[0].chatId;
            await dispatchNextOrderForGroup(activeId);
          } else {
            await ctx.reply(`⚠️ No routing rules configured for this group. Please configure it in the dashboard first.`);
          }
        } catch (e) {
          console.error('Error starting group:', e);
          await ctx.reply(`⚠️ Failed to start group.`);
        }
      }
      return;
    }

    // Check for Balance query
    if (
      textLower === 'bal' || 
      textLower === 'balance' || 
      textLower === '/bal' || 
      textLower === '/balance' || 
      textLower === 'current balance' ||
      textLower === 'my balance' ||
      textLower.startsWith('bal ') ||
      textLower.startsWith('/bal ')
    ) {
      const chatIdStr = ctx.chat.id.toString();
      const { startTs, endTs } = getBDDayRange();

      try {
        if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
          // Group balance
          const gbRes = await db.select().from(groupBalances).where(eq(groupBalances.chatId, chatIdStr)).limit(1);
          const currentBal = gbRes.length > 0 ? (gbRes[0].balance || 0) : 0;
          const groupName = ctx.chat.title || gbRes[0]?.chatName || 'Group';

          // Get today's stats for this group
          const todayReqs = await db.select().from(paymentRequests).where(
            and(
              eq(paymentRequests.telegramChatId, chatIdStr),
              gte(paymentRequests.createdAt, startTs),
              lte(paymentRequests.createdAt, endTs),
              eq(paymentRequests.status, 'COMPLETED')
            )
          );

          const todayCompletedAmount = todayReqs.reduce((sum, r) => sum + (r.amount || 0), 0);

          const balanceMsg = 
            `💳 <b>Current Balance Report</b>\n\n` +
            `👥 Group: <b>${groupName}</b>\n` +
            `💰 Current Balance: <b>৳${currentBal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</b>\n` +
            `📈 Today's Completed: <b>৳${todayCompletedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</b> (${todayReqs.length} orders)\n` +
            `🕒 Time (BD): <code>${formatBDDateTime(Date.now(), true)}</code>`;

          await ctx.reply(balanceMsg, { parse_mode: 'HTML' });
        } else {
          // Private chat - list all groups balance
          const allBalances = await db.select().from(groupBalances);
          
          if (allBalances.length === 0) {
            await ctx.reply(
              `💳 <b>Balance Report</b>\n\n` +
              `💰 Total Balance: <b>৳0.00</b>\n` +
              `ℹ️ No group balances registered yet.`,
              { parse_mode: 'HTML' }
            );
            return;
          }

          const totalBal = allBalances.reduce((sum, g) => sum + (g.balance || 0), 0);
          const groupLines = allBalances.map(g => 
            `• <b>${g.chatName || 'Group ' + g.chatId}</b>: ৳${(g.balance || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
          ).join('\n');

          const balanceMsg = 
            `💳 <b>System Balance Overview</b>\n\n` +
            `💰 <b>Total Balance: ৳${totalBal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</b>\n\n` +
            `<b>Connected Groups:</b>\n${groupLines}\n\n` +
            `🕒 Time (BD): <code>${formatBDDateTime(Date.now(), true)}</code>`;

          await ctx.reply(balanceMsg, { parse_mode: 'HTML' });
        }
      } catch (err: any) {
        console.error("Error fetching balance:", err);
        await ctx.reply(`⚠️ Failed to retrieve current balance: ${err.message || 'Unknown error'}`);
      }
      return;
    }

    if (textLower === 'today trx' || textLower === 'today' || textLower.includes('today trx')) {
      const chatIdStr = ctx.chat.id.toString();
      const { startTs, endTs, dateStr } = getBDDayRange();

      try {
        let requests = await db.select().from(paymentRequests).where(
          and(
            eq(paymentRequests.telegramChatId, chatIdStr),
            gte(paymentRequests.createdAt, startTs),
            lte(paymentRequests.createdAt, endTs)
          )
        );

        if (requests.length === 0) {
          requests = await db.select().from(paymentRequests).where(
            and(
              gte(paymentRequests.createdAt, startTs),
              lte(paymentRequests.createdAt, endTs)
            )
          );
        }

        const completedReqs = requests.filter(r => r.status === 'COMPLETED');
        const totalAmount = completedReqs.reduce((sum, r) => sum + r.amount, 0);

        const textResponse = `📊 <b>Today's Transactions Report (Bangladesh Time)</b>\n` +
          `📅 Date: <b>${formatBDDate(Date.now())}</b>\n` +
          `👥 Group: ${ctx.chat.title || 'Private Chat'}\n\n` +
          `✅ Completed Orders: <b>${completedReqs.length}</b>\n` +
          `💰 Total Amount: <b>৳${totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</b>\n\n` +
          (completedReqs.length > 0 
            ? `<b>Recent Completed Transactions:</b>\n` + completedReqs.slice(0, 10).map(r => `• <code>${r.walletNumber || r.requestId}</code> | ৳${r.amount.toLocaleString('en-IN')} (${r.paymentMethod}) - ${formatBDTime(r.createdAt)}`).join('\n') 
            : `No completed transactions yet today.`);

        await ctx.reply(textResponse, { parse_mode: 'HTML' });
      } catch (err) {
        console.error("Error fetching today trx:", err);
        await ctx.reply(`⚠️ Failed to generate today's transaction summary.`);
      }
      return;
    }

    // Check if user entered a specific date (e.g. 12/09/2026, 12-09-2026, 12.09.2026) or requested trx list/report
    const dateQuery = parseDateFromMessage(text);
    const isTodayTrxList = (
      textLower === 'trx list' || 
      textLower === 'trxlist' || 
      textLower === '/trxlist' || 
      textLower === '/trx_list' || 
      textLower === 'trx report' ||
      textLower === 'report' ||
      textLower === '/report' ||
      textLower.includes('trx list') || 
      textLower.includes('trxlist')
    );

    // Only process date/trxlist query if not replying to a completion prompt
    const hasReplyPrompt = ctx.message.reply_to_message?.text && (
      ctx.message.reply_to_message.text.includes('Please send the Transaction ID') ||
      ctx.message.reply_to_message.text.includes('Request ID:')
    );

    if ((dateQuery || isTodayTrxList) && !hasReplyPrompt) {
      const todayRange = getBDDayRange();
      const [yyyy, mm, dd] = todayRange.dateStr.split('-');
      const todayDisplay = `${dd}/${mm}/${yyyy}`;
      const targetDateInfo = dateQuery || {
        dateStr: todayRange.dateStr,
        displayDate: todayDisplay,
        startTs: todayRange.startTs,
        endTs: todayRange.endTs
      };
      await handleDatePdfExport(ctx, targetDateInfo);
      return;
    }

    // Check if it's a NEW REQUEST message
    if (
      text.includes('NEW REQUEST') || 
      text.includes('নতুন রিকুয়েস্ট') || 
      text.includes('Withdrawal Request') || 
      text.includes('BankTransfer Agents')
    ) {
      const parsed = parsePaymentRequest(text);
      
      if (parsed.confidence === 'HIGH' || parsed.confidence === 'MEDIUM') {
        try {
          // Prevent duplicates
          const existing = await db.select().from(paymentRequests).where(eq(paymentRequests.requestId, parsed.request_id)).limit(1);
          if (existing.length > 0) {
            await ctx.reply(`⚠️ Request ID ${parsed.request_id} already exists.`);
            return;
          }

          const rules = await db.select().from(routingRules);
          const matchingRules = rules.filter(r => {
            if (r.isActive === 0) return false;
            const amountMatches = parsed.amount! >= r.minAmount && parsed.amount! <= r.maxAmount;
            if (!amountMatches) return false;
            const method = (parsed.payment_method || 'UNKNOWN').toUpperCase();
            const allowedMethodsStr = r.paymentMethods || 'BKASH,NAGAD,ROCKET,UPAY';
            const allowedMethods = allowedMethodsStr.split(',').map(m => m.trim().toUpperCase());
            return allowedMethods.includes(method);
          });
          
          let targetChatId: string | null = null;
          let targetChatName: string | null = null;

          if (matchingRules.length > 0) {
            for (const rule of matchingRules) {
              const ruleChatId = normalizeTelegramChatId(rule.chatId);
              const activeTelegramOrders = await db.select().from(paymentRequests).where(
                and(
                  eq(paymentRequests.telegramChatId, ruleChatId),
                  eq(paymentRequests.status, 'PENDING'),
                  sql`telegram_message_id IS NOT NULL`
                )
              ).limit(1);

              if (activeTelegramOrders.length === 0) {
                targetChatId = ruleChatId;
                targetChatName = rule.chatName || null;
                break; // Found a free group!
              }
            }
          }

          // Insert into DB
          const insertData = {
            requestId: parsed.request_id,
            paymentMethod: parsed.payment_method,
            walletNumber: parsed.wallet_number,
            rawWalletNumber: parsed.raw_wallet_number,
            amount: parsed.amount,
            assignedUser: targetChatName || parsed.assigned_user || 'Manual User',
            status: parsed.confidence === 'HIGH' ? 'PENDING' : 'PARSER_REVIEW_REQUIRED',
            createdAt: Date.now(),
            rawMessage: text,
            telegramChatId: targetChatId,
            telegramMessageId: null as string | null
          };
          
          await db.insert(paymentRequests).values(insertData);
          scheduleOrderReminder(parsed.request_id);

          if (targetChatId) {
            // Forward/send to the free group
            const messageText = `📌 <b>NEW QUEUED ORDER DISPATCHED</b>\n\nID: <code>${parsed.request_id}</code>\nWallet: <code>${parsed.wallet_number}</code>\nAmount: ৳${parsed.amount}\nMethod: ${parsed.payment_method}`;
            const keyboard = getActionKeyboard(insertData as any);
            let sentMsg;
            try {
              sentMsg = await bot.api.sendMessage(targetChatId, messageText, {
                reply_markup: keyboard,
                parse_mode: 'HTML'
              });
              await db.update(paymentRequests).set({
                telegramMessageId: sentMsg.message_id.toString()
              }).where(eq(paymentRequests.requestId, parsed.request_id));
              await ctx.reply(`Order routed to ${targetChatName || targetChatId} successfully!`);
            } catch (err) {
              await ctx.reply(`Failed to route order to Telegram group.`);
            }
          } else {
            await ctx.reply(`📌 Request ID <code>${parsed.request_id}</code> is queued globally. It will be sent to the next available matching group.`, { parse_mode: 'HTML' });
          }

          await db.insert(auditLogs).values({
            action: 'CREATE_REQUEST',
            details: `Request ${parsed.request_id} automatically created via parser.`,
            createdAt: Date.now()
          });
        } catch (error) {
          console.error("Database error saving request:", error);
          await ctx.reply(`⚠️ Failed to save request to database.`);
        }
      } else {
        await ctx.reply(`⚠️ Unable to parse request confidently.\nConfidence: ${parsed.confidence}\nPlease review manually.`);
      }
    } else if (ctx.message.reply_to_message?.text) {
      const repliedText = ctx.message.reply_to_message.text;
      
      // Check if it's a direct reply to the parsed message with "ID: <reqId>"
      const idMatch = repliedText.match(/ID:\s*(\d+)/i) || repliedText.match(/Request ID:\s*(\d+)/i);
      // Check if it's a reply to a "Complete" prompt
      const promptMatch = repliedText.match(/Please send the Transaction ID for Request: (\d+)/i);
      
      let reqId = promptMatch ? promptMatch[1] : (idMatch ? idMatch[1] : null);
      if (!reqId && ctx.chat?.id && ctx.message.reply_to_message?.message_id) {
        reqId = findReqIdByMessage(ctx.chat.id, ctx.message.reply_to_message.message_id);
      }

      const isFromBot = ctx.message.reply_to_message.from?.id === ctx.me.id;
      const isTracked = !!(ctx.chat?.id && ctx.message.reply_to_message?.message_id && findReqIdByMessage(ctx.chat.id, ctx.message.reply_to_message.message_id));

      if (reqId && (isFromBot || isTracked)) {
        // Track the user message and the replied-to message in this completion flow
        if (ctx.chat?.id) {
          trackCompletionMessage(ctx.chat.id, reqId, ctx.message.message_id);
          if (ctx.message.reply_to_message?.message_id) {
            trackCompletionMessage(ctx.chat.id, reqId, ctx.message.reply_to_message.message_id);
          }
        }

        const textUpper = text.trim().toUpperCase();

        try {
          const reqs = await db.select().from(paymentRequests).where(eq(paymentRequests.requestId, reqId)).limit(1);
          if (reqs.length === 0) {
            await ctx.reply(`❌ Request ${reqId} not found.`);
            return;
          }
          const req = reqs[0];
          
          if (req.status === 'COMPLETED' || req.status === 'CANCELLED' || req.status === 'LIMIT') {
             await ctx.reply(`⚠️ Request ${reqId} is currently ${req.status} and cannot be modified from the group. Please use the Dashboard if needed.`);
             return;
          }


          if (textUpper === 'LIMIT') {
             cancelOrderReminder(reqId);
             if (req.reminderMessageId && req.telegramChatId) {
               try {
                 await ctx.api.deleteMessage(req.telegramChatId, parseInt(req.reminderMessageId));
               } catch (e) {}
             }
             await db.update(paymentRequests).set({ status: 'LIMIT' }).where(eq(paymentRequests.requestId, reqId));

             await db.insert(auditLogs).values({
               userId: ctx.from.username || ctx.from.id.toString(),
               action: 'LIMIT',
               details: `Marked Request ${reqId} as LIMIT via text reply`,
               createdAt: Date.now()
             });

             // Clean up all completion prompt / error / reply messages
             if (ctx.chat?.id) {
               await cleanupCompletionMessages(ctx.api, ctx.chat.id, reqId, [
                 ctx.message.message_id,
                 ctx.message.reply_to_message?.message_id
               ]);
             }

             await ctx.reply(`⚠️ Request ${reqId} marked as LIMIT.`);
             
             // Try to edit the replied message to remove buttons
             try {
               await ctx.api.editMessageText(ctx.chat.id, ctx.message.reply_to_message.message_id, `⚠️ <b>LIMIT EXCEEDED</b>\n\nOriginal Request ID: <code>${reqId}</code>\nWallet: <code>${req.walletNumber}</code>\nAmount: ৳${req.amount}`, { parse_mode: 'HTML' });
             } catch(e) {}
             
          } else {
             // Validate Transaction ID format: uppercase only, no lowercase (e.g., DIC2EXGJ5U, 75X91WLR)
             const validation = validateTransactionIdFormat(text);
             if (!validation.isValid) {
               const errMsg = await ctx.reply(
                 `⚠️ <b>অবৈধ ট্রানজেকশন আইডি!</b> (Request: <code>${reqId}</code>)\n\n${validation.error}\n\n` +
                 `💡 <i>সঠিক উদাহরণ:</i> <code>DIC2EXGJ5U</code>, <code>DIC1EXAIG5</code>, <code>75X91WLR</code>, <code>75X90BL3</code>\n` +
                 `<i>(সব অক্ষর বড় হাতের ইংরেজি A-Z ও সংখ্যা 0-9 হতে হবে)</i>`,
                 { parse_mode: 'HTML' }
               );
               if (ctx.chat?.id) {
                 trackCompletionMessage(ctx.chat.id, reqId, errMsg.message_id);
               }
               return;
             }

             const txId = validation.sanitizedTxId!;

             // Check unique transaction ID across all completed orders (case-insensitive)
             const existingTx = await db.select().from(paymentRequests).where(
               and(
                 sql`UPPER(${paymentRequests.transactionId}) = UPPER(${txId})`,
                 eq(paymentRequests.status, 'COMPLETED')
               )
             ).limit(1);

             if (existingTx.length > 0 && existingTx[0].requestId !== reqId) {
               const dupMsg = await ctx.reply(
                 `❌ <b>ইতিপূর্বে ব্যবহৃত ট্রানজেকশন আইডি!</b> (Request: <code>${reqId}</code>)\n\n` +
                 `ট্রানজেকশন আইডি <code>${txId}</code> দিয়ে ইতিপূর্বে অর্ডার <code>${existingTx[0].requestId}</code> কমপ্লিট করা হয়েছে।\n\n` +
                 `⚠️ <b>একটি ট্রানজেকশন আইডি দিয়ে দুইবার কমপ্লিট করা যাবে না।</b>`,
                 { parse_mode: 'HTML' }
               );
               if (ctx.chat?.id) {
                 trackCompletionMessage(ctx.chat.id, reqId, dupMsg.message_id);
               }
               return;
             }

             cancelOrderReminder(reqId);
             if (req.reminderMessageId && req.telegramChatId) {
               try {
                 await ctx.api.deleteMessage(req.telegramChatId, parseInt(req.reminderMessageId));
               } catch (e) {}
             }
             const fromUser = ctx.from;
             const userUsername = fromUser?.username ? fromUser.username : null;
             const userUserId = fromUser?.id ? fromUser.id.toString() : null;
             const userDisplayName = fromUser?.username 
               ? `@${fromUser.username}` 
               : (fromUser?.first_name ? `${fromUser.first_name}${fromUser.last_name ? ' ' + fromUser.last_name : ''}` : 'User');

             await db.update(paymentRequests)
              .set({ 
                status: 'COMPLETED', 
                transactionId: txId, 
                completedBy: userDisplayName,
                completedByUserId: userUserId,
                completedByUsername: userUsername,
                completedAt: Date.now()
              })
              .where(eq(paymentRequests.requestId, reqId));

            
             if (req.reminderMessageId && req.telegramChatId) {
               try {
                 await ctx.api.deleteMessage(req.telegramChatId, parseInt(req.reminderMessageId));
               } catch (e) {}
             }

            if (req.telegramChatId && req.status !== 'COMPLETED') {
              const gb = await db.select().from(groupBalances).where(eq(groupBalances.chatId, req.telegramChatId)).limit(1);
              if (gb.length > 0) {
                const newBalance = gb[0].balance + req.amount;
                await db.update(groupBalances)
                  .set({ balance: newBalance, updatedAt: Date.now() })
                  .where(eq(groupBalances.chatId, req.telegramChatId));

                await db.insert(groupLedgerEntries).values({
                  chatId: req.telegramChatId,
                  type: 'DEPOSIT',
                  amount: req.amount,
                  balanceAfter: newBalance,
                  description: `Completed order for request ${req.requestId} (TxID: ${txId})`,
                  referenceId: req.requestId,
                  operator: userDisplayName || 'Bot',
                  createdAt: Date.now(),
                });
              }
            }

            await db.insert(auditLogs).values({
              userId: userDisplayName,
              action: 'COMPLETED',
              details: `Completed Request ${reqId} with TxID ${txId} via text reply`,
              createdAt: Date.now()
            });

            const completedText = `✅ <b>COMPLETED</b>\n\nRequest ID: <code>${req.requestId}</code>\nWallet: <code>${req.walletNumber}</code>\nAmount: ৳${req.amount}\nTransaction ID: <code>${txId}</code>\nCompleted By: ${userDisplayName.replace(/[<>]/g, '')}`;
            
            const copyKeyboard = new InlineKeyboard().row({ text: '📋 Copy TrxID', copy_text: { text: txId } });

            // Order completed! Delete all intermediate prompt, error, and user attempt messages for this request
            if (ctx.chat?.id) {
              await cleanupCompletionMessages(ctx.api, ctx.chat.id, reqId, [
                ctx.message.message_id,
                ctx.message.reply_to_message?.message_id
              ]);
            }

            let editedOriginal = false;
            if (req.telegramMessageId && req.telegramChatId) {
               try {
                  await ctx.api.editMessageText(
                    parseInt(req.telegramChatId),
                    parseInt(req.telegramMessageId),
                    completedText,
                    { parse_mode: 'HTML', reply_markup: copyKeyboard }
                  );
                  editedOriginal = true;
               } catch (e) {}
            }

            if (!editedOriginal) {
              await ctx.reply(completedText, { parse_mode: 'HTML', reply_markup: copyKeyboard });
            }

            if (req.telegramChatId) {
              await dispatchNextOrderForGroup(req.telegramChatId);
            }
          }
        } catch (error) {
          console.error("Error processing reply action:", error);
          await ctx.reply(`⚠️ Error saving action.`);
        }
      }
    }
  });

  botInstance.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;

    const [action, reqId] = data.split(':');

    if (!reqId) {
      await ctx.answerCallbackQuery('Invalid callback data');
      return;
    }

    try {
      const reqs = await db.select().from(paymentRequests).where(eq(paymentRequests.requestId, reqId)).limit(1);
      if (reqs.length === 0) {
        await ctx.answerCallbackQuery({ text: 'Request not found.', show_alert: true });
        return;
      }
      
      const req = reqs[0];

      if (req.status === 'COMPLETED' && action !== 'copy') {
        await ctx.answerCallbackQuery({ text: 'Request is already completed!', show_alert: true });
        return;
      }

      if ((req.status === 'CANCELLED' || req.status === 'LIMIT') && action !== 'copy') {
        await ctx.answerCallbackQuery({ text: `Request is already ${req.status}! Modify from Dashboard if needed.`, show_alert: true });
        return;
      }


      if (action === 'complete') {
        await ctx.answerCallbackQuery();
        const promptMsg = await ctx.reply(`Please send the Transaction ID for Request: ${reqId}`, {
          reply_markup: { force_reply: true }
        });
        if (ctx.chat?.id) {
          trackCompletionMessage(ctx.chat.id, reqId, promptMsg.message_id);
        }
       } else if (action === 'cancel') {
        cancelOrderReminder(reqId);
        if (req.reminderMessageId && req.telegramChatId) {
          try {
            await ctx.api.deleteMessage(req.telegramChatId, parseInt(req.reminderMessageId));
          } catch (e) {}
        }
        if (ctx.chat?.id) {
          await cleanupCompletionMessages(ctx.api, ctx.chat.id, reqId);
        }
        await db.update(paymentRequests).set({ status: 'CANCELLED' }).where(eq(paymentRequests.requestId, reqId));

        await db.insert(auditLogs).values({
          userId: ctx.from.username || ctx.from.id.toString(),
          action: 'CANCELLED',
          details: `Cancelled Request ${reqId}`,
          createdAt: Date.now()
        });
        await ctx.answerCallbackQuery({ text: 'Request marked as Cancelled.', show_alert: true });
        
        // Update the message inline keyboard to remove actions
        await ctx.editMessageText(`❌ <b>CANCELLED</b>\n\nRequest ID: <code>${req.requestId}</code>\nWallet: <code>${req.walletNumber}</code>\nAmount: ৳${req.amount}`, { parse_mode: 'HTML' });

        if (req.telegramChatId) {
          await dispatchNextOrderForGroup(req.telegramChatId);
        }

      } else if (action === 'limit') {
         cancelOrderReminder(reqId);
         if (req.reminderMessageId && req.telegramChatId) {
           try {
             await ctx.api.deleteMessage(req.telegramChatId, parseInt(req.reminderMessageId));
           } catch (e) {}
         }
         if (ctx.chat?.id) {
           await cleanupCompletionMessages(ctx.api, ctx.chat.id, reqId);
         }
         await db.update(paymentRequests).set({ status: 'LIMIT' }).where(eq(paymentRequests.requestId, reqId));

         await db.insert(auditLogs).values({
           userId: ctx.from.username || ctx.from.id.toString(),
           action: 'LIMIT',
           details: `Marked Request ${reqId} as LIMIT`,
           createdAt: Date.now()
         });
         await ctx.answerCallbackQuery({ text: 'Request marked as Limit.', show_alert: true });
         
         await ctx.editMessageText(`⚠️ <b>LIMIT EXCEEDED</b>\n\nRequest ID: <code>${req.requestId}</code>\nWallet: <code>${req.walletNumber}</code>\nAmount: ৳${req.amount}`, { parse_mode: 'HTML' });

         if (req.telegramChatId) {
           await dispatchNextOrderForGroup(req.telegramChatId);
         }
      } else {
        await ctx.answerCallbackQuery('Unknown action');
      }

    } catch (error) {
      console.error("Callback query error:", error);
      await ctx.answerCallbackQuery('An error occurred.');
    }
  });
}
