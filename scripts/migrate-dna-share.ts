import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { connectToDb, getSql } from '@/lib/database'

async function migrate() {
  await connectToDb()
  const sql = getSql()

  console.log('Creating DNA share tables...')

  await sql`
    CREATE TABLE IF NOT EXISTS dna_shares (
      slug TEXT PRIMARY KEY,
      lichess_user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at TIMESTAMPTZ,
      last_viewed_at TIMESTAMPTZ
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS idx_dna_shares_user ON dna_shares (lichess_user_id)`
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dna_shares_active_user
    ON dna_shares (lichess_user_id)
    WHERE revoked_at IS NULL
  `

  console.log('DNA share migration complete.')
  process.exit(0)
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})

