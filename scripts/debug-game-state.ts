import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { connectToDb, getSql } from '@/lib/database'

async function debugGame() {
  await connectToDb()
  const sql = getSql()
  
  const userId = 'anonymous19670705'
  
  console.log(`Checking games for user ${userId}...`)
  
  const games = await sql`
    SELECT game_id, status, updated_at, moves FROM lichess_game_states 
    WHERE lichess_user_id = ${userId}
    ORDER BY updated_at DESC
  `
  
  console.log('Games:', JSON.stringify(games, null, 2))
  
  process.exit(0)
}

debugGame().catch(console.error)
