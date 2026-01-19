#!/usr/bin/env tsx

import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { connectToDb, getSql, getDbDebugInfo } from '../lib/database'

async function main() {
  console.log('DB debug:', getDbDebugInfo())
  await connectToDb()
  const sql = getSql()

  const rows = (await sql`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_name IN ('blunder_dna_patterns', 'blunder_dna_drills', 'blunder_dna_daily_queue', 'lichess_recent_games')
    ORDER BY table_name ASC, table_schema ASC
  `) as Array<{ table_schema: string; table_name: string }>

  rows.forEach((r) => console.log(`${r.table_name}: ${r.table_schema}`))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

