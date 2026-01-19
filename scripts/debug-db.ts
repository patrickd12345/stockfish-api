import { connectToDb, getSql } from '../lib/database'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

async function checkDb() {
  try {
    await connectToDb()
    const sql = getSql()
    
    const dbInfo = await sql`SELECT current_database() as db, current_user as user, current_setting('server_version') as version`
    console.log('Database Info:', dbInfo[0])
    
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `
    console.log('Public Tables:', tables.map(t => t.table_name).join(', '))
    
    const lichessTokensExists = tables.some(t => t.table_name === 'lichess_oauth_tokens')
    console.log('Lichess Tokens Table exists:', lichessTokensExists)
    
    if (!lichessTokensExists) {
      console.log('RE-CREATING Lichess tables just in case...')
      await sql`
        CREATE TABLE IF NOT EXISTS lichess_oauth_tokens (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          lichess_user_id TEXT NOT NULL UNIQUE,
          access_token_encrypted TEXT NOT NULL,
          token_type TEXT NOT NULL DEFAULT 'Bearer',
          scope TEXT[] NOT NULL DEFAULT '{}',
          expires_in INT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          revoked_at TIMESTAMPTZ
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS idx_lichess_oauth_tokens_user ON lichess_oauth_tokens (lichess_user_id)`
      console.log('Table created.')
    }

    process.exit(0)
  } catch (error) {
    console.error('Check failed:', error)
    process.exit(1)
  }
}

checkDb()
