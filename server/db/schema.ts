import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  role: text('role').notNull().default('OPERATOR'),
  status: text('status').default('ACTIVE'),
  createdAt: integer('created_at'),
});

export const paymentRequests = sqliteTable('payment_requests', {
  id: integer('id').primaryKey(),
  requestId: text('request_id').notNull().unique(),
  paymentMethod: text('payment_method').notNull(),
  walletNumber: text('wallet_number').notNull(),
  rawWalletNumber: text('raw_wallet_number'),
  amount: real('amount').notNull(),
  assignedUser: text('assigned_user'),
  status: text('status').notNull().default('PENDING'),
  transactionId: text('transaction_id'),
  completedBy: text('completed_by'),
  completedByUserId: text('completed_by_user_id'),
  completedByUsername: text('completed_by_username'),
  completedAt: integer('completed_at'),
  createdAt: integer('created_at').notNull(),
  rawMessage: text('raw_message'),
  telegramChatId: text('telegram_chat_id'),
  telegramMessageId: text('telegram_message_id'),
  reminderSent: integer('reminder_sent').default(0),
  reminderMessageId: text('reminder_message_id'),
});

export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey(),
  userId: text('user_id'),
  action: text('action'),
  details: text('details'),
  createdAt: integer('created_at'),
});

export const routingRules = sqliteTable('routing_rules', {
  id: integer('id').primaryKey(),
  chatId: text('chat_id').notNull(),
  chatName: text('chat_name'),
  minAmount: real('min_amount').notNull(),
  maxAmount: real('max_amount').notNull(),
  paymentMethods: text('payment_methods').default('BKASH,NAGAD,ROCKET,UPAY'),
  isActive: integer('is_active').default(1), // 1 = Active/Online, 0 = Inactive/Offline
  dailyLimit: real('daily_limit').default(0),
  createdAt: integer('created_at'),
});

export const groupBalances = sqliteTable('group_balances', {
  id: integer('id').primaryKey(),
  chatId: text('chat_id').notNull().unique(),
  chatName: text('chat_name'),
  balance: real('balance').notNull().default(0),
  updatedAt: integer('updated_at'),
});

export const groupLedgerEntries = sqliteTable('group_ledger_entries', {
  id: integer('id').primaryKey(),
  chatId: text('chat_id').notNull(),
  type: text('type').notNull(), // 'DEPOSIT' or 'PAYOUT'
  amount: real('amount').notNull(),
  balanceAfter: real('balance_after').notNull(),
  description: text('description'),
  referenceId: text('reference_id'),
  operator: text('operator'),
  createdAt: integer('created_at').notNull(),
});

export const systemSettings = sqliteTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at'),
});

