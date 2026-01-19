import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { connectToDb, getSql } from '@/lib/database'

async function migrate() {
  await connectToDb()
  const sql = getSql()
  
  console.log('Adding opponent_name and opponent_rating to lichess_game_states...')
  await sql`
    ALTER TABLE lichess_game_states
    ADD COLUMN IF NOT EXISTS opponent_name TEXT,
    ADD COLUMN IF NOT EXISTS opponent_rating INT
  `
  
  console.log('Migration complete.')
  process.exit(0)
}

migrate().catch(console.error)
