import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

import { migrateSqliteToMysql, getDatabaseStatus } from '../server/db/index';

async function main() {
  console.log('========================================================');
  console.log(' CloudPanel MySQL / phpMyAdmin Data Migration Tool');
  console.log('========================================================\n');

  console.log('Checking database configuration...');
  const initialStatus = await getDatabaseStatus();
  console.log(`Current Active Engine: ${initialStatus.activeEngineLabel}`);
  console.log(`Target MySQL Database: ${process.env.MYSQL_DATABASE || 'payment_gateway'} on ${process.env.MYSQL_HOST || '127.0.0.1'}`);

  console.log('\nStarting migration from sqlite.db to MySQL...');
  try {
    const result = await migrateSqliteToMysql();
    console.log('\n[SUCCESS]', result.message);
    console.log('Migrated Record Counts:');
    for (const [table, count] of Object.entries(result.migrated)) {
      console.log(` - ${table}: ${count} rows`);
    }
    console.log('\nAll data is now available in CloudPanel phpMyAdmin!');
    process.exit(0);
  } catch (err: any) {
    console.error('\n[ERROR] Migration failed:', err.message);
    console.error('Please verify your MySQL credentials in .env:');
    console.error('  MYSQL_HOST=' + (process.env.MYSQL_HOST || '127.0.0.1'));
    console.error('  MYSQL_PORT=' + (process.env.MYSQL_PORT || '3306'));
    console.error('  MYSQL_USER=' + (process.env.MYSQL_USER || 'root'));
    console.error('  MYSQL_DATABASE=' + (process.env.MYSQL_DATABASE || 'payment_gateway'));
    process.exit(1);
  }
}

main();
