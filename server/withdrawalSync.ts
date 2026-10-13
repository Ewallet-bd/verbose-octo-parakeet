import fs from 'fs';
import path from 'path';
import { db } from './db';
import { paymentRequests, auditLogs } from './db/schema';
import { eq } from 'drizzle-orm';
import { bot, getActionKeyboard } from './bot/index';
import { scheduleOrderReminder } from './bot/reminderService';

const PENDING_WITHDRAW_FILE = "pending-withdraw.json";

export async function syncWithdrawalsFromFile() {
  const filePath = path.join(process.cwd(), PENDING_WITHDRAW_FILE);
  
  if (!fs.existsSync(filePath)) {
    return { success: false, message: `File ${PENDING_WITHDRAW_FILE} not found.` };
  }

  try {
    const rawData = fs.readFileSync(filePath, 'utf8');
    const withdrawals = JSON.parse(rawData);

    if (!Array.isArray(withdrawals)) {
      return { success: false, message: "Invalid format: Expected an array of withdrawals." };
    }

    let importedCount = 0;
    let skippedCount = 0;

    for (const item of withdrawals) {
      // Robust mapping from potential JSON fields to our DB schema
      const requestId = item.request_id || item.id || item.requestId;
      const amount = parseFloat(item.amount);
      const walletNumber = item.wallet_number || item.wallet || item.phone || item.number;
      const paymentMethod = item.payment_method || item.method || item.type || "CASH_OUT";
      
      if (!requestId || isNaN(amount) || !walletNumber) {
        skippedCount++;
        continue;
      }

      // Check for duplicates
      const existing = await db.select().from(paymentRequests).where(eq(paymentRequests.requestId, String(requestId))).limit(1);
      
      if (existing.length === 0) {
        const insertData = {
          requestId: String(requestId),
          paymentMethod: String(paymentMethod),
          walletNumber: String(walletNumber),
          amount: amount,
          status: 'PENDING',
          createdAt: Date.now(),
          rawMessage: JSON.stringify(item),
        };

        await db.insert(paymentRequests).values(insertData);
        importedCount++;

        // Schedule 1-minute reminder for pending order
        scheduleOrderReminder(String(requestId));

        // Send Telegram Notification
        if (bot && process.env.AUTHORIZED_CHAT_ID) {
          const messageText = `🔔 <b>NEW FILE REQUEST</b>\n\nID: <code>${requestId}</code>\nMethod: <code>${paymentMethod}</code>\nWallet: <code>${walletNumber}</code>\nAmount: ৳${amount}`;
          try {
            await bot.api.sendMessage(process.env.AUTHORIZED_CHAT_ID, messageText, {
              parse_mode: 'HTML',
              reply_markup: getActionKeyboard(insertData)
            });
          } catch (notifyErr) {
            console.error(`Failed to notify telegram chat ${process.env.AUTHORIZED_CHAT_ID}:`, notifyErr);
          }
        }
      } else {
        skippedCount++;
      }
    }

    if (importedCount > 0) {
      await db.insert(auditLogs).values({
        action: 'FILE_SYNC',
        details: `Imported ${importedCount} withdrawals from ${PENDING_WITHDRAW_FILE}`,
        createdAt: Date.now()
      });
    }

    return { 
      success: true, 
      message: `Sync completed. Imported: ${importedCount}, Skipped/Duplicates: ${skippedCount}`,
      imported: importedCount,
      skipped: skippedCount
    };

  } catch (err: any) {
    console.error("Withdrawal sync error:", err);
    return { success: false, message: `Error: ${err.message}` };
  }
}

export function startWithdrawalSyncInterval(intervalMs: number = 60000) {
  console.log(`Starting withdrawal file sync interval: every ${intervalMs / 1000}s`);
  setInterval(async () => {
    try {
      await syncWithdrawalsFromFile();
    } catch (e) {
      console.error("Periodic withdrawal sync failed:", e);
    }
  }, intervalMs);
}
