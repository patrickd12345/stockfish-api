#!/usr/bin/env tsx

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { connectToDb, getDbDebugInfo, getSql } from '../lib/database'
import { Chess } from 'chess.js'

async function main() {
  console.log('DB debug:', getDbDebugInfo())
  await connectToDb()
  const sql = getSql()

  const tables = [
    'blunder_dna_patterns',
    'blunder_dna_drills',
    'blunder_dna_attempts',
    'blunder_dna_mastery',
    'blunder_dna_daily_queue'
  ]

  console.log('Blunder DNA table existence + counts:')
  for (const t of tables) {
    const existsRows = (await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${t}
      ) AS exists
    `) as Array<{ exists: boolean }>
    const exists = !!existsRows[0]?.exists
    if (!exists) {
      console.log(`❌ ${t} (missing)`)
      continue
    }
    let count = 0
    if (t === 'blunder_dna_patterns') {
      const rows = (await sql`SELECT COUNT(*)::int as count FROM blunder_dna_patterns`) as Array<{ count: number }>
      count = rows[0]?.count ?? 0
    } else if (t === 'blunder_dna_drills') {
      const rows = (await sql`SELECT COUNT(*)::int as count FROM blunder_dna_drills`) as Array<{ count: number }>
      count = rows[0]?.count ?? 0
    } else if (t === 'blunder_dna_attempts') {
      const rows = (await sql`SELECT COUNT(*)::int as count FROM blunder_dna_attempts`) as Array<{ count: number }>
      count = rows[0]?.count ?? 0
    } else if (t === 'blunder_dna_mastery') {
      const rows = (await sql`SELECT COUNT(*)::int as count FROM blunder_dna_mastery`) as Array<{ count: number }>
      count = rows[0]?.count ?? 0
    } else if (t === 'blunder_dna_daily_queue') {
      const rows = (await sql`SELECT COUNT(*)::int as count FROM blunder_dna_daily_queue`) as Array<{ count: number }>
      count = rows[0]?.count ?? 0
    }
    console.log(`✅ ${t}: ${count} rows`)
  }

  const users = (await sql`
    SELECT lichess_user_id, COUNT(*)::int as count
    FROM blunder_dna_patterns
    GROUP BY lichess_user_id
    ORDER BY count DESC
  `) as Array<{ lichess_user_id: string; count: number }>

  console.log('\nPattern rows per user:')
  if (users.length === 0) {
    console.log('(none)')
    return
  }
  users.forEach((u) => console.log(`- ${u.lichess_user_id}: ${u.count}`))

  const sampleUser = users[0]?.lichess_user_id
  if (!sampleUser) return

  const patterns = (await sql`
    SELECT pattern_tag, label, occurrences, weakness_score, updated_at
    FROM blunder_dna_patterns
    WHERE lichess_user_id = ${sampleUser}
    ORDER BY weakness_score DESC, occurrences DESC, pattern_tag ASC
  `) as Array<any>

  const versions = (await sql`
    SELECT DISTINCT version
    FROM blunder_dna_patterns
    WHERE lichess_user_id = ${sampleUser}
    ORDER BY version ASC
  `) as Array<{ version: string }>

  console.log(`\nSample patterns for ${sampleUser}:`)
  console.log(`- versions: ${versions.map((v) => JSON.stringify(v.version)).join(', ')}`)
  patterns.forEach((p) =>
    console.log(
      `- ${p.pattern_tag}: occ=${p.occurrences} score=${p.weakness_score}`
    )
  )

  const drills = (await sql`
    SELECT drill_id, lichess_game_id, ply, pattern_tag, difficulty
    FROM blunder_dna_drills
    WHERE lichess_user_id = ${sampleUser}
    ORDER BY created_at DESC
    LIMIT 5
  `) as Array<any>

  console.log(`\nLatest drills for ${sampleUser}:`)
  drills.forEach((d) => console.log(`- ${d.drill_id} ${d.lichess_game_id} ply ${d.ply} tag ${d.pattern_tag} diff ${d.difficulty}`))

  const recentExistsRows = (await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'lichess_recent_games'
    ) AS exists
  `) as Array<{ exists: boolean }>
  if (!recentExistsRows[0]?.exists) return

  const recent = (await sql`
    SELECT lichess_game_id, pgn
    FROM lichess_recent_games
    WHERE lichess_user_id = ${sampleUser}
    ORDER BY fetched_at DESC
    LIMIT 1
  `) as Array<{ lichess_game_id: string; pgn: string }>

  const row = recent[0]
  if (!row?.pgn) return
  const chess = new Chess()
  try {
    chess.loadPgn(row.pgn)
  } catch {
    return
  }
  const h = chess.header() as any
  console.log(`\nLatest recent-game headers for ${sampleUser} (${row.lichess_game_id}):`)
  console.log(`- White: ${h.White}`)
  console.log(`- Black: ${h.Black}`)
}

main().catch((e) => {
  console.error('Debug failed:', e)
  process.exit(1)
})

