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
    // Neon serverless does not allow multiple SQL commands in a single prepared statement,
    // so execute statements one-by-one.
    const statements = migrationSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await sql(statement);
    }

    console.log('✅ Migration completed successfully.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
