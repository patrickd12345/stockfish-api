import { connectToDb, getSql } from '../lib/database';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

async function verifyUsersTable() {
  try {
    await connectToDb();
    const sql = getSql();
    
    console.log('🔍 Verifying users table...');
    
    // Check if table exists
    const tableExists = (await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      )
    `) as Array<{ exists: boolean }>;
    
    if (!tableExists[0]?.exists) {
      console.error('❌ users table does not exist!');
      process.exit(1);
    }
    
    console.log('✅ users table exists');
    
    // Check table structure
    const columns = (await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'users'
      ORDER BY ordinal_position
    `) as Array<{ column_name: string; data_type: string; is_nullable: string }>;
    
    console.log('\n📋 Table structure:');
    columns.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    
    // Check index
    const indexExists = (await sql`
      SELECT EXISTS (
        SELECT FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = 'users' 
        AND indexname = 'idx_users_created_at'
      )
    `) as Array<{ exists: boolean }>;
    
    if (indexExists[0]?.exists) {
      console.log('\n✅ Index idx_users_created_at exists');
    } else {
      console.log('\n⚠️  Index idx_users_created_at not found');
    }
    
    // Check row count
    const count = (await sql`SELECT COUNT(*)::int as count FROM users`) as Array<{ count: number }>;
    console.log(`\n📊 Current row count: ${count[0]?.count || 0}`);
    
    console.log('\n✅ Verification complete!');
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

verifyUsersTable();
