import { db } from '../db';
import { paymentRequests, auditLogs, systemSettings } from '../db/schema';
import { eq, and, lte, or, sql, desc } from 'drizzle-orm';
import { bot } from './index';

// Map of in-memory active timers for instant trigger
const activeTimers = new Map<string, NodeJS.Timeout>();
let cachedTimeoutSeconds = 60;

function toBanglaNum(num: number | string): string {
  const banglaDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(num).replace(/\d/g, (d) => banglaDigits[parseInt(d, 10)] || d);
}

export function formatTimeThresholdBn(seconds: number): string {
  if (seconds % 60 === 0) {
    const mins = seconds / 60;
    return `${toBanglaNum(mins)} মিনিট`;
  }
  if (seconds < 60) {
    return `${toBanglaNum(seconds)} সেকেন্ড`;
  }
  const mins = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  return `${toBanglaNum(mins)} মিনিট ${toBanglaNum(remSec)} সেকেন্ড`;
}

/**
 * Check if the automatic reminder feature is enabled in system settings
 */
export async function isAutoReminderEnabled(): Promise<boolean> {
  try {
    const res = await db.select().from(systemSettings).where(eq(systemSettings.key, 'auto_reminder_enabled')).limit(1);
    if (res.length > 0) {
      return res[0].value === 'true' || res[0].value === '1';
    }
    return true; // Default to true
  } catch (err) {
    console.error("Error checking auto reminder setting:", err);
    return true;
  }
}

/**
 * Update the automatic reminder enable/disable setting
 */
export async function setAutoReminderEnabled(enabled: boolean): Promise<void> {
  const valueStr = enabled ? 'true' : 'false';
  const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, 'auto_reminder_enabled')).limit(1);
  if (existing.length > 0) {
    await db.update(systemSettings)
      .set({ value: valueStr, updatedAt: Date.now() })
      .where(eq(systemSettings.key, 'auto_reminder_enabled'));
  } else {
    await db.insert(systemSettings).values({
      key: 'auto_reminder_enabled',
      value: valueStr,
      updatedAt: Date.now()
    });
  }
}

/**
 * Get the configured reminder time threshold in seconds (default: 60)
 */

export let cachedReminderTemplate = `⚠️ <b>{time} পেন্ডিং অ্যালার্ট (Pending Order Alert)!</b>

📌 রিকোয়েস্ট আইডি: <code>{requestId}</code>
💰 অ্যামাউন্ট: <b>৳{amount}</b> ({paymentMethod})
📱 ওয়ালেট: <code>{wallet}</code>
⏱️ অবস্থা: <b>{time} ধরে পেন্ডিং রয়েছে!</b>

🔔 {mention} — আগের অর্ডারটি আপনি কমপ্লিট করেছিলেন। অনুগ্রহ করে এই নতুন অর্ডারটি দ্রুত চেক ও কমপ্লিট করুন!`;

export async function getReminderMessageTemplate(): Promise<string> {
  try {
    const res = await db.select().from(systemSettings).where(eq(systemSettings.key, 'reminder_message_template')).limit(1);
    if (res.length > 0) {
      cachedReminderTemplate = res[0].value;
      return res[0].value;
    }
  } catch (err) {
    console.error("Error reading reminder template setting:", err);
  }
  return cachedReminderTemplate;
}

export async function setReminderMessageTemplate(template: string): Promise<string> {
  cachedReminderTemplate = template;
  const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, 'reminder_message_template')).limit(1);
  if (existing.length > 0) {
    await db.update(systemSettings).set({ value: template, updatedAt: Date.now() }).where(eq(systemSettings.key, 'reminder_message_template'));
  } else {
    await db.insert(systemSettings).values({
      key: 'reminder_message_template',
      value: template,
      updatedAt: Date.now()
    });
  }
  return template;
}

export async function getReminderTimeoutSeconds(): Promise<number> {
  try {
    const res = await db.select().from(systemSettings).where(eq(systemSettings.key, 'reminder_timeout_seconds')).limit(1);
    if (res.length > 0) {
      const val = parseInt(res[0].value, 10);
      if (!isNaN(val) && val >= 10) {
        cachedTimeoutSeconds = val;
        return val;
      }
    }
  } catch (err) {
    console.error("Error reading reminder timeout setting:", err);
  }
  return cachedTimeoutSeconds;
}

/**
 * Set the reminder time threshold in seconds
 */
export async function setReminderTimeoutSeconds(seconds: number): Promise<number> {
  const safeSeconds = Math.max(15, Math.min(3600, Math.round(seconds)));
  cachedTimeoutSeconds = safeSeconds;
  const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, 'reminder_timeout_seconds')).limit(1);
  if (existing.length > 0) {
    await db.update(systemSettings)
      .set({ value: String(safeSeconds), updatedAt: Date.now() })
      .where(eq(systemSettings.key, 'reminder_timeout_seconds'));
  } else {
    await db.insert(systemSettings).values({
      key: 'reminder_timeout_seconds',
      value: String(safeSeconds),
      updatedAt: Date.now()
    });
  }
  return safeSeconds;
}

/**
 * Cancels any in-memory timer for an order (e.g. when completed/cancelled early)
 */
export function cancelOrderReminder(requestId: string) {
  const timer = activeTimers.get(requestId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(requestId);
  }
}

/**
 * Schedules an in-memory reminder for a newly created payment request
 */
export function scheduleOrderReminder(requestId: string, delayMs?: number) {
  cancelOrderReminder(requestId);
  
  const timeoutMs = delayMs !== undefined ? delayMs : (cachedTimeoutSeconds * 1000);

  const timer = setTimeout(async () => {
    activeTimers.delete(requestId);
    try {
      await triggerOrderReminder(requestId);
    } catch (err) {
      console.error(`Error in scheduled reminder for ${requestId}:`, err);
    }
  }, timeoutMs);

  activeTimers.set(requestId, timer);
}

/**
 * Checks an order and sends a Telegram mention to the previous order completer if still pending after threshold
 */
export async function triggerOrderReminder(requestId: string) {
  try {
    // Check if auto-reminder is enabled by admin
    const isEnabled = await isAutoReminderEnabled();
    if (!isEnabled) {
      return;
    }

    const timeoutSeconds = await getReminderTimeoutSeconds();
    const thresholdMs = timeoutSeconds * 1000;

    const reqs = await db.select().from(paymentRequests).where(eq(paymentRequests.requestId, requestId)).limit(1);
    if (reqs.length === 0) return;

    const req = reqs[0];

    // Only alert if still PENDING / PARSER_REVIEW_REQUIRED and reminder hasn't been sent yet
    if (req.status !== 'PENDING' && req.status !== 'PARSER_REVIEW_REQUIRED') {
      return;
    }
    if (req.reminderSent === 1) {
      return;
    }

    // Do not trigger reminder if it hasn't been assigned to a Telegram group yet (Global Queue)
    if (!req.telegramChatId) {
      return;
    }

    // Verify threshold elapsed (allowing small timer variance)
    const elapsed = Date.now() - req.createdAt;
    if (elapsed < (thresholdMs - 3000)) {
      // Not yet reached threshold, reschedule for remaining time
      scheduleOrderReminder(requestId, Math.max(1000, thresholdMs - elapsed));
      return;
    }

    // Mark reminder as sent immediately to avoid race conditions
    await db.update(paymentRequests)
      .set({ reminderSent: 1 })
      .where(eq(paymentRequests.requestId, requestId));

    if (!bot) {
      console.warn(`[Reminder] Telegram bot not active. Skipped reminder for #${requestId}`);
      return;
    }

    const chatId = req.telegramChatId || process.env.AUTHORIZED_CHAT_ID;
    if (!chatId) {
      console.warn(`[Reminder] No Telegram chat ID found for #${requestId}`);
      return;
    }

    // Find the most recent COMPLETED order to identify the last active user
    let prevOrder: any = null;

    // 1. Search in the same chat first
    if (req.telegramChatId) {
      const chatCompleted = await db.select().from(paymentRequests)
        .where(and(
          eq(paymentRequests.telegramChatId, req.telegramChatId),
          eq(paymentRequests.status, 'COMPLETED')
        ))
        .orderBy(desc(paymentRequests.completedAt), desc(paymentRequests.createdAt))
        .limit(1);
      
      if (chatCompleted.length > 0) {
        prevOrder = chatCompleted[0];
      }
    }

    // 2. Fallback to any completed order in the database
    if (!prevOrder) {
      const allCompleted = await db.select().from(paymentRequests)
        .where(eq(paymentRequests.status, 'COMPLETED'))
        .orderBy(desc(paymentRequests.completedAt), desc(paymentRequests.createdAt))
        .limit(1);
      
      if (allCompleted.length > 0) {
        prevOrder = allCompleted[0];
      }
    }

    // Generate Telegram Mention string
    let mention = '<b>@Operators</b>';
    let mentionedUserName = 'Operators';

    if (prevOrder) {
      if (prevOrder.completedByUsername) {
        const cleanUser = prevOrder.completedByUsername.replace(/^@/, '').trim();
        mention = `@${cleanUser}`;
        mentionedUserName = `@${cleanUser}`;
      } else if (prevOrder.completedByUserId) {
        const displayName = (prevOrder.completedBy || 'Operator').replace(/[<>]/g, '');
        mention = `<a href="tg://user?id=${prevOrder.completedByUserId}">${displayName}</a>`;
        mentionedUserName = displayName;
      } else if (prevOrder.completedBy) {
        const comp = prevOrder.completedBy.trim();
        if (comp.startsWith('@')) {
          mention = comp;
          mentionedUserName = comp;
        } else {
          mention = `<b>${comp.replace(/[<>]/g, '')}</b>`;
          mentionedUserName = comp;
        }
      }
    }

    const timeLabel = formatTimeThresholdBn(timeoutSeconds);

    const alertMessage = 
      `⚠️ <b>${timeLabel} পেন্ডিং অ্যালার্ট (Pending Order Alert)!</b>\n\n` +
      `📌 রিকোয়েস্ট আইডি: <code>${req.requestId}</code>\n` +
      `💰 অ্যামাউন্ট: <b>৳${req.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</b> (${req.paymentMethod})\n` +
      `📱 ওয়ালেট: <code>${req.walletNumber}</code>\n` +
      `⏱️ অবস্থা: <b>${timeLabel} ধরে পেন্ডিং রয়েছে!</b>\n\n` +
      `🔔 ${mention} — আগের অর্ডারটি আপনি কমপ্লিট করেছিলেন। অনুগ্রহ করে এই নতুন অর্ডারটি দ্রুত চেক ও কমপ্লিট করুন!`;

    // Candidates chat IDs to handle supergroup -100 prefixes
    const candidateIds = [chatId];
    if (!chatId.startsWith('-') && /^\d+$/.test(chatId)) {
      candidateIds.push(`-100${chatId}`);
      candidateIds.push(`-${chatId}`);
    } else if (chatId.startsWith('-100')) {
      candidateIds.push(chatId.replace(/^-100/, ''));
    }

    let sent = false;
    for (const targetId of candidateIds) {
      try {
        const sendOptions: any = {
          parse_mode: 'HTML'
        };

        if (req.telegramMessageId && /^\d+$/.test(req.telegramMessageId)) {
          sendOptions.reply_parameters = { message_id: parseInt(req.telegramMessageId) };
        }

        const sentMsg = await bot.api.sendMessage(targetId, alertMessage, sendOptions);
        if (sentMsg && sentMsg.message_id) {
          await db.update(paymentRequests).set({ reminderMessageId: sentMsg.message_id.toString() }).where(eq(paymentRequests.id, req.id));
        }
        sent = true;
        break;
      } catch (err: any) {
        // If reply_parameters failed (e.g. original message deleted), retry without reply_parameters
        if (err?.description && err.description.includes('reply')) {
          try {
            const retryMsg = await bot.api.sendMessage(targetId, alertMessage, {
              parse_mode: 'HTML'
            });
            if (retryMsg && retryMsg.message_id) {
              await db.update(paymentRequests).set({ reminderMessageId: retryMsg.message_id.toString() }).where(eq(paymentRequests.id, req.id));
            }
            sent = true;
            break;
          } catch (retryErr) {}
        }
      }
    }

    if (sent) {
      console.log(`🔔 [${timeoutSeconds}s Alert] Sent reminder for #${req.requestId} mentioning ${mentionedUserName}`);
      await db.insert(auditLogs).values({
        userId: 'SYSTEM_BOT',
        action: 'ORDER_PENDING_REMINDER',
        details: `Sent ${timeLabel} pending alert for Order #${req.requestId} mentioning ${mentionedUserName} in chat ${chatId}`,
        createdAt: Date.now()
      });
    }

  } catch (err) {
    console.error(`Failed to trigger order reminder for ${requestId}:`, err);
  }
}

/**
 * Periodically scans the database for any pending requests older than configured threshold
 * that have not had a reminder sent yet (failsafe for restarts / network lags).
 */
export function startReminderWatchdog() {
  getReminderTimeoutSeconds(); // prime memory cache

  setInterval(async () => {
    try {
      const isEnabled = await isAutoReminderEnabled();
      if (!isEnabled) return;

      const timeoutSeconds = await getReminderTimeoutSeconds();
      const overdueTime = Date.now() - (timeoutSeconds * 1000);
      
      const overdueRequests = await db.select().from(paymentRequests)
        .where(and(
          eq(paymentRequests.status, 'PENDING'),
          sql`telegram_chat_id IS NOT NULL`,
          lte(paymentRequests.createdAt, overdueTime),
          or(eq(paymentRequests.reminderSent, 0), sql`reminder_sent IS NULL`)
        ))
        .limit(10);

      for (const req of overdueRequests) {
        await triggerOrderReminder(req.requestId);
      }
    } catch (err) {
      console.error("Watchdog reminder check error:", err);
    }
  }, 10000); // Check every 10 seconds
}
