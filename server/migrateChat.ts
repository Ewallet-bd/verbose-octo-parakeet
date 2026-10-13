import { db } from './db';
import { routingRules, groupBalances, groupLedgerEntries, paymentRequests } from './db/schema';
import { eq, sql } from 'drizzle-orm';

export async function handleSupergroupMigration(oldChatId: string, newChatId: string) {
  if (oldChatId === newChatId) return;
  console.log(`Migrating chat records from ${oldChatId} to ${newChatId}`);
  try {
    // 1. Update routingRules
    await db.update(routingRules).set({ chatId: newChatId }).where(eq(routingRules.chatId, oldChatId));
    
    // 2. Update groupBalances (careful with unique constraint if new ID already exists somehow)
    const existingNewBalance = await db.select().from(groupBalances).where(eq(groupBalances.chatId, newChatId)).limit(1);
    if (existingNewBalance.length === 0) {
      await db.update(groupBalances).set({ chatId: newChatId }).where(eq(groupBalances.chatId, oldChatId));
    }
    
    // 3. Update groupLedgerEntries
    await db.update(groupLedgerEntries).set({ chatId: newChatId }).where(eq(groupLedgerEntries.chatId, oldChatId));
    
    // 4. Update paymentRequests (all historical and pending)
    await db.update(paymentRequests).set({ telegramChatId: newChatId }).where(eq(paymentRequests.telegramChatId, oldChatId));
    
    console.log(`Migration successful for ${newChatId}`);
  } catch (err) {
    console.error(`Failed to migrate chat ID ${oldChatId} to ${newChatId}:`, err);
  }
}
