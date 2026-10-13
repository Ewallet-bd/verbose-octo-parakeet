import { db } from '../db';
import { groupBalances, paymentRequests, routingRules, systemSettings } from '../db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { getBDDayRange, formatBDDateTime } from '../utils/timezone';
import { bot } from './index';

let autoBalTimer: NodeJS.Timeout | null = null;
let lastTriggeredDateStr: string | null = null;

// Default scheduled time is 23:58 (11:58 PM BD Time)
let scheduledHour = 23;
let scheduledMinute = 58;
let isConfigLoaded = false;

/**
 * Loads scheduled auto-bal time from database.
 */
export async function loadAutoBalScheduleConfig(): Promise<{ hour: number; minute: number }> {
  try {
    const setting = await db.select().from(systemSettings).where(eq(systemSettings.key, 'auto_bal_time')).limit(1);
    if (setting.length > 0 && setting[0].value) {
      const match = setting[0].value.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (match) {
        const h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
          scheduledHour = h;
          scheduledMinute = m;
        }
      }
    }
    isConfigLoaded = true;
  } catch (err) {
    console.warn('⚠️ [AutoBal] Failed to load auto_bal_time from database:', err);
  }
  return { hour: scheduledHour, minute: scheduledMinute };
}

/**
 * Saves and updates scheduled auto-bal time.
 */
export async function setAutoBalScheduleConfig(timeStr: string): Promise<{ success: boolean; time: string; error?: string }> {
  const match = (timeStr || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return { success: false, time: getFormattedScheduledTime(), error: 'সঠিক সময় দিন (HH:MM ফরম্যাট, যেমন: 23:58)' };
  }

  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) {
    return { success: false, time: getFormattedScheduledTime(), error: 'ঘণ্টা 0-23 এবং মিনিট 0-59 এর মধ্যে হতে হবে' };
  }

  scheduledHour = h;
  scheduledMinute = m;
  const formattedTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  try {
    await db.insert(systemSettings)
      .values({ key: 'auto_bal_time', value: formattedTime, updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: formattedTime, updatedAt: Date.now() }
      });
  } catch (err: any) {
    console.error('Failed to save auto_bal_time to DB:', err);
  }

  console.log(`🕒 [AutoBal] Scheduled balance check time updated to ${formattedTime} BST (${getFormattedScheduledTime()})`);
  return { success: true, time: formattedTime };
}

/**
 * Formats the scheduled time into 12-hour AM/PM string with BST label.
 */
export function getFormattedScheduledTime(): string {
  const period = scheduledHour >= 12 ? 'PM' : 'AM';
  const displayHour = scheduledHour % 12 === 0 ? 12 : scheduledHour % 12;
  const minuteStr = String(scheduledMinute).padStart(2, '0');
  const militaryStr = `${String(scheduledHour).padStart(2, '0')}:${minuteStr}`;
  return `${displayHour}:${minuteStr} ${period} (${militaryStr} BST)`;
}

/**
 * Returns current Bangladesh Time (Asia/Dhaka) hour, minute, and dateStr.
 */
function getBDTimeNow(): { hour: number; minute: number; dateStr: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).formatToParts(now);

  let year = '';
  let month = '';
  let day = '';
  let hour = 0;
  let minute = 0;

  for (const p of parts) {
    if (p.type === 'year') year = p.value;
    if (p.type === 'month') month = p.value;
    if (p.type === 'day') day = p.value;
    if (p.type === 'hour') hour = parseInt(p.value, 10);
    if (p.type === 'minute') minute = parseInt(p.value, 10);
  }

  return {
    hour,
    minute,
    dateStr: `${year}-${month}-${day}`
  };
}

/**
 * Sends automatic daily balance report to all active connected groups.
 */
export async function sendDailyAutoBalanceCheck(): Promise<{ sentCount: number; errors: number }> {
  if (!bot) {
    console.warn('⚠️ [AutoBal] Bot instance is not currently active, skipping auto balance check.');
    return { sentCount: 0, errors: 0 };
  }

  const { startTs, endTs } = getBDDayRange();
  let sentCount = 0;
  let errors = 0;

  try {
    // Fetch all active connected groups from routingRules and groupBalances
    const activeRules = await db.select().from(routingRules).where(eq(routingRules.isActive, 1));
    const allGroupBalances = await db.select().from(groupBalances);

    // Collect unique group chat IDs
    const targetChatIds = new Set<string>();

    for (const rule of activeRules) {
      if (rule.chatId) {
        targetChatIds.add(rule.chatId.trim());
      }
    }

    for (const gb of allGroupBalances) {
      if (gb.chatId) {
        targetChatIds.add(gb.chatId.trim());
      }
    }

    if (targetChatIds.size === 0) {
      console.log('ℹ️ [AutoBal] No registered groups found for auto balance check.');
      return { sentCount: 0, errors: 0 };
    }

    const scheduledTimeLabel = getFormattedScheduledTime();
    console.log(`⏰ [AutoBal] Executing ${scheduledTimeLabel} Bangladesh Time auto balance check for ${targetChatIds.size} group(s)...`);

    for (const chatId of targetChatIds) {
      try {
        const gbRes = await db.select().from(groupBalances).where(eq(groupBalances.chatId, chatId)).limit(1);
        const currentBal = gbRes.length > 0 ? (gbRes[0].balance || 0) : 0;
        const groupName = gbRes[0]?.chatName || `Group ${chatId}`;

        // Fetch completed requests for this group today
        const todayReqs = await db.select().from(paymentRequests).where(
          and(
            eq(paymentRequests.telegramChatId, chatId),
            gte(paymentRequests.createdAt, startTs),
            lte(paymentRequests.createdAt, endTs),
            eq(paymentRequests.status, 'COMPLETED')
          )
        );

        const todayCompletedAmount = todayReqs.reduce((sum, r) => sum + (r.amount || 0), 0);

        const autoBalMsg = 
          `💳 <b>দৈনিক অটোমেটিক ব্যালেন্স চেক (Auto Balance - ${scheduledTimeLabel.split('(')[0].trim()})</b>\n\n` +
          `👥 গ্রুপ: <b>${groupName}</b>\n` +
          `💰 বর্তমান ব্যালেন্স: <b>৳${currentBal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</b>\n` +
          `📈 আজকের সম্পন্ন (Completed): <b>৳${todayCompletedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</b> (${todayReqs.length} orders)\n` +
          `🕒 সময় (BD Time): <code>${formatBDDateTime(Date.now(), true)}</code>\n\n` +
          `<i>🔔 প্রতিদিন নির্ধারিত সময়ে এই ব্যালেন্স রিপোর্ট স্বয়ংক্রিয়ভাবে প্রদান করা হয়।</i>`;

        await bot.api.sendMessage(chatId, autoBalMsg, { parse_mode: 'HTML' });
        sentCount++;
        // Minor delay to respect Telegram rate limits
        await new Promise((r) => setTimeout(r, 250));
      } catch (chatErr: any) {
        errors++;
        console.warn(`⚠️ [AutoBal] Failed to send auto balance check to ${chatId}:`, chatErr?.message || chatErr);
      }
    }

    console.log(`✅ [AutoBal] Auto balance check completed: Sent to ${sentCount} group(s), errors: ${errors}`);
  } catch (err) {
    console.error('❌ [AutoBal] Fatal error executing daily balance check:', err);
  }

  return { sentCount, errors };
}

/**
 * Starts the automatic daily BD time watchdog.
 * Checks every 20 seconds. If current BD time matches the configured time and hasn't run yet today, triggers it.
 */
export async function startAutoBalScheduler(): Promise<void> {
  if (autoBalTimer) {
    clearInterval(autoBalTimer);
  }

  if (!isConfigLoaded) {
    await loadAutoBalScheduleConfig();
  }

  console.log(`🕒 [AutoBal] Daily ${getFormattedScheduledTime()} automatic balance watchdog started.`);

  autoBalTimer = setInterval(async () => {
    try {
      const { hour, minute, dateStr } = getBDTimeNow();

      // Trigger at scheduledHour:scheduledMinute once per day
      if (hour === scheduledHour && minute === scheduledMinute) {
        if (lastTriggeredDateStr !== dateStr) {
          lastTriggeredDateStr = dateStr;
          await sendDailyAutoBalanceCheck();
        }
      }
    } catch (err) {
      console.error('⚠️ [AutoBal] Scheduler interval error:', err);
    }
  }, 20000); // Check every 20 seconds
}

export function getAutoBalStatus() {
  const { hour, minute, dateStr } = getBDTimeNow();
  return {
    enabled: true,
    scheduledTime: `${String(scheduledHour).padStart(2, '0')}:${String(scheduledMinute).padStart(2, '0')}`,
    scheduledTimeBD: getFormattedScheduledTime(),
    currentBDTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    lastTriggeredDateStr,
    isRunning: !!autoBalTimer,
  };
}

export function stopAutoBalScheduler(): void {
  if (autoBalTimer) {
    clearInterval(autoBalTimer);
    autoBalTimer = null;
  }
}
