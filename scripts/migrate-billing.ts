import { getSql, initDb } from '../lib/database';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function migrate() {
  console.log('🔌 Connecting to database...');
  await initDb();
  const sql = getSql();

  const migrationFile = path.join(process.cwd(), 'lib/sql/migrations/001_billing.sql');
  console.log(`📄 Reading migration file: ${migrationFile}`);

  try {
    const migrationSql = fs.readFileSync(migrationFile, 'utf8');

    console.log('🚀 Executing migration...');
    // Split by semicolon to execute statements individually if needed,
    // but neon driver might support multiple statements in one call.
    // Let's try executing as a single block first.
    await sql(migrationSql);

    console.log('✅ Migration completed successfully.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
