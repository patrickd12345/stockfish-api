import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { connectToDb, getSql } from '@/lib/database'

async function migrate() {
  await connectToDb()
  const sql = getSql()
  
  console.log('Creating lichess_chat_messages table...')
  await sql`
    CREATE TABLE IF NOT EXISTS lichess_chat_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id TEXT NOT NULL,
      lichess_user_id TEXT NOT NULL,
      room TEXT NOT NULL,
      username TEXT NOT NULL,
      text TEXT NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  console.log('Creating index on game_id...')
  await sql`
    CREATE INDEX IF NOT EXISTS idx_lichess_chat_messages_game ON lichess_chat_messages (game_id, received_at)
  `
  
  console.log('Migration complete.')
  process.exit(0)
}

migrate().catch(console.error)
