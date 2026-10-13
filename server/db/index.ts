import { createClient as createLibsqlClient, Client as LibsqlClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import mysql, { Pool as MysqlPool } from 'mysql2/promise';

export type DatabaseEngine = 'mysql' | 'sqlite';

export interface DatabaseStatus {
  engine: DatabaseEngine;
  configuredEngine: DatabaseEngine;
  isOnline: boolean;
  activeEngineLabel: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  tables: string[];
  counts: {
    users: number;
    paymentRequests: number;
    auditLogs: number;
    routingRules: number;
    groupBalances: number;
    groupLedgerEntries: number;
  };
  phpMyAdminReady: boolean;
  message: string;
  lastError?: string;
}

let activeEngine: DatabaseEngine = 'sqlite';
let mysqlPool: MysqlPool | null = null;
let sqliteClient: LibsqlClient | null = null;
let lastDbError: string | null = null;

// Initialize SQLite fallback client safely
function getOrCreateSqliteClient(): LibsqlClient {
  if (sqliteClient) return sqliteClient;
  try {
    sqliteClient = createLibsqlClient({ url: 'file:sqlite.db' });
  } catch (e: any) {
    console.error("Database connection/integrity check failed:", e?.message);
    if (e?.message && (e.message.includes('malformed') || e.message.includes('corrupt') || e.message.includes('SQLITE_CORRUPT'))) {
      console.warn("Database is corrupted. Backing up and recreating sqlite.db...");
      try { if (fs.existsSync('sqlite.db')) fs.renameSync('sqlite.db', `sqlite.db.corrupt.${Date.now()}`); } catch {}
      try { if (fs.existsSync('sqlite.db-journal')) fs.unlinkSync('sqlite.db-journal'); } catch {}
      try { if (fs.existsSync('sqlite.db-wal')) fs.unlinkSync('sqlite.db-wal'); } catch {}
      try { if (fs.existsSync('sqlite.db-shm')) fs.unlinkSync('sqlite.db-shm'); } catch {}
      sqliteClient = createLibsqlClient({ url: 'file:sqlite.db' });
    } else {
      throw e;
    }
  }
  return sqliteClient;
}

// LibSQL-compatible Adapter that routes queries to either MySQL or SQLite
export const client = {
  execute: async (query: any): Promise<any> => {
    const sqlStr = typeof query === 'string' ? query : query.sql;
    const args = typeof query === 'string' ? [] : (query.args || []);

    if (activeEngine === 'mysql' && mysqlPool) {
      try {
        const [res, fields]: any = await mysqlPool.query(sqlStr, args);
        if (Array.isArray(res)) {
          return {
            columns: fields ? fields.map((f: any) => f.name) : [],
            columnTypes: fields ? fields.map(() => 'TEXT') : [],
            rows: res,
            rowsAffected: 0,
            toJSON: () => ({})
          };
        } else {
          return {
            columns: [],
            columnTypes: [],
            rows: [],
            rowsAffected: res?.affectedRows || 0,
            lastInsertRowid: res?.insertId ? BigInt(res.insertId) : undefined,
            toJSON: () => ({})
          };
        }
      } catch (err: any) {
        // If MySQL execution fails unexpectedly, log diagnostic info
        console.warn(`[MySQL Execution Warning] Query failed (${err.code || err.message}):`, sqlStr.slice(0, 100));
        throw err;
      }
    }

    // Default to SQLite
    const sq = getOrCreateSqliteClient();
    return await sq.execute(query);
  },

  batch: async (queries: any[]): Promise<any[]> => {
    const results = [];
    for (const q of queries) {
      results.push(await client.execute(q));
    }
    return results;
  }
};

// Drizzle ORM instance wrapping our dual-mode client
export const db = drizzle(client as any, { schema });

// Attempt to connect to MySQL
async function tryConnectMysql(): Promise<MysqlPool | null> {
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = parseInt(process.env.MYSQL_PORT || '3306', 10);
  const user = process.env.MYSQL_USER || 'root';
  const password = process.env.MYSQL_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || 'payment_gateway';

  try {
    const pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      charset: 'utf8mb4'
    });

    // Test ping and set ANSI_QUOTES mode for standard double-quote SQL compatibility
    const connection = await pool.getConnection();
    try {
      await connection.query("SET SESSION sql_mode = CONCAT(@@sql_mode, ',ANSI_QUOTES')");
      await connection.ping();
    } finally {
      connection.release();
    }

    console.log(`[Database] Connected successfully to CloudPanel MySQL: ${user}@${host}:${port}/${database}`);
    return pool;
  } catch (err: any) {
    lastDbError = err.message || String(err);
    console.warn(`[Database] Unable to connect to MySQL (${err.code || err.message}). Falling back to SQLite local database.`);
    return null;
  }
}

export const initializeDb = async () => {
  const configured = (process.env.DB_TYPE === 'mysql' || !!process.env.MYSQL_DATABASE) ? 'mysql' : 'sqlite';

  if (configured === 'mysql') {
    const pool = await tryConnectMysql();
    if (pool) {
      mysqlPool = pool;
      activeEngine = 'mysql';
    } else {
      activeEngine = 'sqlite';
      getOrCreateSqliteClient();
    }
  } else {
    activeEngine = 'sqlite';
    getOrCreateSqliteClient();
  }

  if (activeEngine === 'mysql' && mysqlPool) {
    try {
      // Create MySQL tables matching phpMyAdmin schema
      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(191) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL DEFAULT 'OPERATOR',
          status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
          created_at BIGINT NULL,
          INDEX idx_users_role (role),
          INDEX idx_users_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS payment_requests (
          id INT AUTO_INCREMENT PRIMARY KEY,
          request_id VARCHAR(191) NOT NULL UNIQUE,
          payment_method VARCHAR(50) NOT NULL,
          wallet_number VARCHAR(50) NOT NULL,
          raw_wallet_number VARCHAR(100) NULL,
          amount DOUBLE NOT NULL,
          assigned_user VARCHAR(100) NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          transaction_id VARCHAR(100) NULL,
          completed_by VARCHAR(100) NULL,
          completed_by_user_id VARCHAR(100) NULL,
          completed_by_username VARCHAR(100) NULL,
          completed_at BIGINT NULL,
          created_at BIGINT NOT NULL,
          raw_message MEDIUMTEXT NULL,
          telegram_chat_id VARCHAR(100) NULL,
          telegram_message_id VARCHAR(100) NULL,
          reminder_sent INT DEFAULT 0,
          reminder_message_id VARCHAR(100) NULL,
          INDEX idx_payreq_status (status),
          INDEX idx_payreq_created (created_at),
          INDEX idx_payreq_tx (transaction_id),
          INDEX idx_payreq_chat (telegram_chat_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(100) NULL,
          action VARCHAR(100) NULL,
          details MEDIUMTEXT NULL,
          created_at BIGINT NULL,
          INDEX idx_audit_user (user_id),
          INDEX idx_audit_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS routing_rules (
          id INT AUTO_INCREMENT PRIMARY KEY,
          chat_id VARCHAR(100) NOT NULL,
          chat_name VARCHAR(255) NULL,
          min_amount DOUBLE NOT NULL,
          max_amount DOUBLE NOT NULL,
          payment_methods VARCHAR(255) DEFAULT 'BKASH,NAGAD,ROCKET,UPAY',
          is_active INT DEFAULT 1,
          daily_limit DOUBLE DEFAULT 0,
          created_at BIGINT NULL,
          INDEX idx_rules_chat (chat_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS group_balances (
          id INT AUTO_INCREMENT PRIMARY KEY,
          chat_id VARCHAR(191) NOT NULL UNIQUE,
          chat_name VARCHAR(255) NULL,
          balance DOUBLE NOT NULL DEFAULT 0,
          updated_at BIGINT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS group_ledger_entries (
          id INT AUTO_INCREMENT PRIMARY KEY,
          chat_id VARCHAR(100) NOT NULL,
          type VARCHAR(50) NOT NULL,
          amount DOUBLE NOT NULL,
          balance_after DOUBLE NOT NULL,
          description MEDIUMTEXT NULL,
          reference_id VARCHAR(100) NULL,
          operator VARCHAR(100) NULL,
          created_at BIGINT NOT NULL,
          INDEX idx_ledger_chat (chat_id),
          INDEX idx_ledger_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS system_settings (
          \`key\` VARCHAR(191) PRIMARY KEY,
          \`value\` MEDIUMTEXT NOT NULL,
          \`updated_at\` BIGINT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Seed default admin in MySQL
      const [adminRows]: any = await mysqlPool.query("SELECT id FROM users WHERE username = 'admin' LIMIT 1");
      if (!adminRows || adminRows.length === 0) {
        const hash = bcrypt.hashSync('admin123', 10);
        await mysqlPool.query(
          "INSERT INTO users (username, password, role, status, created_at) VALUES ('admin', ?, 'ADMIN', 'ACTIVE', ?)",
          [hash, Date.now()]
        );
        console.log("[MySQL] Seeded default admin user: admin / admin123");
      }
      return;
    } catch (tableErr: any) {
      console.error("[MySQL Init Error] Failed to create tables in MySQL:", tableErr.message);
      // Fallback to SQLite if MySQL schema initialization encounters fatal issue
      activeEngine = 'sqlite';
      getOrCreateSqliteClient();
    }
  }

  // SQLite initialization
  const sq = getOrCreateSqliteClient();
  try {
    await sq.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'OPERATOR',
        status TEXT DEFAULT 'ACTIVE',
        created_at INTEGER
      );
    `);

    await sq.execute(`
      CREATE TABLE IF NOT EXISTS payment_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL UNIQUE,
        payment_method TEXT NOT NULL,
        wallet_number TEXT NOT NULL,
        raw_wallet_number TEXT,
        amount REAL NOT NULL,
        assigned_user TEXT,
        status TEXT DEFAULT 'PENDING',
        transaction_id TEXT,
        completed_by TEXT,
        completed_by_user_id TEXT,
        completed_by_username TEXT,
        completed_at INTEGER,
        created_at INTEGER,
        raw_message TEXT,
        telegram_chat_id TEXT,
        telegram_message_id TEXT,
        reminder_sent INTEGER DEFAULT 0
      );
    `);

    await sq.execute(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        action TEXT,
        details TEXT,
        created_at INTEGER
      );
    `);

    await sq.execute(`
      CREATE TABLE IF NOT EXISTS group_balances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL UNIQUE,
        chat_name TEXT,
        balance REAL NOT NULL DEFAULT 0,
        updated_at INTEGER
      );
    `);

    await sq.execute(`
      CREATE TABLE IF NOT EXISTS group_ledger_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        balance_after REAL NOT NULL,
        description TEXT,
        reference_id TEXT,
        operator TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    await sq.execute(`
      CREATE TABLE IF NOT EXISTS routing_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        chat_name TEXT,
        min_amount REAL NOT NULL,
        max_amount REAL NOT NULL,
        payment_methods TEXT DEFAULT 'BKASH,NAGAD,ROCKET,UPAY',
        is_active INTEGER DEFAULT 1,
        daily_limit REAL DEFAULT 0,
        created_at INTEGER
      );
    `);

    await sq.execute(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER
      );
    `);

    try { await sq.execute("ALTER TABLE payment_requests ADD COLUMN completed_by_user_id TEXT;"); } catch {}
    try { await sq.execute("ALTER TABLE payment_requests ADD COLUMN completed_by_username TEXT;"); } catch {}
    try { await sq.execute("ALTER TABLE payment_requests ADD COLUMN reminder_sent INTEGER DEFAULT 0;"); } catch {}
    try { await sq.execute("ALTER TABLE payment_requests ADD COLUMN reminder_message_id TEXT;"); } catch {}
    try { await sq.execute("ALTER TABLE routing_rules ADD COLUMN payment_methods TEXT DEFAULT 'BKASH,NAGAD,ROCKET,UPAY';"); } catch {}
    try { await sq.execute("ALTER TABLE routing_rules ADD COLUMN is_active INTEGER DEFAULT 1;"); } catch {}
    try { await sq.execute("ALTER TABLE routing_rules ADD COLUMN daily_limit REAL DEFAULT 0;"); } catch {}

  } catch (tableErr: any) {
    console.error("Error creating tables during SQLite init:", tableErr);
  }

  // Auto-seed admin user in SQLite if doesn't exist
  const adminRes = await sq.execute("SELECT * FROM users WHERE username = 'admin'");
  if (adminRes.rows.length === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await sq.execute({
      sql: "INSERT INTO users (username, password, role, created_at) VALUES ('admin', ?, 'ADMIN', ?)",
      args: [hash, Date.now()]
    });
    console.log("[SQLite] Seeded default admin user: admin / admin123");
  }
};

// Retrieve diagnostic information about current database status
export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  const configuredEngine: DatabaseEngine = (process.env.DB_TYPE === 'mysql' || !!process.env.MYSQL_DATABASE) ? 'mysql' : 'sqlite';
  const tables = [
    'users',
    'payment_requests',
    'audit_logs',
    'routing_rules',
    'group_balances',
    'group_ledger_entries',
    'system_settings'
  ];

  const counts = {
    users: 0,
    paymentRequests: 0,
    auditLogs: 0,
    routingRules: 0,
    groupBalances: 0,
    groupLedgerEntries: 0
  };

  let isOnline = false;
  let lastError = lastDbError || undefined;

  try {
    const uRes: any = await client.execute("SELECT COUNT(*) as cnt FROM users");
    const pRes: any = await client.execute("SELECT COUNT(*) as cnt FROM payment_requests");
    const aRes: any = await client.execute("SELECT COUNT(*) as cnt FROM audit_logs");
    const rRes: any = await client.execute("SELECT COUNT(*) as cnt FROM routing_rules");
    const bRes: any = await client.execute("SELECT COUNT(*) as cnt FROM group_balances");
    const lRes: any = await client.execute("SELECT COUNT(*) as cnt FROM group_ledger_entries");

    counts.users = Number(uRes.rows?.[0]?.cnt || 0);
    counts.paymentRequests = Number(pRes.rows?.[0]?.cnt || 0);
    counts.auditLogs = Number(aRes.rows?.[0]?.cnt || 0);
    counts.routingRules = Number(rRes.rows?.[0]?.cnt || 0);
    counts.groupBalances = Number(bRes.rows?.[0]?.cnt || 0);
    counts.groupLedgerEntries = Number(lRes.rows?.[0]?.cnt || 0);
    isOnline = true;
  } catch (err: any) {
    lastError = err.message;
  }

  const isMysql = activeEngine === 'mysql';

  return {
    engine: activeEngine,
    configuredEngine,
    isOnline,
    activeEngineLabel: isMysql ? 'CloudPanel MySQL / MariaDB (phpMyAdmin)' : 'SQLite Local (Zero-Config Fallback)',
    host: isMysql ? (process.env.MYSQL_HOST || '127.0.0.1') : 'Local Disk (file:sqlite.db)',
    port: isMysql ? parseInt(process.env.MYSQL_PORT || '3306', 10) : undefined,
    database: isMysql ? (process.env.MYSQL_DATABASE || 'payment_gateway') : 'sqlite.db',
    user: isMysql ? (process.env.MYSQL_USER || 'root') : undefined,
    tables,
    counts,
    phpMyAdminReady: isMysql,
    message: isMysql
      ? 'All transactions, requests, and logs are actively stored in MySQL and directly manageable via CloudPanel phpMyAdmin.'
      : configuredEngine === 'mysql'
      ? 'MySQL is configured in .env but unreachable. System is operating safely with local SQLite fallback.'
      : 'Currently running on SQLite. To view data in phpMyAdmin on CloudPanel, configure MYSQL_* credentials in .env or run the import script.',
    lastError
  };
}

// Test external MySQL credentials without altering current running database
export async function testMysqlConnection(config: {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}): Promise<{ success: boolean; message: string; tableCount?: number }> {
  try {
    const testPool = mysql.createPool({
      host: config.host || '127.0.0.1',
      port: config.port || 3306,
      user: config.user || 'root',
      password: config.password || '',
      database: config.database || 'payment_gateway',
      connectTimeout: 5000,
      charset: 'utf8mb4'
    });

    const conn = await testPool.getConnection();
    try {
      await conn.ping();
      const [tables]: any = await conn.query("SHOW TABLES");
      return {
        success: true,
        message: `Successfully connected to MySQL database '${config.database}' on ${config.host}:${config.port}. Found ${tables.length} existing tables.`,
        tableCount: tables.length
      };
    } finally {
      conn.release();
      await testPool.end();
    }
  } catch (err: any) {
    return {
      success: false,
      message: `MySQL connection failed: ${err.message}`
    };
  }
}

// Migrate all existing records from local SQLite to CloudPanel MySQL
export async function migrateSqliteToMysql(): Promise<{
  success: boolean;
  migrated: Record<string, number>;
  message: string;
}> {
  const sq = getOrCreateSqliteClient();
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = parseInt(process.env.MYSQL_PORT || '3306', 10);
  const user = process.env.MYSQL_USER || 'root';
  const password = process.env.MYSQL_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || 'payment_gateway';

  let targetPool: MysqlPool;
  let shouldClosePool = false;

  if (activeEngine === 'mysql' && mysqlPool) {
    targetPool = mysqlPool;
  } else {
    try {
      targetPool = mysql.createPool({
        host,
        port,
        user,
        password,
        database,
        charset: 'utf8mb4'
      });
      shouldClosePool = true;
    } catch (e: any) {
      throw new Error(`Cannot connect to MySQL for migration: ${e.message}`);
    }
  }

  const migrated: Record<string, number> = {
    users: 0,
    payment_requests: 0,
    audit_logs: 0,
    routing_rules: 0,
    group_balances: 0,
    group_ledger_entries: 0,
    system_settings: 0
  };

  try {
    // 1. Users
    const usersRes = await sq.execute("SELECT * FROM users");
    for (const u of usersRes.rows as any[]) {
      await targetPool.query(
        "INSERT INTO users (id, username, password, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role), status = VALUES(status)",
        [u.id, u.username, u.password, u.role || 'OPERATOR', u.status || 'ACTIVE', u.created_at || Date.now()]
      );
      migrated.users++;
    }

    // 2. Payment Requests
    const reqRes = await sq.execute("SELECT * FROM payment_requests");
    for (const r of reqRes.rows as any[]) {
      await targetPool.query(
        `INSERT INTO payment_requests (
          id, request_id, payment_method, wallet_number, raw_wallet_number, amount,
          assigned_user, status, transaction_id, completed_by, completed_by_user_id,
          completed_by_username, completed_at, created_at, raw_message, telegram_chat_id,
          telegram_message_id, reminder_sent, reminder_message_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          transaction_id = VALUES(transaction_id),
          completed_by = VALUES(completed_by),
          completed_at = VALUES(completed_at)`,
        [
          r.id, r.request_id, r.payment_method, r.wallet_number, r.raw_wallet_number || null, r.amount,
          r.assigned_user || null, r.status || 'PENDING', r.transaction_id || null, r.completed_by || null,
          r.completed_by_user_id || null, r.completed_by_username || null, r.completed_at || null,
          r.created_at || Date.now(), r.raw_message || null, r.telegram_chat_id || null,
          r.telegram_message_id || null, r.reminder_sent || 0, r.reminder_message_id || null
        ]
      );
      migrated.payment_requests++;
    }

    // 3. Audit Logs
    const auditRes = await sq.execute("SELECT * FROM audit_logs");
    for (const a of auditRes.rows as any[]) {
      await targetPool.query(
        "INSERT INTO audit_logs (id, user_id, action, details, created_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE action = VALUES(action)",
        [a.id, a.user_id || null, a.action || null, a.details || null, a.created_at || Date.now()]
      );
      migrated.audit_logs++;
    }

    // 4. Routing Rules
    const rulesRes = await sq.execute("SELECT * FROM routing_rules");
    for (const ru of rulesRes.rows as any[]) {
      await targetPool.query(
        "INSERT INTO routing_rules (id, chat_id, chat_name, min_amount, max_amount, payment_methods, is_active, daily_limit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)",
        [ru.id, ru.chat_id, ru.chat_name || null, ru.min_amount, ru.max_amount, ru.payment_methods || 'BKASH,NAGAD,ROCKET,UPAY', ru.is_active ?? 1, ru.daily_limit || 0, ru.created_at || Date.now()]
      );
      migrated.routing_rules++;
    }

    // 5. Group Balances
    const balRes = await sq.execute("SELECT * FROM group_balances");
    for (const b of balRes.rows as any[]) {
      await targetPool.query(
        "INSERT INTO group_balances (id, chat_id, chat_name, balance, updated_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE balance = VALUES(balance), updated_at = VALUES(updated_at)",
        [b.id, b.chat_id, b.chat_name || null, b.balance || 0, b.updated_at || Date.now()]
      );
      migrated.group_balances++;
    }

    // 6. Group Ledger Entries
    const ledRes = await sq.execute("SELECT * FROM group_ledger_entries");
    for (const l of ledRes.rows as any[]) {
      await targetPool.query(
        "INSERT INTO group_ledger_entries (id, chat_id, type, amount, balance_after, description, reference_id, operator, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE amount = VALUES(amount)",
        [l.id, l.chat_id, l.type, l.amount, l.balance_after, l.description || null, l.reference_id || null, l.operator || null, l.created_at || Date.now()]
      );
      migrated.group_ledger_entries++;
    }

    // 7. System Settings
    const setRes = await sq.execute("SELECT * FROM system_settings");
    for (const s of setRes.rows as any[]) {
      await targetPool.query(
        "INSERT INTO system_settings (`key`, `value`, `updated_at`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updated_at` = VALUES(`updated_at`)",
        [s.key, s.value, s.updated_at || Date.now()]
      );
      migrated.system_settings++;
    }

    return {
      success: true,
      migrated,
      message: `Migration completed successfully! Migrated ${migrated.payment_requests} payment requests, ${migrated.users} users, and all system records to CloudPanel MySQL.`
    };
  } finally {
    if (shouldClosePool) {
      await targetPool.end();
    }
  }
}

// Generate complete SQL Dump for phpMyAdmin import
export async function exportSqlDump(): Promise<string> {
  const tables = [
    'users',
    'payment_requests',
    'audit_logs',
    'routing_rules',
    'group_balances',
    'group_ledger_entries',
    'system_settings'
  ];

  let dump = `-- ========================================================\n`;
  dump += `-- CloudPanel phpMyAdmin SQL Dump\n`;
  dump += `-- Generated: ${new Date().toISOString()}\n`;
  dump += `-- Engine: ${activeEngine.toUpperCase()}\n`;
  dump += `-- ========================================================\n\n`;
  dump += `SET NAMES utf8mb4;\n`;
  dump += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;

  for (const table of tables) {
    try {
      const res: any = await client.execute(`SELECT * FROM ${table}`);
      const rows = res.rows || [];
      dump += `-- Table data for: ${table} (${rows.length} records)\n`;
      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const colList = columns.map(c => `\`${c}\``).join(', ');
        for (const row of rows) {
          const values = columns.map(col => {
            const val = row[col];
            if (val === null || val === undefined) return 'NULL';
            if (typeof val === 'number') return val;
            if (typeof val === 'boolean') return val ? 1 : 0;
            const strVal = String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return `'${strVal}'`;
          }).join(', ');
          dump += `INSERT INTO \`${table}\` (${colList}) VALUES (${values});\n`;
        }
      }
      dump += `\n`;
    } catch (e: any) {
      dump += `-- Error exporting table ${table}: ${e.message}\n\n`;
    }
  }

  dump += `SET FOREIGN_KEY_CHECKS = 1;\n`;
  return dump;
}
