import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { connectToDb, getSql } from '@/lib/database'

async function migrate() {
  await connectToDb()
  const sql = getSql()
  
  console.log('Adding initial_time_ms and initial_increment_ms to lichess_game_states...')
  await sql`
    ALTER TABLE lichess_game_states
    ADD COLUMN IF NOT EXISTS initial_time_ms INT,
    ADD COLUMN IF NOT EXISTS initial_increment_ms INT
  `
  
  console.log('Migration complete.')
  process.exit(0)
}

migrate().catch(console.error)
