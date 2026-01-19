
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { connectToDb, getSql } from '@/lib/database'

async function migrate() {
  await connectToDb()
  const sql = getSql()
  
  console.log('Adding my_color to lichess_game_states...')
  await sql`
    ALTER TABLE lichess_game_states
    ADD COLUMN IF NOT EXISTS my_color TEXT
  `
  
  console.log('Migration complete.')
  process.exit(0)
}

migrate().catch(console.error)
