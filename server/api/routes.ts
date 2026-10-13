import express from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db, getDatabaseStatus, testMysqlConnection, migrateSqliteToMysql, exportSqlDump } from '../db';
import { users, paymentRequests, auditLogs, routingRules, groupBalances, groupLedgerEntries, systemSettings } from '../db/schema';
import { eq, desc, sql, gte, lte, and } from 'drizzle-orm';
import { ZipArchive } from 'archiver';
import path from 'path';
import fs from 'fs';
import { bot, getActionKeyboard, getBotStatus, restartBotWithToken, updateEnvFile, dispatchNextOrderForGroup } from '../bot/index';
import { checkPaddleHealth } from '../bot/ocr';
import { sendDailyAutoBalanceCheck, getAutoBalStatus, setAutoBalScheduleConfig } from '../bot/autoBalScheduler';
import { handleSupergroupMigration } from '../migrateChat';
import { parsePaymentRequest } from '../bot/parser';
import { syncWithdrawalsFromFile } from '../withdrawalSync';
import { getBDDayRange, getBDDateString, formatBDDate, formatBDDateTime } from '../utils/timezone';
import { validateTransactionIdFormat } from '../utils/txValidator';
import { cleanupCompletionMessages } from '../bot/completionTracker';
import { automationService } from '../scraper';
import { 
  scheduleOrderReminder, 
  cancelOrderReminder, 
  isAutoReminderEnabled, 
  setAutoReminderEnabled,
  getReminderTimeoutSeconds,
  setReminderTimeoutSeconds,
  getReminderMessageTemplate,
  setReminderMessageTemplate,
  formatTimeThresholdBn
} from '../bot/reminderService';

let activeJwtSecret = process.env.JWT_SECRET || 'fallback-secret-for-dev';
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is not set in .env — refusing to start in production with an insecure fallback secret. Set a strong random JWT_SECRET (e.g. `openssl rand -hex 32`).');
  }
  console.warn('⚠️  JWT_SECRET is not set in .env — using an insecure development fallback. Set JWT_SECRET before deploying to production.');
}
export function getJwtSecret() {
  return process.env.JWT_SECRET || activeJwtSecret;
}


export function normalizeTelegramChatId(rawChatId: string | number | undefined | null): string {
  if (!rawChatId) return '';
  let id = String(rawChatId).trim();
  // If it's pure numbers and looks like a supergroup ID (>= 9 digits), supergroups in telegram require -100 prefix
  if (/^\d{9,15}$/.test(id)) {
    id = `-100${id}`;
  } else if (/^100\d{9,15}$/.test(id)) {
    id = `-${id}`;
  }
  return id;
}

export async function recalculateGroupBalance(chatId: string) {
  const allEntries = await db.select().from(groupLedgerEntries)
    .where(eq(groupLedgerEntries.chatId, chatId))
    .orderBy(groupLedgerEntries.createdAt);
  
  let runningBalance = 0;
  for (const ent of allEntries) {
    runningBalance += ent.type === 'DEPOSIT' ? ent.amount : -ent.amount;
    if (ent.balanceAfter !== runningBalance) {
      await db.update(groupLedgerEntries)
        .set({ balanceAfter: runningBalance })
        .where(eq(groupLedgerEntries.id, ent.id));
    }
  }

  // Check if balance entry exists for this group
  const existing = await db.select().from(groupBalances).where(eq(groupBalances.chatId, chatId)).limit(1);
  if (existing.length > 0) {
    await db.update(groupBalances)
      .set({ balance: runningBalance, updatedAt: Date.now() })
      .where(eq(groupBalances.chatId, chatId));
  } else {
    await db.insert(groupBalances).values({
      chatId,
      chatName: chatId,
      balance: runningBalance,
      updatedAt: Date.now()
    });
  }
}

async function sendTelegramOrder(chatId: string, insertData: any, parsed: any) {
  if (!bot) {
    return { sent: false, error: 'Telegram bot is not initialized (check TELEGRAM_BOT_TOKEN).' };
  }

  const messageText = `<b>MANUAL ORDER UPLOAD</b>\n\nParsed successfully!\nID: <code>${parsed.request_id}</code>\nWallet: <code>${parsed.wallet_number}</code>\nAmount: ৳${parsed.amount}\nStatus: ${insertData.status}`;
  const keyboard = getActionKeyboard(insertData);

  // Candidate chat IDs to try
  const candidateIds = [chatId];
  if (!chatId.startsWith('-') && /^\d+$/.test(chatId)) {
    candidateIds.push(`-100${chatId}`);
    candidateIds.push(`-${chatId}`);
  } else if (chatId.startsWith('-') && !chatId.startsWith('-100')) {
    candidateIds.push(`-100${chatId.substring(1)}`);
  } else if (chatId.startsWith('-100')) {
    candidateIds.push(`-${chatId.substring(4)}`);
  }

  let lastError: any = null;
  for (let i = 0; i < candidateIds.length; i++) {
    const targetId = candidateIds[i];
    try {
      const msg = await bot.api.sendMessage(targetId, messageText, {
        reply_markup: keyboard,
        parse_mode: 'HTML'
      });
      return { sent: true, messageId: msg.message_id.toString(), finalChatId: targetId };
    } catch (err: any) {
      lastError = err;
      console.warn(`Telegram sendMessage to ${targetId} failed:`, err?.description || err?.message);
      
      // Handle supergroup migration dynamically if provided by API
      if (err?.parameters?.migrate_to_chat_id && !candidateIds.includes(err.parameters.migrate_to_chat_id.toString())) {
        candidateIds.push(err.parameters.migrate_to_chat_id.toString());
      }
      
      // If error was markdown parse error, retry plain text
      if (err.description && (err.description.includes("can't parse") || err.description.includes('entities'))) {
        try {
          const plainText = `MANUAL ORDER UPLOAD\n\nParsed successfully!\nID: ${parsed.request_id}\nWallet: ${parsed.wallet_number}\nAmount: ৳${parsed.amount}\nStatus: ${insertData.status}`;
          const msg = await bot.api.sendMessage(targetId, plainText, {
            reply_markup: keyboard
          });
          return { sent: true, messageId: msg.message_id.toString(), finalChatId: targetId };
        } catch (retryErr: any) {
          lastError = retryErr;
        }
      }
    }
  }

  return { 
    sent: false, 
    error: lastError?.description || lastError?.message || 'Failed to send to Telegram chat.' 
  };
}

export const apiRouter = express.Router();

// Rate limiting: login is brute-forceable (username/password), /order accepts external
// input (extension). Keep other authenticated dashboard routes unlimited-ish for normal use.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
});

const orderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many order submissions. Please slow down.' },
});

apiRouter.post('/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const userRes = await db.select().from(users).where(eq(users.username, username)).limit(1);
    
    if (userRes.length === 0 || (userRes[0] as any).status === 'INACTIVE') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = userRes[0];
    const isMatch = bcrypt.compareSync(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, getJwtSecret(), { expiresIn: '1d' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

apiRouter.get('/extension/download', (req, res) => {
  try {
    const extensionDir = path.join(process.cwd(), 'extension');
    if (!fs.existsSync(extensionDir)) {
      return res.status(404).json({ error: 'Extension folder not found.' });
    }
    
    res.attachment('smart-order-forwarder.zip');
    
    const archive = new ZipArchive({
      zlib: { level: 9 }
    });
    
    archive.on('error', (err) => {
      res.status(500).send({error: err.message});
    });
    
    archive.pipe(res);
    archive.directory(extensionDir, false);
    archive.finalize();
  } catch (err) {
    console.error('Error generating zip', err);
    res.status(500).json({ error: 'Failed to generate extension zip' });
  }
});

// Middleware for authentication
// Accepts EITHER:
//  1) A normal JWT (from /auth/login) for the dashboard/admin UI, OR
//  2) A long-lived static EXTENSION_API_KEY (from .env) for the browser extension,
//     so the extension doesn't need to re-login every 24h when the JWT expires.
const safeEqual = (a: string, b: string) => {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

const authMiddleware = async (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const extensionKey = process.env.EXTENSION_API_KEY;
  if (extensionKey && safeEqual(token, extensionKey)) {
    req.user = { username: 'extension', role: 'extension' };
    return next();
  }

  try {
    const decoded: any = jwt.verify(token, getJwtSecret());
    // Re-check the account so deactivated/deleted users and role changes apply immediately.
    const cur = await db.select().from(users).where(eq(users.id, decoded.id)).limit(1);
    if (cur.length === 0 || cur[0].status === 'INACTIVE') {
      return res.status(401).json({ error: 'Account disabled' });
    }
    req.user = { ...decoded, role: cur[0].role };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

apiRouter.use(authMiddleware);

// Authorization (previously every authenticated user, including the extension key,
// could reach every route: user management, DB export, bot token, scraper config).
const ADMIN_ONLY_PREFIXES = ['/users', '/database', '/automation', '/settings', '/sync'];
apiRouter.use((req: any, res, next) => {
  const role = String(req.user?.role || '').toUpperCase();
  if (role === 'EXTENSION') {
    if (req.method === 'POST' && req.path === '/order') return next();
    return res.status(403).json({ error: 'Extension key may only submit orders.' });
  }
  const adminOnly = ADMIN_ONLY_PREFIXES.some(p => req.path === p || req.path.startsWith(p + '/'));
  if (adminOnly && role !== 'ADMIN') {
    // Operators may still read/update the reminder settings page.
    const reminderOk = role === 'OPERATOR' && req.path === '/settings' ;
    if (!reminderOk) return res.status(403).json({ error: 'Admin access required.' });
  }
  if (role === 'VIEWER' && req.method !== 'GET') {
    return res.status(403).json({ error: 'Viewers have read-only access.' });
  }
  next();
});


apiRouter.post('/order', orderLimiter, async (req, res) => {
  try {
    const { rawText, targetChatId, walletNumber: extWallet, amount: extAmount, orderId: extOrderId } = req.body;
    if (!rawText) return res.status(400).json({ error: 'Text is required' });

    const parsed = parsePaymentRequest(rawText);

    // Fallback for the browser extension's DOM auto-capture: merchant pages rarely
    // contain an explicit "ID: ..." label in the SAME text node as the amount, so the
    // regex-based parser often can't find a request_id even though the extension DID
    // detect a wallet number / amount (and sometimes a separate ID) on the page.
    // Prefer whatever ID the extension itself found; otherwise auto-generate one instead
    // of silently dropping the capture, and fill in any wallet/amount the parser missed.
    if (!parsed.request_id && ((extWallet || parsed.wallet_number) && (extAmount || parsed.amount))) {
      parsed.request_id = extOrderId ? String(extOrderId) : `EXT${Date.now()}`;
      if (!parsed.wallet_number && extWallet) {
        parsed.wallet_number = String(extWallet).replace(/^\+?88/, '');
        parsed.raw_wallet_number = String(extWallet);
      }
      if (!parsed.amount && extAmount) {
        const parsedAmount = parseFloat(String(extAmount));
        if (!isNaN(parsedAmount)) parsed.amount = parsedAmount;
      }
      // Auto-generated IDs always need a human to confirm before dispatch.
      parsed.confidence = 'LOW';
    }

    if (!parsed.request_id) {
      return res.status(400).json({ error: 'Could not extract a valid Request ID.' });
    }

    if (parsed.amount) {
      if (Math.abs(parsed.amount % 1) > 0.001) {
        return res.status(400).json({ error: 'খুচরা পয়সা (দশমিক সংখ্যা) দিয়ে অর্ডার করা যাবে না। শুধুমাত্র পূর্ণ সংখ্যায় অ্যামাউন্ট গ্রহণযোগ্য।' });
      }
    }

    // Check for duplicates
    const existing = await db.select().from(paymentRequests).where(eq(paymentRequests.requestId, parsed.request_id)).limit(1);
    if (existing.length > 0) {
      return res.status(400).json({ error: `Request ID ${parsed.request_id} already exists.` });
    }

    let chatId: string | null = null;
    let chatName: string | null = null;

    if (parsed.amount) {
      const rules = await db.select().from(routingRules);
      const matchingRules = [];
      const { startTs, endTs } = getBDDayRange();

      for (const r of rules) {
        if (r.isActive === 0) continue;
        const amountMatches = parsed.amount! >= r.minAmount && parsed.amount! <= r.maxAmount;
        if (!amountMatches) continue;

        const method = (parsed.payment_method || 'UNKNOWN').toUpperCase();
        const allowedMethodsStr = r.paymentMethods || 'BKASH,NAGAD,ROCKET,UPAY';
        const allowedMethods = allowedMethodsStr.split(',').map(m => m.trim().toUpperCase());
        if (!allowedMethods.includes(method)) continue;

        if (r.dailyLimit && r.dailyLimit > 0) {
          const ruleChatId = normalizeTelegramChatId(r.chatId);
          const groupOrdersResult: any = await db.all(sql`
            SELECT SUM(amount) as total_amount 
            FROM payment_requests 
            WHERE (telegram_chat_id = ${ruleChatId} OR telegram_chat_id = ${r.chatId})
              AND created_at >= ${startTs} 
              AND created_at <= ${endTs}
              AND status != 'CANCELLED'
          `);
          const groupTotalToday = groupOrdersResult[0]?.total_amount || 0;
          if (groupTotalToday >= r.dailyLimit) {
            continue;
          }
        }

        matchingRules.push(r);
      }
      
      if (matchingRules.length > 0) {
        const totalOrdersResult: any = await db.all(sql`SELECT count(*) as cnt FROM payment_requests`);
        const totalOrdersCount = totalOrdersResult[0]?.cnt || 0;
        const rotateIndex = totalOrdersCount % matchingRules.length;
        const rotatedRules = [...matchingRules.slice(rotateIndex), ...matchingRules.slice(0, rotateIndex)];

        for (const rule of rotatedRules) {
          const ruleChatId = normalizeTelegramChatId(rule.chatId);
          const activeTelegramOrders = await db.select().from(paymentRequests).where(
            and(
              eq(paymentRequests.telegramChatId, ruleChatId),
              eq(paymentRequests.status, 'PENDING'),
              sql`telegram_message_id IS NOT NULL`
            )
          ).limit(1);

          if (activeTelegramOrders.length === 0) {
            chatId = ruleChatId;
            chatName = rule.chatName || null;
            break; // Found a free group via round-robin!
          }
        }
        
        // If chatId is still null here, it means all matching groups are busy.
        // We leave chatId as null, so it goes into the global queue.
      } else {
        // No active rule found or group limits reached — save to global queue successfully
        chatId = null;
        chatName = 'Queued (No Group)';
      }
    }

    const insertData = {
      requestId: parsed.request_id,
      paymentMethod: parsed.payment_method,
      walletNumber: parsed.wallet_number,
      rawWalletNumber: parsed.raw_wallet_number,
      amount: parsed.amount,
      assignedUser: chatName || parsed.assigned_user || 'Manual User',
      status: parsed.confidence === 'HIGH' ? 'PENDING' : 'PARSER_REVIEW_REQUIRED',
      createdAt: Date.now(),
      rawMessage: rawText,
      telegramChatId: chatId,
      telegramMessageId: null as string | null
    };

    // Insert into DB
    await db.insert(paymentRequests).values(insertData);

    // Schedule 1-minute reminder to ping previous completer if still pending
    scheduleOrderReminder(parsed.request_id);

    let tgResult: any = { sent: false, error: 'No Telegram Chat ID found', messageId: null, finalChatId: null };
    
    if (chatId) {
      const activeTelegramOrders = await db.select().from(paymentRequests).where(
        and(
          eq(paymentRequests.telegramChatId, chatId),
          eq(paymentRequests.status, 'PENDING'),
          sql`telegram_message_id IS NOT NULL`
        )
      ).limit(1);

      if (activeTelegramOrders.length === 0) {
        tgResult = await sendTelegramOrder(chatId, insertData, parsed);
        if (tgResult.sent && tgResult.messageId) {
          insertData.telegramMessageId = tgResult.messageId;
          if (tgResult.finalChatId) {
            insertData.telegramChatId = tgResult.finalChatId;
            if (tgResult.finalChatId !== chatId) {
              await handleSupergroupMigration(chatId, tgResult.finalChatId);
            }
          }
          await db.update(paymentRequests).set({ 
            telegramMessageId: tgResult.messageId,
            telegramChatId: insertData.telegramChatId
          }).where(eq(paymentRequests.requestId, parsed.request_id));
        }
      } else {
        tgResult = { sent: false, error: 'Queued: Group currently has an active pending order.' };
      }
    }

    await db.insert(auditLogs).values({
      userId: (req as any).user?.username || 'API',
      action: 'MANUAL_ORDER',
      details: `Created Request ${parsed.request_id}. Telegram: ${tgResult.sent ? 'SENT to ' + insertData.telegramChatId : 'FAILED (' + tgResult.error + ')'}`,
      createdAt: Date.now()
    });

    res.json({ 
      success: true, 
      data: insertData,
      telegramSent: tgResult.sent,
      telegramError: tgResult.sent ? null : tgResult.error,
      chatInfo: { id: insertData.telegramChatId, name: insertData.assignedUser }
    });

  } catch (err) {
    console.error("Order creation error:", err);
    res.status(500).json({ error: 'Failed to process order' });
  }
});

apiRouter.post('/transactions/:id/dispatch', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { chatId } = req.body;
    if (!chatId) return res.status(400).json({ error: 'Target chatId is required' });

    const txs = await db.select().from(paymentRequests).where(eq(paymentRequests.id, id)).limit(1);
    if (txs.length === 0) return res.status(404).json({ error: 'Transaction not found' });
    const tx = txs[0];

    // If order was previously sent to another group, automatically delete message from previous group
    if (tx.telegramChatId && tx.telegramMessageId && bot) {
      const oldChatIds = [tx.telegramChatId, normalizeTelegramChatId(tx.telegramChatId)];
      if (!tx.telegramChatId.startsWith('-')) {
        oldChatIds.push(`-100${tx.telegramChatId}`);
        oldChatIds.push(`-${tx.telegramChatId}`);
      } else if (tx.telegramChatId.startsWith('-') && !tx.telegramChatId.startsWith('-100')) {
        oldChatIds.push(`-100${tx.telegramChatId.substring(1)}`);
      }
      
      for (const oldId of oldChatIds) {
        if (!oldId) continue;
        try {
          await bot.api.deleteMessage(oldId, parseInt(tx.telegramMessageId));
          console.log(`Successfully deleted previous order message from group ${oldId}`);
          break;
        } catch (delErr) {
          // Try next format
        }
      }
    }

    const parsed = {
      request_id: tx.requestId,
      payment_method: tx.paymentMethod,
      wallet_number: tx.walletNumber,
      amount: tx.amount,
      confidence: 'HIGH'
    };

    const tgResult = await sendTelegramOrder(chatId, tx, parsed);
    if (!tgResult.sent) {
      return res.status(400).json({ error: `Telegram dispatch failed: ${tgResult.error}` });
    }

    const finalChatId = tgResult.finalChatId || chatId;
    if (tgResult.finalChatId && tgResult.finalChatId !== tx.telegramChatId && tx.telegramChatId) {
      await handleSupergroupMigration(tx.telegramChatId, tgResult.finalChatId);
    }

    // Find rule chatName if any
    const rules = await db.select().from(routingRules).where(eq(routingRules.chatId, finalChatId)).limit(1);
    const groupName = rules[0]?.chatName || `Group ${finalChatId}`;

    await db.update(paymentRequests).set({
      telegramChatId: finalChatId,
      telegramMessageId: tgResult.messageId,
      assignedUser: groupName
    }).where(eq(paymentRequests.id, id));

    await db.insert(auditLogs).values({
      userId: (req as any).user?.username || 'Admin',
      action: 'ADMIN_DISPATCH_ORDER',
      details: `Dispatched Request ${tx.requestId} to Telegram chat ${finalChatId} (${groupName})`,
      createdAt: Date.now()
    });

    res.json({ success: true, message: `Successfully dispatched order to group!` });
  } catch (err: any) {
    console.error("Manual dispatch error:", err);
    res.status(500).json({ error: err.message || 'Failed to dispatch transaction' });
  }
});

apiRouter.delete('/transactions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const reqData = await db.select().from(paymentRequests).where(eq(paymentRequests.id, id)).limit(1);
    if (reqData.length === 0) return res.status(404).json({ error: 'Not found' });
    
    const { requestId, telegramChatId, status } = reqData[0];
    cancelOrderReminder(requestId);
    
    await db.delete(paymentRequests).where(eq(paymentRequests.id, id));
    
    if (telegramChatId) {
      // Delete any associated ledger entries
      await db.delete(groupLedgerEntries).where(
        and(
          eq(groupLedgerEntries.chatId, telegramChatId),
          eq(groupLedgerEntries.referenceId, requestId)
        )
      );
      // Recalculate group balance
      await recalculateGroupBalance(telegramChatId);
    }
    
    await db.insert(auditLogs).values({
      userId: (req as any).user?.username || 'API',
      action: 'DELETE_TRANSACTION',
      details: `Deleted request ${requestId}`,
      createdAt: Date.now()
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Delete transaction error:", err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

apiRouter.put('/transactions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { amount, walletNumber, status, transactionId, paymentMethod } = req.body;
    
    const reqData = await db.select().from(paymentRequests).where(eq(paymentRequests.id, id)).limit(1);
    if (reqData.length === 0) return res.status(404).json({ error: 'Not found' });

    
    // Transaction ID validation:
    // Rule: সব বড় হাতের হবে, ছোট হাতের দিলে কমপ্লিট হবে না (যেমন: DIC2EXGJ5U, 75X91WLR)
    // Rule: একটা ট্রানজেকশন আইডি দিয়ে দুইবার যেন কমপ্লিট না করতে পারে
    if (status === 'COMPLETED') {
      const validation = validateTransactionIdFormat(transactionId);
      if (!validation.isValid) {
        return res.status(400).json({ error: validation.error });
      }
      const validTxId = validation.sanitizedTxId!;

      const existingTx = await db.select().from(paymentRequests).where(
        and(
          sql`UPPER(${paymentRequests.transactionId}) = UPPER(${validTxId})`,
          eq(paymentRequests.status, 'COMPLETED')
        )
      ).limit(1);
      
      if (existingTx.length > 0 && existingTx[0].id !== id) {
        return res.status(400).json({ 
          error: `এই ট্রানজেকশন আইডি (${validTxId}) ইতিপূর্বে অর্ডার #${existingTx[0].requestId}-এ ব্যবহার করা হয়েছে। একটি ট্রানজেকশন আইডি দিয়ে দুইবার কমপ্লিট করা যাবে না।` 
        });
      }
    } else if (transactionId && transactionId.trim()) {
      const validation = validateTransactionIdFormat(transactionId);
      if (!validation.isValid) {
        return res.status(400).json({ error: validation.error });
      }
      const validTxId = validation.sanitizedTxId!;

      const existingTx = await db.select().from(paymentRequests).where(
        and(
          sql`UPPER(${paymentRequests.transactionId}) = UPPER(${validTxId})`,
          eq(paymentRequests.status, 'COMPLETED')
        )
      ).limit(1);
      
      if (existingTx.length > 0 && existingTx[0].id !== id) {
        return res.status(400).json({ 
          error: `এই ট্রানজেকশন আইডি (${validTxId}) ইতিপূর্বে অর্ডার #${existingTx[0].requestId}-এ ব্যবহার করা হয়েছে। একটি ট্রানজেকশন আইডি দিয়ে দুইবার কমপ্লিট করা যাবে না।` 
        });
      }
    }

    const oldStatus = reqData[0].status;
    const oldChatId = reqData[0].telegramChatId;
    const oldRequestId = reqData[0].requestId;
    const updateAmount = parseFloat(amount) || 0;
    
    if (Math.abs(updateAmount % 1) > 0.001) {
      return res.status(400).json({ error: 'খুচরা পয়সা (দশমিক সংখ্যা) দিয়ে অ্যামাউন্ট আপডেট করা যাবে না। শুধুমাত্র পূর্ণ সংখ্যায় অ্যামাউন্ট গ্রহণযোগ্য।' });
    }
    
    if (status && status !== 'PENDING') {
      cancelOrderReminder(oldRequestId);
    }

    const updateFields: any = { 
      amount: updateAmount, 
      walletNumber, 
      status, 
      transactionId: transactionId ? transactionId.trim().toUpperCase() : null, 
      paymentMethod 
    };

    if (status === 'COMPLETED' && oldStatus !== 'COMPLETED') {
      updateFields.completedAt = Date.now();
      updateFields.completedBy = (req as any).user?.username || 'Admin';
    }

    // 1. If it was previously COMPLETED and had a chat, delete the ledger entry
    if (oldStatus === 'COMPLETED' && oldChatId) {
      await db.delete(groupLedgerEntries).where(
        and(
          eq(groupLedgerEntries.chatId, oldChatId),
          eq(groupLedgerEntries.referenceId, oldRequestId)
        )
      );
    }

    await db.update(paymentRequests)
      .set(updateFields)
      .where(eq(paymentRequests.id, id));

    // 2. If it was previously COMPLETED and had a chat, recalculate balance of the old group
    if (oldStatus === 'COMPLETED' && oldChatId) {
      await recalculateGroupBalance(oldChatId);
    }

    // 3. If new status is COMPLETED and we have a chat ID, add the new ledger entry and recalculate
    const finalChatId = oldChatId; // telegramChatId is not directly edited in this API, so it matches the oldChatId
    
    if (['COMPLETED', 'CANCELLED', 'LIMIT'].includes(status) && status !== oldStatus && finalChatId) {
      if (bot) {
        if (reqData[0].reminderMessageId) {
          bot.api.deleteMessage(finalChatId, parseInt(reqData[0].reminderMessageId)).catch(() => {});
        }
        cleanupCompletionMessages(bot.api, finalChatId, oldRequestId).catch(() => {});
      }
    }

    if (status === 'COMPLETED' && finalChatId) {
      await db.insert(groupLedgerEntries).values({
        chatId: finalChatId,
        type: 'DEPOSIT',
        amount: updateAmount,
        balanceAfter: 0, // Will be updated by recalculateGroupBalance
        description: `Completed order for request ${oldRequestId} via Admin`,
        referenceId: oldRequestId,
        operator: (req as any).user?.username || 'Admin',
        createdAt: Date.now()
      });

      await recalculateGroupBalance(finalChatId);
    }
      
    if (status && status !== 'PENDING' && oldStatus === 'PENDING' && oldChatId) {
      await dispatchNextOrderForGroup(oldChatId);
    }

    await db.insert(auditLogs).values({
      userId: (req as any).user?.username || 'API',
      action: 'EDIT_TRANSACTION',
      details: `Edited request ${oldRequestId}`,
      createdAt: Date.now()
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Edit transaction error:", err);
    res.status(500).json({ error: 'Failed to update' });
  }
});

apiRouter.get('/stats', async (req, res) => {
  try {
    // Determine start and end of current day in Bangladesh timezone
    const { startTs: todayTs, endTs: todayEndTs, dateStr: todayDateStr } = getBDDayRange();

    // Query for total amounts and counts for today in Bangladesh Time
    const result: any = await db.all(sql`
      SELECT 
        status, 
        COUNT(*) as count, 
        SUM(amount) as total_amount 
      FROM payment_requests 
      WHERE created_at >= ${todayTs} AND created_at <= ${todayEndTs}
      GROUP BY status
    `);

    let totalAmount = 0;
    let totalRequests = 0;
    const stats: any = {
      COMPLETED: { count: 0, amount: 0 },
      PENDING: { count: 0, amount: 0 },
      CANCELLED: { count: 0, amount: 0 },
      LIMIT: { count: 0, amount: 0 },
      PARSER_REVIEW_REQUIRED: { count: 0, amount: 0 }
    };

    result.forEach((r: any) => {
      const amt = r.total_amount || 0;
      const count = r.count || 0;
      totalAmount += amt;
      totalRequests += count;
      if (stats[r.status]) {
        stats[r.status] = { count, amount: amt };
      } else {
        stats[r.status] = { count, amount: amt };
      }
    });

    // Query all-time completed revenue and all-time metrics
    const allTimeResult: any = await db.all(sql`
      SELECT 
        status, 
        COUNT(*) as count, 
        SUM(amount) as total_amount 
      FROM payment_requests 
      GROUP BY status
    `);

    let currentTotalRevenue = 0;
    let allTimeTotalRequests = 0;
    let allTimeTotalAmount = 0;
    let allTimePendingCount = 0;
    let allTimePendingAmount = 0;

    allTimeResult.forEach((r: any) => {
      const amt = r.total_amount || 0;
      const count = r.count || 0;
      allTimeTotalRequests += count;
      allTimeTotalAmount += amt;
      if (r.status === 'COMPLETED') {
        currentTotalRevenue += amt;
      }
      if (r.status === 'PENDING' || r.status === 'PARSER_REVIEW_REQUIRED') {
        allTimePendingCount += count;
        allTimePendingAmount += amt;
      }
    });

    // Query active groups count from group_balances and routing_rules
    const activeGroupsResult: any = await db.get(sql`
      SELECT COUNT(DISTINCT chat_id) as count FROM (
        SELECT chat_id FROM group_balances
        UNION
        SELECT chat_id FROM routing_rules
      )
    `);
    const activeGroups = activeGroupsResult?.count || 0;

    // Query offline groups count (groups with no active routing rule)
    const offlineGroupsResult: any = await db.get(sql`
      SELECT COUNT(DISTINCT chat_id) as count 
      FROM (SELECT chat_id FROM group_balances UNION SELECT chat_id FROM routing_rules) 
      WHERE chat_id NOT IN (SELECT chat_id FROM routing_rules WHERE is_active = 1)
    `);
    const offlineGroups = offlineGroupsResult?.count || 0;

    // Total pool balance across all groups
    const totalGroupBalanceResult: any = await db.get(sql`
      SELECT SUM(balance) as total_balance FROM group_balances
    `);
    const totalGroupBalance = totalGroupBalanceResult?.total_balance || 0;

    const pendingOrdersToday = {
      count: (stats.PENDING?.count || 0) + (stats.PARSER_REVIEW_REQUIRED?.count || 0),
      amount: (stats.PENDING?.amount || 0) + (stats.PARSER_REVIEW_REQUIRED?.amount || 0)
    };

    // Query today's payment requests for hourly breakdown
    const todayRequests: any = await db.all(sql`
      SELECT 
        created_at, 
        amount, 
        status 
      FROM payment_requests 
      WHERE created_at >= ${todayTs} AND created_at <= ${todayEndTs}
    `);

    // Prepare 24 hourly buckets for today in Bangladesh Time (UTC+6)
    const hourlyData = Array.from({ length: 24 }, (_, hour) => {
      const hourStart = todayTs + hour * 3600 * 1000;
      const hourStr = `${hour.toString().padStart(2, '0')}:00`;
      const label = new Date(hourStart).toLocaleTimeString('en-US', {
        timeZone: 'Asia/Dhaka',
        hour: 'numeric',
        hour12: true
      });
      return {
        hour,
        time: hourStr,
        label,
        volume: 0,
        completedVolume: 0,
        count: 0,
        completedCount: 0
      };
    });

    todayRequests.forEach((reqItem: any) => {
      const createdTs = typeof reqItem.created_at === 'number' ? reqItem.created_at : Number(reqItem.created_at);
      const amt = Number(reqItem.amount) || 0;
      const hourIndex = Math.min(23, Math.max(0, Math.floor((createdTs - todayTs) / (3600 * 1000))));
      if (hourlyData[hourIndex]) {
        hourlyData[hourIndex].volume += amt;
        hourlyData[hourIndex].count += 1;
        if (reqItem.status === 'COMPLETED') {
          hourlyData[hourIndex].completedVolume += amt;
          hourlyData[hourIndex].completedCount += 1;
        }
      }
    });

    // Generate last 7 days chart data in Bangladesh timezone
    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const targetTime = Date.now() - i * 24 * 60 * 60 * 1000;
      const { startTs: dayStart, endTs: dayEnd, dateStr: dayDateStr } = getBDDayRange(targetTime);
      
      const dayResult: any = await db.all(sql`
        SELECT 
          status, 
          COUNT(*) as count, 
          SUM(amount) as total_amount 
        FROM payment_requests 
        WHERE created_at >= ${dayStart} AND created_at <= ${dayEnd}
        GROUP BY status
      `);

      let completedAmt = 0;
      let limitAmt = 0;
      let cancelledAmt = 0;

      dayResult.forEach((row: any) => {
        if (row.status === 'COMPLETED') completedAmt += row.total_amount || 0;
        if (row.status === 'LIMIT') limitAmt += row.total_amount || 0;
        if (row.status === 'CANCELLED') cancelledAmt += row.total_amount || 0;
      });

      const dayName = new Date(dayStart).toLocaleDateString('en-US', { timeZone: 'Asia/Dhaka', month: 'short', day: 'numeric' });

      chartData.push({
        name: dayName,
        date: dayDateStr,
        completed: completedAmt,
        limit: limitAmt,
        cancelled: cancelledAmt
      });
    }

    res.json({
      totalRequests,
      totalAmount,
      stats,
      todayDate: todayDateStr,
      chartData,
      hourlyData,
      pendingOrdersToday,
      activeGroups,
      offlineGroups,
      currentTotalRevenue,
      todayRevenue: stats.COMPLETED?.amount || 0,
      totalGroupBalance,
      allTimeStats: {
        totalRequests: allTimeTotalRequests,
        totalAmount: allTimeTotalAmount,
        completedRevenue: currentTotalRevenue,
        pendingCount: allTimePendingCount,
        pendingAmount: allTimePendingAmount
      }
    });
  } catch (err) {
    console.error("Stats fetch error:", err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

apiRouter.get('/transactions', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    
    // Support custom limit from client, default to 1000 so transactions history is never truncated to 20-25
    let limit = 1000;
    if (req.query.limit) {
      if (req.query.limit === 'all') {
        limit = 10000;
      } else {
        const parsedLimit = parseInt(req.query.limit as string);
        if (!isNaN(parsedLimit) && parsedLimit > 0) {
          limit = Math.min(parsedLimit, 10000);
        }
      }
    }
    const offset = (page - 1) * limit;

    // Filters from query params
    const statusParam = (req.query.status as string || '').toUpperCase().trim();
    const searchParam = (req.query.search as string || '').trim();
    const methodParam = (req.query.method as string || '').toUpperCase().trim();
    const startDateParam = req.query.startDate as string;
    const endDateParam = req.query.endDate as string;

    const conditions: any[] = [];

    if (statusParam && statusParam !== 'ALL') {
      conditions.push(sql`UPPER(${paymentRequests.status}) = ${statusParam}`);
    }

    if (methodParam && methodParam !== 'ALL') {
      conditions.push(sql`UPPER(${paymentRequests.paymentMethod}) = ${methodParam}`);
    }

    if (searchParam) {
      const s = `%${searchParam}%`;
      conditions.push(sql`(
        ${paymentRequests.requestId} LIKE ${s} OR
        ${paymentRequests.transactionId} LIKE ${s} OR
        ${paymentRequests.walletNumber} LIKE ${s} OR
        ${paymentRequests.assignedUser} LIKE ${s} OR
        ${paymentRequests.completedBy} LIKE ${s}
      )`);
    }

    if (startDateParam) {
      const startMs = new Date(startDateParam).setHours(0, 0, 0, 0);
      if (!isNaN(startMs)) {
        conditions.push(gte(paymentRequests.createdAt, startMs));
      }
    }

    if (endDateParam) {
      const endMs = new Date(endDateParam).setHours(23, 59, 59, 999);
      if (!isNaN(endMs)) {
        conditions.push(lte(paymentRequests.createdAt, endMs));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db.select()
      .from(paymentRequests)
      .where(whereClause)
      .orderBy(desc(paymentRequests.createdAt))
      .limit(limit)
      .offset(offset);
      
    // Count total for current query
    const countRes: any = await db.select({ count: sql<number>`count(*)` })
      .from(paymentRequests)
      .where(whereClause);
    const total = Number(countRes[0]?.count || 0);

    // Global counts across all payment_requests in database for status tabs
    const statusCountsRaw: any = await db.all(sql`
      SELECT 
        status, 
        COUNT(*) as cnt,
        SUM(CASE WHEN status = 'PENDING' AND reminder_sent = 1 THEN 1 ELSE 0 END) as alerts_cnt
      FROM payment_requests
      GROUP BY status
    `);

    const counts: Record<string, number> = {
      ALL: 0,
      PENDING: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      LIMIT: 0,
      PARSER_REVIEW_REQUIRED: 0,
      pendingAlerts: 0
    };

    let grandTotal = 0;
    statusCountsRaw.forEach((row: any) => {
      const st = (row.status || '').toUpperCase();
      const cnt = Number(row.cnt || 0);
      grandTotal += cnt;
      if (counts[st] !== undefined) {
        counts[st] = cnt;
      } else {
        counts[st] = cnt;
      }
      if (row.alerts_cnt) {
        counts.pendingAlerts += Number(row.alerts_cnt);
      }
    });
    counts.ALL = grandTotal;

    res.json({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      counts
    });
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

apiRouter.get('/logs', async (req, res) => {
  try {
    const data = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(50);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

apiRouter.post('/sync/withdrawals', async (req, res) => {
  try {
    const result = await syncWithdrawalsFromFile();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


apiRouter.get('/routing-rules', async (req, res) => {
  try {
    const rules = await db.select().from(routingRules).orderBy(routingRules.minAmount);
    res.json({ success: true, data: rules });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

apiRouter.post('/routing-rules', async (req, res) => {
  try {
    const { chatId, chatName, minAmount, maxAmount, paymentMethods, dailyLimit } = req.body;
    
    let methodsStr = 'BKASH,NAGAD,ROCKET,UPAY';
    if (Array.isArray(paymentMethods)) {
      methodsStr = paymentMethods.map((m: string) => m.trim().toUpperCase()).join(',');
    } else if (typeof paymentMethods === 'string' && paymentMethods.trim().length > 0) {
      methodsStr = paymentMethods.split(',').map((m: string) => m.trim().toUpperCase()).join(',');
    }

    await db.insert(routingRules).values({
      chatId,
      chatName: chatName || '',
      minAmount: parseFloat(minAmount),
      maxAmount: parseFloat(maxAmount),
      paymentMethods: methodsStr,
      isActive: 1, // Default to Active/Online
      dailyLimit: dailyLimit !== undefined && dailyLimit !== '' ? parseFloat(dailyLimit) : 0,
      createdAt: Date.now()
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to add rule:", err);
    res.status(500).json({ error: 'Failed to add rule' });
  }
});

apiRouter.patch('/routing-rules/:id/toggle', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { isActive } = req.body;
    
    await db.update(routingRules)
      .set({ isActive: isActive ? 1 : 0 })
      .where(eq(routingRules.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to toggle rule active state:", err);
    res.status(500).json({ error: 'Failed to toggle rule active state' });
  }
});

apiRouter.put('/routing-rules/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { chatId, chatName, minAmount, maxAmount, paymentMethods, dailyLimit } = req.body;
    
    if (!chatId || minAmount === undefined || maxAmount === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let methodsStr = 'BKASH,NAGAD,ROCKET,UPAY';
    if (Array.isArray(paymentMethods)) {
      methodsStr = paymentMethods.map((m: string) => m.trim().toUpperCase()).join(',');
    } else if (typeof paymentMethods === 'string' && paymentMethods.trim().length > 0) {
      methodsStr = paymentMethods.split(',').map((m: string) => m.trim().toUpperCase()).join(',');
    }

    await db.update(routingRules)
      .set({
        chatId,
        chatName: chatName || '',
        minAmount: parseFloat(minAmount),
        maxAmount: parseFloat(maxAmount),
        paymentMethods: methodsStr,
        dailyLimit: dailyLimit !== undefined && dailyLimit !== '' ? parseFloat(dailyLimit) : 0,
      })
      .where(eq(routingRules.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to update rule:", err);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

apiRouter.delete('/routing-rules/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(routingRules).where(eq(routingRules.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error("Delete routing rule error:", err);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

apiRouter.get('/group-balances', async (req, res) => {
  try {
    const balances = await db.select().from(groupBalances);
    res.json({ success: true, data: balances });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch group balances' });
  }
});

apiRouter.get('/connected-groups', async (req, res) => {
  try {
    const balances = await db.select().from(groupBalances);
    const rules = await db.select().from(routingRules);
    const reqGroups: any[] = await db.all(sql`
      SELECT DISTINCT telegram_chat_id as chatId, assigned_user as chatName 
      FROM payment_requests 
      WHERE telegram_chat_id IS NOT NULL AND telegram_chat_id != ''
    `);

    const groupMap = new Map<string, { chatId: string; chatName: string; balance: number; hasRule: boolean; isActive: boolean }>();

    for (const b of balances) {
      if (!b.chatId) continue;
      const normalizedId = normalizeTelegramChatId(b.chatId);
      groupMap.set(normalizedId, {
        chatId: normalizedId,
        chatName: b.chatName || 'Telegram Group',
        balance: b.balance || 0,
        hasRule: false,
        isActive: false
      });
    }

    for (const r of reqGroups) {
      if (!r.chatId) continue;
      const normalizedId = normalizeTelegramChatId(r.chatId);
      const existing = groupMap.get(normalizedId);
      if (existing) {
        if (!existing.chatName || existing.chatName === 'Telegram Group' || existing.chatName === normalizedId) {
          if (r.chatName) existing.chatName = r.chatName;
        }
      } else {
        groupMap.set(normalizedId, {
          chatId: normalizedId,
          chatName: r.chatName || 'Telegram Group',
          balance: 0,
          hasRule: false,
          isActive: false
        });
      }
    }

    for (const r of rules) {
      if (!r.chatId) continue;
      const normalizedId = normalizeTelegramChatId(r.chatId);
      const existing = groupMap.get(normalizedId);
      if (existing) {
        existing.hasRule = true;
        if (r.isActive) existing.isActive = true;
        if (r.chatName && (!existing.chatName || existing.chatName === 'Telegram Group' || existing.chatName === normalizedId)) {
          existing.chatName = r.chatName;
        }
      } else {
        groupMap.set(normalizedId, {
          chatId: normalizedId,
          chatName: r.chatName || 'Telegram Group',
          balance: 0,
          hasRule: true,
          isActive: r.isActive === 1
        });
      }
    }

    if (process.env.AUTHORIZED_CHAT_ID) {
      const authChatId = normalizeTelegramChatId(process.env.AUTHORIZED_CHAT_ID);
      if (!groupMap.has(authChatId)) {
        groupMap.set(authChatId, {
          chatId: authChatId,
          chatName: 'Main Operations Group',
          balance: 0,
          hasRule: false,
          isActive: false
        });
      }
    }

    const result = Array.from(groupMap.values());
    res.json({ success: true, data: result });
  } catch (err) {
    console.error("Failed to fetch connected groups:", err);
    res.status(500).json({ error: 'Failed to fetch connected groups' });
  }
});

apiRouter.delete('/group-balances/:chatId', async (req, res) => {
  try {
    const rawChatId = req.params.chatId;
    const chatId = normalizeTelegramChatId(rawChatId);
    
    await db.delete(groupLedgerEntries).where(eq(groupLedgerEntries.chatId, chatId));
    await db.delete(groupBalances).where(eq(groupBalances.chatId, chatId));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

apiRouter.post('/group-balances/add', async (req, res) => {
  try {
    const { chatId: rawChatId, chatName, amount } = req.body;
    const chatId = normalizeTelegramChatId(rawChatId);
    const depositAmount = parseFloat(amount) || 0;
    const existing = await db.select().from(groupBalances).where(eq(groupBalances.chatId, chatId)).limit(1);
    
    // Check if group is offline (no active routing rule)
    const activeRule = await db.select().from(routingRules).where(and(eq(routingRules.chatId, chatId), eq(routingRules.isActive, 1))).limit(1);
    if (activeRule.length === 0) {
      await db.insert(auditLogs).values({
        userId: (req as any).user?.username || 'API',
        action: 'OFFLINE_OPERATION_ATTEMPT',
        details: `Attempted to add balance to offline group ${chatName || chatId}`,
        createdAt: Date.now()
      });
      return res.status(400).json({ error: 'Group is offline. Cannot add balance.' });
    }
    
    let newBalance = depositAmount;
    if (existing.length > 0) {
      newBalance = existing[0].balance + depositAmount;
      await db.update(groupBalances)
        .set({ balance: newBalance, chatName: chatName || existing[0].chatName, updatedAt: Date.now() })
        .where(eq(groupBalances.chatId, chatId));
    } else {
      await db.insert(groupBalances).values({
        chatId,
        chatName: chatName || chatId,
        balance: depositAmount,
        updatedAt: Date.now()
      });
    }

    await db.insert(groupLedgerEntries).values({
      chatId,
      type: 'DEPOSIT',
      amount: depositAmount,
      balanceAfter: newBalance,
      description: `Balance deposit added by admin`,
      referenceId: null,
      operator: (req as any).user?.username || 'Admin',
      createdAt: Date.now()
    });

    await db.insert(auditLogs).values({
      userId: (req as any).user?.username || 'API',
      action: 'ADD_BALANCE',
      details: `Added ${depositAmount} to group ${chatName || chatId}`,
      createdAt: Date.now()
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add balance' });
  }
});

apiRouter.post('/group-balances/deduct', async (req, res) => {
  try {
    const { chatId: rawChatId, chatName, amount } = req.body;
    const chatId = normalizeTelegramChatId(rawChatId);
    const deductAmount = Math.abs(parseFloat(amount) || 0);
    const existing = await db.select().from(groupBalances).where(eq(groupBalances.chatId, chatId)).limit(1);
    
    // Check if group is offline (no active routing rule)
    const activeRule = await db.select().from(routingRules).where(and(eq(routingRules.chatId, chatId), eq(routingRules.isActive, 1))).limit(1);
    if (activeRule.length === 0) {
      await db.insert(auditLogs).values({
        userId: (req as any).user?.username || 'API',
        action: 'OFFLINE_OPERATION_ATTEMPT',
        details: `Attempted to deduct balance from offline group ${existing.length > 0 ? existing[0].chatName : chatId}`,
        createdAt: Date.now()
      });
      return res.status(400).json({ error: 'Group is offline. Cannot deduct balance.' });
    }
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    const newBalance = existing[0].balance - deductAmount;
    await db.update(groupBalances)
      .set({ balance: newBalance, updatedAt: Date.now() })
      .where(eq(groupBalances.chatId, chatId));

    await db.insert(groupLedgerEntries).values({
      chatId,
      type: 'PAYOUT',
      amount: deductAmount,
      balanceAfter: newBalance,
      description: `Balance deduction added by admin`,
      referenceId: null,
      operator: (req as any).user?.username || 'Admin',
      createdAt: Date.now()
    });

    await db.insert(auditLogs).values({
      userId: (req as any).user?.username || 'API',
      action: 'DEDUCT_BALANCE',
      details: `Subtracted ${deductAmount} from group ${existing[0].chatName || chatId}`,
      createdAt: Date.now()
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to deduct balance' });
  }
});

apiRouter.get('/group-ledgers/:chatId', async (req, res) => {
  try {
    const rawChatId = req.params.chatId;
    const chatId = normalizeTelegramChatId(rawChatId);
    
    const groupRes = await db.select().from(groupBalances).where(eq(groupBalances.chatId, chatId)).limit(1);
    const entries = await db.select().from(groupLedgerEntries).where(eq(groupLedgerEntries.chatId, chatId)).orderBy(desc(groupLedgerEntries.createdAt));

    res.json({
      success: true,
      data: {
        group: groupRes[0] || { chatId, chatName: chatId, balance: 0 },
        entries
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch group ledger' });
  }
});

apiRouter.get('/reports/daily-groups', async (req, res) => {
  try {
    const dateQuery = req.query.date as string; // Format: YYYY-MM-DD (in BD Time)
    const chatIdQuery = req.query.chatId as string;
    
    // Parse using Bangladesh Day Range
    const { startTs, endTs } = getBDDayRange(dateQuery);

    let result;
    if (chatIdQuery) {
      result = await db.all(sql`
        SELECT 
          telegram_chat_id, 
          COUNT(*) as count, 
          SUM(amount) as total_amount 
        FROM payment_requests 
        WHERE status = 'COMPLETED' 
          AND created_at >= ${startTs} 
          AND created_at <= ${endTs}
          AND telegram_chat_id = ${chatIdQuery}
        GROUP BY telegram_chat_id
      `);
    } else {
      result = await db.all(sql`
        SELECT 
          telegram_chat_id, 
          COUNT(*) as count, 
          SUM(amount) as total_amount 
        FROM payment_requests 
        WHERE status = 'COMPLETED' 
          AND created_at >= ${startTs} 
          AND created_at <= ${endTs}
          AND telegram_chat_id IS NOT NULL
        GROUP BY telegram_chat_id
      `);
    }

    // Fetch chat names from routing rules or group balances
    const balances = await db.select().from(groupBalances);
    const rules = await db.select().from(routingRules);

    const report = result.map((r: any) => {
      const chatId = r.telegram_chat_id;
      let chatName = chatId;
      const b = balances.find(x => x.chatId === chatId);
      const ru = rules.find(x => x.chatId === chatId);
      if (b && b.chatName) chatName = b.chatName;
      else if (ru && ru.chatName) chatName = ru.chatName;

      return {
        chatId,
        chatName,
        count: r.count,
        totalAmount: r.total_amount
      };
    });

    res.json({ success: true, data: report });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

apiRouter.get('/reports/daily-deduct', async (req, res) => {
  try {
    const dateQuery = req.query.date as string; // Format: YYYY-MM-DD (in BD Time)
    const chatIdQuery = req.query.chatId as string;
    
    // Parse using Bangladesh Day Range
    const { startTs, endTs } = getBDDayRange(dateQuery);

    let result;
    if (chatIdQuery) {
      result = await db.all(sql`
        SELECT 
          chat_id, 
          COUNT(*) as count, 
          SUM(amount) as total_amount 
        FROM group_ledger_entries 
        WHERE type = 'PAYOUT' 
          AND created_at >= ${startTs} 
          AND created_at <= ${endTs}
          AND chat_id = ${chatIdQuery}
        GROUP BY chat_id
      `);
    } else {
      result = await db.all(sql`
        SELECT 
          chat_id, 
          COUNT(*) as count, 
          SUM(amount) as total_amount 
        FROM group_ledger_entries 
        WHERE type = 'PAYOUT' 
          AND created_at >= ${startTs} 
          AND created_at <= ${endTs}
          AND chat_id IS NOT NULL
        GROUP BY chat_id
      `);
    }

    // Also get detailed entries list for the day
    let entriesQuery;
    if (chatIdQuery) {
      entriesQuery = sql`
        SELECT 
          id, chat_id, type, amount, balance_after, description, reference_id, operator, created_at 
        FROM group_ledger_entries 
        WHERE type = 'PAYOUT' 
          AND created_at >= ${startTs} 
          AND created_at <= ${endTs}
          AND chat_id = ${chatIdQuery}
        ORDER BY created_at DESC
      `;
    } else {
      entriesQuery = sql`
        SELECT 
          id, chat_id, type, amount, balance_after, description, reference_id, operator, created_at 
        FROM group_ledger_entries 
        WHERE type = 'PAYOUT' 
          AND created_at >= ${startTs} 
          AND created_at <= ${endTs}
        ORDER BY created_at DESC
      `;
    }
    const rawEntries: any = await db.all(entriesQuery);

    // Fetch chat names from routing rules or group balances
    const balances = await db.select().from(groupBalances);
    const rules = await db.select().from(routingRules);

    const report = result.map((r: any) => {
      const chatId = r.chat_id;
      let chatName = chatId;
      const b = balances.find(x => x.chatId === chatId);
      const ru = rules.find(x => x.chatId === chatId);
      if (b && b.chatName) chatName = b.chatName;
      else if (ru && ru.chatName) chatName = ru.chatName;

      return {
        chatId,
        chatName,
        count: r.count,
        totalAmount: r.total_amount
      };
    });

    const entries = rawEntries.map((e: any) => {
      const chatId = e.chat_id;
      let chatName = chatId;
      const b = balances.find(x => x.chatId === chatId);
      const ru = rules.find(x => x.chatId === chatId);
      if (b && b.chatName) chatName = b.chatName;
      else if (ru && ru.chatName) chatName = ru.chatName;

      return {
        id: e.id,
        chatId: e.chat_id,
        chatName,
        type: e.type,
        amount: e.amount,
        balanceAfter: e.balance_after,
        description: e.description,
        referenceId: e.reference_id,
        operator: e.operator,
        createdAt: e.created_at
      };
    });

    res.json({ success: true, data: report, entries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch deduct report' });
  }
});

apiRouter.put('/group-ledgers/entry/:id', async (req, res) => {
  try {
    const entryId = parseInt(req.params.id);
    const { amount, description, type, referenceId } = req.body;

    const existingEntry = await db.select().from(groupLedgerEntries).where(eq(groupLedgerEntries.id, entryId)).limit(1);
    if (existingEntry.length === 0) {
      return res.status(404).json({ error: 'Ledger entry not found' });
    }

    const entry = existingEntry[0];
    const chatId = entry.chatId;

    const newAmount = amount !== undefined ? parseFloat(amount) : entry.amount;
    const newType = type || entry.type;
    const newDescription = description !== undefined ? description : entry.description;
    const newRefId = referenceId !== undefined ? referenceId : entry.referenceId;

    await db.update(groupLedgerEntries)
      .set({
        amount: newAmount,
        type: newType,
        description: newDescription,
        referenceId: newRefId,
      })
      .where(eq(groupLedgerEntries.id, entryId));

    // Recalculate balance for this chat
    await recalculateGroupBalance(chatId);

    await db.insert(auditLogs).values({
      userId: (req as any).user?.username || 'API',
      action: 'UPDATE_LEDGER_ENTRY',
      details: `Updated ledger entry #${entryId} for group ${chatId}`,
      createdAt: Date.now()
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update ledger entry' });
  }
});

apiRouter.delete('/group-ledgers/entry/:id', async (req, res) => {
  try {
    const entryId = parseInt(req.params.id);
    console.log(`Delete request received for entry ID: ${entryId}`);

    const existingEntry = await db.select().from(groupLedgerEntries).where(eq(groupLedgerEntries.id, entryId)).limit(1);
    if (existingEntry.length === 0) {
      console.error(`Ledger entry not found: ${entryId}`);
      return res.status(404).json({ error: 'Ledger entry not found' });
    }

    const entry = existingEntry[0];
    const chatId = entry.chatId;

    // Find and delete any linked Transactions / Orders in paymentRequests
    const matchedPaymentRequests: any[] = [];

    if (entry.referenceId && entry.referenceId.trim()) {
      const refId = entry.referenceId.trim();
      const byReqId = await db.select().from(paymentRequests).where(eq(paymentRequests.requestId, refId));
      if (byReqId.length > 0) {
        matchedPaymentRequests.push(...byReqId);
      } else {
        const byTxId = await db.select().from(paymentRequests).where(eq(paymentRequests.transactionId, refId));
        if (byTxId.length > 0) {
          matchedPaymentRequests.push(...byTxId);
        }
      }
    }

    if (matchedPaymentRequests.length === 0 && entry.description) {
      // Try to parse requestId from description e.g. "request 12345" or "Request #12345"
      const match = entry.description.match(/(?:request|order|req)\s*(?:#|id[:\s]*)?\s*([A-Za-z0-9_-]+)/i);
      if (match && match[1]) {
        const extractedReqId = match[1].trim();
        const byExtracted = await db.select().from(paymentRequests).where(eq(paymentRequests.requestId, extractedReqId));
        if (byExtracted.length > 0) {
          matchedPaymentRequests.push(...byExtracted);
        }
      }
    }

    // Delete matched payment requests (Transactions & Orders)
    for (const pr of matchedPaymentRequests) {
      cancelOrderReminder(pr.requestId);
      await db.delete(paymentRequests).where(eq(paymentRequests.id, pr.id));
      console.log(`Deleted linked payment request: ${pr.requestId} (ID: ${pr.id})`);

      await db.insert(auditLogs).values({
        userId: (req as any).user?.username || 'API',
        action: 'DELETE_TRANSACTION',
        details: `Deleted transaction/order ${pr.requestId} (৳${pr.amount}) linked to deleted ledger entry #${entryId}`,
        createdAt: Date.now()
      });
    }

    // Delete the ledger entry
    await db.delete(groupLedgerEntries).where(eq(groupLedgerEntries.id, entryId));
    console.log(`Entry ${entryId} deleted successfully.`);

    // Recalculate balance for this chat
    await recalculateGroupBalance(chatId);
    console.log(`Balance recalculated for chat: ${chatId}`);

    await db.insert(auditLogs).values({
      userId: (req as any).user?.username || 'API',
      action: 'DELETE_LEDGER_ENTRY',
      details: `Deleted ledger entry #${entryId} for group ${chatId}${matchedPaymentRequests.length > 0 ? ` (and deleted ${matchedPaymentRequests.length} linked transaction/order)` : ''}`,
      createdAt: Date.now()
    });

    res.json({ 
      success: true, 
      deletedTransactionsCount: matchedPaymentRequests.length 
    });
  } catch (err) {
    console.error("Delete ledger entry error:", err);
    res.status(500).json({ error: 'Failed to delete ledger entry' });
  }
});

// System Settings Endpoints
apiRouter.get('/settings', async (req, res) => {
  try {
    const autoReminder = await isAutoReminderEnabled();
    const timeoutSeconds = await getReminderTimeoutSeconds();
    const reminderMessageTemplate = await getReminderMessageTemplate();
    const allSettings = await db.select().from(systemSettings);
    
    const settingsMap: Record<string, string> = {};
    const SECRET_KEYS = ['jwt_secret', 'telegram_bot_token'];
    for (const s of allSettings) {
      if (SECRET_KEYS.includes(s.key)) continue;
      settingsMap[s.key] = s.value;
    }

    res.json({
      success: true,
      data: {
        autoReminderEnabled: autoReminder,
        reminderTimeoutSeconds: timeoutSeconds,
      reminderMessageTemplate,
        formattedThresholdBn: formatTimeThresholdBn(timeoutSeconds),
        botRunning: !!bot,
        settings: settingsMap,
      }
    });
  } catch (err) {
    console.error("Error fetching settings:", err);
    res.status(500).json({ error: 'Failed to fetch system settings' });
  }
});

apiRouter.post('/settings', async (req, res) => {
  try {
    const { autoReminderEnabled, reminderTimeoutSeconds, reminderMessageTemplate } = req.body;
    const adminUser = (req as any).user?.username || 'Admin';

    if (typeof autoReminderEnabled === 'boolean') {
      await setAutoReminderEnabled(autoReminderEnabled);
      
      await db.insert(auditLogs).values({
        userId: adminUser,
        action: 'UPDATE_SETTING',
        details: `Set Telegram Auto Mention Alert to ${autoReminderEnabled ? 'ENABLED' : 'DISABLED'}`,
        createdAt: Date.now()
      });
    }

    if (typeof reminderTimeoutSeconds === 'number' || (typeof reminderTimeoutSeconds === 'string' && !isNaN(Number(reminderTimeoutSeconds)))) {
      const parsedSeconds = parseInt(String(reminderTimeoutSeconds), 10);
      if (parsedSeconds >= 15 && parsedSeconds <= 3600) {
        const savedSeconds = await setReminderTimeoutSeconds(parsedSeconds);
        const timeLabel = formatTimeThresholdBn(savedSeconds);
        await db.insert(auditLogs).values({
          userId: adminUser,
          action: 'UPDATE_SETTING',
          details: `Set Telegram Auto Mention Alert Threshold to ${savedSeconds}s (${timeLabel})`,
          createdAt: Date.now()
        });
      }
    }

    const currentEnabled = await isAutoReminderEnabled();
    const currentTimeout = await getReminderTimeoutSeconds();
    const timeLabel = formatTimeThresholdBn(currentTimeout);

    res.json({
      success: true,
      message: `Settings updated successfully. (Alerts: ${currentEnabled ? 'Enabled' : 'Disabled'}, Threshold: ${timeLabel})`,
      data: {
        autoReminderEnabled: currentEnabled,
        reminderTimeoutSeconds: currentTimeout,
        formattedThresholdBn: timeLabel
      }
    });
  } catch (err) {
    console.error("Error updating settings:", err);
    res.status(500).json({ error: 'Failed to update system settings' });
  }
});

// System Services Health (Open-Source PaddleOCR & Telegram Bot API)
apiRouter.get('/settings/services-health', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const paddleHealth = await checkPaddleHealth(forceRefresh);

    const botStatus = getBotStatus();
    const isTelegramHealthy = botStatus.isRunning && !!botStatus.username && !botStatus.lastError;
    
    let telegramMessage = '';
    if (isTelegramHealthy) {
      telegramMessage = `Telegram Bot is active & polling as @${botStatus.username}`;
    } else if (botStatus.lastError) {
      telegramMessage = `Telegram Bot attention required: ${botStatus.lastError}`;
    } else if (!botStatus.hasConfiguredToken) {
      telegramMessage = 'Telegram Bot token is not configured.';
    } else {
      telegramMessage = 'Telegram Bot is currently stopped or initializing.';
    }

    const telegramHealth = {
      status: isTelegramHealthy ? 'healthy' : 'attention_required',
      isHealthy: isTelegramHealthy,
      message: telegramMessage,
      username: botStatus.username,
      isRunning: botStatus.isRunning,
      hasConfiguredToken: botStatus.hasConfiguredToken,
      lastError: botStatus.lastError,
      lastChecked: Date.now(),
    };

    const dbStatus = await getDatabaseStatus();

    res.json({
      success: true,
      data: {
        paddle: paddleHealth,
        telegram: telegramHealth,
        database: dbStatus,
      }
    });
  } catch (err: any) {
    console.error('Error fetching services health:', err);
    res.status(500).json({ error: 'Failed to retrieve system services health' });
  }
});

// Telegram Bot Status & Configuration Endpoints
apiRouter.get('/settings/telegram', async (req, res) => {
  try {
    const status = getBotStatus();
    
    // Check if there is also an authorized_chat_id stored in DB
    const dbChatId = await db.select().from(systemSettings).where(eq(systemSettings.key, 'authorized_chat_id')).limit(1);
    const authorizedChatId = (dbChatId.length > 0 && dbChatId[0].value) ? dbChatId[0].value : (process.env.AUTHORIZED_CHAT_ID || '');

    res.json({
      success: true,
      data: {
        ...status,
        authorizedChatId,
      }
    });
  } catch (err) {
    console.error('Error getting Telegram status:', err);
    res.status(500).json({ error: 'Failed to get Telegram Bot status' });
  }
});

apiRouter.post('/settings/telegram', async (req, res) => {
  try {
    const { token, authorizedChatId } = req.body;
    const adminUser = (req as any).user?.username || 'Admin';

    if (!token || typeof token !== 'string' || token.trim().length < 20) {
      return res.status(400).json({ error: 'সঠিক টেলিগ্রাম বট টোকেন দিন (Telegram Bot Token is required)' });
    }

    const cleanToken = token.trim();
    
    // Attempt connecting and starting the bot with the provided token
    const result = await restartBotWithToken(cleanToken);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'বট কানেক্ট করা সম্ভব হয়নি' });
    }

    // If authorizedChatId provided, save it
    if (typeof authorizedChatId === 'string') {
      const cleanChatId = authorizedChatId.trim();
      process.env.AUTHORIZED_CHAT_ID = cleanChatId;
      updateEnvFile('AUTHORIZED_CHAT_ID', cleanChatId);
      
      await db.insert(systemSettings)
        .values({ key: 'authorized_chat_id', value: cleanChatId, updatedAt: Date.now() })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: cleanChatId, updatedAt: Date.now() }
        });
    }

    await db.insert(auditLogs).values({
      userId: adminUser,
      action: 'UPDATE_TELEGRAM_BOT',
      details: `Connected Telegram Bot @${result.botUsername} via Dashboard Settings`,
      createdAt: Date.now()
    });

    res.json({
      success: true,
      message: `বট @${result.botUsername} সফলভাবে কানেক্ট হয়েছে এবং সক্রিয় রয়েছে!`,
      data: {
        botUsername: result.botUsername,
        ...getBotStatus()
      }
    });
  } catch (err: any) {
    console.error('Error saving Telegram bot token:', err);
    res.status(500).json({ error: err?.message || 'বটের সেটিংস সংরক্ষণ করতে ব্যর্থ হয়েছে' });
  }
});

apiRouter.post('/settings/telegram/test-ping', async (req, res) => {
  try {
    const { targetChatId } = req.body;
    const adminUser = (req as any).user?.username || 'Admin';

    if (!bot) {
      return res.status(400).json({ error: 'টেলিগ্রাম বট সক্রিয় নেই। প্রথমে সঠিক টোকেন দিয়ে বট কানেক্ট করুন।' });
    }

    let resolvedChatId = targetChatId ? String(targetChatId).trim() : (process.env.AUTHORIZED_CHAT_ID || '');
    if (!resolvedChatId) {
      // Check database
      const dbChat = await db.select().from(systemSettings).where(eq(systemSettings.key, 'authorized_chat_id')).limit(1);
      if (dbChat.length > 0 && dbChat[0].value) {
        resolvedChatId = dbChat[0].value.trim();
      }
    }

    if (!resolvedChatId) {
      return res.status(400).json({ error: 'কোনো গ্রুপ বা চ্যাট আইডি প্রদান করা হয়নি (Chat ID missing).' });
    }

    const testTime = formatBDDateTime(Date.now());
    const testMsg = `🔔 <b>টেস্ট মেসেজ / Bot Test Ping</b>\n\n✅ ড্যাশবোর্ড থেকে বট সফলভাবে যুক্ত হয়েছে।\n🕒 সময়: ${testTime}\n👤 অ্যাডমিন: ${adminUser}\n\n<i>This confirms Telegram Bot integration is working properly!</i>`;

    const candidateIds = [resolvedChatId];
    if (!resolvedChatId.startsWith('-') && /^\d+$/.test(resolvedChatId)) {
      candidateIds.push(`-100${resolvedChatId}`);
      candidateIds.push(`-${resolvedChatId}`);
    }

    let sent = false;
    let lastErr: any = null;

    for (const cid of candidateIds) {
      try {
        await bot.api.sendMessage(cid, testMsg, { parse_mode: 'HTML' });
        sent = true;
        break;
      } catch (err: any) {
        lastErr = err;
      }
    }

    if (!sent) {
      return res.status(400).json({ 
        error: `মেসেজ পাঠানো যায়নি: ${lastErr?.description || lastErr?.message || 'Chat not found'}. নিশ্চিত করুন বটটিকে আপনার গ্রুপে অ্যাড করা আছে এবং অ্যাডমিন পারমিশন দেওয়া আছে।` 
      });
    }

    await db.insert(auditLogs).values({
      userId: adminUser,
      action: 'TEST_TELEGRAM_BOT',
      details: `Sent test ping to chat ID ${resolvedChatId}`,
      createdAt: Date.now()
    });

    res.json({
      success: true,
      message: `টেস্ট মেসেজ সফলভাবে গ্রুপে (${resolvedChatId}) পাঠানো হয়েছে!`
    });
  } catch (err: any) {
    console.error('Error sending test ping:', err);
    res.status(500).json({ error: err?.message || 'Failed to send test message' });
  }
});

// Auto Balance Check (Configurable Daily BD Time) Status, Update & Manual Trigger
apiRouter.get('/settings/auto-bal', (req, res) => {
  try {
    const status = getAutoBalStatus();
    res.json({ success: true, data: status });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to get auto-balance status' });
  }
});

apiRouter.post('/settings/auto-bal/time', async (req, res) => {
  try {
    const { time } = req.body;
    const adminUser = (req as any).user?.username || 'Admin';

    if (!time || typeof time !== 'string') {
      return res.status(400).json({ error: 'সঠিক সময় দিন (Time string is required)' });
    }

    const result = await setAutoBalScheduleConfig(time);
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'ভুল সময় ফরম্যাট' });
    }

    await db.insert(auditLogs).values({
      userId: adminUser,
      action: 'UPDATE_AUTO_BAL_TIME',
      details: `Updated daily auto balance schedule time to ${result.time} BST`,
      createdAt: Date.now(),
    });

    const status = getAutoBalStatus();
    res.json({
      success: true,
      message: `অটোমেটিক ব্যালেন্স চেক এর সময় সফলভাবে পরিবর্তন করা হয়েছে: ${status.scheduledTimeBD}`,
      data: status,
    });
  } catch (err: any) {
    console.error('Error updating auto-bal time:', err);
    res.status(500).json({ error: err?.message || 'Failed to update auto-balance schedule time' });
  }
});

apiRouter.post('/settings/auto-bal/trigger', async (req, res) => {
  try {
    const adminUser = (req as any).user?.username || 'Admin';
    const result = await sendDailyAutoBalanceCheck();
    
    await db.insert(auditLogs).values({
      userId: adminUser,
      action: 'TRIGGER_AUTO_BAL',
      details: `Manual trigger of daily balance check. Sent: ${result.sentCount}, Errors: ${result.errors}`,
      createdAt: Date.now(),
    });

    res.json({
      success: true,
      message: `অটোমেটিক ব্যালেন্স চেক সফলভাবে সম্পন্ন হয়েছে। ${result.sentCount} টি গ্রুপে ব্যালেন্স রিপোর্ট পাঠানো হয়েছে।`,
      data: result,
    });
  } catch (err: any) {
    console.error('Error triggering auto-balance:', err);
    res.status(500).json({ error: err?.message || 'Failed to trigger auto-balance check' });
  }
});

// Security & JWT Settings Endpoints
apiRouter.get('/settings/security', async (req, res) => {
  try {
    const rawJwt = process.env.JWT_SECRET || '';
    const hasCustom = !!rawJwt && rawJwt !== 'fallback-secret-for-dev';
    const masked = (hasCustom && rawJwt.length > 6) 
      ? `${rawJwt.substring(0, 4)}...${rawJwt.substring(rawJwt.length - 3)}`
      : 'fallback-secret-for-dev';

    res.json({
      success: true,
      data: {
        hasCustomJwt: hasCustom,
        jwtSecretMasked: masked,
        port: process.env.PORT || '3000',
        environment: process.env.NODE_ENV || 'development'
      }
    });
  } catch (err) {
    console.error('Error fetching security settings:', err);
    res.status(500).json({ error: 'Failed to fetch security settings' });
  }
});

apiRouter.post('/settings/security', async (req, res) => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'ADMIN') {
      return res.status(403).json({ error: 'শুধুমাত্র অ্যাডমিন সিকিউরিটি সেটিংস পরিবর্তন করতে পারেন।' });
    }

    const { jwtSecret } = req.body;
    const adminUser = (req as any).user?.username || 'Admin';

    if (!jwtSecret || typeof jwtSecret !== 'string' || jwtSecret.trim().length < 8) {
      return res.status(400).json({ error: 'JWT Secret কমপক্ষে ৮ অক্ষরের হতে হবে (Minimum 8 characters required).' });
    }

    const cleanSecret = jwtSecret.trim();
    activeJwtSecret = cleanSecret;
    process.env.JWT_SECRET = cleanSecret;
    updateEnvFile('JWT_SECRET', cleanSecret);

    await db.insert(systemSettings)
      .values({ key: 'jwt_secret', value: cleanSecret, updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: cleanSecret, updatedAt: Date.now() }
      });

    await db.insert(auditLogs).values({
      userId: adminUser,
      action: 'UPDATE_SECURITY_SECRET',
      details: 'Updated system JWT Secret key',
      createdAt: Date.now()
    });

    res.json({
      success: true,
      message: 'JWT Secret সফলভাবে সংরক্ষণ এবং আপডেট করা হয়েছে!'
    });
  } catch (err: any) {
    console.error('Error updating security settings:', err);
    res.status(500).json({ error: err?.message || 'Failed to update security settings' });
  }
});

// User Management Endpoints
apiRouter.get('/users', async (req, res) => {
  try {
    const allUsers = await db.select({
      id: users.id,
      username: users.username,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
    }).from(users).orderBy(desc(users.createdAt));
    
    res.json({ success: true, data: allUsers });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

apiRouter.post('/users', async (req, res) => {
  try {
    const { username, password, role, status } = req.body;
    
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
    }
    
    if (!password || typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
    }
    
    const cleanUsername = username.trim().toLowerCase();
    
    // Check if user already exists
    const existing = await db.select().from(users).where(eq(users.username, cleanUsername)).limit(1);
    if (existing.length > 0) {
      return res.status(400).json({ error: `User '${cleanUsername}' already exists.` });
    }
    
    const validRoles = ['ADMIN', 'OPERATOR', 'VIEWER'];
    const assignedRole = (role && validRoles.includes(role.toUpperCase())) ? role.toUpperCase() : 'OPERATOR';
    const assignedStatus = (status && ['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) ? status.toUpperCase() : 'ACTIVE';
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    const now = Date.now();
    
    await db.insert(users).values({
      username: cleanUsername,
      password: hashedPassword,
      role: assignedRole,
      status: assignedStatus,
      createdAt: now,
    });
    
    const createdUserRes = await db.select().from(users).where(eq(users.username, cleanUsername)).limit(1);
    const newUserId = createdUserRes[0]?.id || 0;
    
    const adminUser = (req as any).user?.username || 'Admin';
    await db.insert(auditLogs).values({
      userId: adminUser,
      action: 'CREATE_USER',
      details: `Created new user: ${cleanUsername} (${assignedRole}, ${assignedStatus})`,
      createdAt: now,
    });
    
    res.json({
      success: true,
      message: `User '${cleanUsername}' created successfully.`,
      data: {
        id: newUserId,
        username: cleanUsername,
        role: assignedRole,
        status: assignedStatus,
        createdAt: now,
      }
    });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

apiRouter.put('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    const { role, status, password } = req.body;
    const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const targetUser = existing[0];
    const updates: any = {};
    const logDetails: string[] = [];
    
    if (role) {
      const validRoles = ['ADMIN', 'OPERATOR', 'VIEWER'];
      const targetRole = role.toUpperCase();
      if (validRoles.includes(targetRole)) {
        // If demoting an admin, check if another admin exists
        if (targetUser.role === 'ADMIN' && targetRole !== 'ADMIN') {
          const admins = await db.select().from(users).where(eq(users.role, 'ADMIN'));
          if (admins.length <= 1) {
            return res.status(400).json({ error: 'Cannot change role. System must have at least one ADMIN.' });
          }
        }
        updates.role = targetRole;
        logDetails.push(`role to ${targetRole}`);
      }
    }
    
    if (status) {
      const validStatuses = ['ACTIVE', 'INACTIVE'];
      const targetStatus = status.toUpperCase();
      if (validStatuses.includes(targetStatus)) {
        if (targetUser.role === 'ADMIN' && targetStatus === 'INACTIVE') {
          const activeAdmins = await db.select().from(users).where(and(eq(users.role, 'ADMIN'), eq(users.status, 'ACTIVE')));
          if (activeAdmins.length <= 1 && activeAdmins[0]?.id === userId) {
            return res.status(400).json({ error: 'Cannot deactivate the only active ADMIN account.' });
          }
        }
        updates.status = targetStatus;
        logDetails.push(`status to ${targetStatus}`);
      }
    }
    
    if (password && typeof password === 'string' && password.length >= 4) {
      updates.password = bcrypt.hashSync(password, 10);
      logDetails.push('password reset');
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' });
    }
    
    await db.update(users).set(updates).where(eq(users.id, userId));
    
    const adminUser = (req as any).user?.username || 'Admin';
    await db.insert(auditLogs).values({
      userId: adminUser,
      action: 'UPDATE_USER',
      details: `Updated user ${targetUser.username}: ${logDetails.join(', ')}`,
      createdAt: Date.now(),
    });
    
    res.json({
      success: true,
      message: `User '${targetUser.username}' updated successfully.`
    });
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

apiRouter.delete('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    const currentLoggedUser = (req as any).user;
    if (currentLoggedUser && currentLoggedUser.id === userId) {
      return res.status(400).json({ error: 'You cannot delete your own logged-in account.' });
    }
    
    const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const targetUser = existing[0];
    
    if (targetUser.role === 'ADMIN') {
      const admins = await db.select().from(users).where(eq(users.role, 'ADMIN'));
      if (admins.length <= 1) {
        return res.status(400).json({ error: 'Cannot delete the only ADMIN account in the system.' });
      }
    }
    
    await db.delete(users).where(eq(users.id, userId));
    
    const adminUser = currentLoggedUser?.username || 'Admin';
    await db.insert(auditLogs).values({
      userId: adminUser,
      action: 'DELETE_USER',
      details: `Deleted user: ${targetUser.username} (${targetUser.role})`,
      createdAt: Date.now(),
    });
    
    res.json({
      success: true,
      message: `User '${targetUser.username}' deleted successfully.`
    });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ==========================================
// CloudPanel MySQL & phpMyAdmin Management APIs
// ==========================================

apiRouter.get('/database/status', async (req, res) => {
  try {
    const status = await getDatabaseStatus();
    res.json({ success: true, data: status });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get database status: ' + err.message });
  }
});

apiRouter.post('/database/test-connection', async (req, res) => {
  try {
    const { host, port, user, password, database } = req.body;
    const result = await testMysqlConnection({
      host: host || '127.0.0.1',
      port: port ? parseInt(port, 10) : 3306,
      user: user || 'root',
      password: password || '',
      database: database || 'payment_gateway',
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Test failed: ' + err.message });
  }
});

apiRouter.post('/database/migrate-to-mysql', async (req, res) => {
  try {
    const result = await migrateSqliteToMysql();
    const adminUser = (req as any).user?.username || 'Admin';
    await db.insert(auditLogs).values({
      userId: adminUser,
      action: 'MIGRATE_TO_MYSQL',
      details: result.message,
      createdAt: Date.now(),
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Migration failed: ' + err.message });
  }
});

apiRouter.get('/database/export-sql', async (req, res) => {
  try {
    const dump = await exportSqlDump();
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="phpmyadmin_dump_${Date.now()}.sql"`);
    res.send(dump);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate SQL export: ' + err.message });
  }
});

// ========================================================
// Playwright Automation & Scraper Routes
// ========================================================

apiRouter.get('/automation/status', (req, res) => {
  try {
    const status = automationService.getStatus();
    res.json({ success: true, data: status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/automation/config', (req, res) => {
  try {
    const config = automationService.getConfig();
    // Mask password
    res.json({ 
      success: true, 
      data: {
        ...config,
        password: config.password ? '••••••••' : ''
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/automation/config', async (req, res) => {
  try {
    const updated = automationService.updateConfig(req.body);
    const adminUser = (req as any).user?.username || 'Admin';
    await db.insert(auditLogs).values({
      userId: adminUser,
      action: 'UPDATE_AUTOMATION_CONFIG',
      details: `Updated scraper configuration (portalUrl: ${req.body.portalUrl || 'unchanged'})`,
      createdAt: Date.now(),
    });
    res.json({ success: true, data: updated, message: 'Configuration saved successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/automation/start', async (req, res) => {
  try {
    const result = await automationService.start();
    const adminUser = (req as any).user?.username || 'Admin';
    await db.insert(auditLogs).values({
      userId: adminUser,
      action: 'START_AUTOMATION',
      details: 'Started Playwright automation crawler',
      createdAt: Date.now(),
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/automation/stop', async (req, res) => {
  try {
    const result = await automationService.stop();
    const adminUser = (req as any).user?.username || 'Admin';
    await db.insert(auditLogs).values({
      userId: adminUser,
      action: 'STOP_AUTOMATION',
      details: 'Stopped Playwright automation crawler',
      createdAt: Date.now(),
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/automation/submit-otp', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'OTP code is required' });
    }
    const result = await automationService.submitOtp(String(code), 'WEB');
    const adminUser = (req as any).user?.username || 'Admin';
    await db.insert(auditLogs).values({
      userId: adminUser,
      action: 'SUBMIT_AUTOMATION_OTP',
      details: `Submitted OTP code via Web UI (success: ${result.success})`,
      createdAt: Date.now(),
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/automation/clear-session', (req, res) => {
  try {
    const success = automationService.clearSession();
    res.json({ success, message: success ? 'Session cleared successfully' : 'No stored session found' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/automation/reload', async (req, res) => {
  try {
    const result = await automationService.reloadPage();
    const adminUser = (req as any).user?.username || 'Admin';
    await db.insert(auditLogs).values({
      userId: adminUser,
      action: 'RELOAD_AUTOMATION_PAGE',
      details: `Manually reloaded browser page`,
      createdAt: Date.now(),
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/automation/screenshot', async (req, res) => {
  try {
    const base64 = await automationService.getScreenshot();
    if (!base64) {
      return res.status(404).json({ success: false, error: 'Screenshot not available' });
    }
    res.json({ success: true, screenshot: base64 });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/automation/sync-now', async (req, res) => {
  try {
    const result = await automationService.syncNow();
    res.json({ success: true, data: result, message: `Sync complete: ${result.imported} imported, ${result.duplicates} skipped.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/automation/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const logs = automationService.getLogs(limit);
    res.json({ success: true, data: logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/automation/logs/clear', (req, res) => {
  try {
    automationService.clearLogs();
    res.json({ success: true, message: 'Logs cleared successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/automation/simulate', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Expected an array of order items' });
    }
    const result = await automationService.simulateIncomingOrders(items);
    res.json({ success: true, data: result, message: `Simulated ${result.imported} new orders (${result.duplicates} duplicates)` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});



